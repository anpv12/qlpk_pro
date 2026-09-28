from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.survey_session import SurveySession, SurveySessionStatus
from app.models.patient import Patient
from app.models.examination import Examination
from app.models.survey_response import SurveyResponse
from app.models.appointment import Appointment
from app.models.chi_dinh import ChiDinh
from app.models.survey_template import SurveyTemplate
from app.api.auth import require_auth
from app.realtime.events import emit_survey_changed, emit_order_changed
from app.modules.orders.services.survey_lifecycle import transition_order
from app.services.notification_service import NotificationService
from app.utils.clinical_access import appointment_access_error
import qrcode
import io
import base64
from datetime import datetime, timedelta, timezone
import uuid
import logging
from copy import deepcopy

survey_sessions = Blueprint('survey_sessions', __name__)
logger = logging.getLogger(__name__)
notification_service = NotificationService()


@survey_sessions.route('/survey-sessions/draft', methods=['GET', 'PUT'])
def survey_draft():
    """The secret session link may read/write only its own draft."""
    from app.modules.orders.services.survey_draft import draft_view, save_survey_draft, session_snapshot
    from app.modules.orders.services.survey_lifecycle import SurveyLifecycleError
    db = next(get_db())
    try:
        if request.method == 'PUT':
            session = save_survey_draft(db, request.get_json(silent=True))
            db.commit()
        else:
            token = request.args.get('session_token')
            if not token:
                raise SurveyLifecycleError('Thiếu phiên khảo sát', 401)
            session = db.query(SurveySession).filter_by(session_token=token).first()
            if not session or not session.order_id:
                raise SurveyLifecycleError('Phiên khảo sát không hợp lệ', 404)
        data = draft_view(db, session)
        submitted = db.query(SurveyResponse).filter_by(session_id=session.id).first()
        data['submitted'] = submitted is not None
        if not submitted:
            from app.api.survey_templates import template_validation_message
            data['validation_message'] = template_validation_message(data['template_content'])
        if submitted:
            snapshot = submitted.template_snapshot or session_snapshot(db, session)
            data.update(responses=submitted.responses,
                        result_summary=snapshot.get('result_summary'),
                        template_name=snapshot['name'], template_content=snapshot['content'])
        response = jsonify(success=True, data=data)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except ValueError as error:
        db.rollback()
        return jsonify(success=False, message=str(error)), getattr(error, 'status', 400)
    finally:
        db.close()

def normalize_datetime(dt):
    """Normalize datetime to timezone-naive UTC datetime for consistent comparison"""
    if dt is None:
        return None
    # If datetime is timezone-aware, convert to UTC then remove timezone info
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    # If datetime is naive, assume it's already in UTC
    return dt

def utc_iso(value):
    normalized = normalize_datetime(value)
    return normalized.isoformat() + 'Z' if normalized else None


def _session_link_payload(session):
    """Create URL and QR together for both generation and subsequent reads."""
    from urllib.parse import urlencode
    params = {'patient_id': session.patient_id, 'examination_id': session.examination_id,
              'session_token': session.session_token}
    if session.survey_template_id:
        params['template_id'] = session.survey_template_id
    survey_url = f"{request.host_url.rstrip('/')}/patient-survey.html?{urlencode(params)}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(survey_url)
    qr.make(fit=True)
    buffer = io.BytesIO()
    qr.make_image(fill_color='black', back_color='white').save(buffer, format='PNG')
    return {'survey_url': survey_url,
            'qr_code': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()}


def get_current_datetime():
    """Get current datetime as timezone-naive UTC"""
    return datetime.now(timezone.utc).replace(tzinfo=None)

def get_appointment_id_for_examination(db, examination_id):
    if not examination_id:
        return None
    row = db.query(Examination.appointment_id).filter(Examination.id == examination_id).first()
    return row[0] if row else None


def _get_accessible_examination(db, user, examination_id):
    examination = db.query(Examination).filter(Examination.id == examination_id).first()
    if not examination:
        return None, None, ('Không tìm thấy lần khám', 404)
    appointment = db.query(Appointment).filter(Appointment.id == examination.appointment_id).first()
    if not appointment:
        return None, None, ('Không tìm thấy lịch hẹn của lần khám', 404)
    access_error = appointment_access_error(user, appointment)
    if access_error:
        order_id = request.args.get('order_id', type=int) or (request.get_json(silent=True) or {}).get('order_id')
        assigned = db.query(ChiDinh.id).filter(ChiDinh.id == order_id, ChiDinh.appointment_id == appointment.id, ChiDinh.in_house_unit_id == user.id).first() if order_id else None
        if not assigned:
            return None, None, (access_error, 403)
    return examination, appointment, None


def _get_order_template_id(db, appointment_id):
    row = (
        db.query(ChiDinh)
        .filter(
            ChiDinh.appointment_id == appointment_id,
            ChiDinh.survey_template_id.isnot(None),
        )
        .order_by(ChiDinh.created_at.desc(), ChiDinh.id.desc())
        .first()
    )
    return row.survey_template_id if row else None


def _get_template_id_for_session(db, session_row, appointment_id=None):
    """Resolve the survey template tied to a session before notifying."""
    if getattr(session_row, 'survey_template_id', None):
        return session_row.survey_template_id
    response = db.query(SurveyResponse.survey_template_id).filter(
        SurveyResponse.examination_id == session_row.examination_id,
    ).order_by(
        SurveyResponse.updated_at.desc().nullslast(),
        SurveyResponse.created_at.desc().nullslast(),
        SurveyResponse.id.desc(),
    ).first()
    if response and response[0]:
        return response[0]
    return _get_order_template_id(db, appointment_id) if appointment_id else None


def _emit_survey_completion_notifications(db, session_row, template_id, actor_user=None):
    """Persist survey-completion notifications without breaking status updates."""
    try:
        notifications = notification_service.create_survey_completed_notifications(
            db,
            session_row,
            template_id=template_id,
            actor_user=actor_user,
        )
        payloads = notification_service.build_realtime_payloads(db, notifications)
        db.commit()
        notification_service.emit_realtime_payloads(payloads)
    except Exception:
        # The session transition is already committed; notification delivery is
        # best effort and must not turn a completed survey into an API failure.
        db.rollback()
        logger.exception('Không thể tạo thông báo hoàn thành khảo sát')

@survey_sessions.route('/survey-sessions/generate', methods=['POST'])
@require_auth
def generate_survey_session(user):
    """Generate survey session with QR code and URL"""
    db_gen = None
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({'success': False, 'message': 'Dữ liệu tạo khảo sát không hợp lệ'}), 400
        patient_id = data.get('patient_id')
        examination_id = data.get('examination_id')
        template_id = data.get('template_id')  # Get template_id from request
        
        if not patient_id or not examination_id:
            return jsonify({'success': False, 'message': 'Thiếu patient_id hoặc examination_id'}), 400
        
        db_gen = get_db()
        db = next(db_gen)
        
        try:
            patient_id = int(patient_id)
            examination_id = int(examination_id)
            template_id = int(template_id) if template_id is not None else None
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'ID bệnh nhân, lần khám hoặc mẫu khảo sát không hợp lệ'}), 400

        # Check if patient, examination and appointment are in the current user's scope.
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({'success': False, 'message': 'Không tìm thấy bệnh nhân'}), 404

        examination, appointment, access_error = _get_accessible_examination(db, user, examination_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error[0]}), access_error[1]
        if examination.patient_id != patient_id:
            return jsonify({'success': False, 'message': 'Bệnh nhân không khớp với lần khám'}), 400

        if not template_id:
            template_id = _get_order_template_id(db, appointment.id)
        if not template_id:
            return jsonify({'success': False, 'message': 'Chỉ định chưa gắn mẫu khảo sát'}), 400

        template = db.query(SurveyTemplate).filter(
            SurveyTemplate.id == template_id,
            SurveyTemplate.is_active.is_(True),
            SurveyTemplate.content.isnot(None),
        ).first()
        if not template:
            return jsonify({'success': False, 'message': 'Mẫu khảo sát không tồn tại hoặc đã ngừng hoạt động'}), 400

        order_id = data.get('order_id')
        if not order_id:
            return jsonify(success=False, message='Thiếu chỉ định cần gửi khảo sát'), 400
        linked_order = db.query(ChiDinh).filter(
            ChiDinh.id == order_id, ChiDinh.appointment_id == appointment.id,
            ChiDinh.survey_template_id == template_id,
        ).with_for_update().first()
        if not linked_order:
            return jsonify({'success': False, 'message': 'Mẫu khảo sát chưa được gắn vào chỉ định của lượt khám'}), 400
        
        if linked_order.status in ('has_result', 'completed'):
            return jsonify(success=False, message='Khảo sát đã có kết quả hoặc đã kết thúc.'), 409
        session = db.query(SurveySession).filter(
            SurveySession.order_id == linked_order.id,
            SurveySession.status.in_([SurveySessionStatus.pending, SurveySessionStatus.in_progress]),
            SurveySession.expires_at > get_current_datetime(),
        ).order_by(SurveySession.id.desc()).first()
        if not session:
            now = get_current_datetime()
            session = SurveySession(patient_id=patient_id, examination_id=examination_id,
                order_id=linked_order.id, survey_template_id=template_id,
                session_token=str(uuid.uuid4()), status=SurveySessionStatus.pending,
                expires_at=now + timedelta(hours=24), created_at=now, updated_at=now)
            db.add(session)
        from app.utils.survey_scoring import validate_survey_content
        try:
            validate_survey_content((session.template_snapshot or {}).get('content', template.content))
        except ValueError as exc:
            # An empty invalid legacy snapshot may adopt a repaired catalog template.
            # A draft or submitted response must keep the exact questionnaire it used.
            can_refresh = not session.draft_responses and not db.query(SurveyResponse.id).filter_by(session_id=session.id).first()
            try:
                if not can_refresh:
                    raise exc
                validate_survey_content(template.content)
            except ValueError:
                db.rollback()
                return jsonify(success=False, code='SURVEY_TEMPLATE_INVALID', message='Mẫu khảo sát chưa đủ cấu hình điểm. Vui lòng kiểm tra lại.'), 400
            session.template_snapshot = {'name': template.name, 'content': deepcopy(template.content)}
        if not session.template_snapshot:
            session.template_snapshot = {'name': template.name, 'content': deepcopy(template.content)}
        transition_order(linked_order, 'survey_sent')
        linked_order.survey_expires_at = session.expires_at.replace(tzinfo=timezone.utc)
        db.commit()
        db.refresh(session)
        emit_order_changed('survey_sent', order=linked_order)
        emit_survey_changed('session_created', session=session, appointment_id=examination.appointment_id, extra={'template_id': template_id})

        return jsonify({
            'success': True,
            'data': {
                'session_id': session.id,
                'session_token': session.session_token,
                **_session_link_payload(session),
                'patient_name': patient.full_name,
                'patient_phone': patient.phone,
                'expires_at': session.expires_at.isoformat(),
                'created_at': session.created_at.isoformat(),
                'status': session.status.value,
                'template_id': template_id  # Include template_id in response
            }
        })
        
    except Exception as e:
        logger.exception("Unhandled survey session error")
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'}), 500
    finally:
        if db_gen:
            try:
                next(db_gen, None)
            except StopIteration:
                pass

@survey_sessions.route('/survey-sessions/<int:examination_id>/status', methods=['GET'])
@require_auth
def get_survey_status(user, examination_id):
    """Get survey status for an examination"""
    db_gen = None
    try:
        db_gen = get_db()
        db = next(db_gen)

        examination, appointment, access_error = _get_accessible_examination(db, user, examination_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error[0]}), access_error[1]
        
        # Get latest session
        session_query = db.query(SurveySession).filter(SurveySession.examination_id == examination_id)
        order_id = request.args.get('order_id', type=int)
        if order_id:
            session_query = session_query.filter(SurveySession.order_id == order_id)
        session_row = session_query.order_by(SurveySession.created_at.desc()).first()
        
        if not session_row:
            return jsonify({
                'success': True,
                'data': {
                    'status': 'not_started',
                    'message': 'Chưa có phiên khảo sát nào',
                    'template_id': _get_order_template_id(db, appointment.id),
                }
            })
        
        # Check if session is expired
        if session_row.is_expired() and session_row.status not in [SurveySessionStatus.completed, SurveySessionStatus.closed, SurveySessionStatus.expired]:
            session_row.status = SurveySessionStatus.expired
            session_row.updated_at = get_current_datetime()
            db.commit()
            db.refresh(session_row)
            emit_survey_changed(
                'expired',
                session=session_row,
                appointment_id=get_appointment_id_for_examination(db, session_row.examination_id),
                extra={'status': 'expired'}
            )
        
        session_id = session_row.id
        patient_id = session_row.patient_id
        session_token = session_row.session_token
        status = session_row.status
        expires_at = session_row.expires_at
        created_at = session_row.created_at
        started_at = session_row.started_at
        template_id = session_row.survey_template_id
        
        # Get patient info
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        patient_name = patient.full_name if patient else 'Unknown'
        patient_phone = patient.phone if patient else 'Unknown'
        
        # Get survey responses if completed
        responses_data = None
        if status == SurveySessionStatus.completed:
            responses_data = []
            response_rows = db.query(SurveyResponse).filter(SurveyResponse.order_id == session_row.order_id).all() if session_row.order_id else []
            for row in response_rows:
                responses_data.append({
                    'template_id': row.survey_template_id,
                    'total_scores': row.total_scores,
                    'completed_at': row.created_at.isoformat()
                })
        
        # Calculate elapsed_time correctly: use started_at if available, otherwise created_at for pending/in_progress
        elapsed_time = None
        if status in [SurveySessionStatus.pending, SurveySessionStatus.in_progress]:
            now = get_current_datetime()
            if started_at:
                started_at_normalized = normalize_datetime(started_at)
                elapsed_time = (now - started_at_normalized).total_seconds()
            elif created_at:
                created_at_normalized = normalize_datetime(created_at)
                elapsed_time = (now - created_at_normalized).total_seconds()
        
        return jsonify({
            'success': True,
            'data': {
                'session_id': session_id,
                'order_id': session_row.order_id,
                'updated_at': utc_iso(session_row.updated_at),
                'session_token': session_token,
                **_session_link_payload(session_row),
                'status': status.value,
                'patient_name': patient_name,
                'patient_phone': patient_phone,
                'created_at': utc_iso(created_at),
                'expires_at': utc_iso(expires_at),
                'responses': responses_data,
                'elapsed_time': elapsed_time,
                'template_id': template_id,
            }
        })
        
    except Exception as e:
        logger.exception("Unhandled survey session error")
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'}), 500
    finally:
        if db_gen:
            try:
                next(db_gen, None)
            except StopIteration:
                pass

@survey_sessions.route('/survey-sessions/<int:session_id>/update-status', methods=['PUT'])
@require_auth
def update_survey_status(user, session_id):
    """Update survey session status"""
    db_gen = None
    try:
        data = request.get_json(silent=True) or {}
        status = data.get('status')
        
        if status not in ['pending', 'in_progress']:
            return jsonify(success=False, message='Trạng thái này do tiến trình chỉ định quản lý'), 409
        
        db_gen = get_db()
        db = next(db_gen)
        
        # Check if session exists
        session_row = db.query(SurveySession).filter(SurveySession.id == session_id).with_for_update().populate_existing().first()
        
        if not session_row:
            return jsonify({'success': False, 'message': 'Không tìm thấy phiên khảo sát'}), 404

        _, _, access_error = _get_accessible_examination(db, user, session_row.examination_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error[0]}), access_error[1]
        
        # Check if session is expired
        if session_row.is_expired() and session_row.status in (SurveySessionStatus.pending, SurveySessionStatus.in_progress):
            if session_row.status != SurveySessionStatus.expired:
                session_row.status = SurveySessionStatus.expired
                session_row.updated_at = get_current_datetime()
                db.commit()
                db.refresh(session_row)
                emit_survey_changed(
                    'expired',
                    session=session_row,
                    appointment_id=get_appointment_id_for_examination(db, session_row.examination_id),
                    extra={'status': 'expired'}
                )
            return jsonify({'success': False, 'message': 'Phiên khảo sát đã hết hạn'}), 410
        
        if session_row.status in (SurveySessionStatus.completed, SurveySessionStatus.closed, SurveySessionStatus.expired):
            return jsonify(success=False, message='Link khảo sát không còn cho phép thay đổi'), 409
        # Update session status
        now = get_current_datetime()
        # Convert string to enum
        status_enum = None
        if status == 'pending':
            status_enum = SurveySessionStatus.pending
        elif status == 'in_progress':
            status_enum = SurveySessionStatus.in_progress
        
        # Set started_at when status changes to in_progress
        if status == 'in_progress' and session_row.status != SurveySessionStatus.in_progress:
            session_row.started_at = datetime.now(timezone.utc)
        
        session_row.status = status_enum
        session_row.updated_at = now
        db.commit()
        db.refresh(session_row)
        emit_survey_changed(
            'status_updated',
            session=session_row,
            appointment_id=get_appointment_id_for_examination(db, session_row.examination_id),
            extra={'status': status}
        )
        
        return jsonify({
            'success': True,
            'data': {
                'session_id': session_id,
                'status': status,
                'updated_at': now.isoformat()
            }
        })
        
    except Exception as e:
        logger.exception("Unhandled survey session error")
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'}), 500
    finally:
        if db_gen:
            try:
                next(db_gen, None)
            except StopIteration:
                pass

@survey_sessions.route('/survey-sessions/update-status-by-token', methods=['PUT'])
def update_survey_status_by_token():
    """Update survey session status by session token"""
    db_gen = None
    try:
        data = request.get_json(silent=True) or {}
        session_token = data.get('session_token')
        status = data.get('status')
        
        if not session_token:
            return jsonify({'success': False, 'message': 'Thiếu session token'}), 400
        
        if status not in ['pending', 'in_progress']:
            return jsonify(success=False, message='Trạng thái này do tiến trình chỉ định quản lý'), 409
        
        db_gen = get_db()
        db = next(db_gen)
        
        # Check if session exists
        session_row = db.query(SurveySession).filter(SurveySession.session_token == session_token).with_for_update().populate_existing().first()
        
        if not session_row:
            return jsonify({'success': False, 'message': 'Không tìm thấy phiên khảo sát'}), 404
        
        # Check if session is expired (unless we're explicitly setting it to expired or closed)
        if session_row.is_expired() and session_row.status in (SurveySessionStatus.pending, SurveySessionStatus.in_progress):
            if session_row.status != SurveySessionStatus.expired:
                session_row.status = SurveySessionStatus.expired
                session_row.updated_at = get_current_datetime()
                db.commit()
                db.refresh(session_row)
                emit_survey_changed(
                    'expired',
                    session=session_row,
                    appointment_id=get_appointment_id_for_examination(db, session_row.examination_id),
                    extra={'status': 'expired'}
                )
            return jsonify({'success': False, 'message': 'Phiên khảo sát đã hết hạn'}), 410
        
        session_id = session_row.id
        current_status = session_row.status
        
        if session_row.status in (SurveySessionStatus.completed, SurveySessionStatus.closed, SurveySessionStatus.expired):
            return jsonify(success=False, message='Link khảo sát không còn cho phép thay đổi'), 409
        # Update session status
        now = get_current_datetime()
        
        # Convert string to enum
        status_enum = None
        if status == 'pending':
            status_enum = SurveySessionStatus.pending
        elif status == 'in_progress':
            status_enum = SurveySessionStatus.in_progress
        
        # Set started_at when status changes to in_progress
        if status == 'in_progress' and current_status != SurveySessionStatus.in_progress:
            session_row.started_at = datetime.now(timezone.utc)
        
        session_row.status = status_enum
        session_row.updated_at = now
        db.commit()
        db.refresh(session_row)
        emit_survey_changed(
            'status_updated',
            session=session_row,
            appointment_id=get_appointment_id_for_examination(db, session_row.examination_id),
            extra={'status': status}
        )
        
        return jsonify({
            'success': True,
            'data': {
                'session_id': session_id,
                'status': status,
                'updated_at': now.isoformat()
            }
        })
        
    except Exception as e:
        logger.exception("Unhandled survey session error")
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'}), 500
    finally:
        if db_gen:
            try:
                next(db_gen, None)
            except StopIteration:
                pass

@survey_sessions.route('/survey-sessions/status/<session_token>', methods=['GET'])
def get_survey_session_status_by_token(session_token):
    """Get survey session status by session token"""
    db_gen = None
    try:
        if not session_token:
            return jsonify({'success': False, 'message': 'Thiếu session token'}), 400
        
        db_gen = get_db()
        db = next(db_gen)
        
        # Get session status with patient info
        session_row = db.query(SurveySession, Patient).filter(SurveySession.session_token == session_token).join(Patient, SurveySession.patient_id == Patient.id).first()
        
        if not session_row:
            return jsonify({'success': False, 'message': 'Không tìm thấy phiên khảo sát'}), 404
        
        survey_session, patient = session_row
        
        # Check if session is expired
        if survey_session.is_expired() and survey_session.status not in [SurveySessionStatus.completed, SurveySessionStatus.closed, SurveySessionStatus.expired]:
            survey_session.status = SurveySessionStatus.expired
            survey_session.updated_at = get_current_datetime()
            db.commit()
            db.refresh(survey_session)
            emit_survey_changed(
                'expired',
                session=survey_session,
                appointment_id=get_appointment_id_for_examination(db, survey_session.examination_id),
                extra={'status': 'expired'}
            )
        
        session_id = survey_session.id
        status = survey_session.status
        patient_id = survey_session.patient_id
        examination_id = survey_session.examination_id
        created_at = survey_session.created_at
        updated_at = survey_session.updated_at
        expires_at = survey_session.expires_at
        started_at = survey_session.started_at
        patient_name = patient.full_name
        patient_phone = patient.phone
        
        return jsonify({
            'success': True,
            'data': {
                'id': session_id,
                'order_id': survey_session.order_id,
                'template_id': survey_session.survey_template_id,
                'status': status.value,
                'patient_id': patient_id,
                'examination_id': examination_id,
                'patient_name': patient_name,
                'patient_phone': patient_phone,
                'created_at': utc_iso(created_at),
                'started_at': utc_iso(started_at),
                'updated_at': utc_iso(updated_at),
                'expires_at': utc_iso(expires_at)
            }
        })
        
    except Exception as e:
        logger.exception("Unhandled survey session error")
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'}), 500
    finally:
        if db_gen:
            try:
                next(db_gen, None)
            except StopIteration:
                pass

@survey_sessions.route('/survey-sessions/close/<session_token>', methods=['POST'])
@require_auth
def close_survey_session(user, session_token):
    """Close survey session - make it read-only"""
    db_gen = None
    try:
        if not session_token:
            return jsonify({'success': False, 'message': 'Thiếu session token'}), 400
        
        db_gen = get_db()
        db = next(db_gen)
        
        # Check if session exists
        session_row = db.query(SurveySession).filter(SurveySession.session_token == session_token).first()
        
        if not session_row:
            return jsonify({'success': False, 'message': 'Không tìm thấy phiên khảo sát'}), 404

        # Compatibility route delegates to the same authenticated order owner.
        from app.modules.orders.api.chi_dinh import finish_survey
        if not session_row.order_id:
            return jsonify(success=False, message='Phiên khảo sát chưa liên kết chỉ định'), 409
        return finish_survey.__wrapped__(user, session_row.order_id)
        
    except Exception as e:
        logger.exception("Unhandled survey session error")
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'}), 500
    finally:
        if db_gen:
            try:
                next(db_gen, None)
            except StopIteration:
                pass
