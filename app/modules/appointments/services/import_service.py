"""Batch import services for appointment workflows."""

from dataclasses import dataclass
from datetime import datetime
import random

from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.modules.appointments.services.scheduling_conflict import (
    AppointmentSchedulingConflictError,
    ensure_no_scheduling_conflict,
)
from app.utils import generate_patient_code
from app.utils.appointment_helpers import parse_appointment_date
from app.utils.allergy_contract import parse_text_allergy_input


class AppointmentImportNoData(Exception):
    """Raised when an import request has no rows."""


@dataclass
class AppointmentImportResult:
    imported_count: int
    errors: list


def import_appointments_batch(db, rows, logger=None):
    """Import appointment rows using the legacy batch semantics."""
    if not rows:
        raise AppointmentImportNoData("No data provided for import.")

    imported_count = 0
    errors = []

    for idx, row in enumerate(rows):
        try:
            imported = _import_appointment_row(db, row, idx, errors, logger=logger)
            if imported:
                imported_count += 1
        except Exception as exc:
            errors.append(f"Row {idx+1}: Error processing entry - {str(exc)}. Skipping entry.")
            db.rollback()
            continue

    return AppointmentImportResult(imported_count=imported_count, errors=errors)


def _import_appointment_row(db, row, idx, errors, logger=None):
    full_name = row.get('full_name')
    phone = row.get('phone')
    if not full_name or not phone:
        errors.append(f"Row {idx+1}: Missing 'full_name' or 'phone' for patient. Skipping entry.")
        return False

    normalized_phone = ''.join(filter(str.isdigit, phone))
    patient = _find_or_create_import_patient(
        db,
        row,
        idx,
        full_name,
        normalized_phone,
        errors,
        logger=logger,
    )

    doctor_id = row.get('doctor_id')
    appointment_date_str = row.get('appointment_date')
    if not doctor_id or not appointment_date_str:
        errors.append(f"Row {idx+1}: Missing 'doctor_id' or 'appointment_date' for appointment. Skipping entry.")
        return False

    try:
        appt_date_obj = parse_appointment_date(appointment_date_str)
    except ValueError:
        errors.append(f"Row {idx+1}: Invalid appointment_date format '{appointment_date_str}'. Skipping entry.")
        return False

    duration_minutes = row.get('duration_minutes', 60)
    try:
        ensure_no_scheduling_conflict(
            db,
            doctor_id,
            appt_date_obj,
            duration_minutes=duration_minutes,
        )
    except AppointmentSchedulingConflictError as exc:
        errors.append(f"Row {idx+1}: {exc.detail} Skipping entry.")
        return False

    code_suffix = datetime.now().strftime('%Y%m%d%H%M%S%f')
    appointment_code = f"APT{code_suffix}{str(random.randint(1000,9999))}"

    appt = Appointment(
        appointment_code=appointment_code,
        patient_id=patient.id,
        doctor_id=doctor_id,
        appointment_date=appt_date_obj,
        status=row.get('status', AppointmentStatus.SCHEDULED),
        notes=row.get('notes'),
        duration_minutes=duration_minutes,
        appointment_type=row.get('appointment_type'),
        service_id=row.get('service_id'),
        package_id=row.get('package_id')
    )
    db.add(appt)
    return True


def _find_or_create_import_patient(db, row, idx, full_name, normalized_phone, errors, logger=None):
    patient = db.query(Patient).filter(Patient.phone == normalized_phone).first()
    dob_obj = None

    if not patient:
        dob_str = row.get('date_of_birth')
        if dob_str:
            try:
                dob_obj = datetime.strptime(dob_str, '%Y-%m-%d').date()
            except ValueError:
                if logger:
                    logger.info(f"Warning: Row {idx+1}: Invalid date_of_birth format '{dob_str}' for patient.")
                errors.append(f"Row {idx+1}: Invalid date_of_birth format '{dob_str}' for patient. Proceeding without DOB.")

        if dob_obj:
            patient = db.query(Patient).filter(
                Patient.full_name == full_name,
                Patient.date_of_birth == dob_obj
            ).first()

        if not patient:
            patient_data_for_new = {
                'full_name': full_name,
                'phone': normalized_phone,
                'email': row.get('email'),
                'address': row.get('address'),
                'emergency_contact': row.get('emergency_contact'),
                'allergies': parse_text_allergy_input(row.get('allergies')),
                'is_active': row.get('is_active', True),
                'date_of_birth': dob_obj,
            }
            patient_data_for_new['patient_code'] = generate_patient_code(db)
            patient = Patient(**patient_data_for_new)
            db.add(patient)
            db.flush()

    return patient
