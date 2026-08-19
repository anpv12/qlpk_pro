"""Confirmation services for appointment workflows."""

from dataclasses import dataclass
from datetime import datetime

from app.models.appointment import Appointment, AppointmentStatus
from app.models.examination import Examination, ExaminationStatus, ExaminationType


class AppointmentConfirmationNotFound(Exception):
    """Raised when an appointment cannot be found for confirmation."""


class AppointmentConfirmationValidationError(Exception):
    """Raised when an appointment cannot be confirmed."""


@dataclass
class AppointmentConfirmationResult:
    appointment: Appointment
    examination: Examination


def confirm_scheduled_appointment(db, appointment_id):
    """Confirm a scheduled appointment and create the legacy examination record."""
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentConfirmationNotFound("Appointment not found")

    if appointment.status != AppointmentStatus.SCHEDULED:
        raise AppointmentConfirmationValidationError("Only scheduled appointments can be confirmed")

    appointment.status = AppointmentStatus.CONFIRMED
    existing_examination = db.query(Examination).filter(
        Examination.appointment_id == appointment.id,
        Examination.is_active == True,
    ).first()
    if existing_examination:
        existing_examination.patient_id = appointment.patient_id
        existing_examination.doctor_id = appointment.doctor_id
        existing_examination.examination_date = appointment.appointment_date
        existing_examination.examination_type = _get_examination_type_from_appointment(appointment)
        existing_examination.service_id = appointment.service_id
        existing_examination.package_id = appointment.package_id
        return AppointmentConfirmationResult(appointment=appointment, examination=existing_examination)

    examination_code = f"LK{datetime.now().strftime('%Y%m%d%H%M%S')}"
    examination = Examination(
        appointment_id=appointment.id,
        patient_id=appointment.patient_id,
        doctor_id=appointment.doctor_id,
        examination_date=appointment.appointment_date,
        examination_code=examination_code,
        status=ExaminationStatus.WAITING_TRANSFER,
        examination_type=_get_examination_type_from_appointment(appointment),
        service_id=appointment.service_id,
        package_id=appointment.package_id,
        main_reason="",
        symptoms=""
    )

    db.add(examination)
    return AppointmentConfirmationResult(appointment=appointment, examination=examination)

def _get_examination_type_from_appointment(appointment):
    appointment_type = appointment.appointment_type.value if hasattr(appointment.appointment_type, 'value') else appointment.appointment_type
    if appointment_type == 'SERVICE' or (appointment.service_id and not appointment.package_id):
        return ExaminationType.SERVICE
    return ExaminationType.PACKAGE
