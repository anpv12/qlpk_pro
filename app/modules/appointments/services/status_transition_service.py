"""Status transition services for appointment workflows."""

from dataclasses import dataclass
from datetime import datetime

from app.models.appointment import Appointment, AppointmentStatus
from app.models.examination import Examination
from app.modules.appointments.services.doctor_queue import mark_doctor_queue_entry


class AppointmentStatusTransitionNotFound(Exception):
    """Raised when a requested appointment transition target is missing."""


@dataclass
class AppointmentBackToScheduledResult:
    appointment: Appointment
    deleted_examination_count: int


@dataclass
class AppointmentExaminationTransitionResult:
    appointment: Appointment
    examination: Examination
    new_status: str


def move_appointment_back_to_scheduled(db, appointment_id, logger=None):
    """Delete linked examinations and move an appointment back to SCHEDULED."""
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentStatusTransitionNotFound("Appointment not found")

    examinations = list(appointment.examinations or [])
    for examination in examinations:
        db.delete(examination)

    if logger and examinations:
        logger.info(f"Deleted {len(examinations)} examination records for appointment {appointment_id}")

    appointment.status = AppointmentStatus.SCHEDULED

    return AppointmentBackToScheduledResult(
        appointment=appointment,
        deleted_examination_count=len(examinations),
    )


def return_appointment_to_doctor(db, appointment_id):
    """Return the linked examination to DOCTOR_EXAM."""
    appointment = _get_appointment_or_raise(db, appointment_id)
    examination = _get_examination_for_status_transition(
        db,
        appointment_id,
        ['PSYCHOLOGIST_EXAM', 'CONCLUSION', 'COMPLETED'],
        "No examination found to return to doctor",
    )

    return _set_examination_status(appointment, examination, 'DOCTOR_EXAM')


def return_appointment_to_receptionist(db, appointment_id):
    """Return the linked examination to WAITING_TRANSFER."""
    appointment = _get_appointment_or_raise(db, appointment_id)
    examination = _get_examination_for_status_transition(
        db,
        appointment_id,
        ['DOCTOR_EXAM', 'PSYCHOLOGIST_EXAM', 'CONCLUSION', 'COMPLETED'],
        "No examination found to return to receptionist",
    )

    return _set_examination_status(appointment, examination, 'WAITING_TRANSFER')


def _get_appointment_or_raise(db, appointment_id):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentStatusTransitionNotFound("Appointment not found")
    return appointment


def _get_examination_for_status_transition(db, appointment_id, statuses, not_found_message):
    examination = db.query(Examination).filter(
        Examination.appointment_id == appointment_id,
        Examination.status.in_(statuses),
    ).first()

    if not examination:
        raise AppointmentStatusTransitionNotFound(not_found_message)
    return examination


def _set_examination_status(appointment, examination, new_status):
    mark_doctor_queue_entry(appointment, examination.status, new_status)
    examination.status = new_status
    examination.updated_at = datetime.now()

    return AppointmentExaminationTransitionResult(
        appointment=appointment,
        examination=examination,
        new_status=new_status,
    )
