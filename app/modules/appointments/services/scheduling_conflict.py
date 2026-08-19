"""Shared scheduling conflict checks for appointment workflows."""

from dataclasses import dataclass
from datetime import datetime, timedelta

import pytz

from app.models.appointment import Appointment, AppointmentStatus
from app.models.doctor_busy_schedule import DoctorBusySchedule

SERVER_TZ = pytz.timezone('Asia/Ho_Chi_Minh')


class AppointmentSchedulingConflictError(Exception):
    """Raised when an appointment or busy schedule overlaps the requested slot."""

    def __init__(self, detail, conflict_type=None, conflict=None):
        super().__init__(detail)
        self.detail = detail
        self.conflict_type = conflict_type
        self.conflict = conflict


@dataclass
class SchedulingSlot:
    start: datetime
    end: datetime


def build_slot(start_datetime, duration_minutes=None, end_datetime=None):
    """Build a normalized requested slot."""
    if not start_datetime:
        return None

    start = start_datetime
    if end_datetime:
        end = end_datetime
    else:
        try:
            duration = int(duration_minutes or 60)
        except (TypeError, ValueError):
            duration = 60
        end = start + timedelta(minutes=duration)

    return SchedulingSlot(start=start, end=end)

def coerce_int(value):
    if value in (None, ''):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return value


def find_appointment_overlap(db, doctor_id, start_datetime, end_datetime, exclude_appointment_id=None):
    """Return the first active appointment overlapping a requested slot."""
    if not doctor_id or not start_datetime or not end_datetime:
        return None

    doctor_id = coerce_int(doctor_id)
    exclude_appointment_id = coerce_int(exclude_appointment_id)
    requested_start = to_local_naive(start_datetime)
    requested_end = to_local_naive(end_datetime)

    query = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.is_deleted == False,
        Appointment.status != AppointmentStatus.CANCELLED,
        Appointment.appointment_date < requested_end,
    )
    if exclude_appointment_id:
        query = query.filter(Appointment.id != exclude_appointment_id)

    for appointment in query.order_by(Appointment.appointment_date.asc()).all():
        if appointments_overlap(requested_start, requested_end, appointment):
            return appointment
    return None


def find_busy_schedule_overlap(db, doctor_id, start_datetime, end_datetime, exclude_schedule_id=None):
    """Return the first active busy schedule overlapping a requested slot."""
    if not doctor_id or not start_datetime or not end_datetime:
        return None

    doctor_id = coerce_int(doctor_id)
    exclude_schedule_id = coerce_int(exclude_schedule_id)
    requested_start = to_local_aware(start_datetime)
    requested_end = to_local_aware(end_datetime)

    query = db.query(DoctorBusySchedule).filter(
        DoctorBusySchedule.doctor_id == doctor_id,
        DoctorBusySchedule.status == 'active',
    )
    if exclude_schedule_id:
        query = query.filter(DoctorBusySchedule.id != exclude_schedule_id)

    for schedule in query.order_by(DoctorBusySchedule.start_datetime.asc()).all():
        schedule_start = to_local_aware(schedule.start_datetime)
        schedule_end = to_local_aware(schedule.end_datetime)
        if schedule_start < requested_end and schedule_end > requested_start:
            return schedule
    return None


def ensure_no_scheduling_conflict(
    db,
    doctor_id,
    start_datetime,
    duration_minutes=None,
    end_datetime=None,
    exclude_appointment_id=None,
    include_busy_schedules=True,
):
    """Raise if the requested appointment slot conflicts with appointments or busy schedules."""
    slot = build_slot(start_datetime, duration_minutes=duration_minutes, end_datetime=end_datetime)
    if not slot or not doctor_id:
        return

    appointment = find_appointment_overlap(
        db,
        doctor_id,
        slot.start,
        slot.end,
        exclude_appointment_id=exclude_appointment_id,
    )
    if appointment:
        raise AppointmentSchedulingConflictError(
            build_appointment_conflict_message(appointment),
            conflict_type='appointment',
            conflict=appointment,
        )

    if include_busy_schedules:
        busy_schedule = find_busy_schedule_overlap(db, doctor_id, slot.start, slot.end)
        if busy_schedule:
            raise AppointmentSchedulingConflictError(
                build_busy_schedule_conflict_message(busy_schedule),
                conflict_type='busy_schedule',
                conflict=busy_schedule,
            )


def appointments_overlap(requested_start, requested_end, existing_appointment):
    existing_start = existing_appointment.appointment_date
    if not existing_start:
        return False

    existing_end = existing_start + timedelta(minutes=existing_appointment.duration_minutes or 60)
    return existing_start < requested_end and existing_end > requested_start


def to_local_naive(value):
    if value.tzinfo is None:
        return value
    return value.astimezone(SERVER_TZ).replace(tzinfo=None)


def to_local_aware(value):
    if value.tzinfo is None:
        return SERVER_TZ.localize(value)
    return value.astimezone(SERVER_TZ)


def build_appointment_conflict_message(appointment):
    if not appointment.appointment_date:
        return 'Khung giờ này đã có lịch hẹn.'

    time_str = appointment.appointment_date.strftime('%H:%M')
    date_str = appointment.appointment_date.strftime('%d/%m/%Y')
    patient_name = appointment.patient.full_name if appointment.patient else 'bệnh nhân khác'
    return f'Khung giờ này đã có lịch hẹn.\nBác sĩ đã có lịch khám của {patient_name} vào {time_str} - {date_str}.'


def build_busy_schedule_conflict_message(schedule):
    start = to_local_aware(schedule.start_datetime).strftime('%d/%m/%Y %H:%M')
    end = to_local_aware(schedule.end_datetime).strftime('%d/%m/%Y %H:%M')
    reason = schedule.reason or 'Không có lý do'
    return f'Bác sĩ đã có lịch bận trong khung giờ này ({start} - {end}, {reason}).'
