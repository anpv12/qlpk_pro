"""View models for examination detail APIs."""

from app.models.examination_detail import ExaminationDetail
from app.models.patient import Patient
from app.models.user import User
from app.utils.examination_utils import build_icd_display_contract

def build_examination_invoice_detail_response(db, examination):
    """Build the legacy response for GET /api/examination-detail/<id>."""
    patient = db.query(Patient).filter(Patient.id == examination.patient_id).first()
    doctor = db.query(User).filter(User.id == examination.doctor_id).first()
    details = db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination.id
    ).all()

    diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
    benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)

    return {
        'id': examination.id,
        'examination_code': examination.examination_code,
        'examination_date': examination.examination_date.isoformat() if examination.examination_date else None,
        'examination_time': examination.examination_date.strftime('%H:%M') if examination.examination_date else None,
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
        'advance_payment': float(examination.advance_payment) if examination.advance_payment else 0,
        'amount_paid': float(examination.amount_paid) if examination.amount_paid else 0,
        'actual_price': float(examination.actual_price) if examination.actual_price else 0,
        'patient': {
            'id': patient.id,
            'full_name': patient.full_name,
            'gender': patient.gender or '',
            'phone_number': getattr(patient, 'phone', '') or getattr(patient, 'phone_number', ''),
            'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None
        } if patient else None,
        'doctor': {
            'id': doctor.id,
            'full_name': doctor.full_name,
            'email': doctor.email
        } if doctor else None,
        'details': [
            {
                'key': detail.field_name,
                'value': detail.field_value
            } for detail in details
        ]
    }
