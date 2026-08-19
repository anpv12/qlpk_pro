"""Deletion and cancellation services for appointment workflows."""

from dataclasses import dataclass
from datetime import datetime

from app.models.appointment import Appointment, AppointmentStatus
from app.models.examination import Examination, ExaminationStatus


class AppointmentDeletionNotFound(Exception):
    """Raised when an appointment targeted for delete/cancel does not exist."""


class AppointmentDeletionBlocked(Exception):
    """Raised when lifecycle status blocks appointment cancellation."""

    def __init__(self, detail, examination_status):
        super().__init__(detail)
        self.examination_status = examination_status


class AppointmentDeletionRequiresForce(Exception):
    """Raised when appointment cancellation requires explicit force confirmation."""

    def __init__(self, detail, examination_status):
        super().__init__(detail)
        self.examination_status = examination_status


@dataclass
class AppointmentSoftDeletionResult:
    appointment: Appointment
    deactivated_examination_count: int


@dataclass
class AppointmentHardDeletionResult:
    appointment: Appointment


def soft_delete_appointment(db, appointment_id, force=False, logger=None):
    """Apply the legacy lifecycle guard and soft-delete an appointment."""
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentDeletionNotFound("Không tìm thấy lịch hẹn")

    examination = db.query(Examination).filter(
        Examination.appointment_id == appointment_id
    ).first()

    if examination:
        _ensure_cancellable_examination_status(examination, force)

    appointment.is_deleted = True
    appointment.deleted_at = datetime.utcnow()
    appointment.status = AppointmentStatus.CANCELLED

    examinations = db.query(Examination).filter(Examination.appointment_id == appointment_id).all()
    for exam in examinations:
        exam.is_active = False
        if logger:
            logger.info(f"Examination {exam.id} đã được đánh dấu không active")

    return AppointmentSoftDeletionResult(
        appointment=appointment,
        deactivated_examination_count=len(examinations),
    )


def hard_delete_appointment_record(db, appointment_id, calendar_syncer=None):
    """Hard-delete an appointment while preserving the legacy calendar-sync order."""
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentDeletionNotFound("Appointment not found")

    if calendar_syncer:
        calendar_syncer(appointment, db, action='delete')

    db.delete(appointment)
    return AppointmentHardDeletionResult(appointment=appointment)


def _ensure_cancellable_examination_status(examination, force):
    blocked_statuses = [
        ExaminationStatus.WAITING_PAYMENT,
        ExaminationStatus.PAID,
        ExaminationStatus.COMPLETED,
    ]
    if examination.status in blocked_statuses:
        status_labels = {
            ExaminationStatus.WAITING_PAYMENT: 'Chờ thanh toán',
            ExaminationStatus.PAID: 'Đã thanh toán',
            ExaminationStatus.COMPLETED: 'Hoàn thành',
        }
        label = status_labels.get(examination.status, examination.status.value)
        raise AppointmentDeletionBlocked(
            f'Không thể xóa lịch hẹn đã hoàn tất khám (trạng thái: {label}). Liên hệ quản trị viên nếu cần.',
            examination.status.value,
        )

    warn_statuses = [
        ExaminationStatus.DOCTOR_EXAM,
        ExaminationStatus.PSYCHOLOGIST_EXAM,
        ExaminationStatus.CONCLUSION,
    ]
    if examination.status in warn_statuses and not force:
        raise AppointmentDeletionRequiresForce(
            'Lịch hẹn này đang trong quá trình khám. Bạn có chắc chắn muốn xóa?',
            examination.status.value,
        )
