"""Response builders for clinical indication APIs."""

from app.utils.examination_utils import build_icd_display_contract, current_examination


def serialize_survey_template_for_order(template):
    """Build the compact survey shape consumed by the indication form."""
    question_count = 0
    if isinstance(template.content, list):
        question_count = len(template.content)
    elif template.content and isinstance(template.content, dict):
        question_count = len(template.content.get('questions', []))

    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "question_count": question_count,
        "service_id": template.service_id,
        "service_name": template.service.name if template.service else None,
        "pricing_type": template.pricing_type,
        "price_per_minute": float(template.price_per_minute) if template.price_per_minute else None,
        "min_price": float(template.min_price) if template.min_price else None,
        "max_price": float(template.max_price) if template.max_price else None,
        "default_performer_id": template.default_performer_id,
        "default_performer_name": template.default_performer.full_name if template.default_performer else None,
        "is_survey": True,
    }


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
    """Resolve diagnosis from the appointment's canonical examination owner."""
    examination = current_examination(appointment)
    if not examination:
        return None, []

    diagnosis_contract = build_icd_display_contract(
        db,
        getattr(examination, 'diagnosis', None),
    )
    return diagnosis_contract['text'] or None, diagnosis_contract['ids']

def _doctor_display_name(doctor):
    return (
        getattr(doctor, 'full_name', None) or
        getattr(doctor, 'username', None) or
        getattr(doctor, 'email', None) or
        ''
    ) if doctor else ''
