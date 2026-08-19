"""Appointment edit response view model."""

from app.models.appointment import Appointment
from app.models.examination import Examination
from app.modules.appointments.view_models.appointment_response import build_appointment_response
from app.utils.examination_utils import build_icd_display_contract
from app.utils.upload_storage import normalize_upload_url


class AppointmentEditNotFound(Exception):
    """Raised when an appointment cannot be found for edit response."""


def build_appointment_edit_response(db, appointment_id):
    """Build the legacy GET /api/appointments/<id>/edit response."""
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentEditNotFound("Không tìm thấy lịch hẹn")

    result = build_appointment_response(appointment, db=db)
    examination = db.query(Examination).filter(Examination.appointment_id == appointment_id).first()
    result.update({
        'patient_info': _build_patient_info(appointment),
        'doctor_info': _build_doctor_info(appointment),
        'service_info': _build_service_info(appointment),
        'package_info': _build_package_info(appointment),
        'examination_info': _build_examination_info(db, examination),
    })

    return result


def _build_patient_info(appointment):
    patient = appointment.patient
    return {
        'id': patient.id,
        'patient_code': patient.patient_code,
        'full_name': patient.full_name,
        'phone': patient.phone,
        'id_number': patient.id_number,
        'address': patient.address,
        'address_detail': patient.address_detail,
        'province': patient.province,
        'district': patient.district,
        'ward': patient.ward,
        'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        'age': patient.age,
        'gender': patient.gender,
        'emergency_contact': patient.emergency_contact,
        'email': patient.email,
        'current_medication': patient.current_medication,
        'nickname': patient.nickname,
        'occupation': patient.occupation,
        'don_vi_cong_tac': patient.don_vi_cong_tac,
        'dia_chi_cong_ty': patient.dia_chi_cong_ty,
        'marital_status': patient.marital_status,
        'sexual_orientation': patient.sexual_orientation,
        'nationality': patient.nationality,
        'religion': patient.religion,
        'ethnicity': patient.ethnicity,
        'education_level': patient.education_level,
        'mang_thai': patient.mang_thai,
        'expected_delivery_date': patient.expected_delivery_date.isoformat() if patient.expected_delivery_date else None,
        'so_tuan_thai': patient.so_tuan_thai,
        'referral_source': patient.referral_source,
        'problem_start_time': patient.problem_start_time,
        'symptom_progression': patient.symptom_progression,
        'current_behavior': patient.current_behavior,
        'severity_level': patient.severity_level,
    }


def _build_doctor_info(appointment):
    return {
        'id': appointment.doctor.id,
        'full_name': appointment.doctor.full_name,
        'username': appointment.doctor.username,
        'avatar': normalize_upload_url(appointment.doctor.avatar),
    }


def _build_service_info(appointment):
    return {
        'id': appointment.service.id if appointment.service else None,
        'name': appointment.service.name if appointment.service else None,
        'price': float(appointment.service.default_price) if appointment.service and appointment.service.default_price else None,
    }


def _build_package_info(appointment):
    return {
        'id': appointment.package.id if appointment.package else None,
        'name': appointment.package.name if appointment.package else None,
        'price': float(appointment.package.price) if appointment.package and appointment.package.price else None,
    }


def _build_examination_info(db, examination):
    if not examination:
        return {}

    diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
    benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)

    return {
        'id': examination.id,
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
        'weight': float(examination.weight) if examination.weight is not None else None,
        'height': float(examination.height) if examination.height is not None else None,
        'bmi': float(examination.bmi) if examination.bmi is not None else None,
        'pulse': float(examination.pulse) if examination.pulse is not None else None,
        'blood_pressure': examination.blood_pressure,
        'temperature': float(examination.temperature) if examination.temperature is not None else None,
        'breathing': float(examination.breathing) if examination.breathing is not None else None,
    }
