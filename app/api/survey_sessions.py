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
from app.realtime.events import emit_survey_changed
from app.utils.clinical_access import appointment_access_error
import qrcode
import io
import base64
from datetime import datetime, timedelta, timezone
import uuid
import logging
from sqlalchemy import text

survey_sessions = Blueprint('survey_sessions', __name__)
logger = logging.getLogger(__name__)

def normalize_datetime(dt):
    """Normalize datetime to timezone-naive UTC datetime for consistent comparison"""
    if dt is None:
        return None
    # If datetime is timezone-aware, convert to UTC then remove timezone info
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    # If datetime is naive, assume it's already in UTC
    return dt

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

        linked_order = db.query(ChiDinh).filter(
            ChiDinh.appointment_id == appointment.id,
            ChiDinh.survey_template_id == template_id,
        ).first()
        if not linked_order:
            return jsonify({'success': False, 'message': 'Mẫu khảo sát chưa được gắn vào chỉ định của lượt khám'}), 400
        
        # Always create a new session when user clicks "Gửi link khảo sát"
        # This ensures each link is unique and can be tracked separately
        # Previous sessions are kept in database for history/audit purposes
        session_token = str(uuid.uuid4())
        now = get_current_datetime()
        expires_at = now + timedelta(hours=24)
        
        session = SurveySession(
            patient_id=patient_id,
            examination_id=examination_id,
            session_token=session_token,
            status=SurveySessionStatus.pending,
            expires_at=expires_at,
            created_at=now,
            updated_at=now
        )
        db.add(session)
        
        db.commit()
        db.refresh(session)
        emit_survey_changed('session_created', session=session, appointment_id=examination.appointment_id, extra={'template_id': template_id})
        
        # Generate survey URL (include template_id if provided)
        base_url = request.host_url.rstrip('/')
        survey_url = f"{base_url}/patient-survey.html?patient_id={patient_id}&examination_id={examination_id}&session_token={session.session_token}"
        if template_id:
            survey_url += f"&template_id={template_id}"
        
        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(survey_url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return jsonify({
            'success': True,
            'data': {
                'session_id': session.id,
                'session_token': session.session_token,
                'survey_url': survey_url,
                'qr_code': f"data:image/png;base64,{qr_base64}",
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
        session_row = db.query(SurveySession).filter(SurveySession.examination_id == examination_id).order_by(SurveySession.created_at.desc()).first()
        
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
        updated_at = session_row.updated_at
        started_at = session_row.started_at
        template_id = _get_order_template_id(db, appointment.id)
        
        # Get patient info
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        patient_name = patient.full_name if patient else 'Unknown'
        patient_phone = patient.phone if patient else 'Unknown'
        
        # Get survey responses if completed
        responses_data = None
        if status == SurveySessionStatus.completed:
            responses_data = []
            response_rows = db.query(SurveyResponse).filter(SurveyResponse.examination_id == examination_id).all()
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
                'session_token': session_token,
                'status': status.value,
                'patient_name': patient_name,
                'patient_phone': patient_phone,
                'created_at': created_at.isoformat(),
                'expires_at': expires_at.isoformat(),
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
        
        if status not in ['pending', 'in_progress', 'completed', 'expired']:
            return jsonify({'success': False, 'message': 'Trạng thái không hợp lệ'}), 400
        
        db_gen = get_db()
        db = next(db_gen)
        
        # Check if session exists
        session_row = db.query(SurveySession).filter(SurveySession.id == session_id).first()
        
        if not session_row:
            return jsonify({'success': False, 'message': 'Không tìm thấy phiên khảo sát'}), 404

        _, _, access_error = _get_accessible_examination(db, user, session_row.examination_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error[0]}), access_error[1]
        
        # Check if session is expired
        if session_row.is_expired():
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
        
        # Update session status
        now = get_current_datetime()
        # Convert string to enum
        status_enum = None
        if status == 'pending':
            status_enum = SurveySessionStatus.pending
        elif status == 'in_progress':
            status_enum = SurveySessionStatus.in_progress
        elif status == 'completed':
            status_enum = SurveySessionStatus.completed
        elif status == 'expired':
            status_enum = SurveySessionStatus.expired
        
        # Set started_at when status changes to in_progress
        if status == 'in_progress' and session_row.status != SurveySessionStatus.in_progress:
            session_row.started_at = now
        
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
        
        if status not in ['pending', 'in_progress', 'completed', 'expired', 'closed']:
            return jsonify({'success': False, 'message': 'Trạng thái không hợp lệ'}), 400
        
        db_gen = get_db()
        db = next(db_gen)
        
        # Check if session exists
        session_row = db.query(SurveySession).filter(SurveySession.session_token == session_token).first()
        
        if not session_row:
            return jsonify({'success': False, 'message': 'Không tìm thấy phiên khảo sát'}), 404
        
        # Check if session is expired (unless we're explicitly setting it to expired or closed)
        if status not in ['expired', 'closed'] and session_row.is_expired():
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
        
        # Update session status
        now = get_current_datetime()
        
        # Convert string to enum
        status_enum = None
        if status == 'pending':
            status_enum = SurveySessionStatus.pending
        elif status == 'in_progress':
            status_enum = SurveySessionStatus.in_progress
        elif status == 'completed':
            status_enum = SurveySessionStatus.completed
        elif status == 'expired':
            status_enum = SurveySessionStatus.expired
        elif status == 'closed':
            status_enum = SurveySessionStatus.closed
        
        # Set started_at when status changes to in_progress
        if status == 'in_progress' and current_status != SurveySessionStatus.in_progress:
            session_row.started_at = now
        
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
                'status': status.value,
                'patient_id': patient_id,
                'examination_id': examination_id,
                'patient_name': patient_name,
                'patient_phone': patient_phone,
                'created_at': created_at.isoformat() if created_at else None,
                'started_at': started_at.isoformat() if started_at else None,
                'updated_at': updated_at.isoformat() if updated_at else None,
                'expires_at': expires_at.isoformat() if expires_at else None
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
def close_survey_session(session_token):
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
        
        session_id = session_row.id
        patient_id = session_row.patient_id
        examination_id = session_row.examination_id
        
        # Update session status to closed
        now = get_current_datetime()
        session_row.status = SurveySessionStatus.closed
        session_row.updated_at = now
        db.commit()
        db.refresh(session_row)
        emit_survey_changed(
            'closed',
            session=session_row,
            appointment_id=get_appointment_id_for_examination(db, examination_id),
            extra={'status': 'closed'}
        )
        
        return jsonify({
            'success': True,
            'message': 'Khảo sát đã được kết thúc thành công',
            'data': {
                'session_id': session_id,
                'status': 'closed',
                'patient_id': patient_id,
                'examination_id': examination_id,
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
