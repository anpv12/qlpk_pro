"""app.api.calendar: phần 2 — tách từ calendar.py (import ở cuối calendar.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from app.api.auth import require_auth
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
from app.models.user import User
from app.services.google_calendar_service import GoogleCalendarService
from app.realtime.events import emit_appointment_changed
from app.modules.appointments.services.calendar_access import CalendarAccessError, calendar_actor, manages_all_calendars, parse_calendar_ids, prepare_calendar_batch
from datetime import datetime
from app.api.calendar import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    calendar_bp,
    logger,
)


def _verify_appointment_events(appointment_ids, connections, events_by_appt, users):
    from app.services.google_calendar_service import GoogleCalendarService
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
    return results


def _index_calendar_events(db, events):
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
    return connections, events_by_appt, users


@calendar_bp.route('/verify-events', methods=['POST'])
@require_auth
def verify_events(user: User):
    """
    Verify thực tế các event tồn tại trên Google Calendar.
    Body: { "appointment_ids": [1, 2, 3] }
    Trả về: { "results": { "1": {"doctor": true, "receptionist": true}, ... } }
    """

    db = next(get_db())
    try:
        actor = calendar_actor(db, user)
        appointment_ids = parse_calendar_ids(request.get_json(silent=True))
        prepare_calendar_batch(db, actor, appointment_ids)

        # Lấy tất cả calendar events cho các appointments
        events = db.query(GoogleCalendarEvent).filter(
            GoogleCalendarEvent.appointment_id.in_(appointment_ids)
        ).all()

        connections, events_by_appt, users = _index_calendar_events(db, events)

        results = _verify_appointment_events(appointment_ids, connections, events_by_appt, users)

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
        if isinstance(e, CalendarAccessError):
            return jsonify({'error': str(e)}), e.status_code
        logger.error(f"Error verifying events: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


def _sync_appointment_for_users(appt, appt_id, appt_result, db, doctor_role_label, users_to_sync):
    from app.services.google_calendar_service import GoogleCalendarService, format_friendly_error
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
                is_exists = GoogleCalendarService.verify_event(existing_event.event_id, conn, strict=True)
                if is_exists:
                    # Giữ lại event hợp lệ đầu tiên
                    if not valid_event:
                        valid_event = existing_event
                    else:
                        # Xóa các event trùng lặp (giữ lại 1)
                        if existing_event.event_id == valid_event.event_id or GoogleCalendarService.delete_event(existing_event, conn):
                            db.delete(existing_event)
                        else:
                            raise RuntimeError('Chưa xóa được lịch Google trùng; giữ liên kết để thử lại')
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
                is_verified = GoogleCalendarService.verify_event(valid_event.event_id, conn, strict=True)
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


def _calendar_users_to_sync(actor, appt, db):
    from app.models.user import User as UserModel, UserRole
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

    for conn in staff_connections if manages_all_calendars(actor) else []:
        users_to_sync.append({
            'user_id': conn.user_id,
            'role': 'receptionist',
            'connection': conn
        })
    return doctor_role_label, users_to_sync


@calendar_bp.route('/sync', methods=['POST'])
@require_auth
def sync_appointments(user: User):
    """
    Đồng bộ các lịch hẹn được chọn lên Google Calendar.
    Logic: Xóa record cũ (nếu event đã bị xóa) → Tạo mới → Verify → Return kết quả chi tiết
    Body: { "appointment_ids": [1, 2, 3] }
    """
    from app.models.appointment import Appointment

    db = next(get_db())
    try:
        actor = calendar_actor(db, user)
        appointment_ids = parse_calendar_ids(request.get_json(silent=True))
        appointments = prepare_calendar_batch(db, actor, appointment_ids, write=True)

        results = {}  # {appt_id: {doctor_verified, receptionist_verified, sync_status, errors}}
        synced_ids = []
        failed_ids = []

        for appt in appointments:
            appt_id = appt.id

            doctor_role_label, users_to_sync = _calendar_users_to_sync(actor, appt, db)

            # Kết quả cho appointment này
            appt_result = {
                'status': 'processing',
                'doctor_verified': None,
                'doctor_role': doctor_role_label,  # Trả về role label
                'receptionist_verified': None,
                'sync_status': 'partial',
                'errors': []
            }

            _sync_appointment_for_users(appt, appt_id, appt_result, db, doctor_role_label, users_to_sync)

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
        if isinstance(e, CalendarAccessError):
            return jsonify({'error': str(e)}), e.status_code
        logger.error(f"Error syncing appointments: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()
