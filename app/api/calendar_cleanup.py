"""app.api.calendar: phần 3 — tách từ calendar.py (import ở cuối calendar.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from app.api.auth import require_auth
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
from app.models.user import User
from app.realtime.events import emit_appointment_changed
from app.modules.appointments.services.calendar_access import CalendarAccessError, calendar_actor, manages_all_calendars, calendar_date_range, scope_calendar_query
from app.api.calendar import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    calendar_bp,
    logger,
)
from app.utils.api_error_contract import api_error_boundary


# Hàm xóa 1 event trên Google Calendar với retry
def _delete_google_event(data, max_retries=3):
    """Xóa 1 event từ Google Calendar, trả về (db_event_id, success, error)
    Có retry logic cho rate limit errors
    """
    import time

    if not data['access_token']:
        return (data['db_event_id'], False, 'Chưa có kết nối Google hoạt động; giữ liên kết để thử lại')

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
            from googleapiclient.errors import HttpError
            status = e.resp.status if isinstance(e, HttpError) else None
            # 410 = đã xóa rồi, 404 = không tồn tại -> coi như thành công
            if status in (410, 404):
                return (data['db_event_id'], True, None)

            # Rate limit -> retry với exponential backoff
            if status == 429 or (status == 403 and 'rateLimitExceeded' in str(e)):
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 1  # 1s, 2s, 4s
                    time.sleep(wait_time)
                    continue

            logger.warning('Could not delete Google event %s', data['event_id'], exc_info=True)

            return (data['db_event_id'], False, 'Chưa xóa được lịch Google; giữ liên kết để thử lại')

    return (data['db_event_id'], False, "Max retries exceeded")


def _delete_calendar_events_parallel(db, event_data, events):
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # Xóa song song với ThreadPoolExecutor (5 workers để tránh rate limit)
    successfully_deleted_ids = []
    failed_events = []

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(_delete_google_event, ed): ed for ed in event_data}

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
    return deleted_count, failed_events


def _build_event_delete_payloads(db, events):
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
            event_data.append({
                'event_id': event.event_id,
                'db_event_id': event.id,
                'access_token': None,
                'refresh_token': None,
                'token_expires_at': None,
                'user_id': event.user_id
            })
    return event_data


@calendar_bp.route('/delete-all', methods=['DELETE'])
@require_auth
@api_error_boundary(error='{error}')
def delete_all_calendar_events(user: User):
    """Xóa tất cả Google Calendar events trong khoảng ngày được chọn
    Tối ưu: Sử dụng ThreadPoolExecutor để xóa song song trên Google Calendar
    """
    from app.models.appointment import Appointment

    db = next(get_db())
    try:
        actor = calendar_actor(db, user)
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise CalendarAccessError('Dữ liệu xóa lịch không hợp lệ')
        from_dt, to_dt = calendar_date_range(data.get('from_date'), data.get('to_date'))
        appointment_query = db.query(Appointment).filter(
            Appointment.appointment_date >= from_dt, Appointment.appointment_date < to_dt,
        )
        appointments = scope_calendar_query(appointment_query, actor, write=True).order_by(Appointment.id).populate_existing().with_for_update().all()
        appointment_ids = [appointment.id for appointment in appointments]

        # Build query cho appointments trong khoảng ngày
        query = db.query(GoogleCalendarEvent).filter(GoogleCalendarEvent.appointment_id.in_(appointment_ids))
        if not manages_all_calendars(actor):
            query = query.filter(GoogleCalendarEvent.user_id == actor.id)

        # Lấy tất cả events
        events = query.all()

        if not events:
            return jsonify({
                'success': True,
                'deleted_count': 0,
                'message': 'Không có sự kiện nào để xóa'
            })

        event_data = _build_event_delete_payloads(db, events)

        deleted_count, failed_events = _delete_calendar_events_parallel(db, event_data, events)

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

    except CalendarAccessError as e:
        db.rollback()
        return jsonify({'error': str(e)}), e.status_code
    finally:
        db.close()
