"""Normalize re-examination metadata for appointment create/update flows."""

from app.models.appointment import Appointment, AppointmentCategory
from app.models.appointment_service import AppointmentService


RE_EXAMINATION_NOTE_PREFIX = 'Lịch hẹn tái khám từ'


class ReExaminationMetadataValidationError(Exception):
    """Raised when re-examination appointment metadata cannot be made consistent."""

    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


def normalize_re_examination_metadata(db, data, current_appointment=None, default_category=None):
    """Keep appointment_category/original_appointment_id/service target consistent.

    Business rule: an appointment linked to an original appointment is a
    re-examination appointment, and a re-examination appointment must carry a
    service/package target so calendar, payment, and prescription flows agree.
    """
    if not isinstance(data, dict):
        return data

    has_category = 'appointment_category' in data
    has_original = 'original_appointment_id' in data
    raw_category = data.get('appointment_category') if has_category else None
    category = _normalize_category(
        raw_category,
        fallback=_appointment_category_value(current_appointment) if current_appointment else default_category,
    )
    original_appointment_id = _coerce_positive_int(
        data.get('original_appointment_id') if has_original else getattr(current_appointment, 'original_appointment_id', None)
    )

    if original_appointment_id and category != AppointmentCategory.RE_EXAMINATION.value:
        category = AppointmentCategory.RE_EXAMINATION.value

    if category == AppointmentCategory.RE_EXAMINATION.value and not original_appointment_id:
        category = AppointmentCategory.NEW.value

    if category == AppointmentCategory.RE_EXAMINATION.value:
        _normalize_re_examination(db, data, current_appointment, original_appointment_id)
    elif category == AppointmentCategory.NEW.value:
        _normalize_new_appointment(data, should_write=has_category or has_original or default_category == AppointmentCategory.NEW.value)

    return data


def _normalize_re_examination(db, data, current_appointment, original_appointment_id):
    if not original_appointment_id:
        raise ReExaminationMetadataValidationError('Lịch tái khám cần có lịch hẹn gốc')

    original_appointment = db.query(Appointment).filter(Appointment.id == original_appointment_id).first()
    if not original_appointment:
        raise ReExaminationMetadataValidationError('Không tìm thấy lịch hẹn gốc của lịch tái khám')

    service_id, package_id, appointment_type = _resolve_re_examination_target(db, data, current_appointment, original_appointment)
    if not service_id and not package_id:
        raise ReExaminationMetadataValidationError('Lịch tái khám cần có dịch vụ hoặc gói khám hợp lệ')

    data['appointment_category'] = AppointmentCategory.RE_EXAMINATION.value
    data['original_appointment_id'] = original_appointment.id
    data['appointment_type'] = appointment_type
    data['service_id'] = service_id
    data['package_id'] = package_id

    if not data.get('notes'):
        data['notes'] = f"Lịch hẹn tái khám từ lịch hẹn ngày {original_appointment.appointment_date.strftime('%d/%m/%Y')}"


def _normalize_new_appointment(data, should_write=False):
    if should_write:
        data['appointment_category'] = AppointmentCategory.NEW.value
        data['original_appointment_id'] = None
    if _is_generated_re_examination_note(data.get('notes')):
        data['notes'] = ''


def _resolve_re_examination_target(db, data, current_appointment, original_appointment):
    service_id = _coerce_positive_int(data.get('service_id'))
    package_id = _coerce_positive_int(data.get('package_id'))

    if not service_id and current_appointment:
        service_id = _coerce_positive_int(getattr(current_appointment, 'service_id', None))
    if not package_id and current_appointment:
        package_id = _coerce_positive_int(getattr(current_appointment, 'package_id', None))

    if not service_id:
        service_id = _coerce_positive_int(getattr(original_appointment, 'service_id', None))
    if not package_id:
        package_id = _coerce_positive_int(getattr(original_appointment, 'package_id', None))

    if not service_id:
        appointment_service = db.query(AppointmentService).filter(
            AppointmentService.appointment_id == original_appointment.id,
            AppointmentService.service_id.isnot(None),
        ).order_by(AppointmentService.id.asc()).first()
        if appointment_service:
            service_id = _coerce_positive_int(appointment_service.service_id)

    if service_id:
        return service_id, None, 'SERVICE'
    if package_id:
        return None, package_id, 'PACKAGE'
    return None, None, None


def _normalize_category(value, fallback=None):
    raw = value if value not in (None, '') else fallback
    if raw is None:
        return None
    if hasattr(raw, 'value'):
        raw = raw.value
    raw = str(raw).strip().upper()
    if raw in {AppointmentCategory.NEW.value, AppointmentCategory.RE_EXAMINATION.value}:
        return raw
    return None


def _appointment_category_value(appointment):
    category = getattr(appointment, 'appointment_category', None)
    return category.value if hasattr(category, 'value') else category


def _coerce_positive_int(value):
    if value in (None, '', 'null', 'undefined'):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _is_generated_re_examination_note(value):
    return isinstance(value, str) and value.strip().startswith(RE_EXAMINATION_NOTE_PREFIX)
