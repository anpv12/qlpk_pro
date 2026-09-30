"""Transactional owner of survey submission and clinical-order progression."""
from copy import deepcopy
from datetime import datetime, timezone

from app.models.chi_dinh import ChiDinh
from app.models.examination import Examination
from app.models.survey_session import SurveySession, SurveySessionStatus
from app.models.survey_response import SurveyResponse
from app.models.survey_template import SurveyTemplate
from app.utils.survey_scoring import score_survey_responses, evaluate_survey_results

ORDER_STATUSES = ('sent', 'survey_sent', 'has_result', 'completed')

class SurveyLifecycleError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def transition_order(order, status, now=None):
    if status not in ORDER_STATUSES:
        raise SurveyLifecycleError('Trạng thái chỉ định không hợp lệ')
    now = now or datetime.now(timezone.utc)
    order.status = status
    order.is_completed = status == 'completed'
    if status == 'survey_sent' and not getattr(order, 'survey_sent_at', None):
        order.survey_sent_at = now
    if status == 'has_result' and not getattr(order, 'result_at', None):
        order.result_at = now
    if status == 'completed' and not getattr(order, 'completed_at', None):
        order.completed_at = now


def finish_order_survey(db, order_id, *, actor_id=None, now=None):
    """Finish once, locking the order before its sessions; preserve submitted work."""
    now = now or datetime.now(timezone.utc)
    order = db.query(ChiDinh).filter_by(id=order_id).with_for_update().populate_existing().first()
    if not order or not order.survey_template_id:
        raise SurveyLifecycleError('Không tìm thấy chỉ định khảo sát', 404)
    if order.status == 'completed':
        return order, False
    deadline = order.survey_expires_at
    expired = deadline is not None and deadline <= now
    if not expired and actor_id is None:
        raise SurveyLifecycleError('Khảo sát chưa hết hạn', 409)
    finished_at = deadline if expired else now
    sessions = db.query(SurveySession).filter_by(order_id=order.id).order_by(SurveySession.id).with_for_update().all()
    for session in sessions:
        # A submitted session stays completed so its saved answers remain readable.
        if session.status in (SurveySessionStatus.pending, SurveySessionStatus.in_progress):
            session.status = SurveySessionStatus.expired if expired else SurveySessionStatus.closed
            session.updated_at = finished_at.replace(tzinfo=None)
    transition_order(order, 'completed', finished_at)
    order.completion_reason = 'expired' if expired else 'doctor'
    order.completed_by = None if expired else actor_id
    db.flush()
    return order, True


def expire_due_order_surveys(db, now=None):
    """Reconcile deadlines before workflow reads/writes; caller commits and emits."""
    now = now or datetime.now(timezone.utc)
    ids = db.query(ChiDinh.id).filter(
        ChiDinh.survey_template_id.isnot(None), ChiDinh.status != 'completed',
        ChiDinh.survey_expires_at <= now,
    ).order_by(ChiDinh.id).all()
    changed = []
    for (order_id,) in ids:
        order, did_change = finish_order_survey(db, order_id, now=now)
        if did_change:
            changed.append(order)
    return changed


def _verify_survey_submitter(data, db, order, session):
    examination = db.query(Examination).filter_by(id=session.examination_id).first()
    try:
        matches = (int(data.get('patient_id')) == session.patient_id == examination.patient_id
                   and int(data.get('examination_id')) == session.examination_id
                   and int(data.get('survey_template_id')) == session.survey_template_id == order.survey_template_id
                   and examination.appointment_id == order.appointment_id)
    except (TypeError, ValueError, AttributeError):
        matches = False
    if not matches:
        raise SurveyLifecycleError('Bài trả lời không khớp chỉ định hoặc phiên khảo sát')


def _survey_submission_state(data, db, order, session):
    existing = db.query(SurveyResponse).filter_by(session_id=session.id).first()
    if session.status == SurveySessionStatus.completed:
        if existing and existing.responses == data.get('responses'):
            return existing, order, session, False
        raise SurveyLifecycleError('Khảo sát đã hoàn thành, không thể thay đổi bài đã nộp', 409)
    if order.status in ('has_result', 'completed'):
        raise SurveyLifecycleError('Chỉ định đã có kết quả hoặc đã hoàn thành', 409)
    if session.status not in (SurveySessionStatus.pending, SurveySessionStatus.in_progress) or session.is_expired():
        raise SurveyLifecycleError('Link khảo sát đã đóng hoặc hết hạn', 410)
    return None


def submit_order_survey(db, data):
    """Validate, score and record a result atomically; caller commits then emits."""
    if not isinstance(data, dict) or not data.get('session_token'):
        raise SurveyLifecycleError('Thiếu phiên khảo sát hợp lệ')
    # All lifecycle writes acquire the order before the session lock.
    session = db.query(SurveySession).filter_by(session_token=data['session_token']).first()
    if not session or not session.order_id:
        raise SurveyLifecycleError('Phiên khảo sát chưa liên kết đúng chỉ định', 404)
    order = db.query(ChiDinh).filter_by(id=session.order_id).with_for_update().populate_existing().first()
    session = db.query(SurveySession).filter_by(id=session.id).with_for_update().populate_existing().first()
    if not order:
        raise SurveyLifecycleError('Không tìm thấy chỉ định', 404)
    _verify_survey_submitter(data, db, order, session)
    error_response = _survey_submission_state(data, db, order, session)
    if error_response is not None:
        return error_response
    template = db.query(SurveyTemplate).filter_by(id=session.survey_template_id).first()
    if not template:
        raise SurveyLifecycleError('Không tìm thấy mẫu khảo sát')
    answers = data.get('responses')
    if not answers:
        raise SurveyLifecycleError('Chưa có câu trả lời để nộp')
    snapshot = session.template_snapshot or {'name': template.name, 'content': deepcopy(template.content)}
    scores = score_survey_responses(snapshot['content'], answers)
    snapshot = deepcopy(snapshot)
    summary = evaluate_survey_results(snapshot['content'], answers)
    if summary is not None:
        snapshot['result_summary'] = summary
    now = datetime.now(timezone.utc)
    result = SurveyResponse(order_id=order.id, session_id=session.id,
        patient_id=session.patient_id, examination_id=session.examination_id,
        survey_template_id=template.id, responses=answers, total_scores=scores,
        template_snapshot=deepcopy(snapshot),
        created_at=now, updated_at=now)
    db.add(result)
    transition_order(order, 'has_result', now)
    session.status = SurveySessionStatus.completed
    session.updated_at = now.replace(tzinfo=None)
    db.flush()
    return result, order, session, True
