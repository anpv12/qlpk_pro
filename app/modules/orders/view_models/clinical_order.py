"""Response builders for clinical indication APIs."""

from app.utils.examination_utils import build_icd_display_contract

def build_chi_dinh_list_item(db, chi_dinh):
    """Build one legacy list item for GET /api/chi-dinh."""
    appointment = chi_dinh.appointment
    patient = appointment.patient if appointment else None
    doctor = appointment.doctor if appointment else None

    diagnosis_text, diagnosis_ids = _resolve_diagnosis(db, appointment)

    item_dict = chi_dinh.to_dict()
    item_dict['appointment'] = {
        'id': appointment.id,
        'appointment_code': appointment.appointment_code,
        'appointment_date': appointment.appointment_date.isoformat() if appointment.appointment_date else None,
        'diagnosis': diagnosis_text,
        'diagnosis_ids': diagnosis_ids
    } if appointment else None

    item_dict['patient'] = {
        'id': patient.id,
        'full_name': patient.full_name,
        'phone': patient.phone,
        'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None
    } if patient else None

    doctor_display_name = _doctor_display_name(doctor)
    item_dict['doctor'] = {
        'id': doctor.id,
        'full_name': getattr(doctor, 'full_name', doctor_display_name),
        'display_name': doctor_display_name
    } if doctor else None

    return item_dict

def build_chi_dinh_detail_response(db, chi_dinh):
    """Build the legacy detail response for GET /api/chi-dinh/<id>."""
    appointment = chi_dinh.appointment
    patient = appointment.patient if appointment else None
    doctor = appointment.doctor if appointment else None
    diagnosis_text, diagnosis_ids = _resolve_diagnosis(db, appointment)

    result = chi_dinh.to_dict()
    appointment_dict = None
    if appointment:
        appointment_dict = {
            'id': appointment.id,
            'appointment_code': appointment.appointment_code,
            'appointment_date': appointment.appointment_date.isoformat() if appointment.appointment_date else None,
            'status': appointment.status.value if getattr(appointment, 'status', None) else None,
            'doctor_id': appointment.doctor_id,
            'patient_id': appointment.patient_id,
            'notes': appointment.notes,
        }
        if diagnosis_text:
            appointment_dict['diagnosis_text'] = diagnosis_text
        appointment_dict['diagnosis_ids'] = diagnosis_ids

    result['appointment'] = appointment_dict
    result['patient'] = patient.to_dict() if patient else None
    result['doctor'] = {
        'id': doctor.id,
        'full_name': getattr(doctor, 'full_name', None),
        'name': getattr(doctor, 'name', None)
    } if doctor else None
    return result


def build_chi_dinh_history_item(chi_dinh):
    """Build the compact patient-history row used by Doctor Chỉ định."""
    result = chi_dinh.to_dict()
    appointment = chi_dinh.appointment
    result['appointment'] = {
        'id': appointment.id,
        'appointment_code': appointment.appointment_code,
        'appointment_date': appointment.appointment_date.isoformat() if appointment.appointment_date else None,
    } if appointment else None
    return result

def _resolve_diagnosis(db, appointment):
    diagnosis_text = None
    diagnosis_ids = []
    if appointment and appointment.diagnosis:
        diagnosis_text = appointment.diagnosis.main_disease
    elif appointment and appointment.examinations:
        exam = appointment.examinations[0] if appointment.examinations else None
        if exam:
            diagnosis_contract = build_icd_display_contract(db, exam.diagnosis)
            diagnosis_text = diagnosis_contract['text']
            diagnosis_ids = diagnosis_contract['ids']
    return diagnosis_text, diagnosis_ids

def _doctor_display_name(doctor):
    return (
        getattr(doctor, 'full_name', None) or
        getattr(doctor, 'username', None) or
        getattr(doctor, 'email', None) or
        ''
    ) if doctor else ''
