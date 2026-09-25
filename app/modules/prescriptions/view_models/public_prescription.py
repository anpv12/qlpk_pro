"""View models for prescription document and verification flows."""

from app.models.appointment import Appointment
from app.models.appointment_relative import AppointmentRelative
from app.models.doctor import Doctor
from app.models.examination import Examination
from app.models.medicine import Medicine
from app.models.patient import Patient
from app.models.prescription import Prescription, PrescriptionItem
from app.models.user import User
from app.modules.prescriptions.services.re_examination_service import (
    latest_re_examination, show_re_examination_date_on_prescription,
)
from app.utils.examination_utils import build_icd_display_contract


class PrescriptionViewModelError(Exception):
    """Base error for prescription view model building."""


class PrescriptionNotFound(PrescriptionViewModelError):
    """Raised when a prescription code does not exist."""


class AppointmentNotFound(PrescriptionViewModelError):
    """Raised when a prescription points to a missing appointment."""


def _build_patient_address(patient):
    if not patient:
        return ""

    parts = [
        patient.address_detail,
        patient.ward,
        patient.district,
        patient.province,
    ]
    address = ", ".join(part for part in parts if part)
    return address or (patient.address or "")


def _serialize_medicines(db, prescription_id):
    items = db.query(PrescriptionItem).filter(
        PrescriptionItem.prescription_id == prescription_id
    ).all()

    medicines = []
    for item in items:
        medicine = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
        medicines.append({
            "medicine_id": item.medicine_id if medicine else None,
            "name": item.medicine_name,
            "generic_name": medicine.generic_name if medicine else None,
            "quantity": float(item.quantity) if item.quantity else 0.0,
            "unit": item.unit,
            "strength": item.strength,
            "route": item.route,
            "usage": item.usage,
            "is_external": item.is_external if item.is_external is not None else False,
            "unit_price": item.unit_price,
        })
    return medicines


def _serialize_relatives(db, appointment):
    relatives = db.query(AppointmentRelative).filter(
        AppointmentRelative.appointment_id == appointment.id
    ).order_by(AppointmentRelative.created_at.asc()).all()

    relatives_data = []
    for relative in relatives:
        rel_dict = relative.to_dict()
        if appointment.appointment_date:
            rel_dict["appointment_date"] = appointment.appointment_date.isoformat()
        relatives_data.append(rel_dict)
    return relatives_data


def build_public_prescription_view_model(db, prescription_code):
    """Build the public QR verification payload for a prescription code."""
    prescription = db.query(Prescription).filter(
        Prescription.prescription_code == prescription_code
    ).first()
    if not prescription:
        raise PrescriptionNotFound("Không tìm thấy đơn thuốc")

    appointment = db.query(Appointment).filter(
        Appointment.id == prescription.appointment_id
    ).first()
    if not appointment:
        raise AppointmentNotFound("Không tìm thấy lịch hẹn")

    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    doctor = db.query(User).filter(User.id == appointment.doctor_id).first()
    doctor_profile = db.query(Doctor).filter(Doctor.user_id == doctor.id).first() if doctor else None
    examination = db.query(Examination).filter(
        Examination.appointment_id == appointment.id
    ).first()

    diagnosis_contract = build_icd_display_contract(db, examination.diagnosis) if examination else {"text": "", "ids": []}
    comorbidity_contract = build_icd_display_contract(db, examination.benh_kem_theo) if examination else {"text": "", "ids": []}
    examination_date = (
        examination.examination_date.isoformat()
        if examination and examination.examination_date
        else appointment.appointment_date.isoformat() if appointment.appointment_date else None
    )

    return {
        "prescription_code": prescription.prescription_code,
        "prescription_type": prescription.prescription_type or "BASIC",
        "total_amount": prescription.total_amount or 0,
        "usage_instructions": prescription.usage_instructions or "",
        "re_examination_date": prescription.re_examination_date.isoformat() if prescription.re_examination_date else None,
        "show_re_examination_date": show_re_examination_date_on_prescription(
            latest_re_examination(db, appointment.id)
        ),
        "created_at": prescription.created_at.isoformat() if prescription.created_at else None,
        "medicines": _serialize_medicines(db, prescription.id),
        "patient": {
            "full_name": patient.full_name if patient else "",
            "date_of_birth": patient.date_of_birth.isoformat() if patient and patient.date_of_birth else None,
            "gender": patient.gender if patient else "",
            "phone": patient.phone if patient else "",
            "address": _build_patient_address(patient),
            "patient_code": patient.patient_code if patient else "",
            "id_number": patient.id_number if patient else "",
            "weight": None,
        },
        "doctor": {
            "full_name": doctor.full_name if doctor else "Bác sĩ",
            "license_number": doctor_profile.license_number if doctor and doctor_profile else "",
        },
        "diagnosis": diagnosis_contract["text"],
        "benh_kem_theo": comorbidity_contract["text"],
        "weight": float(examination.weight) if examination and examination.weight is not None else None,
        "loi_dan": examination.loi_dan if examination else "",
        "diagnosis_ids": diagnosis_contract["ids"],
        "relatives": _serialize_relatives(db, appointment),
        "examination_date": examination_date,
    }
