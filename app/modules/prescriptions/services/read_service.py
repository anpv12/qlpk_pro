"""Read services for internal prescription workflows."""

import re

from sqlalchemy import func

from app.models.appointment import Appointment, AppointmentCategory, AppointmentStatus
from app.models.examination import Examination
from app.models.examination_detail import ExaminationDetail
from app.models.medicine import Medicine
from app.models.patient import Patient
from app.utils.risk_assessment import format_risk_assessment
from app.models.prescription import Prescription, PrescriptionItem
from app.models.user import User
from app.modules.prescriptions.services.re_examination_service import (
    latest_re_examination, schedule_state, show_re_examination_date_on_prescription,
)
from app.modules.prescriptions.services.stock_service import (
    build_prescription_batch_allocation_states,
)
from app.utils.examination_utils import build_icd_display_contract, resolve_diagnosis_to_str
from app.utils.allergy_contract import format_allergy_entries


def _build_re_examination_fields(re_appointment=None, prescription_date=None):
    """Build re-examination payload fields from the actual schedule when available."""
    re_date = None
    re_time = None

    if re_appointment and re_appointment.appointment_date:
        re_date = re_appointment.appointment_date.date()
        re_time = re_appointment.appointment_date.strftime('%H:%M')
    elif prescription_date:
        re_date = prescription_date
        re_time = '09:00'

    return {
        'show_re_examination_date': show_re_examination_date_on_prescription(re_appointment),
        're_examination_snapshot': {**schedule_state(re_appointment), 'datetime': f'{re_date.isoformat()} {re_time}' if re_date else ''},
        're_examination_date': re_date.isoformat() if re_date else None,
        're_examination_time': re_time,
        're_examination_appointment_id': re_appointment.id if re_appointment else None,
        're_examination_service_id': re_appointment.service_id if re_appointment else None,
        're_examination_package_id': re_appointment.package_id if re_appointment else None,
        're_examination_appointment_type': re_appointment.appointment_type.value if re_appointment and re_appointment.appointment_type else None,
        're_examination_status': re_appointment.status.value if re_appointment and re_appointment.status else None,
    }


def _resolve_item_medicine(db, item):
    medicine_id = getattr(item, 'medicine_id', None)
    if not medicine_id:
        return None
    return db.query(Medicine).filter(Medicine.id == medicine_id).first()

def _build_history_stock_mapping_fields(item, medicine):
    """Return stock identity metadata for applying old prescriptions safely.

    `stock_mapping_required` only means the historical row has no usable
    `medicine_id`. Current stock availability is validated later by save logic.
    """
    is_external = item.is_external if item.is_external is not None else False
    current_stock = float(medicine.stock_quantity) if medicine and medicine.stock_quantity is not None else None
    reason = None

    if not is_external:
        if not getattr(item, 'medicine_id', None):
            reason = 'missing_medicine_id'
        elif not medicine:
            reason = 'medicine_not_found'

    return {
        'stock_mapping_required': reason is not None,
        'stock_mapping_reason': reason,
        'current_stock_quantity': current_stock,
        'medicine_is_active': medicine.is_active if medicine else None,
        'linked_medicine_id': item.medicine_id,
    }


def _group_appointment_prescriptions(appointment_id, db, prescriptions):
    all_medicines = []
    prescriptions_grouped = []
    total_amount = 0
    usage_instructions = ''
    re_examination_date_val = None
    prescribed_totals = {
        int(medicine_id): quantity
        for medicine_id, quantity in (
            db.query(
                PrescriptionItem.medicine_id,
                func.sum(PrescriptionItem.quantity).label('prescribed_quantity'),
            )
            .join(Prescription, Prescription.id == PrescriptionItem.prescription_id)
            .filter(
                Prescription.appointment_id == appointment_id,
                PrescriptionItem.is_external.is_(False),
                PrescriptionItem.medicine_id.isnot(None),
            )
            .group_by(PrescriptionItem.medicine_id)
            .all()
        )
    }
    batch_allocation_states = build_prescription_batch_allocation_states(
        db,
        appointment_id,
        prescribed_totals,
    )

    for prescription in prescriptions:
        items = db.query(PrescriptionItem).filter(
            PrescriptionItem.prescription_id == prescription.id
        ).all()

        type_medicines = []
        for item in items:
            medicine = _resolve_item_medicine(db, item)

            med_data = {
                'medicine_id': item.medicine_id if medicine else None,
                'name': item.medicine_name,
                'generic_name': medicine.generic_name if medicine else None,
                'unit_price': item.unit_price,
                'quantity': float(item.quantity) if item.quantity else 0.0,
                'unit': item.unit,
                'strength': item.strength,
                'route': item.route,
                'administration_method': medicine.administration_method if medicine else (item.route or ''),
                'usage': item.usage,
                'is_external': item.is_external if item.is_external is not None else False,
                'category_type': medicine.category_type if medicine else 'DRUG',
                'prescription_type': medicine.prescription_type if medicine else (prescription.prescription_type or 'BASIC'),
                'batch_allocation': batch_allocation_states.get(item.medicine_id),
                **_build_history_stock_mapping_fields(item, medicine),
            }
            type_medicines.append(med_data)
            all_medicines.append(med_data)

        prescriptions_grouped.append({
            'type': prescription.prescription_type or 'BASIC',
            'prescription_code': prescription.prescription_code,
            'prescription_id': prescription.id,
            'medicines': type_medicines,
            'total_amount': prescription.total_amount or 0
        })

        total_amount += (prescription.total_amount or 0)
        if prescription.usage_instructions:
            usage_instructions = prescription.usage_instructions
        if prescription.re_examination_date:
            re_examination_date_val = prescription.re_examination_date
    return all_medicines, prescriptions_grouped, re_examination_date_val, total_amount, usage_instructions


def build_appointment_prescription_payload(db, appointment_id):
    """Build the legacy /api/prescription/appointment/<id> response payload."""
    prescriptions = db.query(Prescription).filter(
        Prescription.appointment_id == appointment_id
    ).all()

    re_appointment = latest_re_examination(db, appointment_id)
    re_examination_fields = _build_re_examination_fields(re_appointment)

    if not prescriptions:
        return {
            'medicines': [],
            'prescriptions': [],
            'total_amount': 0,
            'usage_instructions': '',
            **re_examination_fields,
        }

    all_medicines, prescriptions_grouped, re_examination_date_val, total_amount, usage_instructions = _group_appointment_prescriptions(appointment_id, db, prescriptions)

    re_examination_fields = _build_re_examination_fields(re_appointment, re_examination_date_val)

    return {
        'medicines': all_medicines,
        'prescriptions': prescriptions_grouped,
        'total_amount': total_amount,
        'usage_instructions': usage_instructions,
        **re_examination_fields,
        'prescription_code': prescriptions[0].prescription_code if prescriptions else None
    }


def _attach_prescription_history(db, grouped, prescription_results):
    for prescription, appointment in prescription_results:
        apt_id = appointment.id
        items = db.query(PrescriptionItem).filter(
            PrescriptionItem.prescription_id == prescription.id
        ).all()

        if not items:
            continue

        medicines = []
        for item in items:
            medicine = _resolve_item_medicine(db, item)
            medicines.append({
                "medicine_id": item.medicine_id if medicine else None,
                "name": item.medicine_name,
                "generic_name": medicine.generic_name if medicine else None,
                "unit_price": item.unit_price,
                "quantity": float(item.quantity) if item.quantity else 0.0,
                "unit": item.unit,
                "strength": item.strength,
                "route": item.route,
                "administration_method": medicine.administration_method if medicine else (item.route or ""),
                "usage": item.usage,
                "is_external": item.is_external if item.is_external is not None else False,
                "category_type": medicine.category_type if medicine else "DRUG",
                "prescription_type": medicine.prescription_type if medicine else "BASIC",
                **_build_history_stock_mapping_fields(item, medicine),
            })

        if apt_id in grouped:
            grouped[apt_id]["prescriptions"].append({
                "prescription_code": prescription.prescription_code,
                "prescription_type": prescription.prescription_type or "BASIC",
                "total_amount": prescription.total_amount,
                "medicines": medicines
            })
            grouped[apt_id]["total_items_count"] += len(medicines)


def build_patient_prescription_history_payload(db, patient_id):
    """Build the legacy /api/prescription/patient/<id>/history response payload."""
    examinations = db.query(Examination, Appointment).join(
        Appointment, Examination.appointment_id == Appointment.id
    ).filter(
        Appointment.patient_id == patient_id,
        Appointment.is_deleted == False,
        Examination.is_active == True
    ).order_by(Appointment.appointment_date.desc()).all()

    total_examinations = len(examinations)
    grouped = {}
    for examination, appointment in examinations:
        apt_id = appointment.id
        doctor = db.query(User).filter(User.id == appointment.doctor_id).first()

        benh_su_detail = db.query(ExaminationDetail).filter(
            ExaminationDetail.examination_id == examination.id,
            ExaminationDetail.section == "bac_si_kham_tien_su",
            ExaminationDetail.field_name == "medical_history"
        ).first()

        diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)
        benh_kem_theo_contract = build_icd_display_contract(db, examination.benh_kem_theo)

        grouped[apt_id] = {
            "appointment_id": apt_id,
            "examination_id": examination.id,
            "appointment_date": appointment.appointment_date.strftime("%d/%m/%Y") if appointment.appointment_date else None,
            "appointment_date_iso": appointment.appointment_date.isoformat() if appointment.appointment_date else None,
            "doctor_name": doctor.full_name if doctor else "N/A",
            "diagnosis": diagnosis_contract["text"] or None,
            "diagnosis_ids": diagnosis_contract["ids"],
            "benh_kem_theo": benh_kem_theo_contract["text"] or None,
            "benh_kem_theo_ids": benh_kem_theo_contract["ids"],
            "main_reason": examination.main_reason,
            "medical_history": benh_su_detail.field_value if benh_su_detail else None,
            "prescriptions": [],
            "total_items_count": 0
        }

    from app.modules.prescriptions.services.ledger_service import visit_ledger_payload
    from app.models.medicine_transaction import MedicineTransaction
    ledger_visits = db.query(Appointment).join(
        MedicineTransaction, MedicineTransaction.appointment_id == Appointment.id
    ).filter(Appointment.patient_id == patient_id, Appointment.is_deleted == False).distinct().all()
    for appointment in ledger_visits:
        if appointment.id not in grouped:
            grouped[appointment.id] = {
                'appointment_id': appointment.id,
                'appointment_date': appointment.appointment_date.strftime('%d/%m/%Y'),
                'appointment_date_iso': appointment.appointment_date.isoformat(),
                'doctor_name': appointment.doctor.full_name if appointment.doctor else 'N/A',
                'prescriptions': [], 'total_items_count': 0,
            }

    prescription_results = db.query(Prescription, Appointment).join(
        Appointment, Prescription.appointment_id == Appointment.id
    ).filter(
        Appointment.patient_id == patient_id,
        Appointment.is_deleted == False
    ).order_by(Appointment.appointment_date.desc(), Prescription.prescription_type.asc()).all()

    _attach_prescription_history(db, grouped, prescription_results)

    for appointment_id, record in grouped.items():
        record['medicine_transactions'] = visit_ledger_payload(db, appointment_id)
    history = sorted(grouped.values(), key=lambda record: record.get('appointment_date_iso') or '', reverse=True)
    patient_info = _build_patient_info(db, patient_id)

    return {
        "patient_id": patient_id,
        "total_examinations": total_examinations,
        "total_records": len(history),
        "history": history,
        "patient_info": patient_info
    }


def _build_patient_info(db, patient_id):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return None

    latest_exam = db.query(Examination).join(
        Appointment, Examination.appointment_id == Appointment.id
    ).filter(
        Appointment.patient_id == patient_id,
        Appointment.is_deleted == False,
        Examination.is_active == True
    ).order_by(Appointment.appointment_date.desc()).first()
    risk_raw = getattr(latest_exam, 'risk_assessment', None) if latest_exam else None

    return {
        "full_name": patient.full_name,
        "physical_history_text": _resolve_history_jsonb(db, patient.physical_history),
        "family_history_text": _resolve_history_jsonb(db, patient.family_history),
        "allergies": format_allergy_entries(patient.allergies or []),
        "risk_assessment": _format_risk_assessment(risk_raw)
    }


def _resolve_history_jsonb(db, history_jsonb):
    if not history_jsonb:
        return ""
    icd_ids = [h['id'] for h in history_jsonb if isinstance(h, dict) and h.get('type') == 'icd' and h.get('id')]
    text_vals = [h['value'] for h in history_jsonb if isinstance(h, dict) and h.get('type') == 'text' and h.get('value')]
    parts = []
    if icd_ids:
        parts.append(resolve_diagnosis_to_str(db, icd_ids))
    if text_vals:
        parts.extend(text_vals)
    return "; ".join(filter(None, parts))


def _format_risk_assessment(raw):
    return format_risk_assessment(raw)
