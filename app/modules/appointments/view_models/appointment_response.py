"""Legacy appointment API response view model."""

from app.core.database import get_db
from app.models.appointment import Appointment
from app.models.examination import Examination, ExaminationStatus
from app.schemas.appointment import AppointmentRead
from app.utils.examination_utils import build_icd_display_contract, current_examination
from app.utils.risk_assessment import normalize_risk_assessment
from app.utils.upload_storage import normalize_upload_url


def get_examination_status_text(status):
    """Return Vietnamese display text for an examination status."""
    status_mapping = {
        ExaminationStatus.WAITING_TRANSFER: "Chờ chuyển khám",
        ExaminationStatus.DOCTOR_EXAM: "Bác sĩ khám",
        ExaminationStatus.PSYCHOLOGIST_EXAM: "Tâm lý gia khám",
        ExaminationStatus.CONCLUSION: "Kết luận",
        ExaminationStatus.WAITING_PAYMENT: "Chờ thanh toán",
        ExaminationStatus.COMPLETED: "Đã khám",
    }
    return status_mapping.get(status, str(status))


def build_appointment_response(appointment: Appointment, db=None) -> dict:
    """Build the legacy appointment API response without changing its shape."""
    owned_db = None
    db_for_aux = db
    if db_for_aux is None:
        owned_db = next(get_db())
        db_for_aux = owned_db

    try:
        return _build_appointment_response(appointment, db_for_aux)
    finally:
        if owned_db is not None:
            owned_db.close()


def _add_examination_fields(appointment, db, examination, result):
    result['examination_id'] = examination.id
    result['examination_code'] = examination.examination_code
    result['examination_status'] = examination.status.value if examination.status else None
    result['examination_status_text'] = get_examination_status_text(examination.status) if examination.status else None
    result['examination_date'] = examination.examination_date.strftime('%Y-%m-%dT%H:%M:%S') if examination.examination_date else None

    diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
    benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)

    result['examination'] = {
        'id': examination.id,
        'status': examination.status.value if examination.status else None,
        'weight': float(examination.weight) if examination.weight else None,
        'height': float(examination.height) if examination.height else None,
        'bmi': float(examination.bmi) if examination.bmi else None,
        'pulse': float(examination.pulse) if examination.pulse else None,
        'blood_pressure': examination.blood_pressure,
        'temperature': float(examination.temperature) if examination.temperature else None,
        'breathing': float(examination.breathing) if examination.breathing else None,
        'main_reason': examination.main_reason,
        'main_symptoms': examination.main_symptoms,
        'diagnosis': diagnosis_contract['text'],
        'diagnosis_ids': diagnosis_contract['ids'],
        'benh_kem_theo': benh_kem_theo_contract['text'],
        'benh_kem_theo_ids': benh_kem_theo_contract['ids'],
        'treatment_plan': examination.treatment_plan,
        'loi_dan': examination.loi_dan,
        'current_medications': examination.current_medications,
    }

    result['examinations'] = []
    for exam in appointment.examinations:
        result['examinations'].append({
            'id': exam.id,
            'status': exam.status.value if exam.status else None,
            'doctor_id': exam.doctor_id,
            'loi_dan': exam.loi_dan,
        })


def _add_patient_fields(appointment, db, result):
    result['patient_code'] = appointment.patient.patient_code or ''
    result['patient_full_name'] = appointment.patient.full_name or ''
    result['patient_gender'] = appointment.patient.gender or ''
    result['patient_phone'] = appointment.patient.phone or ''
    result['patient_address'] = appointment.patient.address or ''
    result['patient_address_detail'] = appointment.patient.address_detail or ''
    result['patient_province'] = appointment.patient.province or ''
    result['patient_district'] = appointment.patient.district or ''
    result['patient_ward'] = appointment.patient.ward or ''
    result['patient_emergency_contact'] = appointment.patient.emergency_contact or ''
    result['severity_level'] = appointment.patient.severity_level or ''

    exam_for_risk = current_examination(appointment)
    result['medical_history'] = _build_medical_history_payload(db, appointment, exam_for_risk)
    result['patient_email'] = appointment.patient.email or ''
    result['patient_current_medication'] = appointment.patient.current_medication or ''
    result['patient_id_number'] = appointment.patient.id_number or ''
    result['patient_date_of_birth'] = appointment.patient.date_of_birth.isoformat() if appointment.patient.date_of_birth else None

    result['patient'] = {
        'id': appointment.patient.id,
        'patient_code': appointment.patient.patient_code or '',
        'full_name': appointment.patient.full_name or '',
        'gender': appointment.patient.gender or '',
        'phone': appointment.patient.phone or '',
        'address': appointment.patient.address or '',
        'date_of_birth': appointment.patient.date_of_birth.isoformat() if appointment.patient.date_of_birth else None,
        'id_number': appointment.patient.id_number or '',
        'email': appointment.patient.email or '',
        'current_medication': appointment.patient.current_medication or '',
        'severity_level': appointment.patient.severity_level or ''
    }


def _build_appointment_response(appointment: Appointment, db) -> dict:
    result = AppointmentRead.from_orm(appointment).dict()

    result['appointment_category'] = appointment.appointment_category.value if appointment.appointment_category else 'NEW'

    if result.get('appointment_date') and appointment.appointment_date:
        result['appointment_date'] = appointment.appointment_date.strftime('%Y-%m-%dT%H:%M:%S')

    if appointment.patient:
        _add_patient_fields(appointment, db, result)
    else:
        result['patient_code'] = ''
        result['patient_full_name'] = ''
        result['patient_gender'] = ''
        result['patient_phone'] = ''
        result['patient_address'] = ''
        result['patient_address_detail'] = ''
        result['patient_province'] = ''
        result['patient_district'] = ''
        result['patient_ward'] = ''
        result['patient_emergency_contact'] = ''
        result['severity_level'] = ''
        result['medical_history'] = _empty_medical_history_payload()
        result['patient_email'] = ''
        result['patient_current_medication'] = ''
        result['patient_id_number'] = ''
        result['patient_date_of_birth'] = None
        result['patient'] = None

    if appointment.doctor:
        doctor_avatar = normalize_upload_url(appointment.doctor.avatar) or ''
        result['doctor_name'] = appointment.doctor.full_name or appointment.doctor.username or ''
        result['doctor_avatar'] = doctor_avatar
        result['doctor'] = {
            'id': appointment.doctor.id,
            'full_name': appointment.doctor.full_name or appointment.doctor.username or '',
            'role': appointment.doctor.role.value if appointment.doctor.role else None,
            'avatar': doctor_avatar
        }
    else:
        result['doctor_name'] = ''
        result['doctor_avatar'] = ''
        result['doctor'] = None

    if hasattr(appointment, 'psychologist') and appointment.psychologist:
        result['psychologist_name'] = appointment.psychologist.full_name or appointment.psychologist.username or ''
    else:
        result['psychologist_name'] = ''

    examination = current_examination(appointment)
    if examination:
        _add_examination_fields(appointment, db, examination, result)
    else:
        result['examination_id'] = None
        result['examination_code'] = None
        result['examination_status'] = None
        result['examination_status_text'] = None
        result['examination_date'] = None
        result['examination'] = None
        result['examinations'] = []

    return result


def _empty_medical_history_payload() -> dict:
    return {
        'patient': {
            'physical_history': [],
            'family_history': [],
            'allergies': [],
            'substance_use_history': {},
            'safety_plan': {},
        },
        'examination': {'risk_assessment': {}},
        'previous_examination': {'risk_assessment': {}},
    }


def _build_medical_history_payload(db, appointment, examination) -> dict:
    previous = _get_previous_risk_assessment(db, appointment)
    patient = appointment.patient
    return {
        'patient': {
            'id': patient.id,
            'physical_history': patient.physical_history or [],
            'family_history': patient.family_history or [],
            'allergies': patient.allergies or [],
            'substance_use_history': patient.substance_use_history or {},
            'safety_plan': patient.safety_plan or {},
        },
        'examination': {
            'risk_assessment': normalize_risk_assessment(
                examination.risk_assessment if examination else None
            ),
        },
        'previous_examination': {
            'risk_assessment': normalize_risk_assessment(previous),
        },
    }


def _get_previous_risk_assessment(db, appointment: Appointment):
    if not appointment.patient_id:
        return None
    previous_exams = (
        db.query(Examination)
        .join(Appointment, Examination.appointment_id == Appointment.id)
        .filter(
            Appointment.patient_id == appointment.patient_id,
            Appointment.id != appointment.id,
            Appointment.is_deleted == False,
            Examination.is_active == True,
            Examination.risk_assessment.isnot(None),
        )
        .order_by(Appointment.appointment_date.desc())
        .all()
    )
    for previous_exam in previous_exams:
        normalized = normalize_risk_assessment(previous_exam.risk_assessment)
        if normalized.get('suicide_history') or normalized.get('assessment'):
            return normalized
    return None
