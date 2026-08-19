"""View models for examination management APIs."""

from app.models.examination import ExaminationStatus
from app.models.package import Package
from app.models.patient import Patient
from app.models.service import Service
from app.models.user import User
from app.utils.examination_utils import build_icd_display_contract

def get_examination_status_text(status):
    """Return Vietnamese display text for an examination status."""
    status_text_mapping = {
        ExaminationStatus.WAITING_TRANSFER: "Chờ chuyển khám",
        ExaminationStatus.DOCTOR_EXAM: "Bác sĩ khám",
        ExaminationStatus.PSYCHOLOGIST_EXAM: "Tâm lý gia khám",
        ExaminationStatus.CONCLUSION: "Kết luận",
        ExaminationStatus.WAITING_PAYMENT: "Chờ thanh toán",
        ExaminationStatus.COMPLETED: "Đã khám",
    }
    return status_text_mapping.get(status, str(status))

def build_examination_management_list_item(db, examination):
    """Build one legacy row for GET /examinations."""
    patient = db.query(Patient).get(examination.patient_id)
    doctor = db.query(User).get(examination.doctor_id)

    return {
        'id': examination.id,
        'examination_code': examination.examination_code,
        'patient_name': patient.full_name if patient else '',
        'patient_code': patient.patient_code if patient else '',
        'doctor_name': doctor.full_name if doctor else '',
        'examination_date': examination.examination_date.strftime('%Y-%m-%d %H:%M') if examination.examination_date else '',
        'status': examination.status.value if examination.status else '',
        'status_text': get_examination_status_text(examination.status),
        'main_reason': examination.main_reason or '',
        'actual_price': float(examination.actual_price) if examination.actual_price else None,
        'payment_status': examination.payment_status or 'UNPAID'
    }

def build_examination_management_detail_response(db, examination):
    """Build the legacy detail response for GET /examinations/<id>."""
    patient = db.query(Patient).get(examination.patient_id)
    doctor = db.query(User).get(examination.doctor_id)
    service = db.query(Service).get(examination.service_id) if examination.service_id else None
    package = db.query(Package).get(examination.package_id) if examination.package_id else None

    diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
    benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)

    result = examination.to_dict()
    result.update({
        'diagnosis': diagnosis_contract['text'],
        'diagnosis_ids': diagnosis_contract['ids'],
        'benh_kem_theo': benh_kem_theo_contract['text'],
        'benh_kem_theo_ids': benh_kem_theo_contract['ids'],
        'patient_name': patient.full_name if patient else '',
        'patient_code': patient.patient_code if patient else '',
        'doctor_name': doctor.full_name if doctor else '',
        'service_name': service.name if service else '',
        'package_name': package.name if package else '',
        'status_text': get_examination_status_text(examination.status)
    })
    return result
