"""family_member helpers split out by topic (links); re-exported by app.api.family_member."""

from flask import jsonify
from app.models.family_member import FamilyMember
from app.models.patient import Patient
from app.services.kinship_service import FALLBACK_KINSHIP, get_reverse_kinship
from datetime import datetime


def sync_appointment_relatives_from_family_member(db, family_member):
    """Keep joint-exam rows aligned with their linked family member.

    A receptionist action can create both a FamilyMember and an AppointmentRelative.
    Once an appointment-relative row points at family_member_id, FamilyMember is the
    canonical owner for shared identity/contact fields edited in the relatives table.
    """
    from app.models.appointment_relative import AppointmentRelative

    linked_rows = db.query(AppointmentRelative).filter(
        AppointmentRelative.family_member_id == family_member.id,
        AppointmentRelative.patient_id == family_member.patient_id,
    ).all()

    for row in linked_rows:
        row.name = family_member.name
        row.kinship = family_member.kinship
        row.id_number = family_member.id_number
        row.phone = family_member.phone
        row.emergency_contact = bool(family_member.emergency_contact)
        row.updated_at = datetime.utcnow()

    return linked_rows


def _create_family_link(db, source_patient, target_patient, kinship_value, emergency_contact, joint_exam_date, is_forward=True):
    if not source_patient or not target_patient:
        return None
    # Không tạo nếu đã tồn tại liên kết
    existing = db.query(FamilyMember).filter(
        FamilyMember.patient_id == source_patient.id,
        FamilyMember.relative_patient_id == target_patient.id
    ).first()
    if existing:
        # Cập nhật emergency_contact và joint_exam_date nếu đã tồn tại
        if is_forward:  # Chỉ cập nhật cho forward link (từ patient_id chính)
            existing.emergency_contact = emergency_contact
            existing.joint_exam_date = joint_exam_date
        return existing

    member = FamilyMember(
        patient_id=source_patient.id,
        relative_patient_id=target_patient.id,
        name=target_patient.full_name,
        kinship=kinship_value or FALLBACK_KINSHIP,
        examine_together=True,
        phone=target_patient.phone,
        emergency_contact=emergency_contact if is_forward else False,  # Chỉ set cho forward link
        joint_exam_date=joint_exam_date if is_forward else None  # Chỉ set cho forward link
    )
    db.add(member)
    return member


def _link_relative_patients(db, emergency_contact, forward_kinship, joint_exam_date, patient_id, relative_ids):
    linked_relatives = []
    patient_cache = {}

    def get_patient(pid):
        if pid not in patient_cache:
            patient_cache[pid] = db.query(Patient).filter(Patient.id == pid).first()
        return patient_cache[pid]

    requester_patient = get_patient(patient_id)
    if not requester_patient:
        return (jsonify({
            'success': False,
            'message': 'Không tìm thấy bệnh nhân được chọn'
        }), 404), None

    for relative_id in relative_ids:
        relative_patient = get_patient(relative_id)
        if not relative_patient:
            continue

        # Forward link: từ requester_patient đến relative_patient (có emergency_contact và joint_exam_date)
        forward = _create_family_link(db, requester_patient, relative_patient, forward_kinship, emergency_contact, joint_exam_date, is_forward=True)
        if forward:
            linked_relatives.append(forward)

        reverse_label = get_reverse_kinship(
            forward_kinship,
            source_patient=requester_patient,
            target_patient=relative_patient
        ) or FALLBACK_KINSHIP

        # Reverse link: từ relative_patient đến requester_patient (không có emergency_contact và joint_exam_date)
        reverse = _create_family_link(db, relative_patient, requester_patient, reverse_label, emergency_contact, joint_exam_date, is_forward=False)
        if reverse:
            linked_relatives.append(reverse)
    return None, linked_relatives
