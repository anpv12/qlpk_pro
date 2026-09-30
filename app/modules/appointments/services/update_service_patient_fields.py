"""app.modules.appointments.services.update_service: phần 2 — tách từ update_service.py (import ở cuối update_service.py để đăng ký route/giữ tên cũ)."""

from datetime import datetime
from app.models.examination_detail import ExaminationDetail
from app.models.patient import Patient
from app.utils.address_contract import apply_patient_address_update
from app.utils.examination_utils import is_psychologist_examination
from app.utils.medical_history_contract import (
    normalize_family_history,
    normalize_physical_history,
    normalize_safety_plan,
    normalize_substance_use_history,
)
from app.utils.allergy_contract import normalize_allergy_entries
from app.utils.referral_source import apply_referral_source
from sqlalchemy import and_
from app.modules.appointments.services.update_service import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    ADDRESS_UPDATE_FIELDS,
    NUMERIC_VITAL_FIELDS,
    PATIENT_FIELD_ALIASES,
    PATIENT_MODEL_FIELDS,
    PATIENT_UPDATE_FIELDS,
    PSYCHOLOGIST_DETAIL_FIELDS,
    VITAL_FIELDS,
    logger,
)


def apply_examination_vitals(examination, data):
    updated_any = False
    for field in VITAL_FIELDS:
        if field in data and data[field] is not None and data[field] != '':
            value = data[field]
            if field in NUMERIC_VITAL_FIELDS:
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    logger.warning('Bỏ qua sinh hiệu %s không phải số: %r', field, value)
                    continue
            setattr(examination, field, value)
            updated_any = True
    return updated_any


def apply_psychologist_detail_updates_from_appointment_payload(db, examination, data, logger=None):
    """Keep the psychologist-only form contract out of Doctor updates."""
    if not examination or not is_psychologist_examination(examination):
        return

    save_psychologist_form_detail_fields(db, examination, data, logger=logger)


def save_psychologist_form_detail_fields(db, examination, data, logger=None):
    new_section = 'tam_ly_gia_kham_form_kham'

    if not any(field in data for field in PSYCHOLOGIST_DETAIL_FIELDS):
        return

    if logger:
        logger.debug("Saving examination details for examination_id=%s", examination.id)
        logger.debug("Psychologist fields received: %s", [field for field in PSYCHOLOGIST_DETAIL_FIELDS if field in data])

    for field in PSYCHOLOGIST_DETAIL_FIELDS:
        if field in data:
            if logger:
                logger.debug("Upserting examination detail field %s", field)

            deleted_count = db.query(ExaminationDetail).filter(
                and_(
                    ExaminationDetail.examination_id == examination.id,
                    ExaminationDetail.section == new_section,
                    ExaminationDetail.field_name == field,
                )
            ).delete()
            if logger:
                logger.debug("Deleted %s existing detail record(s) for field %s", deleted_count, field)

            detail = ExaminationDetail(
                examination_id=examination.id,
                section=new_section,
                field_name=field,
                field_value=data[field] if data[field] else '',
            )
            db.add(detail)
            if logger:
                logger.debug("Created new examination detail record for field %s", field)

    db.flush()
    if logger:
        logger.debug("Examination details saved successfully")


def _merge_patient_safety_plan(patient, value):
    # Keep the separately uploaded safety-plan file when saving form fields.
    current_plan = normalize_safety_plan(patient.safety_plan or {})
    current_plan.update(normalize_safety_plan(value))
    patient.safety_plan = current_plan


# field -> (patient, value, db, logger) handler for fields that need normalization before saving.
PATIENT_UPDATE_FIELD_HANDLERS = {
    'date_of_birth': lambda patient, value, db, logger: apply_patient_date_of_birth(patient, value, logger=logger),
    'expected_delivery_date': lambda patient, value, db, logger: apply_patient_expected_delivery_date(patient, value, logger=logger),
    'mang_thai': lambda patient, value, db, logger: setattr(patient, 'mang_thai', normalize_boolean(value)),
    'so_tuan_thai': lambda patient, value, db, logger: setattr(patient, 'so_tuan_thai', normalize_optional_integer(value)),
    'referral_source': lambda patient, value, db, logger: apply_referral_source(patient, value),
    'safety_plan': lambda patient, value, db, logger: _merge_patient_safety_plan(patient, value),
    'physical_history': lambda patient, value, db, logger: setattr(patient, 'physical_history', normalize_physical_history(db, value)),
    'family_history': lambda patient, value, db, logger: setattr(patient, 'family_history', normalize_family_history(value)),
    'substance_use_history': lambda patient, value, db, logger: setattr(patient, 'substance_use_history', normalize_substance_use_history(value)),
    'allergies': lambda patient, value, db, logger: setattr(patient, 'allergies', normalize_allergy_entries(value)),
}


def _apply_patient_update_field(address_payload, db, field_name, logger, patient, value):
    handler = PATIENT_UPDATE_FIELD_HANDLERS.get(field_name)
    if handler:
        handler(patient, value, db, logger)
    elif field_name in ADDRESS_UPDATE_FIELDS:
        address_payload[field_name] = value
    elif field_name in PATIENT_MODEL_FIELDS:
        setattr(patient, field_name, value)


def apply_patient_updates_from_appointment_payload(db, appointment, data, logger=None):
    """Apply patient-owned fields from the legacy appointment update payload."""
    patient_data_for_update = {
        field: data.get(field)
        for field in PATIENT_UPDATE_FIELDS
        if field in data
    }

    if not patient_data_for_update or not appointment.patient_id:
        return None

    if logger:
        logger.debug("Updating patient %s with fields: %s", appointment.patient_id, sorted(patient_data_for_update.keys()))

    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    if not patient:
        return None

    address_payload = {}
    for key, value in patient_data_for_update.items():
        field_name = PATIENT_FIELD_ALIASES.get(key, key)

        _apply_patient_update_field(address_payload, db, field_name, logger, patient, value)

    if address_payload:
        apply_patient_address_update(patient, address_payload)
        if logger:
            logger.debug("Applied address contract for patient %s", appointment.patient_id)

    db.flush()
    db.refresh(patient)
    return patient


def apply_patient_date_of_birth(patient, value, logger=None):
    if value is None:
        patient.date_of_birth = None
        return

    try:
        patient.date_of_birth = datetime.strptime(value, '%Y-%m-%d').date()
    except ValueError:
        if logger:
            logger.info("Warning: Invalid date_of_birth format for patient update")


def apply_patient_expected_delivery_date(patient, value, logger=None):
    if value in (None, ''):
        patient.expected_delivery_date = None
        patient.so_tuan_thai = None
        return

    try:
        patient.expected_delivery_date = datetime.strptime(value, '%Y-%m-%d').date()
        patient.so_tuan_thai = calculate_pregnancy_week(patient.expected_delivery_date)
    except ValueError:
        if logger:
            logger.info("Warning: Invalid expected_delivery_date format for patient update")


def normalize_boolean(value):
    if value is True or value == 1:
        return True
    if value in (False, None, ''):
        return False
    return str(value).strip().lower() in ('1', 'true', 'yes', 'y', 'co', 'có')


def normalize_optional_integer(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def calculate_pregnancy_week(expected_delivery_date):
    if not expected_delivery_date:
        return None

    today = datetime.now().date()
    days_until_delivery = (expected_delivery_date - today).days
    if days_until_delivery > 280:
        return None

    days_pregnant = 280 - days_until_delivery
    if days_pregnant < 0:
        return None

    return max(0, days_pregnant // 7)
