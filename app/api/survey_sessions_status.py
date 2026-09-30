"""app.api.survey_sessions: phần 2 — tách từ survey_sessions.py (import ở cuối survey_sessions.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from app.models.survey_session import SurveySession, SurveySessionStatus
from app.models.patient import Patient
from app.api.auth import require_auth
from app.realtime.events import emit_survey_changed
from datetime import datetime, timezone
from app.api.survey_sessions import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    _get_accessible_examination,
    get_appointment_id_for_examination,
    get_current_datetime,
    logger,
    survey_sessions,
    utc_iso,
)
from app.utils.api_error_contract import api_error_boundary


@survey_sessions.route('/survey-sessions/<int:session_id>/update-status', methods=['PUT'])
@require_auth
@api_error_boundary(success=False, message='Lỗi: {error}')
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

    finally:
        if db_gen:
            next(db_gen, None)


@survey_sessions.route('/survey-sessions/update-status-by-token', methods=['PUT'])
@api_error_boundary(success=False, message='Lỗi: {error}')
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

    finally:
        if db_gen:
            next(db_gen, None)


@survey_sessions.route('/survey-sessions/status/<session_token>', methods=['GET'])
@api_error_boundary(success=False, message='Lỗi: {error}')
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

    finally:
        if db_gen:
            next(db_gen, None)


@survey_sessions.route('/survey-sessions/close/<session_token>', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='Lỗi: {error}')
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

    finally:
        if db_gen:
            next(db_gen, None)
