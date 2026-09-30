"""Server-owned partial answers; drafts never count as a submitted result."""
from copy import deepcopy
from datetime import datetime, timezone
import json

from app.models.chi_dinh import ChiDinh
from app.models.survey_session import SurveySession, SurveySessionStatus
from app.models.survey_template import SurveyTemplate
from app.modules.orders.services.survey_lifecycle import SurveyLifecycleError
from app.utils.survey_scoring import questions_from_content, score_survey_responses


def session_snapshot(db, session):
    if session.template_snapshot:
        return session.template_snapshot
    template = db.query(SurveyTemplate).filter_by(id=session.survey_template_id).first()
    if not template:
        raise SurveyLifecycleError('Không tìm thấy mẫu khảo sát', 404)
    return {'name': template.name, 'content': deepcopy(template.content)}


def draft_view(db, session):
    snapshot = session_snapshot(db, session)
    return {
        'order_id': session.order_id, 'patient_id': session.patient_id,
        'examination_id': session.examination_id, 'survey_template_id': session.survey_template_id,
        'responses': session.draft_responses or {}, 'revision': session.draft_revision,
        'updated_at': session.draft_updated_at.isoformat() if session.draft_updated_at else None,
        'template_name': snapshot['name'], 'template_content': snapshot['content'],
        'session_status': session.status.value,
    }


def _validated_draft_answers(data, session):
    answers = data.get('responses')
    if not isinstance(answers, dict) or len(json.dumps(answers, ensure_ascii=False)) > 131072:
        raise SurveyLifecycleError('Dữ liệu tiến độ không hợp lệ hoặc quá lớn')
    for value in answers.values():
        values = value if isinstance(value, list) else [value]
        if any(type(item) not in (str, int, float) for item in values):
            raise SurveyLifecycleError('Giá trị câu trả lời không hợp lệ')
    revision = data.get('revision')
    if type(revision) is not int or revision != session.draft_revision:
        # A lost response may be retried safely with the exact same contents.
        if type(revision) is int and revision == session.draft_revision - 1 and answers == session.draft_responses:
            return session, None
        raise SurveyLifecycleError('Bài đang được thay đổi ở phiên khác. Vui lòng tải lại trước khi tiếp tục.', 409)
    return None, answers


def save_survey_draft(db, data):
    if not isinstance(data, dict) or not data.get('session_token'):
        raise SurveyLifecycleError('Thiếu phiên khảo sát')
    session = db.query(SurveySession).filter_by(session_token=data['session_token']).first()
    if not session or not session.order_id:
        raise SurveyLifecycleError('Phiên khảo sát không hợp lệ', 404)
    # Same lock order as submission and closure, so late autosaves cannot reopen work.
    order = db.query(ChiDinh).filter_by(id=session.order_id).with_for_update().populate_existing().first()
    session = db.query(SurveySession).filter_by(id=session.id).with_for_update().populate_existing().first()
    if not order or order.status in ('has_result', 'completed') or session.status not in (
            SurveySessionStatus.pending, SurveySessionStatus.in_progress) or session.is_expired():
        raise SurveyLifecycleError('Khảo sát đã nộp hoặc đã kết thúc; không thể lưu thêm', 410)
    try:
        matches = (int(data.get('patient_id')) == session.patient_id
                   and int(data.get('examination_id')) == session.examination_id
                   and int(data.get('survey_template_id')) == session.survey_template_id == order.survey_template_id)
    except (TypeError, ValueError):
        matches = False
    if not matches:
        raise SurveyLifecycleError('Tiến độ không khớp phiên khảo sát')
    retried_session, answers = _validated_draft_answers(data, session)
    if retried_session is not None:
        return retried_session
    snapshot = session_snapshot(db, session)
    partial_content = deepcopy(snapshot['content'])
    for question in questions_from_content(partial_content):
        question['required'] = False
    # Validate provided identities/options, allowing unanswered required questions.
    score_survey_responses(partial_content, answers)
    session.template_snapshot = snapshot
    session.draft_responses = deepcopy(answers)
    session.draft_revision += 1
    session.draft_updated_at = datetime.now(timezone.utc)
    if session.status == SurveySessionStatus.pending:
        session.status = SurveySessionStatus.in_progress
    if not session.started_at:
        session.started_at = session.draft_updated_at
    db.flush()
    return session
