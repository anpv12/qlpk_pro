"""creation_service helpers split out by topic (existing_patient); re-exported by app.modules.appointments.services.creation_service."""

import logging
from datetime import datetime
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User
from app.utils.medical_history_contract import normalize_family_history, normalize_physical_history
from app.utils.referral_source import apply_referral_source

logger = logging.getLogger('app.modules.appointments.services.creation_service')


class AppointmentCreationRequiresConfirmation(Exception):
    """Raised when existing patient changes require user confirmation."""

    def __init__(self, payload):
        super().__init__(payload.get('message'))
        self.payload = payload


def _find_existing_patient(db, patient_data, normalized_phone, logger=None):
    patient = None
    if patient_data.get('id_number'):
        patient = db.query(Patient).filter(Patient.id_number == patient_data['id_number']).first()
        if patient and logger:
            logger.info("Found existing patient by id_number (patient_id=%s)", patient.id)

    if not patient and normalized_phone:
        patient = db.query(Patient).filter(Patient.phone == normalized_phone).first()
        if patient and logger:
            logger.info("Found existing patient by phone (patient_id=%s)", patient.id)

    if not patient and patient_data.get('full_name') and patient_data.get('date_of_birth'):
        try:
            dob_obj = datetime.strptime(patient_data['date_of_birth'], '%Y-%m-%d').date()
            patient = db.query(Patient).filter(
                Patient.full_name == patient_data['full_name'],
                Patient.date_of_birth == dob_obj
            ).first()
            if patient and logger:
                logger.info("Found existing patient by full_name + date_of_birth (patient_id=%s)", patient.id)
        except ValueError:
            if logger:
                logger.info("Warning: Invalid date_of_birth format received")

    return patient


def _handle_existing_patient_for_creation(db, patient, patient_data, data, logger=None):
    if logger:
        logger.info("Using existing patient (patient_id=%s)", patient.id)

    patient_data = dict(patient_data)
    if 'physical_history' in patient_data:
        patient_data['physical_history'] = normalize_physical_history(db, patient_data['physical_history'])
    if 'family_history' in patient_data:
        patient_data['family_history'] = normalize_family_history(patient_data['family_history'])

    important_changes, all_changes = _build_existing_patient_changes(patient, patient_data)
    if important_changes and not data.get('confirm_update_patient'):
        raise AppointmentCreationRequiresConfirmation(
            _build_existing_patient_confirmation_payload(db, patient, patient_data, important_changes, all_changes)
        )

    updated = _apply_existing_patient_updates(patient, patient_data)
    if updated:
        db.flush()
        db.refresh(patient)
        if logger:
            logger.info("Existing patient updated (patient_id=%s)", patient.id)


def _build_existing_patient_changes(patient, patient_data):
    important_changes = {}
    all_changes = {}
    patient_data_for_check = {k: v for k, v in patient_data.items() if k not in ['breathing']}

    for key, value in patient_data_for_check.items():
        if not hasattr(patient, key):
            continue

        old_value = getattr(patient, key)
        if key == 'date_of_birth':
            if value:
                try:
                    new_dob = datetime.strptime(value, '%Y-%m-%d').date()
                    if old_value != new_dob:
                        all_changes[key] = {
                            'old': old_value.isoformat() if old_value else None,
                            'new': value
                        }
                except ValueError as exc:
                    logger.warning("Bỏ qua ngày sinh không hợp lệ khi so sánh thay đổi: %s", exc)
        elif value is not None and value != '' and old_value != value:
            all_changes[key] = {
                'old': old_value,
                'new': value
            }
            if key == 'full_name':
                important_changes[key] = all_changes[key]

    return important_changes, all_changes


def _build_existing_patient_confirmation_payload(db, patient, patient_data, important_changes, all_changes):
    if patient_data.get('id_number') and patient.id_number == patient_data['id_number']:
        all_patients_with_same_cccd = db.query(Patient).filter(
            Patient.id_number == patient_data['id_number']
        ).all()
        patient_ids = [p.id for p in all_patients_with_same_cccd]
        existing_appointments = db.query(Appointment).filter(
            Appointment.patient_id.in_(patient_ids),
            Appointment.is_deleted == False
        ).order_by(Appointment.appointment_date.asc()).all()
    else:
        existing_appointments = db.query(Appointment).filter(
            Appointment.patient_id == patient.id,
            Appointment.is_deleted == False
        ).order_by(Appointment.appointment_date.asc()).all()

    existing_appointments_list = _build_existing_appointments_list(db, existing_appointments)

    return {
        'requires_confirmation': True,
        'message': 'Thông tin bệnh nhân đã tồn tại trong hệ thống.<br>Bạn vui lòng kiểm tra và lựa chọn cập nhật thông tin phù hợp!',
        'existing_patient': {
            'id': patient.id,
            'full_name': patient.full_name,
            'phone': patient.phone,
            'id_number': patient.id_number,
            'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
            'email': patient.email if hasattr(patient, 'email') else None,
            'address': patient.address if hasattr(patient, 'address') else None,
            'existing_appointments_count': len(existing_appointments_list),
            'existing_appointments': existing_appointments_list
        },
        'new_patient_data': {
            'full_name': patient_data.get('full_name'),
            'phone': patient_data.get('phone'),
            'id_number': patient_data.get('id_number'),
            'date_of_birth': patient_data.get('date_of_birth'),
            'email': patient_data.get('email'),
            'address': patient_data.get('address')
        },
        'changes': important_changes,
        'all_changes': all_changes
    }


def _build_existing_appointments_list(db, existing_appointments):
    existing_appointments_list = []
    for apt in existing_appointments:
        existing_appointments_list.append({
            'id': apt.id,
            'appointment_date': apt.appointment_date.isoformat() if apt.appointment_date else None,
            'appointment_date_formatted': apt.appointment_date.strftime('%d/%m/%Y %H:%M') if apt.appointment_date else None,
            'status': apt.status.value if hasattr(apt.status, 'value') else str(apt.status),
            'doctor_name': None,
            'psychologist_name': None
        })

    for apt_info in existing_appointments_list:
        apt_obj = next((apt for apt in existing_appointments if apt.id == apt_info['id']), None)
        if apt_obj:
            if apt_obj.doctor_id:
                doctor_user = db.query(User).filter(User.id == apt_obj.doctor_id).first()
                if doctor_user:
                    apt_info['doctor_name'] = doctor_user.full_name
            if apt_obj.psychologist_id:
                psych_user = db.query(User).filter(User.id == apt_obj.psychologist_id).first()
                if psych_user:
                    apt_info['psychologist_name'] = psych_user.full_name

    return existing_appointments_list


def _apply_existing_patient_updates(patient, patient_data):
    updated = False
    patient_data_for_update = {k: v for k, v in patient_data.items() if k not in ['breathing']}

    for key, value in patient_data_for_update.items():
        if key == 'date_of_birth':
            if value and patient.date_of_birth != datetime.strptime(value, '%Y-%m-%d').date():
                patient.date_of_birth = datetime.strptime(value, '%Y-%m-%d').date()
                updated = True
        elif key == 'referral_source' and value is not None:
            apply_referral_source(patient, value)
            updated = True
        elif value is not None and value != '' and hasattr(patient, key) and getattr(patient, key) != value:
            setattr(patient, key, value)
            updated = True

    return updated
