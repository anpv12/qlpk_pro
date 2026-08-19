from flask import Blueprint, request, jsonify, redirect, session
from app.core.database import get_db
from app.api.auth import require_auth, get_current_user
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
from app.models.user import User
from app.services.google_calendar_service import GoogleCalendarService
from app.core.config import settings
from app.realtime.events import emit_appointment_changed
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

calendar_bp = Blueprint('calendar', __name__, url_prefix='/api/calendar')

@calendar_bp.route('/connect/google/init', methods=['GET'])
@require_auth
def connect_google_init(user: User):
    """Endpoint trung gian để lấy authorization URL - trả về JSON"""
    try:
        # Lấy redirect URI
        if settings.GOOGLE_REDIRECT_URI:
            redirect_uri = settings.GOOGLE_REDIRECT_URI
        else:
            base_url = request.host_url.rstrip('/')
            redirect_uri = f"{base_url}/api/calendar/oauth/google/callback"
        
        # Lưu user_id vào session để dùng trong callback
        session['google_calendar_user_id'] = user.id
        
        auth_url = GoogleCalendarService.get_authorization_url(redirect_uri)
        return jsonify({'url': auth_url}), 200
    except Exception as e:
        logger.error(f"Error initiating Google Calendar connection: {e}")
        return jsonify({'error': str(e)}), 500

@calendar_bp.route('/connect/google', methods=['GET'])
@require_auth
def connect_google(user: User):
    """Bắt đầu quá trình kết nối Google Calendar"""
    try:
        # Lấy redirect URI từ request
        from app.core.config import settings
        if settings.GOOGLE_REDIRECT_URI:
            redirect_uri = settings.GOOGLE_REDIRECT_URI
        else:
            base_url = request.host_url.rstrip('/')
            redirect_uri = f"{base_url}/api/calendar/oauth/google/callback"
        
        # Lưu user_id vào session để dùng trong callback
        session['google_calendar_user_id'] = user.id
        
        auth_url = GoogleCalendarService.get_authorization_url(redirect_uri)
        return redirect(auth_url)
    except Exception as e:
        logger.error(f"Error initiating Google Calendar connection: {e}")
        return jsonify({'error': str(e)}), 500

@calendar_bp.route('/oauth/google/callback', methods=['GET'])
def google_callback():
    """Callback từ Google OAuth"""
    try:
        code = request.args.get('code')
        error = request.args.get('error')
        
        if error:
            logger.error(f"Google OAuth error: {error}")
            return redirect('/appointment-management.html?calendar_error=' + error)
        
        if not code:
            return redirect('/appointment-management.html?calendar_error=no_code')
        
        # Lấy user_id từ session
        user_id = session.get('google_calendar_user_id')
        if not user_id:
            return redirect('/appointment-management.html?calendar_error=no_session')
        
        # Lấy redirect URI
        if settings.GOOGLE_REDIRECT_URI:
            redirect_uri = settings.GOOGLE_REDIRECT_URI
        else:
            base_url = request.host_url.rstrip('/')
            redirect_uri = f"{base_url}/api/calendar/oauth/google/callback"
        
        # Đổi code lấy token
        tokens = GoogleCalendarService.exchange_code_for_token(code, redirect_uri)
        
        db = next(get_db())
        try:
            connection = db.query(GoogleCalendarConnection).filter(
                GoogleCalendarConnection.user_id == user_id
            ).first()
            
            if connection:
                # Cập nhật connection hiện có
                connection.access_token = tokens['access_token']
                
                # Chỉ cập nhật refresh_token nếu Google trả về (lần đầu hoặc có prompt='consent')
                # Nếu không, GIỮ NGUYÊN cái cũ để tránh làm hỏng token
                new_refresh_token = tokens.get('refresh_token')
                if new_refresh_token:
                    connection.refresh_token = new_refresh_token
                    
                connection.token_expires_at = tokens['expires_at']
                connection.is_active = True
            else:
                # Tạo connection mới
                connection = GoogleCalendarConnection(
                    user_id=user_id,
                    access_token=tokens['access_token'],
                    refresh_token=tokens['refresh_token'],
                    token_expires_at=tokens['expires_at'],
                    is_active=True
                )
                db.add(connection)
            
            db.commit()
            emit_appointment_changed('calendar_connected', extra={'user_id': user_id})
            logger.info(f"Google Calendar connected for user {user_id}")
            
            # Xóa session
            session.pop('google_calendar_user_id', None)
            
            return redirect('/appointment-management.html?calendar_connected=google')
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error saving Google Calendar connection: {e}")
            return redirect('/appointment-management.html?calendar_error=' + str(e))
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Error in Google OAuth callback: {e}")
        return redirect('/appointment-management.html?calendar_error=' + str(e))

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
        # Lấy tất cả connections active
        connections = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.is_active == True
        ).all()
        
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
    from sqlalchemy import func
    from sqlalchemy.orm import joinedload
    
    db = next(get_db())
    try:
        # Parse date range
        date_from = request.args.get('from')
        date_to = request.args.get('to')
        
        if not date_from or not date_to:
            return jsonify({'error': 'Vui lòng cung cấp from và to'}), 400
        
        try:
            from_date = datetime.strptime(date_from, '%Y-%m-%d')
            to_date = datetime.strptime(date_to, '%Y-%m-%d')
            # Set to end of day
            to_date = to_date.replace(hour=23, minute=59, second=59)
        except ValueError:
            return jsonify({'error': 'Định dạng ngày không hợp lệ (YYYY-MM-DD)'}), 400
        
        # Query appointments (không lấy CANCELLED)
        appointments = db.query(Appointment).options(
            joinedload(Appointment.doctor),
            joinedload(Appointment.patient)
        ).filter(
            Appointment.appointment_date >= from_date,
            Appointment.appointment_date <= to_date,
            Appointment.status != AppointmentStatus.CANCELLED,
            Appointment.is_deleted == False
        ).order_by(Appointment.appointment_date.asc()).all()
        
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
        logger.error(f"Error getting sync status: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@calendar_bp.route('/verify-events', methods=['POST'])
@require_auth
def verify_events(user: User):
    """
    Verify thực tế các event tồn tại trên Google Calendar.
    Body: { "appointment_ids": [1, 2, 3] }
    Trả về: { "results": { "1": {"doctor": true, "receptionist": true}, ... } }
    """
    from app.services.google_calendar_service import GoogleCalendarService
    
    db = next(get_db())
    try:
        data = request.get_json()
        appointment_ids = data.get('appointment_ids', [])
        
        if not appointment_ids:
            return jsonify({'error': 'Vui lòng cung cấp appointment_ids'}), 400
        
        # Lấy tất cả calendar events cho các appointments
        events = db.query(GoogleCalendarEvent).filter(
            GoogleCalendarEvent.appointment_id.in_(appointment_ids)
        ).all()
        
        # Group events by appointment_id và user_id
        events_by_appt = {}
        for e in events:
            if e.appointment_id not in events_by_appt:
                events_by_appt[e.appointment_id] = []
            events_by_appt[e.appointment_id].append(e)
        
        # Lấy tất cả connections để verify
        user_ids = list(set([e.user_id for e in events if e.user_id]))
        connections = {}
        if user_ids:
            conns = db.query(GoogleCalendarConnection).filter(
                GoogleCalendarConnection.user_id.in_(user_ids),
                GoogleCalendarConnection.is_active == True
            ).all()
            for c in conns:
                connections[c.user_id] = c
        
        # Lấy thông tin user để phân biệt role
        from app.models.user import User as UserModel
        users = {}
        if user_ids:
            user_list = db.query(UserModel).filter(UserModel.id.in_(user_ids)).all()
            for u in user_list:
                users[u.id] = u
        
        # Verify từng event
        results = {}
        for appt_id in appointment_ids:
            results[str(appt_id)] = {
                'doctor_verified': None,  # None = không có event, True = verified, False = missing
                'receptionist_verified': None,
                'doctor_name': None,
                'doctor_role': 'Bác sĩ',  # Default, sẽ cập nhật khi kiểm tra role
                'receptionist_name': None
            }
            
            appt_events = events_by_appt.get(appt_id, [])
            for event in appt_events:
                if not event.user_id:
                    continue
                    
                user_obj = users.get(event.user_id)
                if not user_obj:
                    continue
                
                connection = connections.get(event.user_id)
                if not connection:
                    # Không có connection, không thể verify
                    continue
                
                # Verify event thực tế
                is_verified = GoogleCalendarService.verify_event(event.event_id, connection)
                
                # Phân loại theo role THỰC TẾ của user (không dùng thứ tự event)
                user_role = user_obj.role.value if hasattr(user_obj.role, 'value') else str(user_obj.role)
                user_role_upper = user_role.upper()
                
                if user_role_upper in ['DOCTOR', 'PSYCHOLOGIST']:
                    results[str(appt_id)]['doctor_verified'] = is_verified
                    results[str(appt_id)]['doctor_name'] = user_obj.full_name
                    # Cập nhật doctor_role dựa trên role thực của user
                    if user_role_upper == 'PSYCHOLOGIST':
                        results[str(appt_id)]['doctor_role'] = 'Tâm lý gia'
                    else:
                        results[str(appt_id)]['doctor_role'] = 'Bác sĩ'
                elif user_role_upper == 'STAFF':
                    results[str(appt_id)]['receptionist_verified'] = is_verified
                    results[str(appt_id)]['receptionist_name'] = user_obj.full_name
        
        # Tổng hợp sync_status từ trạng thái Bác sĩ và Lễ tân
        for appt_id_str, result in results.items():
            doctor_status = result.get('doctor_verified')  # True/False/None
            receptionist_status = result.get('receptionist_verified')  # True/False/None
            
            if doctor_status == True and receptionist_status == True:
                result['sync_status'] = 'full'  # Đồng bộ đầy đủ
            else:
                result['sync_status'] = 'partial'  # Thiếu
        
        return jsonify({
            'success': True,
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Error verifying events: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@calendar_bp.route('/sync', methods=['POST'])
@require_auth
def sync_appointments(user: User):
    """
    Đồng bộ các lịch hẹn được chọn lên Google Calendar.
    Logic: Xóa record cũ (nếu event đã bị xóa) → Tạo mới → Verify → Return kết quả chi tiết
    Body: { "appointment_ids": [1, 2, 3] }
    """
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel, UserRole
    from app.services.google_calendar_service import GoogleCalendarService, format_friendly_error
    
    db = next(get_db())
    try:
        data = request.get_json()
        appointment_ids = data.get('appointment_ids', [])
        
        if not appointment_ids:
            return jsonify({'error': 'Vui lòng chọn ít nhất 1 lịch hẹn'}), 400
        
        results = {}  # {appt_id: {doctor_verified, receptionist_verified, sync_status, errors}}
        synced_ids = []
        failed_ids = []
        
        for appt_id in appointment_ids:
            appt = db.query(Appointment).filter(
                Appointment.id == appt_id,
                Appointment.is_deleted == False
            ).first()
            
            if not appt:
                results[str(appt_id)] = {
                    'status': 'not_found',
                    'doctor_verified': None,
                    'receptionist_verified': None,
                    'sync_status': 'error',
                    'errors': ['Không tìm thấy lịch hẹn']
                }
                failed_ids.append(appt_id)
                continue
            
            # Xác định users cần sync (Bác sĩ/Tâm lý gia + Lễ tân đã kết nối)
            users_to_sync = []
            doctor_role_label = 'Bác sĩ'  # Default
            
            # 1. Bác sĩ/Tâm lý gia (người khám chính)
            if appt.doctor_id:
                # Kiểm tra role thực của user
                doctor_user = db.query(UserModel).filter(UserModel.id == appt.doctor_id).first()
                if doctor_user:
                    # Xác định label dựa trên role
                    if doctor_user.role == UserRole.PSYCHOLOGIST:
                        doctor_role_label = 'Tâm lý gia'
                    else:
                        doctor_role_label = 'Bác sĩ'
                
                doctor_conn = db.query(GoogleCalendarConnection).filter(
                    GoogleCalendarConnection.user_id == appt.doctor_id,
                    GoogleCalendarConnection.is_active == True
                ).first()
                if doctor_conn:
                    users_to_sync.append({
                        'user_id': appt.doctor_id,
                        'role': 'doctor',
                        'connection': doctor_conn
                    })
            
            # 2. Tất cả Lễ tân đã kết nối
            staff_connections = db.query(GoogleCalendarConnection).join(
                UserModel, GoogleCalendarConnection.user_id == UserModel.id
            ).filter(
                UserModel.role == UserRole.STAFF,
                GoogleCalendarConnection.is_active == True
            ).all()
            
            for conn in staff_connections:
                users_to_sync.append({
                    'user_id': conn.user_id,
                    'role': 'receptionist',
                    'connection': conn
                })
            
            # Kết quả cho appointment này
            appt_result = {
                'status': 'processing',
                'doctor_verified': None,
                'doctor_role': doctor_role_label,  # Trả về role label
                'receptionist_verified': None,
                'sync_status': 'partial',
                'errors': []
            }
            
            for user_info in users_to_sync:
                user_id = user_info['user_id']
                role = user_info['role']
                conn = user_info['connection']
                
                try:
                    # 1. Lấy TẤT CẢ event records cũ trong DB cho (appointment_id, user_id)
                    existing_events = db.query(GoogleCalendarEvent).filter(
                        GoogleCalendarEvent.appointment_id == appt_id,
                        GoogleCalendarEvent.user_id == user_id
                    ).all()
                    
                    # 2. Kiểm tra và xóa TẤT CẢ records cũ nếu event không còn trên Calendar
                    valid_event = None
                    for existing_event in existing_events:
                        is_exists = GoogleCalendarService.verify_event(existing_event.event_id, conn)
                        if is_exists:
                            # Giữ lại event hợp lệ đầu tiên
                            if not valid_event:
                                valid_event = existing_event
                            else:
                                # Xóa các event trùng lặp (giữ lại 1)
                                logger.info(f"Deleting duplicate event record {existing_event.event_id}")
                                db.delete(existing_event)
                        else:
                            # Event đã bị xóa trên Calendar → Xóa record
                            logger.info(f"Event {existing_event.event_id} no longer exists, deleting record")
                            db.delete(existing_event)
                    
                    db.flush()
                    
                    # 3. Tạo event mới nếu không còn event hợp lệ nào
                    if not valid_event:
                        event_id = GoogleCalendarService.create_event(appt, conn)
                        
                        if event_id:
                            new_event = GoogleCalendarEvent(
                                appointment_id=appt_id,
                                user_id=user_id,
                                event_id=event_id,
                                updated_at=datetime.now()
                            )
                            db.add(new_event)
                            db.flush()
                            valid_event = new_event
                            logger.info(f"Created new event {event_id} for user {user_id}")
                        else:
                            appt_result['errors'].append(f"Không thể tạo event cho {doctor_role_label if role == 'doctor' else 'Lễ tân'}")
                    
                    # 4. VERIFY lại event trên Calendar
                    if valid_event:
                        valid_event.updated_at = datetime.now()
                        is_verified = GoogleCalendarService.verify_event(valid_event.event_id, conn)
                        if role == 'doctor':
                            appt_result['doctor_verified'] = is_verified
                        else:
                            appt_result['receptionist_verified'] = is_verified
                        
                        if not is_verified:
                            role_label = doctor_role_label if role == 'doctor' else 'Lễ tân'
                            appt_result['errors'].append(f"Verify thất bại cho {role_label}")
                    
                except Exception as e:
                    logger.error(f"Error syncing for user {user_id}: {e}")
                    role_label = doctor_role_label if role == 'doctor' else 'Lễ tân'
                    friendly_error = format_friendly_error(e)
                    appt_result['errors'].append(f"{role_label}: {friendly_error}")
            
            # Xác định sync_status dựa trên verify results
            doctor_ok = appt_result['doctor_verified'] == True
            receptionist_ok = appt_result['receptionist_verified'] == True
            
            if doctor_ok and receptionist_ok:
                appt_result['sync_status'] = 'full'
                appt_result['status'] = 'success'
                synced_ids.append(appt_id)
            elif doctor_ok or receptionist_ok:
                appt_result['sync_status'] = 'partial'
                appt_result['status'] = 'partial'
                synced_ids.append(appt_id)
            else:
                appt_result['sync_status'] = 'error'
                appt_result['status'] = 'failed'
                failed_ids.append(appt_id)
            
            results[str(appt_id)] = appt_result
        
        db.commit()
        emit_appointment_changed('calendar_synced', extra={
            'success_count': len(synced_ids),
            'failed_count': len(failed_ids),
            'appointment_ids': synced_ids,
        })
        
        success_count = len(synced_ids)
        failed_count = len(failed_ids)
        
        return jsonify({
            'success': True,
            'message': f'Đã đồng bộ {success_count}/{len(appointment_ids)} lịch hẹn',
            'success_count': success_count,
            'failed_count': failed_count,
            'synced_ids': synced_ids,
            'failed_ids': failed_ids,
            'results': results
        })
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error syncing appointments: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@calendar_bp.route('/delete-all', methods=['DELETE'])
@require_auth
def delete_all_calendar_events(user: User):
    """Xóa tất cả Google Calendar events trong khoảng ngày được chọn
    Tối ưu: Sử dụng ThreadPoolExecutor để xóa song song trên Google Calendar
    """
    from app.models.appointment import Appointment
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    db = next(get_db())
    try:
        data = request.get_json() or {}
        from_date = data.get('from_date')
        to_date = data.get('to_date')
        
        # Build query cho appointments trong khoảng ngày
        query = db.query(GoogleCalendarEvent).join(
            Appointment, 
            GoogleCalendarEvent.appointment_id == Appointment.id
        )
        
        if from_date:
            from_dt = datetime.strptime(from_date, '%Y-%m-%d')
            query = query.filter(Appointment.appointment_date >= from_dt)
        
        if to_date:
            to_dt = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            query = query.filter(Appointment.appointment_date <= to_dt)
        
        # Lấy tất cả events
        events = query.all()
        
        if not events:
            return jsonify({
                'success': True,
                'deleted_count': 0,
                'message': 'Không có sự kiện nào để xóa'
            })
        
        # Pre-cache tất cả connections (1 query thay vì N queries)
        user_ids = list(set([e.user_id for e in events]))
        connections = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.user_id.in_(user_ids),
            GoogleCalendarConnection.is_active == True
        ).all()
        conn_map = {c.user_id: c for c in connections}
        
        # Chuẩn bị data cho threads (tránh truy cập DB từ threads)
        event_data = []
        for event in events:
            conn = conn_map.get(event.user_id)
            if conn:
                event_data.append({
                    'event_id': event.event_id,
                    'db_event_id': event.id,
                    'access_token': conn.access_token,
                    'refresh_token': conn.refresh_token,
                    'token_expires_at': conn.token_expires_at,
                    'user_id': event.user_id
                })
            else:
                # Không có connection, vẫn cần xóa DB record
                event_data.append({
                    'event_id': event.event_id,
                    'db_event_id': event.id,
                    'access_token': None,
                    'refresh_token': None,
                    'token_expires_at': None,
                    'user_id': event.user_id
                })
        
        # Hàm xóa 1 event trên Google Calendar với retry
        def delete_single_event(data, max_retries=3):
            """Xóa 1 event từ Google Calendar, trả về (db_event_id, success, error)
            Có retry logic cho rate limit errors
            """
            import time
            
            if not data['access_token']:
                # Không có credentials, coi như thành công để xóa DB
                return (data['db_event_id'], True, None)
            
            for attempt in range(max_retries):
                try:
                    from google.oauth2.credentials import Credentials
                    from googleapiclient.discovery import build
                    from app.core.config import settings
                    
                    creds = Credentials(
                        token=data['access_token'],
                        refresh_token=data['refresh_token'],
                        token_uri='https://oauth2.googleapis.com/token',
                        client_id=settings.GOOGLE_CLIENT_ID,
                        client_secret=settings.GOOGLE_CLIENT_SECRET
                    )
                    service = build('calendar', 'v3', credentials=creds)
                    
                    service.events().delete(
                        calendarId='primary',
                        eventId=data['event_id']
                    ).execute()
                    
                    return (data['db_event_id'], True, None)
                except Exception as e:
                    error_str = str(e)
                    # 410 = đã xóa rồi, 404 = không tồn tại -> coi như thành công
                    if '410' in error_str or '404' in error_str:
                        return (data['db_event_id'], True, None)
                    
                    # Rate limit -> retry với exponential backoff
                    if '403' in error_str and 'rateLimitExceeded' in error_str:
                        if attempt < max_retries - 1:
                            wait_time = (2 ** attempt) * 1  # 1s, 2s, 4s
                            time.sleep(wait_time)
                            continue
                    
                    logger.warning(f"Could not delete event {data['event_id']} from Google (attempt {attempt + 1}): {e}")
                    
                    # Nếu là lần cuối hoặc lỗi khác rate limit
                    if attempt == max_retries - 1:
                        return (data['db_event_id'], False, error_str)
            
            return (data['db_event_id'], False, "Max retries exceeded")
        
        # Xóa song song với ThreadPoolExecutor (5 workers để tránh rate limit)
        successfully_deleted_ids = []
        failed_events = []
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(delete_single_event, ed): ed for ed in event_data}
            
            for future in as_completed(futures):
                db_event_id, success, error = future.result()
                if success:
                    successfully_deleted_ids.append(db_event_id)
                else:
                    failed_events.append({'id': db_event_id, 'error': error})
        
        # Xóa DB records chỉ cho những events đã xóa Google thành công
        deleted_count = 0
        for event in events:
            if event.id in successfully_deleted_ids:
                db.delete(event)
                deleted_count += 1
        
        db.commit()
        emit_appointment_changed('calendar_events_deleted', extra={'deleted_count': deleted_count})
        
        result = {
            'success': True,
            'deleted_count': deleted_count,
            'message': f'Đã xóa {deleted_count} sự kiện Google Calendar'
        }
        
        if failed_events:
            result['failed_count'] = len(failed_events)
            result['message'] += f' ({len(failed_events)} sự kiện lỗi)'
        
        return jsonify(result)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting calendar events: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()
