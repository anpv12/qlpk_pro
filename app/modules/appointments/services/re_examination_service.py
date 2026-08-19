"""Re-examination services for appointment workflows."""

from dataclasses import dataclass
from datetime import datetime
import random

from app.models.appointment import Appointment, AppointmentCategory, AppointmentStatus, AppointmentType
from app.models.examination import Examination
from app.models.patient import Patient
from app.models.user import User
from app.modules.appointments.services.side_effects import (
    schedule_appointment_reminder,
    sync_re_examination_calendar_on_create,
)
from app.modules.appointments.services.scheduling_conflict import (
    AppointmentSchedulingConflictError,
    ensure_no_scheduling_conflict,
)


class ReExaminationError(Exception):
    """Raised for re-examination validation/not-found errors."""

    def __init__(self, detail, status_code=400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass
class ReExaminationCreationResult:
    appointment: Appointment


def create_re_examination_from_payload(db, data, notification_service, logger=None):
    """Create a re-examination appointment from the direct API payload."""
    required_fields = ['original_appointment_id', 'examination_type', 'package_service_id', 'doctor_id', 're_examination_date', 're_examination_time']
    for field in required_fields:
        if not data.get(field):
            raise ReExaminationError(f'Missing required field: {field}', 400)

    re_appointment = _create_re_examination_appointment(
        db,
        original_appointment_id=data['original_appointment_id'],
        re_examination_date=data['re_examination_date'],
        re_examination_time=data['re_examination_time'],
        doctor_id=data['doctor_id'],
        examination_type=data['examination_type'],
        package_service_id=data['package_service_id'],
        missing_original_message='Original appointment not found',
        missing_patient_message='Patient not found',
        missing_doctor_message='Selected doctor not found',
        invalid_datetime_message='Invalid date or time format',
        past_datetime_message='Re-examination date must be in the future',
        not_found_status_code=404,
    )

    sync_re_examination_calendar_on_create(
        db,
        re_appointment,
        logger_override=logger,
    )

    schedule_appointment_reminder(
        re_appointment.id,
        notification_service,
        logger_override=logger,
        success_message="Re-examination appointment reminder created for appointment ID: {appointment_id}",
        error_message="Error creating re-examination appointment reminder for appt ID {appointment_id}: {error}",
        scheduling_error_message="Error scheduling reminder creation for re-examination appt ID {appointment_id}: {error}",
    )

    return ReExaminationCreationResult(appointment=re_appointment)


def get_re_examination_appointment(db, original_appointment_id):
    """Find the active scheduled re-examination appointment for an original appointment."""
    return db.query(Appointment).filter(
        Appointment.original_appointment_id == original_appointment_id,
        Appointment.appointment_category == AppointmentCategory.RE_EXAMINATION,
        Appointment.status == AppointmentStatus.SCHEDULED,
        Appointment.is_deleted == False
    ).first()


def create_re_examination_from_prescription(
    db,
    original_appointment_id,
    re_examination_date,
    re_examination_time,
    doctor_id,
    examination_type,
    package_service_id,
    logger=None,
):
    """Create a re-examination appointment from prescription data."""
    try:
        re_appointment = _create_re_examination_appointment(
            db,
            original_appointment_id=original_appointment_id,
            re_examination_date=re_examination_date,
            re_examination_time=re_examination_time,
            doctor_id=doctor_id,
            examination_type=examination_type,
            package_service_id=package_service_id,
            missing_original_message='Không tìm thấy appointment gốc',
            missing_patient_message='Không tìm thấy bệnh nhân',
            missing_doctor_message='Không tìm thấy bác sĩ',
            invalid_datetime_message='Định dạng ngày/giờ không hợp lệ',
            past_datetime_message='Ngày tái khám phải trong tương lai',
            not_found_status_code=400,
        )
    except ReExaminationError as exc:
        return None, exc.detail

    sync_re_examination_calendar_on_create(
        db,
        re_appointment,
        logger_override=logger,
        doctor_success_message="Created Google Calendar event {event_id} for re-examination from prescription appointment {appointment_id}",
        receptionist_success_message="Created Google Calendar event {event_id} for receptionist {user_id} for re-examination from prescription {appointment_id}",
        outer_error_message="Error syncing re-examination from prescription to Google Calendar: {error}",
    )

    return re_appointment, None


def cancel_re_examination_appointment(db, appointment_id):
    """Cancel a scheduled re-examination appointment."""
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        return False, "Không tìm thấy appointment"

    if appointment.status != AppointmentStatus.SCHEDULED:
        return False, "Chỉ có thể hủy appointment chưa khám (status = SCHEDULED)"

    appointment.is_deleted = True
    appointment.deleted_at = datetime.utcnow()
    appointment.status = AppointmentStatus.CANCELLED

    examinations = db.query(Examination).filter(Examination.appointment_id == appointment_id).all()
    for exam in examinations:
        exam.is_active = False

    db.commit()
    return True, None


def _create_re_examination_appointment(
    db,
    original_appointment_id,
    re_examination_date,
    re_examination_time,
    doctor_id,
    examination_type,
    package_service_id,
    missing_original_message,
    missing_patient_message,
    missing_doctor_message,
    invalid_datetime_message,
    past_datetime_message,
    not_found_status_code,
):
    original_appointment = db.query(Appointment).filter(Appointment.id == original_appointment_id).first()
    if not original_appointment:
        raise ReExaminationError(missing_original_message, not_found_status_code)

    patient = db.query(Patient).filter(Patient.id == original_appointment.patient_id).first()
    if not patient:
        raise ReExaminationError(missing_patient_message, not_found_status_code)

    doctor = db.query(User).filter(User.id == doctor_id, User.is_active == True).first()
    if not doctor:
        raise ReExaminationError(missing_doctor_message, not_found_status_code)

    try:
        re_examination_datetime = datetime.strptime(
            f"{re_examination_date} {re_examination_time}",
            '%Y-%m-%d %H:%M'
        )
    except ValueError:
        raise ReExaminationError(invalid_datetime_message, 400)

    if re_examination_datetime <= datetime.now():
        raise ReExaminationError(past_datetime_message, 400)

    service_id = None
    package_id = None
    if examination_type == 'package':
        package_id = package_service_id
    else:
        service_id = package_service_id

    try:
        ensure_no_scheduling_conflict(
            db,
            doctor_id,
            re_examination_datetime,
            duration_minutes=original_appointment.duration_minutes or 60,
        )
    except AppointmentSchedulingConflictError as exc:
        raise ReExaminationError(exc.detail, 409) from exc

    re_appointment = Appointment(
        appointment_code=_build_re_appointment_code(100, 999),
        patient_id=patient.id,
        doctor_id=doctor_id,
        appointment_date=re_examination_datetime,
        duration_minutes=original_appointment.duration_minutes,
        status=AppointmentStatus.SCHEDULED,
        appointment_category=AppointmentCategory.RE_EXAMINATION,
        appointment_type=AppointmentType.SERVICE if examination_type == 'service' else AppointmentType.PACKAGE,
        service_id=service_id,
        package_id=package_id,
        target_type=original_appointment.target_type,
        target_name=original_appointment.target_name,
        notes=f"Lịch hẹn tái khám từ lịch hẹn ngày {original_appointment.appointment_date.strftime('%d/%m/%Y')}",
        original_appointment_id=original_appointment.id
    )

    db.add(re_appointment)
    try:
        db.commit()
    except Exception:
        db.rollback()
        re_appointment.appointment_code = _build_re_appointment_code(1000, 9999)
        db.add(re_appointment)
        db.commit()

    db.refresh(re_appointment)
    return re_appointment

def _build_re_appointment_code(random_start, random_end):
    return f"APT{datetime.now().strftime('%Y%m%d%H%M%S%f')}{random.randint(random_start, random_end)}R"
