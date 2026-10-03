"""Authorization and input boundaries for Calendar dashboard operations."""
from datetime import datetime, timedelta

from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User
from app.utils.clinical_access import appointment_in_user_scope, has_full_patient_scope, user_role_value


class CalendarAccessError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def calendar_actor(db, user):
    user_id = getattr(user, 'id', None)
    if not isinstance(user_id, int) or isinstance(user_id, bool):
        raise CalendarAccessError('Không có quyền thao tác lịch Google', 403)
    actor = db.query(User).filter(User.id == user_id).populate_existing().with_for_update(read=True).first()
    if not actor or actor.is_active is not True or user_role_value(actor) not in {'admin', 'staff', 'doctor', 'psychologist'}:
        raise CalendarAccessError('Không có quyền thao tác lịch Google', 403)
    return actor


def manages_all_calendars(actor):
    return user_role_value(actor) in {'admin', 'staff'}


def parse_calendar_ids(data):
    values = data.get('appointment_ids') if isinstance(data, dict) else None
    if not isinstance(values, list) or not 1 <= len(values) <= 100:
        raise CalendarAccessError('Chọn từ 1 đến 100 lịch hẹn')
    if any(isinstance(value, bool) or not isinstance(value, (int, str))
           or len(str(value)) > 10 or not str(value).isascii() or not str(value).isdecimal()
           or not 0 < int(value) <= 2147483647 for value in values):
        raise CalendarAccessError('Mã lịch hẹn không hợp lệ')
    return sorted({int(value) for value in values})


def calendar_date_range(start, end):
    try:
        if not isinstance(start, str) or not isinstance(end, str):
            raise ValueError()
        first, last = datetime.strptime(start, '%Y-%m-%d'), datetime.strptime(end, '%Y-%m-%d')
        if first.strftime('%Y-%m-%d') != start or last.strftime('%Y-%m-%d') != end:
            raise ValueError()
        if not 0 <= (last - first).days <= 365:
            raise ValueError()
        return first, last + timedelta(days=1)
    except (ValueError, OverflowError) as exc:
        raise CalendarAccessError('Chọn khoảng ngày hợp lệ, tối đa 366 ngày (YYYY-MM-DD)') from exc


def prepare_calendar_batch(db, actor, appointment_ids, *, write=False):
    query = db.query(Appointment).filter(Appointment.id.in_(appointment_ids)).order_by(Appointment.id).populate_existing()
    appointments = query.with_for_update(read=not write).all()
    if len(appointments) != len(appointment_ids) or any(appointment.is_deleted for appointment in appointments):
        raise CalendarAccessError('Có lịch hẹn không tồn tại hoặc đã bị xóa', 404)
    for appointment in appointments:
        allowed = (manages_all_calendars(actor) or appointment.doctor_id == actor.id) if write else appointment_in_user_scope(actor, appointment)
        if not allowed:
            raise CalendarAccessError('Bạn không có quyền thao tác một hoặc nhiều lịch hẹn', 403)
        if write and appointment.status == AppointmentStatus.CANCELLED:
            raise CalendarAccessError('Không đồng bộ lại lịch hẹn đã hủy', 409)
    return appointments


def scope_calendar_query(query, actor, *, write=False):
    if manages_all_calendars(actor) or (not write and has_full_patient_scope(actor)):
        return query
    if not write and user_role_value(actor) == 'psychologist':
        return query.filter((Appointment.doctor_id == actor.id) | (Appointment.psychologist_id == actor.id))
    return query.filter(Appointment.doctor_id == actor.id)
