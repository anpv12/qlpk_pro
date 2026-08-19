"""Transfer services for appointment workflows."""

from dataclasses import dataclass

from app.models.appointment import Appointment
from app.models.examination import Examination, ExaminationStatus
from app.modules.appointments.services.side_effects import sync_transferred_appointment_calendar


class AppointmentTransferValidationError(Exception):
    """Raised when transfer appointment payload is invalid."""


@dataclass
class AppointmentTransferResult:
    updated_count: int


def transfer_appointments_between_roles(db, user, data, logger=None):
    """Apply the legacy POST /api/appointments/transfer mutation."""
    appointment_ids = data.get('appointment_ids', [])
    to_role = data.get('to_role')
    to_person_id = data.get('to_person_id')

    if not appointment_ids or not to_role or not to_person_id:
        raise AppointmentTransferValidationError("Missing required parameters")

    if to_person_id is None:
        raise AppointmentTransferValidationError("to_person_id cannot be null")

    if to_person_id == user.id:
        raise AppointmentTransferValidationError("Không thể chuyển cho chính mình")

    from_role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    new_status = get_new_examination_status(from_role, to_role)

    if logger:
        logger.info(
            f"Transfer: user.role={user.role}, from_role={from_role}, "
            f"to_role={to_role}, to_person_id={to_person_id}, "
            f"appointment_ids={appointment_ids}"
        )
        logger.info(f"New status will be: {new_status}")

    to_role_normalized = normalize_transfer_role(to_role)
    updated_count = 0

    for appointment_id in appointment_ids:
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            continue

        old_doctor_id = appointment.doctor_id

        if to_role_normalized == 'doctor':
            appointment.doctor_id = to_person_id
        elif to_role_normalized == 'psychologist':
            appointment.psychologist_id = to_person_id
            appointment.doctor_id = to_person_id

        examination = db.query(Examination).filter(Examination.appointment_id == appointment_id).first()
        if examination:
            if to_role_normalized in ('doctor', 'psychologist'):
                examination.doctor_id = to_person_id
            examination.status = new_status

        if to_role_normalized == 'doctor' and appointment.doctor_id != old_doctor_id:
            sync_transferred_appointment_calendar(
                db,
                appointment,
                old_doctor_id,
                logger_override=logger,
            )

        updated_count += 1

    return AppointmentTransferResult(updated_count=updated_count)


def normalize_transfer_role(role):
    """Normalize transfer target role names used by legacy callers."""
    role_normalized = role.lower() if role else ''
    if role_normalized == 'staff':
        return 'receptionist'
    return role_normalized


def get_new_examination_status(from_role, to_role):
    """Return the examination status after a transfer between roles."""
    from_role_lower = from_role.lower() if from_role else ''
    to_role_lower = to_role.lower() if to_role else ''

    if from_role_lower == 'psychologist' or from_role == 'PSYCHOLOGIST':
        from_role_lower = 'psychologist'
    if to_role_lower == 'psychologist' or to_role == 'PSYCHOLOGIST':
        to_role_lower = 'psychologist'

    if from_role_lower == 'receptionist' and to_role_lower == 'doctor':
        return ExaminationStatus.DOCTOR_EXAM
    if from_role_lower == 'doctor' and to_role_lower == 'psychologist':
        return ExaminationStatus.PSYCHOLOGIST_EXAM
    if from_role_lower == 'psychologist' and to_role_lower == 'doctor':
        return ExaminationStatus.CONCLUSION
    if to_role_lower == 'doctor':
        return ExaminationStatus.DOCTOR_EXAM
    if to_role_lower == 'psychologist':
        return ExaminationStatus.PSYCHOLOGIST_EXAM
    return ExaminationStatus.WAITING_TRANSFER
