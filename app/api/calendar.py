from flask import Blueprint, request, jsonify, redirect, session
from app.core.database import get_db
from app.api.auth import require_auth
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
from app.models.user import User
from app.services.google_calendar_service import GoogleCalendarService
from app.core.config import settings
from app.realtime.events import emit_appointment_changed
from app.modules.appointments.services.calendar_access import (
    CalendarAccessError, calendar_actor, manages_all_calendars, parse_calendar_ids,
    calendar_date_range, prepare_calendar_batch, scope_calendar_query,
)
from datetime import datetime
import hashlib
import hmac
import secrets
import time
import logging
from app.services.access_sessions import SessionStoreUnavailable, session_digest_is_active
from app.services.auth import decode_access_claims
from app.services.browser_sessions import request_access_token

logger = logging.getLogger(__name__)

calendar_bp = Blueprint('calendar', __name__, url_prefix='/api/calendar')
OAUTH_SESSION_KEY = 'google_calendar_oauth'
OAUTH_STATE_TTL_SECONDS = 600


def _google_redirect_uri():
    if settings.GOOGLE_REDIRECT_URI:
        return settings.GOOGLE_REDIRECT_URI
    return request.host_url.rstrip('/') + '/api/calendar/oauth/google/callback'


def _calendar_redirect(error=None):
    return redirect('/appointment-management.html?' + (f'calendar_error={error}' if error else 'calendar_connected=google'))


def _begin_google_oauth(user):
    token = request_access_token()
    claims = decode_access_claims(token) or {}
    if claims.get('session_user_id') != user.id or not isinstance(claims.get('jti'), str):
        raise CalendarAccessError('Phiên đăng nhập không hợp lệ', 401)
    state = secrets.token_urlsafe(32)
    auth_url, code_verifier = GoogleCalendarService.get_authorization_url(_google_redirect_uri(), state)
    session.pop('google_calendar_user_id', None)
    session[OAUTH_SESSION_KEY] = {
        'state': state, 'code_verifier': code_verifier, 'user_id': user.id,
        'session_id': claims['jti'], 'session_generation': claims.get('session_generation'),
        'token_digest': hashlib.sha256(token.encode()).hexdigest(),
        'expires_at': int(time.time()) + OAUTH_STATE_TTL_SECONDS,
    }
    return auth_url


def _valid_pending_oauth(pending, state):
    return (isinstance(pending, dict) and isinstance(state, str) and isinstance(pending.get('state'), str)
            and hmac.compare_digest(state.encode(), pending['state'].encode())
            and type(pending.get('user_id')) is int and isinstance(pending.get('code_verifier'), str)
            and type(pending.get('expires_at')) is int and pending['expires_at'] >= time.time())


def _oauth_user(db, pending, lock=False):
    query = db.query(User).filter(User.id == pending['user_id']).populate_existing()
    user = (query.with_for_update(read=True) if lock else query).first()
    active_session = session_digest_is_active(pending.get('session_id'), pending.get('token_digest'),
                                              user_id=pending['user_id'], generation=pending.get('session_generation'))
    return user if user and user.is_active is True and active_session else None


@calendar_bp.route('/connect/google/init', methods=['GET'])
@require_auth
def connect_google_init(user: User):
    """Return the Google consent URL bound to the current login session."""
    try:
        return jsonify({'url': _begin_google_oauth(user)}), 200
    except CalendarAccessError as error:
        return jsonify({'error': str(error)}), error.status_code
    except Exception as error:
        logger.error('Error initiating Google Calendar connection: %s', type(error).__name__)
        return jsonify({'error': 'Không thể bắt đầu kết nối Google Calendar'}), 500

@calendar_bp.route('/connect/google', methods=['GET'])
@require_auth
def connect_google(user: User):
    """Redirect to the Google consent URL bound to the current login session."""
    try:
        return redirect(_begin_google_oauth(user))
    except CalendarAccessError as error:
        return jsonify({'error': str(error)}), error.status_code
    except Exception as error:
        logger.error('Error initiating Google Calendar connection: %s', type(error).__name__)
        return jsonify({'error': 'Không thể bắt đầu kết nối Google Calendar'}), 500

@calendar_bp.route('/oauth/google/callback', methods=['GET'])
def google_callback():
    """Complete OAuth only for the browser, account and login session that began it."""
    pending = session.pop(OAUTH_SESSION_KEY, None)
    session.pop('google_calendar_user_id', None)
    if not _valid_pending_oauth(pending, request.args.get('state')):
        return _calendar_redirect('invalid_state')
    if request.args.get('error'):
        return _calendar_redirect('access_denied')
    code = request.args.get('code')
    if not code:
        return _calendar_redirect('no_code')
    db = next(get_db())
    try:
        if not _oauth_user(db, pending):
            return _calendar_redirect('session_expired')
        db.rollback()
        tokens = GoogleCalendarService.exchange_code_for_token(code, _google_redirect_uri(), pending['code_verifier'])
        if not _oauth_user(db, pending, lock=True):
            db.rollback()
            return _calendar_redirect('session_expired')
        user_id = pending['user_id']
        connection = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.user_id == user_id
        ).with_for_update().first()
        if connection:
            connection.access_token = tokens['access_token']
            if tokens.get('refresh_token'):
                connection.refresh_token = tokens['refresh_token']
            connection.token_expires_at = tokens['expires_at']
            connection.is_active = True
        else:
            db.add(GoogleCalendarConnection(
                user_id=user_id, access_token=tokens['access_token'], refresh_token=tokens['refresh_token'],
                token_expires_at=tokens['expires_at'], is_active=True,
            ))
        db.commit()
        emit_appointment_changed('calendar_connected', extra={'user_id': user_id})
        logger.info('Google Calendar connected for user %s', user_id)
        return _calendar_redirect()
    except SessionStoreUnavailable:
        db.rollback()
        return _calendar_redirect('session_unavailable')
    except Exception as error:
        db.rollback()
        logger.error('Error completing Google Calendar connection: %s', type(error).__name__)
        return _calendar_redirect('oauth_failed')
    finally:
        db.close()

@calendar_bp.route('/disconnect', methods=['POST'])
@require_auth
def disconnect(user: User):
    """Ngắt kết nối Google Calendar"""
    db = next(get_db())
    try:
        connection = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.user_id == user.id
        ).first()
        
        if connection:
            connection.is_active = False
            db.commit()
            emit_appointment_changed('calendar_disconnected', extra={'user_id': user.id})
            logger.info(f"Google Calendar disconnected for user {user.id}")
            return jsonify({'success': True, 'message': 'Đã ngắt kết nối Google Calendar'})
        else:
            return jsonify({'success': False, 'message': 'Không tìm thấy kết nối'}), 404
            
    except Exception as e:
        db.rollback()
        logger.error(f"Error disconnecting Google Calendar: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@calendar_bp.route('/status', methods=['GET'])
@require_auth
def get_connection_status(user: User):
    """Lấy trạng thái kết nối Google Calendar của user"""
    db = next(get_db())
    try:
        connection = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.user_id == user.id
        ).first()
        
        is_connected = connection is not None and connection.is_active
        
        return jsonify({
            'connected': is_connected,
            'is_active': connection.is_active if connection else False
        })
    except Exception as e:
        logger.error(f"Error getting calendar status: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@calendar_bp.route('/validate-connections', methods=['POST'])
@require_auth
def validate_connections(user: User):
    """
    Validate tất cả connections, lấy email từ Google, xử lý trùng email.
    Gọi API này khi mở modal Sync để đảm bảo data integrity.
    """
    from datetime import datetime, timezone
    from app.services.google_calendar_service import GoogleCalendarService
    from googleapiclient.discovery import build
    
    db = next(get_db())
    try:
        actor = calendar_actor(db, user)
        # Lấy tất cả connections active
        query = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.is_active == True
        )
        if not manages_all_calendars(actor):
            query = query.filter(GoogleCalendarConnection.user_id == actor.id)
        connections = query.all()
        
        validated = []
        invalidated = []
        warnings = []
        email_map = {}  # email -> [connections] để detect trùng
        
        for conn in connections:
            try:
                # Lấy valid credentials
                credentials = GoogleCalendarService.get_valid_credentials(conn)
                if not credentials:
                    reason = GoogleCalendarService.get_connection_credential_error(conn) or 'invalid_token'
                    item = {
                        'user_id': conn.user_id,
                        'reason': reason
                    }
                    if GoogleCalendarService.is_terminal_connection_credential_error(conn):
                        conn.is_active = False
                        invalidated.append(item)
                    else:
                        warnings.append(item)
                    continue
                
                # Dùng Calendar API để lấy email (không cần thêm scope)
                # calendarList.get('primary') trả về calendar info với 'id' là email
                service = build('calendar', 'v3', credentials=credentials)
                calendar_info = service.calendarList().get(calendarId='primary').execute()
                google_email = calendar_info.get('id')  # Calendar ID chính là email
                
                if google_email:
                    conn.google_email = google_email
                    conn.last_verified_at = datetime.now(timezone.utc)
                    
                    # Track email để detect trùng
                    if google_email not in email_map:
                        email_map[google_email] = []
                    email_map[google_email].append(conn)
                    
                    validated.append({
                        'user_id': conn.user_id,
                        'email': google_email
                    })
                else:
                    warnings.append({
                        'user_id': conn.user_id,
                        'reason': 'no_email'
                    })
                    
            except Exception as e:
                logger.error(f"Error validating connection for user {conn.user_id}: {e}")
                warnings.append({
                    'user_id': conn.user_id,
                    'reason': str(e)
                })
        
        # Xử lý trùng email: chỉ giữ connection mới nhất (updated_at hoặc created_at)
        duplicates = []
        for email, conns in email_map.items():
            if len(conns) > 1:
                # Sort theo thời gian mới nhất (updated hoặc created)
                sorted_conns = sorted(
                    conns, 
                    key=lambda c: c.updated_at or c.created_at or datetime.min.replace(tzinfo=timezone.utc),
                    reverse=True
                )
                # Giữ connection đầu tiên (mới nhất), vô hiệu hóa các cái khác
                for old_conn in sorted_conns[1:]:
                    old_conn.is_active = False
                    duplicates.append({
                        'user_id': old_conn.user_id,
                        'email': email,
                        'reason': 'duplicate_email'
                    })
        
        db.commit()
        emit_appointment_changed('calendar_connections_validated', extra={
            'validated_count': len(validated),
            'invalidated_count': len(invalidated),
            'warning_count': len(warnings),
            'duplicate_count': len(duplicates),
        })
        
        return jsonify({
            'success': True,
            'validated_count': len(validated),
            'invalidated_count': len(invalidated),
            'warning_count': len(warnings),
            'duplicate_count': len(duplicates),
            'validated': validated,
            'invalidated': invalidated,
            'warnings': warnings,
            'duplicates': duplicates
        })
        
    except Exception as e:
        db.rollback()
        if isinstance(e, CalendarAccessError):
            return jsonify({'error': str(e)}), e.status_code
        logger.error(f"Error validating connections: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


# =====================================================
# SYNC DASHBOARD ENDPOINTS (Thêm mới - không sửa code cũ)
# =====================================================

@calendar_bp.route('/sync-status', methods=['GET'])
@require_auth
def get_sync_status(user: User):
    """
    Lấy trạng thái đồng bộ của các lịch hẹn trong khoảng thời gian.
    Query params: from (YYYY-MM-DD), to (YYYY-MM-DD)
    """
    from datetime import datetime
    from app.models.appointment import Appointment, AppointmentStatus
    from sqlalchemy.orm import joinedload
    
    db = next(get_db())
    try:
        actor = calendar_actor(db, user)
        # Parse date range
        date_from = request.args.get('from')
        date_to = request.args.get('to')
        
        if not date_from or not date_to:
            return jsonify({'error': 'Vui lòng cung cấp from và to'}), 400
        
        from_date, to_date = calendar_date_range(date_from, date_to)
        
        # Query appointments (không lấy CANCELLED)
        query = db.query(Appointment).options(
            joinedload(Appointment.doctor),
            joinedload(Appointment.patient)
        ).filter(
            Appointment.appointment_date >= from_date,
            Appointment.appointment_date < to_date,
            Appointment.status != AppointmentStatus.CANCELLED,
            Appointment.is_deleted == False
        )
        appointments = scope_calendar_query(query, actor).order_by(Appointment.appointment_date.asc()).all()
        
        # Lấy danh sách doctor_ids đã liên kết Google Calendar
        doctor_ids = list(set([a.doctor_id for a in appointments if a.doctor_id]))
        connected_doctors = set()
        if doctor_ids:
            connections = db.query(GoogleCalendarConnection).filter(
                GoogleCalendarConnection.user_id.in_(doctor_ids),
                GoogleCalendarConnection.is_active == True
            ).all()
            connected_doctors = set([c.user_id for c in connections])
        
        # Lấy danh sách staff đã kết nối Google Calendar (để biết event cần sync cho ai)
        from app.models.user import User as UserModel, UserRole
        staff_connections = db.query(GoogleCalendarConnection).join(
            UserModel, GoogleCalendarConnection.user_id == UserModel.id
        ).filter(
            UserModel.role == UserRole.STAFF,
            GoogleCalendarConnection.is_active == True
        ).all()
        connected_staff = set([c.user_id for c in staff_connections])
        
        # Get all calendar events for these appointments
        appt_ids = [a.id for a in appointments]
        calendar_events = {}
        if appt_ids:
            events = db.query(GoogleCalendarEvent).filter(
                GoogleCalendarEvent.appointment_id.in_(appt_ids)
            ).all()
            for e in events:
                if e.appointment_id not in calendar_events:
                    calendar_events[e.appointment_id] = []
                calendar_events[e.appointment_id].append(e)
        
        # Build response
        result = []
        synced_count = 0
        missing_count = 0
        error_count = 0
        
        for appt in appointments:
            events = calendar_events.get(appt.id, [])
            
            # Kiểm tra doctor có kết nối và có event
            doctor_connected = appt.doctor_id in connected_doctors if appt.doctor_id else False
            doctor_event = any(e.user_id == appt.doctor_id for e in events) if doctor_connected else None
            
            # Kiểm tra có BẤT KỲ staff nào có event cho lịch này (vì sync broadcast cho tất cả staff)
            staff_has_event = any(e.user_id in connected_staff for e in events) if connected_staff else None
            
            # Xác định trạng thái - synced chỉ khi đủ cho các người đã kết nối
            # - Nếu doctor kết nối: cần có doctor event
            # - Nếu có staff kết nối: cần có staff event
            if doctor_connected and len(connected_staff) > 0:
                # Cả doctor và staff đều cần có event
                if doctor_event and staff_has_event:
                    sync_status = 'synced'
                    synced_count += 1
                else:
                    sync_status = 'missing'
                    missing_count += 1
            elif doctor_connected:
                # Chỉ cần doctor có event
                if doctor_event:
                    sync_status = 'synced'
                    synced_count += 1
                else:
                    sync_status = 'missing'
                    missing_count += 1
            elif len(connected_staff) > 0:
                # Chỉ cần staff có event
                if staff_has_event:
                    sync_status = 'synced'
                    synced_count += 1
                else:
                    sync_status = 'missing'
                    missing_count += 1
            else:
                # Không có ai kết nối
                sync_status = 'missing'
                missing_count += 1
            
            result.append({
                'id': appt.id,
                'time': appt.appointment_date.strftime('%H:%M') if appt.appointment_date else '',
                'date_key': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                'datetime': appt.appointment_date.strftime('%H:%M %d/%m/%Y') if appt.appointment_date else '',
                'duration': appt.duration_minutes or 60,
                'patient_name': appt.patient.full_name if appt.patient else 'N/A',
                'doctor_name': appt.doctor.full_name if appt.doctor else 'N/A',
                'doctor_id': appt.doctor_id,
                'doctor_has_calendar': appt.doctor_id in connected_doctors if appt.doctor_id else False,
                'sync_status': sync_status,
                'event_count': len(events)
            })
        
        return jsonify({
            'total': len(result),
            'synced': synced_count,
            'missing': missing_count,
            'error': error_count,
            'appointments': result
        })
        
    except Exception as e:
        if isinstance(e, CalendarAccessError):
            return jsonify({'error': str(e)}), e.status_code
        logger.error(f"Error getting sync status: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

# Route/hàm còn lại nằm ở calendar_part2.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.calendar_part2 import (  # noqa: E402,F401
    verify_events,
    sync_appointments,
)

# Route/hàm còn lại nằm ở calendar_part3.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.calendar_part3 import (  # noqa: E402,F401
    delete_all_calendar_events,
)
