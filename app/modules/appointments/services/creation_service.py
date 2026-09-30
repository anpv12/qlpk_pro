"""Creation services for appointment workflows."""

from dataclasses import dataclass
from datetime import datetime
import logging

from app.models.appointment import Appointment, AppointmentCategory, AppointmentStatus
from app.models.examination import Examination, ExaminationStatus, ExaminationType
from app.models.package import Package
from app.models.patient import Patient
from app.schemas.appointment import AppointmentCreate
from app.modules.appointments.services.calendar_sync import enqueue_calendar_sync
from app.modules.appointments.services.side_effects import schedule_appointment_reminder
from app.modules.appointments.services.re_examination_metadata import (
    ReExaminationMetadataValidationError,
    normalize_re_examination_metadata,
)
from app.modules.appointments.services.scheduling_conflict import (
    AppointmentSchedulingConflictError,
    ensure_no_scheduling_conflict,
)
from app.utils import generate_patient_code
from app.utils.appointment_helpers import parse_appointment_date
from app.utils.medical_history_contract import (
    normalize_family_history,
    normalize_physical_history,
    normalize_safety_plan,
    normalize_substance_use_history,
)
from app.utils.allergy_contract import normalize_allergy_entries
from app.utils.referral_source import build_referral_source_fields
from app.modules.appointments.services.creation_service_existing_patient import AppointmentCreationRequiresConfirmation, _apply_existing_patient_updates, _build_existing_appointments_list, _build_existing_patient_changes, _build_existing_patient_confirmation_payload, _find_existing_patient, _handle_existing_patient_for_creation  # noqa: F401 — re-exported for callers of this module

logger = logging.getLogger(__name__)


class AppointmentCreationValidationError(Exception):
    """Raised when appointment creation should return an error response."""

    def __init__(self, detail, status_code=400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class AppointmentCreationDuplicateError(Exception):
    """Raised when an appointment duplicates an active slot."""

    def __init__(self, detail):
        super().__init__(detail)
        self.detail = detail


@dataclass
class AppointmentCreationResult:
    appointment: Appointment


def create_appointment_from_payload(db, data, notification_service, calendar_syncer, logger=None):
    """Create an appointment using the legacy POST /api/appointments payload."""
    if logger:
        logger.info(f"Creating appointment for patient: {data.get('patient_id', 'new')}")

    patient = _resolve_patient_for_creation(db, data, logger=logger)
    data['patient_id'] = patient.id

    _normalize_appointment_creation_payload(db, data)
    appt_create_data = _validate_appointment_create_data(data)
    appt_date = _parse_appointment_create_date(appt_create_data)
    duration_minutes = _resolve_duration_minutes(db, appt_create_data, logger=logger)
    _ensure_no_duplicate_appointment(db, data, appt_create_data, appt_date, duration_minutes)
    appt = _create_appointment_model(db, data, appt_create_data, appt_date, duration_minutes)
    db.flush()

    _try_create_initial_examination(db, appt, data)
    enqueue_calendar_sync(db, appt.id)
    db.commit()
    db.refresh(appt)

    if appt.id:
        schedule_appointment_reminder(
            appt.id,
            notification_service,
            logger_override=logger,
        )

    calendar_syncer(appt, db, action='create')

    return AppointmentCreationResult(appointment=appt)


def _resolve_patient_for_creation(db, data, logger=None):
    if data.get('patient_id'):
        patient = db.query(Patient).filter(Patient.id == data['patient_id']).first()
        if not patient:
            raise AppointmentCreationValidationError(f"Patient with ID {data['patient_id']} not found.", 404)
        return patient

    patient_data = _build_patient_creation_data(data)
    if not patient_data['full_name']:
        raise AppointmentCreationValidationError('Missing patient information (full_name) for new patient creation.', 400)

    normalized_phone = ''.join(filter(str.isdigit, patient_data['phone'])) if patient_data.get('phone') else None
    patient = _find_existing_patient(db, patient_data, normalized_phone, logger=logger)

    if patient:
        _handle_existing_patient_for_creation(db, patient, patient_data, data, logger=logger)
        return patient

    return _create_new_patient_for_appointment(db, patient_data, normalized_phone, logger=logger)


def _build_patient_creation_data(data):
    return {
        'full_name': data.get('full_name'),
        'phone': data.get('phone'),
        'id_number': data.get('id_number'),
        'email': data.get('email'),
        'address': data.get('address'),
        'allergies': normalize_allergy_entries(data.get('allergies')),
        'current_medication': data.get('current_medication'),
        'date_of_birth': data.get('date_of_birth'),
        'nickname': data.get('nickname'),
        'occupation': data.get('occupation'),
        'marital_status': data.get('marital_status'),
        'gender': data.get('gender'),
        'family_history': normalize_family_history(data['family_history']) if 'family_history' in data else None,
        'referral_source': data.get('referral_source'),
        'problem_start_time': data.get('problem_start_time'),
        'symptom_progression': data.get('symptom_progression'),
        'sexual_orientation': data.get('sexual_orientation'),
        'emergency_contact': data.get('emergency_contact'),
        'physical_history': data.get('physical_history'),
        'substance_use_history': normalize_substance_use_history(data['substance_use_history']) if 'substance_use_history' in data else None,
        'safety_plan': normalize_safety_plan(data['safety_plan']) if 'safety_plan' in data else None,
        'severity_level': data.get('severity_level'),
        'address_detail': data.get('address_detail'),
        'province': data.get('province'),
        'district': data.get('district'),
        'ward': data.get('ward'),
        'nationality': data.get('nationality'),
        'religion': data.get('religion'),
        'ethnicity': data.get('ethnicity'),
        'education_level': data.get('education_level'),
        'breathing': data.get('breathing'),
    }


def _normalize_new_patient_history_fields(db, patient_data):
    if 'physical_history' in patient_data:
        patient_data['physical_history'] = normalize_physical_history(db, patient_data['physical_history'])
    if 'family_history' in patient_data:
        patient_data['family_history'] = normalize_family_history(patient_data['family_history'])
    if 'substance_use_history' in patient_data:
        patient_data['substance_use_history'] = normalize_substance_use_history(patient_data['substance_use_history'])
    if 'safety_plan' in patient_data:
        patient_data['safety_plan'] = normalize_safety_plan(patient_data['safety_plan'])


def _create_new_patient_for_appointment(db, patient_data, normalized_phone, logger=None):
    if logger:
        logger.info("Creating new patient from appointment payload")
    if normalized_phone:
        patient_data['phone'] = normalized_phone

    patient_data['patient_code'] = generate_patient_code(db)

    if patient_data.get('date_of_birth'):
        try:
            patient_data['date_of_birth'] = datetime.strptime(patient_data['date_of_birth'], '%Y-%m-%d').date()
        except ValueError:
            if logger:
                logger.info("Warning: Invalid date_of_birth format for new patient, setting to None")
            patient_data['date_of_birth'] = None

    patient_data.pop('breathing', None)
    patient_data.pop('phone_number', None)
    _normalize_new_patient_history_fields(db, patient_data)
    patient_data['family_history'] = patient_data.get('family_history') or []
    patient_data['substance_use_history'] = patient_data.get('substance_use_history') or {}
    patient_data['safety_plan'] = patient_data.get('safety_plan') or {}
    patient_data.update(build_referral_source_fields(patient_data.get('referral_source')))

    patient = Patient(**patient_data)
    db.add(patient)
    db.flush()
    if logger:
        logger.info("New patient created (patient_id=%s)", patient.id)
    return patient


def _normalize_appointment_creation_payload(db, data):
    if 'status' in data and data['status']:
        data['status'] = data['status'].upper()
        if data['status'] not in AppointmentStatus.__members__:
            raise AppointmentCreationValidationError(
                'Trạng thái lịch hẹn không hợp lệ. Chỉ hỗ trợ khi tạo mới: Chờ xác nhận, Đã xác nhận.',
                400,
            )
        if data['status'] in ('CANCELLED', 'NO_SHOW'):
            raise AppointmentCreationValidationError(
                'Không thể tạo mới lịch hẹn ở trạng thái Hủy hoặc Không đến.',
                400,
            )

    if 'appointment_type' in data and data['appointment_type']:
        data['appointment_type'] = data['appointment_type'].upper()

    _normalize_service_package_payload(data)

    try:
        normalize_re_examination_metadata(db, data, default_category=AppointmentCategory.NEW.value)
    except ReExaminationMetadataValidationError as exc:
        raise AppointmentCreationValidationError(exc.detail, 400)

    _normalize_service_package_payload(data)

    if not data.get('status') and data.get('appointment_category') in ['NEW', 'RE_EXAMINATION']:
        data['status'] = 'CONFIRMED'


def _normalize_service_package_payload(data):
    for key in ('service_id', 'package_id'):
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


def _validate_appointment_create_data(data):
    try:
        appointment_schema_data = {
            k: v for k, v in data.items()
            if k in Appointment.__table__.columns.keys() or k in ['appointment_date', 'appointment_type', 'service_id', 'package_id']
        }
        return AppointmentCreate(**appointment_schema_data)
    except Exception as exc:
        raise AppointmentCreationValidationError(f'Invalid appointment data: {str(exc)}', 400)


def _parse_appointment_create_date(appt_create_data):
    if not appt_create_data.appointment_date:
        return None

    try:
        return parse_appointment_date(appt_create_data.appointment_date.isoformat())
    except ValueError as exc:
        raise AppointmentCreationValidationError(str(exc), 400)


def _ensure_no_duplicate_appointment(db, data, appt_create_data, appt_date, duration_minutes):
    if not appt_date or not appt_create_data.doctor_id:
        return

    try:
        ensure_no_scheduling_conflict(
            db,
            appt_create_data.doctor_id,
            appt_date,
            duration_minutes=duration_minutes,
        )
    except AppointmentSchedulingConflictError as exc:
        raise AppointmentCreationDuplicateError(exc.detail) from exc


def _catalog_duration_minutes(db, model, record_id, label, logger=None):
    """duration_minutes of the Service/Package row, or None when missing or unreadable."""
    try:
        record = db.query(model).filter(model.id == record_id).first()
    except Exception as exc:
        if logger:
            logger.error(f"Error fetching {label.lower()} duration: {exc}", exc_info=True)
        return None
    if record and record.duration_minutes:
        if logger:
            logger.info(f"Using duration_minutes={record.duration_minutes} from {label} ID {record.id}")
        return record.duration_minutes
    return None


def _resolve_duration_minutes(db, appt_create_data, logger=None):
    duration_minutes = appt_create_data.duration_minutes
    if appt_create_data.service_id:
        from app.models.service import Service
        duration_minutes = _catalog_duration_minutes(db, Service, appt_create_data.service_id, 'Service', logger) or duration_minutes
    elif appt_create_data.package_id:
        duration_minutes = _catalog_duration_minutes(db, Package, appt_create_data.package_id, 'Package', logger) or duration_minutes
    return duration_minutes or 60


def _create_appointment_model(db, data, appt_create_data, appt_date, duration_minutes):
    if not appt_create_data.appointment_code:
        appt_create_data.appointment_code = 'APT' + datetime.now().strftime('%Y%m%d%H%M%S')

    appt = Appointment(
        appointment_code=appt_create_data.appointment_code,
        patient_id=appt_create_data.patient_id,
        doctor_id=appt_create_data.doctor_id,
        appointment_date=appt_date,
        duration_minutes=duration_minutes,
        status=appt_create_data.status,
        appointment_category=data.get('appointment_category', 'NEW'),
        appointment_type=appt_create_data.appointment_type,
        service_id=appt_create_data.service_id,
        package_id=appt_create_data.package_id,
        original_appointment_id=appt_create_data.original_appointment_id,
        target_type=data.get('target_type'),
        target_name=data.get('target_name'),
        notes=appt_create_data.notes
    )
    db.add(appt)
    return appt


def _try_create_initial_examination(db, appt, data):
    try:
        appointment_status = appt.status.value if hasattr(appt.status, 'value') else str(appt.status)
        if appointment_status != AppointmentStatus.CONFIRMED.value:
            logger.debug(
                "Skip initial examination creation for appointment %s because status=%s",
                appt.id,
                appointment_status,
            )
            return None

        appointment_category = data.get('appointment_category')
        has_main_reason = 'main_reason' in data
        has_main_symptoms = 'main_symptoms' in data
        has_family_history = 'family_history' in data

        logger.debug("appointment_category=%s", appointment_category)
        logger.debug("has_main_reason=%s", has_main_reason)
        logger.debug("has_main_symptoms=%s", has_main_symptoms)
        logger.debug("has_family_history=%s", has_family_history)

        is_from_receptionist_new = (
            appointment_category == 'NEW' or
            has_main_reason or
            has_main_symptoms or
            has_family_history
        )

        logger.debug("is_from_receptionist_new=%s", is_from_receptionist_new)

        if not is_from_receptionist_new:
            logger.debug("Skip initial examination creation; is_from_receptionist_new=%s", is_from_receptionist_new)
            return None

        logger.debug("Creating initial examination for appointment %s from receptionist-new.html", appt.id)
        examination = Examination(
            examination_code=f"LK{datetime.now().strftime('%Y%m%d%H%M%S')}",
            appointment_id=appt.id,
            patient_id=appt.patient_id,
            doctor_id=appt.doctor_id,
            examination_date=appt.appointment_date,
            examination_type=_get_examination_type_from_appointment(appt),
            service_id=appt.service_id,
            package_id=appt.package_id,
            status=ExaminationStatus.WAITING_TRANSFER,
            main_reason=data.get('main_reason'),
            main_symptoms=data.get('main_symptoms'),
            weight=data.get('weight'),
            height=data.get('height'),
            bmi=data.get('bmi'),
            pulse=data.get('pulse'),
            blood_pressure=data.get('blood_pressure'),
            temperature=data.get('temperature'),
            breathing=data.get('breathing'),
        )

        db.add(examination)
        db.flush()

        from app.models.appointment_relative import AppointmentRelative
        appointment_relatives = db.query(AppointmentRelative).filter(
            AppointmentRelative.appointment_id == appt.id,
            AppointmentRelative.family_member_id.isnot(None)
        ).all()

        for relative in appointment_relatives:
            relative.examination_id = examination.id

        logger.debug("Initial examination created with id=%s status=WAITING_TRANSFER", examination.id)
        if appointment_relatives:
            logger.debug("Linked %s appointment_relatives to examination %s", len(appointment_relatives), examination.id)
        return examination
    except Exception:
        logger.exception("Error creating initial examination for appointment %s", appt.id)
        raise

def _get_examination_type_from_appointment(appt):
    appointment_type = appt.appointment_type.value if hasattr(appt.appointment_type, 'value') else appt.appointment_type
    if appointment_type == 'SERVICE' or (appt.service_id and not appt.package_id):
        return ExaminationType.SERVICE
    return ExaminationType.PACKAGE
