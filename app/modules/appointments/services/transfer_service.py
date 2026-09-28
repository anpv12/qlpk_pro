"""Transfer services for appointment workflows."""

from dataclasses import dataclass, field

from app.models.appointment import Appointment, AppointmentStatus
from app.models.examination import Examination, ExaminationStatus
from app.models.user import User
from app.utils.clinical_access import user_role_value
from app.modules.appointments.services.side_effects import sync_transferred_appointment_calendar
from app.modules.appointments.services.doctor_queue import mark_doctor_queue_entry


class AppointmentTransferValidationError(Exception):
    """Raised when transfer appointment payload is invalid."""

    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class AppointmentTransferResult:
    updated_count: int
    appointment_ids: list
    calendar_appointment_ids: list = field(default_factory=list)


def parse_transfer_request(data):
    if not isinstance(data, dict):
        raise AppointmentTransferValidationError('Dữ liệu chuyển khám không hợp lệ')
    appointment_ids = data.get('appointment_ids', [])
    to_role = data.get('to_role')
    to_person_id = data.get('to_person_id')
    try:
        if not isinstance(appointment_ids, list) or not appointment_ids or len(appointment_ids) > 100:
            raise ValueError()
        values = [*appointment_ids, to_person_id]
        if any(isinstance(value, bool) or not isinstance(value, (str, int))
               or not str(value).isascii() or not str(value).isdecimal() for value in values):
            raise ValueError()
        appointment_ids = sorted(set(int(value) for value in appointment_ids))
        to_person_id = int(to_person_id)
        if any(value <= 0 or value > 2147483647 for value in [*appointment_ids, to_person_id]):
            raise ValueError()
    except (TypeError, ValueError):
        raise AppointmentTransferValidationError("Lượt khám hoặc người nhận không hợp lệ")
    if not isinstance(to_role, str) or normalize_transfer_role(to_role) not in {'doctor', 'psychologist', 'receptionist'}:
        raise AppointmentTransferValidationError('Nhóm nhận chuyển khám không hợp lệ')
    return appointment_ids, normalize_transfer_role(to_role), to_person_id


def prepare_transfer_records(db, user, appointment_ids, to_role, to_person_id):
    actor_id = getattr(user, 'id', None)
    if not isinstance(actor_id, int) or isinstance(actor_id, bool) or actor_id <= 0:
        raise AppointmentTransferValidationError('Không có quyền chuyển khám', 403)
    people = db.query(User).filter(User.id.in_([actor_id, to_person_id])).order_by(User.id).populate_existing().with_for_update(read=True).all()
    users = {person.id: person for person in people}
    actor = users.get(actor_id)
    recipient = users.get(to_person_id)
    role = user_role_value(actor)
    if not actor or actor.is_active is not True or role not in {'admin', 'staff', 'doctor', 'psychologist'}:
        raise AppointmentTransferValidationError('Không có quyền chuyển khám', 403)
    if actor_id == to_person_id:
        raise AppointmentTransferValidationError('Không thể chuyển cho chính mình')
    expected_role = 'staff' if to_role == 'receptionist' else to_role
    if not recipient or recipient.is_active is not True or user_role_value(recipient) != expected_role:
        raise AppointmentTransferValidationError('Người nhận không hoạt động hoặc không đúng nhóm chuyển khám')
    appointments = db.query(Appointment).filter(Appointment.id.in_(appointment_ids)).order_by(Appointment.id).populate_existing().with_for_update().all()
    if len(appointments) != len(appointment_ids) or any(appointment.is_deleted for appointment in appointments):
        raise AppointmentTransferValidationError('Có lượt khám không tồn tại hoặc đã bị hủy', 404)
    if role not in {'admin', 'staff'} and any(appointment.doctor_id != actor_id for appointment in appointments):
        raise AppointmentTransferValidationError('Bạn không có quyền chuyển một hoặc nhiều lượt khám đã chọn', 403)
    examinations = db.query(Examination).filter(Examination.appointment_id.in_(appointment_ids), Examination.is_active.is_(True)).order_by(Examination.id).populate_existing().with_for_update().all()
    by_appointment = {}
    for examination in examinations:
        if examination.appointment_id in by_appointment:
            raise AppointmentTransferValidationError('Lượt khám có nhiều hồ sơ đang hoạt động; cần kiểm tra lại', 409)
        by_appointment[examination.appointment_id] = examination
    allowed_statuses = {ExaminationStatus.WAITING_TRANSFER, ExaminationStatus.DOCTOR_EXAM,
                        ExaminationStatus.PSYCHOLOGIST_EXAM, ExaminationStatus.CONCLUSION}
    for appointment in appointments:
        examination = by_appointment.get(appointment.id)
        if appointment.status != AppointmentStatus.CONFIRMED or not examination or examination.status not in allowed_statuses:
            raise AppointmentTransferValidationError('Có lượt khám không còn ở trạng thái được chuyển khám', 409)
    return actor, [(appointment, by_appointment[appointment.id]) for appointment in appointments]


def transfer_appointments_between_roles(db, user, data, logger=None):
    """Validate and lock the whole batch before changing any appointment."""
    appointment_ids, to_role_normalized, to_person_id = parse_transfer_request(data)
    actor, records = prepare_transfer_records(db, user, appointment_ids, to_role_normalized, to_person_id)
    new_status = get_new_examination_status(user_role_value(actor), to_role_normalized)

    if logger:
        logger.info(
            f"Transfer: actor_id={actor.id}, from_role={user_role_value(actor)}, "
            f"to_role={to_role_normalized}, to_person_id={to_person_id}, "
            f"appointment_ids={appointment_ids}"
        )
        logger.info(f"New status will be: {new_status}")

    changed_ids = []
    calendar_ids = []

    for appointment, examination in records:
        old_doctor_id = appointment.doctor_id
        previous_status = examination.status
        same_owner = to_role_normalized == 'receptionist' or (
            old_doctor_id == to_person_id and examination.doctor_id == to_person_id
            and (to_role_normalized != 'psychologist' or appointment.psychologist_id == to_person_id)
        )
        if same_owner and previous_status == new_status:
            continue

        if to_role_normalized == 'doctor':
            appointment.doctor_id = int(to_person_id)
        elif to_role_normalized == 'psychologist':
            appointment.psychologist_id = int(to_person_id)
            appointment.doctor_id = int(to_person_id)

        if to_role_normalized in ('doctor', 'psychologist'):
            examination.doctor_id = to_person_id
        examination.status = new_status
        mark_doctor_queue_entry(appointment, previous_status, new_status, old_doctor_id)

        if appointment.doctor_id != old_doctor_id:
            if sync_transferred_appointment_calendar(
                db,
                appointment,
                old_doctor_id,
                logger_override=logger,
            ) is True:
                calendar_ids.append(appointment.id)

        changed_ids.append(appointment.id)

    return AppointmentTransferResult(updated_count=len(changed_ids), appointment_ids=changed_ids,
                                     calendar_appointment_ids=calendar_ids)


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
