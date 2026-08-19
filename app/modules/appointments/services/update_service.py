"""Update helpers for the high-risk PUT /api/appointments/<id> flow."""

from dataclasses import dataclass
from datetime import datetime

import pytz

from app.models.examination import Examination, ExaminationStatus, ExaminationType
from app.models.examination_detail import ExaminationDetail
from app.models.appointment import AppointmentStatus
from app.models.package import Package
from app.models.patient import Patient
from app.models.service import Service
from app.modules.appointments.services.re_examination_metadata import (
    ReExaminationMetadataValidationError,
    normalize_re_examination_metadata,
)
from app.modules.appointments.services.scheduling_conflict import (
    AppointmentSchedulingConflictError,
    ensure_no_scheduling_conflict,
)
from app.schemas.appointment import AppointmentUpdate
from app.utils.appointment_helpers import parse_appointment_date
from app.utils.address_contract import ADDRESS_COMPONENT_FIELDS, apply_patient_address_update
from app.utils.examination_utils import is_psychologist_examination
from app.utils.medical_history_contract import (
    normalize_family_history,
    normalize_physical_history,
    normalize_safety_plan,
    normalize_substance_use_history,
)
from app.utils.allergy_contract import normalize_allergy_entries
from app.utils.risk_assessment import normalize_risk_assessment, validate_risk_assessment
from app.utils.referral_source import apply_referral_source
from sqlalchemy import and_


class AppointmentAdminValidationError(Exception):
    """Raised when appointment admin updates should return HTTP 400."""

    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


@dataclass
class AppointmentAdminUpdateResult:
    appointment_date_updated: bool
    doctor_changed: bool
    update_fields: dict


PATIENT_UPDATE_FIELDS = (
    'full_name',
    'phone',
    'phone_number',
    'email',
    'address',
    'allergies',
    'date_of_birth',
    'current_medication',
    'nickname',
    'occupation',
    'don_vi_cong_tac',
    'dia_chi_cong_ty',
    'marital_status',
    'gender',
    'mang_thai',
    'expected_delivery_date',
    'so_tuan_thai',
    'family_history',
    'referral_source',
    'problem_start_time',
    'symptom_progression',
    'id_number',
    'sexual_orientation',
    'religion',
    'ethnicity',
    'nationality',
    'education_level',
    'province',
    'district',
    'ward',
    'address_detail',
    'breathing',
    'emergency_contact',
    'physical_history',
    'current_behavior',
    'severity_level',
    'substance_use_history',
    'safety_plan',
)

PATIENT_FIELD_ALIASES = {
    'phone_number': 'phone',
}

PATIENT_MODEL_FIELDS = set(Patient.__table__.columns.keys())
ADDRESS_UPDATE_FIELDS = set(ADDRESS_COMPONENT_FIELDS) | {'address'}
EXAMINATION_CREATION_FIELDS = [
    'weight', 'height', 'bmi', 'pulse', 'blood_pressure', 'temperature', 'breathing',
    'main_reason', 'main_symptoms', 'diagnosis', 'benh_kem_theo', 'treatment_plan', 'loi_dan',
    'current_medications', 'risk_assessment',
]
EXAMINATION_FLUSH_FIELDS = [
    'main_reason', 'main_symptoms', 'diagnosis', 'benh_kem_theo', 'treatment_plan', 'loi_dan',
    'current_medications', 'risk_assessment',
]
VITAL_FIELDS = ['weight', 'height', 'bmi', 'pulse', 'blood_pressure', 'temperature', 'breathing']
NUMERIC_VITAL_FIELDS = {'weight', 'height', 'bmi', 'pulse', 'temperature', 'breathing'}
PSYCHOLOGIST_DETAIL_FIELDS = [
    'trieu_chung_va_hanh_vi_hien_tai',
    'nhan_dinh_chung',
    'ke_hoach_can_thiep',
]
SERVER_TZ = pytz.timezone('Asia/Ho_Chi_Minh')


def apply_appointment_admin_updates(db, appointment, appointment_id, data, logger=None):
    """Apply appointment-owned fields from the legacy appointment update payload."""
    old_doctor_id = appointment.doctor_id
    old_service_id = appointment.service_id
    old_package_id = appointment.package_id
    new_doctor_id = data.get('doctor_id')
    doctor_changed = new_doctor_id not in (None, '') and str(new_doctor_id) != str(old_doctor_id)

    appointment_date_updated = apply_appointment_date_update(appointment, data)

    normalize_appointment_update_payload(data)
    normalize_service_package_payload(data)
    try:
        normalize_re_examination_metadata(db, data, current_appointment=appointment)
    except ReExaminationMetadataValidationError as exc:
        raise AppointmentAdminValidationError(exc.detail)
    normalize_service_package_payload(data)
    ensure_appointment_status_update_allowed(appointment, data)

    update_fields = build_appointment_update_fields(data)
    apply_validated_appointment_update_fields(appointment, update_fields, logger=logger)
    apply_selected_target_duration_update(db, appointment, data, old_service_id, old_package_id, logger=logger)
    if has_scheduling_update(data):
        ensure_scheduling_update_has_no_conflict(db, appointment, appointment_id)
    sync_examinations_for_appointment_admin_update(
        db,
        appointment,
        appointment_id,
        data,
        appointment_date_updated,
        logger=logger,
    )
    apply_explicit_notes_update(appointment, data, logger=logger)
    appointment.updated_at = datetime.utcnow()

    return AppointmentAdminUpdateResult(
        appointment_date_updated=appointment_date_updated,
        doctor_changed=doctor_changed,
        update_fields=update_fields,
    )


def apply_appointment_date_update(appointment, data):
    appt_date_str = data.get('appointment_date')
    if not appt_date_str:
        return False

    try:
        new_appointment_date = parse_appointment_date(appt_date_str)
    except ValueError as exc:
        raise AppointmentAdminValidationError(str(exc))

    if appointment.appointment_date != new_appointment_date:
        appointment.appointment_date = new_appointment_date
        return True
    return False


def sync_examinations_for_appointment_admin_update(
    db,
    appointment,
    appointment_id,
    data,
    appointment_date_updated,
    logger=None,
):
    relevant_fields = {
        'patient_id',
        'doctor_id',
        'appointment_type',
        'service_id',
        'package_id',
    }
    should_sync = appointment_date_updated or any(field in data for field in relevant_fields)

    if not should_sync:
        return

    examinations = db.query(Examination).filter(
        Examination.appointment_id == appointment_id,
        Examination.is_active == True,
    ).all()

    for exam in examinations:
        if appointment_date_updated:
            exam.examination_date = appointment.appointment_date
        if 'patient_id' in data:
            exam.patient_id = appointment.patient_id
        if 'doctor_id' in data:
            exam.doctor_id = appointment.doctor_id
        if any(field in data for field in ('appointment_type', 'service_id', 'package_id')):
            exam.examination_type = get_examination_type_from_appointment(appointment)
            exam.service_id = appointment.service_id
            exam.package_id = appointment.package_id

    if examinations:
        db.flush()
        if logger:
            logger.info(
                "Đã đồng bộ dữ liệu hành chính appointment cho %s examination",
                len(examinations),
            )


def get_examination_type_from_appointment(appointment):
    appointment_type = appointment.appointment_type.value if hasattr(appointment.appointment_type, 'value') else appointment.appointment_type
    if appointment_type == 'SERVICE' or (appointment.service_id and not appointment.package_id):
        return ExaminationType.SERVICE
    return ExaminationType.PACKAGE


def normalize_appointment_update_payload(data):
    if 'status' in data and data['status']:
        data['status'] = data['status'].upper()
        if data['status'] not in AppointmentStatus.__members__:
            raise AppointmentAdminValidationError(
                'Trạng thái lịch hẹn không hợp lệ. Chỉ hỗ trợ: Chờ xác nhận, Đã xác nhận, Không đến.'
            )
    if 'appointment_type' in data and data['appointment_type']:
        data['appointment_type'] = data['appointment_type'].upper()


def normalize_service_package_payload(data):
    for key in ('service_id', 'package_id', 'original_appointment_id'):
        if data.get(key) == '':
            data[key] = None

    appointment_type = data.get('appointment_type')
    if appointment_type == 'SERVICE':
        data['package_id'] = None
    elif appointment_type == 'PACKAGE':
        data['service_id'] = None
    elif data.get('service_id') and not data.get('package_id'):
        data['appointment_type'] = 'SERVICE'
    elif data.get('package_id') and not data.get('service_id'):
        data['appointment_type'] = 'PACKAGE'


def ensure_appointment_status_update_allowed(appointment, data):
    if 'status' in data and data['status'] == 'SCHEDULED' and appointment.status == 'CONFIRMED':
        raise AppointmentAdminValidationError(
            'Không thể chuyển về "Chờ xác nhận" khi đã "Đã xác nhận". Vui lòng sử dụng chức năng "Hủy lượt khám" ở màn hình lễ tân.'
        )
    if 'status' in data and data['status'] == 'CANCELLED':
        raise AppointmentAdminValidationError(
            'Không thể hủy lịch bằng cập nhật trạng thái trực tiếp. Vui lòng sử dụng chức năng Xóa/ẩn lịch hẹn.'
        )
    if 'status' in data and data['status'] == 'NO_SHOW':
        now_vn = datetime.now(SERVER_TZ).replace(tzinfo=None)
        if appointment.appointment_date and appointment.appointment_date > now_vn:
            raise AppointmentAdminValidationError(
                'Chỉ có thể đánh dấu Không đến cho lịch hẹn đã qua giờ hẹn.'
            )


def build_appointment_update_fields(data):
    update_fields = {}
    for key, value in data.items():
        if key in [
            'patient_id', 'doctor_id', 'appointment_date', 'duration_minutes', 'status', 'notes',
            'appointment_category', 'appointment_type', 'service_id', 'package_id', 'original_appointment_id',
        ]:
            if key == 'notes':
                if value is not None and value != '':
                    update_fields[key] = value
            elif key in ['service_id', 'package_id', 'original_appointment_id']:
                update_fields[key] = value
            elif value is not None:
                update_fields[key] = value
    return update_fields


def apply_validated_appointment_update_fields(appointment, update_fields, logger=None):
    try:
        if logger:
            logger.debug("Appointment update fields before validation: %s", sorted(update_fields.keys()))
        appointment_update_data = AppointmentUpdate(**update_fields)
        validated_fields = appointment_update_data.dict(exclude_unset=True)
        if logger:
            logger.debug("AppointmentUpdate validation successful for fields: %s", sorted(validated_fields.keys()))
        for field, value in validated_fields.items():
            if hasattr(appointment, field) and field != 'appointment_date':
                if logger:
                    logger.debug("Setting appointment field %s", field)
                setattr(appointment, field, value)
    except Exception as exc:
        if logger:
            logger.error(
                "AppointmentUpdate validation failed for fields=%s error_type=%s",
                sorted(update_fields.keys()),
                type(exc).__name__,
            )
        raise AppointmentAdminValidationError(f'Invalid update data: {str(exc)}')


def apply_selected_target_duration_update(db, appointment, data, old_service_id, old_package_id, logger=None):
    appointment_type = data.get('appointment_type')
    new_service_id = data.get('service_id')
    new_package_id = data.get('package_id')

    if appointment_type == 'PACKAGE' or (new_package_id and not new_service_id):
        apply_package_duration_update(db, appointment, new_package_id, old_package_id, logger=logger)
        return

    if appointment_type == 'SERVICE' or new_service_id:
        apply_service_duration_update(db, appointment, new_service_id, old_service_id, logger=logger)


def apply_service_duration_update(db, appointment, new_service_id, old_service_id, logger=None):
    if not new_service_id or new_service_id == old_service_id:
        return

    try:
        service = db.query(Service).filter(Service.id == new_service_id).first()
        if service and service.duration_minutes:
            appointment.duration_minutes = service.duration_minutes
            if logger:
                logger.info(f"Auto-updated duration_minutes={service.duration_minutes} from Service ID {new_service_id}")
    except Exception as exc:
        if logger:
            logger.error(f"Error fetching service duration on update: {exc}")


def apply_package_duration_update(db, appointment, new_package_id, old_package_id, logger=None):
    if not new_package_id or new_package_id == old_package_id:
        return

    try:
        package = db.query(Package).filter(Package.id == new_package_id).first()
        if package and package.duration_minutes:
            appointment.duration_minutes = package.duration_minutes
            if logger:
                logger.info(f"Auto-updated duration_minutes={package.duration_minutes} from Package ID {new_package_id}")
    except Exception as exc:
        if logger:
            logger.error(f"Error fetching package duration on update: {exc}")


def ensure_scheduling_update_has_no_conflict(db, appointment, appointment_id):
    try:
        ensure_no_scheduling_conflict(
            db,
            appointment.doctor_id,
            appointment.appointment_date,
            duration_minutes=appointment.duration_minutes,
            exclude_appointment_id=appointment_id,
        )
    except AppointmentSchedulingConflictError as exc:
        raise AppointmentAdminValidationError(exc.detail) from exc


def has_scheduling_update(data):
    scheduling_fields = {
        'appointment_date',
        'doctor_id',
        'duration_minutes',
        'appointment_type',
        'service_id',
        'package_id',
    }
    return any(field in data for field in scheduling_fields)


def apply_explicit_notes_update(appointment, data, logger=None):
    if 'notes' not in data:
        return

    notes_value = data.get('notes')
    if notes_value is not None and notes_value != '':
        appointment.notes = notes_value
        if logger:
            logger.debug("Set appointment.notes")
    elif notes_value == '':
        appointment.notes = None
        if logger:
            logger.debug("Clear appointment.notes")


def ensure_examination_for_confirmed_appointment(db, appointment, appointment_id, update_fields):
    if 'status' not in update_fields or update_fields['status'] != 'CONFIRMED':
        return None

    existing_examination = db.query(Examination).filter(
        Examination.appointment_id == appointment_id,
        Examination.is_active == True,
    ).first()
    if existing_examination:
        existing_examination.patient_id = appointment.patient_id
        existing_examination.doctor_id = appointment.doctor_id
        existing_examination.examination_date = appointment.appointment_date
        existing_examination.examination_type = get_examination_type_from_appointment(appointment)
        existing_examination.service_id = appointment.service_id
        existing_examination.package_id = appointment.package_id
        return existing_examination

    examination_code = f"LK{datetime.now().strftime('%Y%m%d%H%M%S')}"
    examination = Examination(
        appointment_id=appointment.id,
        patient_id=appointment.patient_id,
        doctor_id=appointment.doctor_id,
        examination_date=appointment.appointment_date,
        examination_code=examination_code,
        status=ExaminationStatus.WAITING_TRANSFER,
        examination_type=get_examination_type_from_appointment(appointment),
        service_id=appointment.service_id,
        package_id=appointment.package_id,
        main_reason="",
    )
    db.add(examination)
    return examination


def apply_examination_clinical_updates_from_appointment_payload(db, appointment, appointment_id, data, logger=None):
    """Apply examination-owned clinical fields from the legacy appointment update payload."""
    examination = db.query(Examination).filter(Examination.appointment_id == appointment_id).first()

    if not examination and any(key in data for key in EXAMINATION_CREATION_FIELDS):
        examination_code = f"LK{datetime.now().strftime('%Y%m%d%H%M%S')}"
        examination = Examination(
            examination_code=examination_code,
            appointment_id=appointment.id,
            patient_id=appointment.patient_id,
            doctor_id=appointment.doctor_id,
            examination_date=appointment.appointment_date,
            examination_type=get_examination_type_from_appointment(appointment),
            service_id=appointment.service_id,
            package_id=appointment.package_id,
            status=ExaminationStatus.WAITING_TRANSFER,
        )
        db.add(examination)
        db.flush()
        if logger:
            logger.info(f"Created new examination {examination.id} for appointment {appointment_id}")

    if not examination:
        return None

    # Appointment edits may not overwrite active clinical reason/symptoms.
    # Doctor manual save has no `is_appointment_edit` flag and remains canonical.
    exam_status_value = examination.status.value if hasattr(examination.status, 'value') else examination.status
    block_clinical_overwrite = (
        bool(data.get('is_appointment_edit'))
        and exam_status_value not in ('WAITING_TRANSFER', None)
    )
    if 'main_reason' in data and not block_clinical_overwrite:
        examination.main_reason = data.get('main_reason')
    if 'main_symptoms' in data and not block_clinical_overwrite:
        examination.main_symptoms = data.get('main_symptoms')
    if 'diagnosis' in data:
        examination.diagnosis = data.get('diagnosis')
    if 'benh_kem_theo' in data:
        examination.benh_kem_theo = data.get('benh_kem_theo')
    if 'treatment_plan' in data:
        examination.treatment_plan = data.get('treatment_plan')
    if 'loi_dan' in data:
        examination.loi_dan = data.get('loi_dan')
    if 'current_medications' in data:
        examination.current_medications = data.get('current_medications')
    if 'risk_assessment' in data:
        examination.risk_assessment = normalize_risk_assessment(
            validate_risk_assessment(data.get('risk_assessment'))
        )

    updated_any = apply_examination_vitals(examination, data)
    if updated_any or any(key in data for key in EXAMINATION_FLUSH_FIELDS):
        db.flush()
        if logger:
            logger.info(f"Updated examination {examination.id} with vital signs and other fields")

    return examination


def apply_examination_vitals(examination, data):
    updated_any = False
    for field in VITAL_FIELDS:
        if field in data and data[field] is not None and data[field] != '':
            value = data[field]
            if field in NUMERIC_VITAL_FIELDS:
                try:
                    value = float(value)
                except Exception:
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

        if field_name == 'date_of_birth':
            apply_patient_date_of_birth(patient, value, logger=logger)
        elif field_name == 'expected_delivery_date':
            apply_patient_expected_delivery_date(patient, value, logger=logger)
        elif field_name == 'mang_thai':
            patient.mang_thai = normalize_boolean(value)
        elif field_name == 'so_tuan_thai':
            patient.so_tuan_thai = normalize_optional_integer(value)
        elif field_name == 'referral_source':
            apply_referral_source(patient, value)
        elif field_name == 'safety_plan':
            # Keep the separately uploaded safety-plan file when saving form fields.
            current_plan = normalize_safety_plan(patient.safety_plan or {})
            current_plan.update(normalize_safety_plan(value))
            patient.safety_plan = current_plan
        elif field_name == 'physical_history':
            patient.physical_history = normalize_physical_history(db, value)
        elif field_name == 'family_history':
            patient.family_history = normalize_family_history(value)
        elif field_name == 'substance_use_history':
            patient.substance_use_history = normalize_substance_use_history(value)
        elif field_name == 'allergies':
            patient.allergies = normalize_allergy_entries(value)
        elif field_name in ADDRESS_UPDATE_FIELDS:
            address_payload[field_name] = value
        elif field_name in PATIENT_MODEL_FIELDS:
            setattr(patient, field_name, value)

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
