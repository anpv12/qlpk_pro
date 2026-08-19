"""Internal prescription print/preview view model."""

from app.models.appointment import Appointment
from app.models.appointment_relative import AppointmentRelative
from app.models.examination import Examination
from app.models.examination_detail import ExaminationDetail
from app.models.patient import Patient
from app.models.user import User
from app.modules.prescriptions.services.read_service import build_appointment_prescription_payload
from app.utils.examination_utils import build_icd_display_contract
from app.utils.risk_assessment import format_risk_assessment


class PrescriptionPrintViewModelError(Exception):
    """Base error for internal prescription print view models."""


class PrescriptionPrintAppointmentNotFound(PrescriptionPrintViewModelError):
    """Raised when an appointment cannot be found for prescription print."""


def _iso(value):
    return value.isoformat() if value else None


def _time(value):
    return value.strftime('%H:%M') if value else None


def _number(value):
    return float(value) if value is not None else None


def _doctor_payload(doctor):
    if not doctor:
        return None
    return {
        'id': doctor.id,
        'full_name': doctor.full_name or doctor.username or 'Bác sĩ',
        'email': doctor.email,
    }


def _patient_payload(patient):
    if not patient:
        return {}
    data = patient.to_dict()
    data['phone_number'] = data.get('phone') or ''
    return data


def _examination_payload(db, examination, patient, doctor):
    if not examination:
        return {}

    diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
    benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)

    details = db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination.id
    ).all()

    return {
        'id': examination.id,
        'examination_code': examination.examination_code,
        'appointment_id': examination.appointment_id,
        'patient_id': examination.patient_id,
        'doctor_id': examination.doctor_id,
        'examination_date': _iso(examination.examination_date),
        'examination_time': _time(examination.examination_date),
        'examination_type': examination.examination_type.value if examination.examination_type else None,
        'status': examination.status.value if examination.status else None,
        'main_reason': examination.main_reason,
        'main_symptoms': examination.main_symptoms,
        'diagnosis': diagnosis_contract['text'],
        'diagnosis_ids': diagnosis_contract['ids'],
        'benh_kem_theo': benh_kem_theo_contract['text'],
        'benh_kem_theo_ids': benh_kem_theo_contract['ids'],
        'treatment_plan': examination.treatment_plan,
        'loi_dan': examination.loi_dan,
        'current_medications': examination.current_medications,
        'risk_assessment': format_risk_assessment(examination.risk_assessment),
        'weight': _number(examination.weight),
        'height': _number(examination.height),
        'bmi': _number(examination.bmi),
        'pulse': _number(examination.pulse),
        'blood_pressure': examination.blood_pressure,
        'temperature': _number(examination.temperature),
        'breathing': _number(examination.breathing),
        'patient': {
            'id': patient.id,
            'full_name': patient.full_name,
            'gender': patient.gender or '',
            'phone_number': patient.phone or '',
            'date_of_birth': _iso(patient.date_of_birth),
        } if patient else None,
        'doctor': _doctor_payload(doctor),
        'details': [
            {
                'key': detail.field_name,
                'value': detail.field_value,
            }
            for detail in details
        ],
    }


def _history_payload(db, appointment, examination, doctor):
    if not examination:
        return {
            'id': None,
            'appointment_id': appointment.id,
            'examination_date': _iso(appointment.appointment_date),
            'examination_time': _time(appointment.appointment_date),
            'diagnosis': '',
            'diagnosis_ids': [],
            'benh_kem_theo': '',
            'benh_kem_theo_ids': [],
            'doctor': _doctor_payload(doctor),
            'weight': None,
        }

    diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
    benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)

    return {
        'id': examination.id,
        'appointment_id': appointment.id,
        'examination_date': _iso(examination.examination_date or appointment.appointment_date),
        'examination_time': _time(examination.examination_date or appointment.appointment_date),
        'diagnosis': diagnosis_contract['text'],
        'diagnosis_ids': diagnosis_contract['ids'],
        'benh_kem_theo': benh_kem_theo_contract['text'],
        'benh_kem_theo_ids': benh_kem_theo_contract['ids'],
        'doctor': _doctor_payload(doctor),
        'main_reason': examination.main_reason,
        'main_symptoms': examination.main_symptoms,
        'treatment_plan': examination.treatment_plan,
        'loi_dan': examination.loi_dan,
        'weight': _number(examination.weight),
        'height': _number(examination.height),
        'bmi': _number(examination.bmi),
        'pulse': _number(examination.pulse),
        'blood_pressure': examination.blood_pressure,
        'temperature': _number(examination.temperature),
        'breathing': _number(examination.breathing),
    }


def _details_by_section(db, examination):
    if not examination:
        return {}

    result = {}
    details = db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination.id
    ).all()
    for detail in details:
        result.setdefault(detail.section, {})[detail.field_name] = detail.field_value
    return result


def _relatives_payload(db, appointment):
    relatives = db.query(AppointmentRelative).filter(
        AppointmentRelative.appointment_id == appointment.id
    ).order_by(AppointmentRelative.created_at.asc()).all()

    result = []
    for relative in relatives:
        data = relative.to_dict()
        if appointment.appointment_date:
            data['appointment_date'] = appointment.appointment_date.isoformat()
        result.append(data)
    return result


def build_internal_prescription_print_view_model(db, appointment_id):
    """Build one backend-owned payload for prescription print/preview."""
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise PrescriptionPrintAppointmentNotFound('Không tìm thấy lịch hẹn')

    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    doctor = db.query(User).filter(User.id == appointment.doctor_id).first()
    examination = db.query(Examination).filter(
        Examination.appointment_id == appointment.id
    ).first()

    return {
        'appointment_id': appointment.id,
        'appointment': {
            'id': appointment.id,
            'appointment_date': _iso(appointment.appointment_date),
            'notes': appointment.notes,
            'doctor': _doctor_payload(doctor),
        },
        'patient': _patient_payload(patient),
        'history': _history_payload(db, appointment, examination, doctor),
        'examinationDetail': _examination_payload(db, examination, patient, doctor),
        'examinationDetailsBySection': _details_by_section(db, examination),
        'prescriptionData': build_appointment_prescription_payload(db, appointment.id),
        'relatives': _relatives_payload(db, appointment),
    }
