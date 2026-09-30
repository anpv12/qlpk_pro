"""app.api.patient: phần 3 — tách từ patient.py (import ở cuối patient.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from sqlalchemy import text
from app.utils import generate_patient_code
from app.utils.allergy_contract import normalize_allergy_entries
from app.utils.clinical_access import patient_access_error
from app.api.auth import require_auth
from app.realtime.events import emit_patient_changed
from app.models.patient import Patient
from app.models.appointment import Appointment
from app.models.examination import Examination
from sqlalchemy.orm import joinedload
from app.api.patient import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    logger,
    router,
)
from app.utils.api_error_contract import api_error_boundary


# Check for duplicate patients
@router.route('/check-duplicate', methods=['POST'])
@require_auth
@api_error_boundary(detail='Lỗi khi kiểm tra trùng lặp bệnh nhân')
def check_duplicate_patient(user):
    db = next(get_db())
    try:
        data = request.get_json()
        full_name = data.get('full_name', '').strip()
        phone = data.get('phone', '').strip()
        id_number = data.get('id_number', '').strip()

        if not full_name:
            return jsonify({'is_duplicate': False}), 200

        # Build query conditions
        conditions = []
        params = {}

        # Check by full name
        conditions.append("LOWER(full_name) = LOWER(:full_name)")
        params['full_name'] = full_name

        # Check by phone if provided
        if phone:
            conditions.append("phone = :phone")
            params['phone'] = phone

        # Check by ID number if provided
        if id_number:
            conditions.append("id_number = :id_number")
            params['id_number'] = id_number

        # Build the query - get ALL matching patients
        query = f"""
        SELECT id, patient_code, full_name, phone, id_number, date_of_birth, gender, created_at
        FROM patients
        WHERE {' OR '.join(conditions)}
        ORDER BY created_at DESC
        """

        result = db.execute(text(query), params)
        duplicate_patients = result.fetchall()

        if duplicate_patients:
            patients_list = []
            for patient in duplicate_patients:
                patients_list.append({
                    'id': patient.id,
                    'patient_code': patient.patient_code,
                    'full_name': patient.full_name,
                    'phone': patient.phone,
                    'id_number': patient.id_number,
                    'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                    'gender': patient.gender,
                    'created_at': patient.created_at.isoformat() if patient.created_at else None
                })

            return jsonify({
                'is_duplicate': True,
                'duplicate_patients': patients_list,
                'count': len(patients_list)
            }), 200
        else:
            return jsonify({'is_duplicate': False}), 200

    finally:
        db.close()


# Import bệnh nhân từ file (dữ liệu JSON)
@router.route('/import', methods=['POST'])
@require_auth
@api_error_boundary(detail='Internal server error during import: {error}')
def import_patients(user):
    db = next(get_db())
    try:
        data = request.get_json()
        rows = data.get('data', [])
        if not rows:
            return jsonify({'detail': 'No data provided for import.'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        imported_count = 0
        errors = []

        for idx, row in enumerate(rows):
            full_name = row.get('full_name')
            phone = row.get('phone')

            if not full_name or not phone:
                errors.append(f"Row {idx+1}: Missing 'full_name' or 'phone'. Skipping entry.")
                continue

            # Check if patient with this phone number already exists
            existing_patient = db.query(Patient).filter(Patient.phone == phone).first()
            if existing_patient:
                errors.append(f"Row {idx+1}: Patient with phone '{phone}' already exists. Skipping entry.")
                continue

            patient_code = row.get('patient_code')
            if not patient_code:
                # Generate patient_code dynamically, ensuring it's unique
                patient_code = generate_patient_code(db) # Use the utility function

            try:
                new_patient = Patient(
                    patient_code=patient_code,
                    full_name=full_name,
                    phone=phone,
                    address=row.get('address'),
                    emergency_contact=row.get('emergency_contact'),
                    allergies=normalize_allergy_entries(row.get('allergies')),
                    is_active=row.get('is_active', True)
                )
                db.add(new_patient)
                db.flush() # Use flush to assign an ID if needed for subsequent operations within the same transaction
                imported_count += 1
            except Exception as e:
                logger.warning('Patient import row %s failed', idx + 1, exc_info=True)
                errors.append(f"Row {idx+1}: Error creating patient - {str(e)}. Skipping entry.")
                db.rollback() # Rollback the current patient creation if there's an issue
                db.close() # Đóng kết nối cũ để tránh rò rỉ
                # Re-get a fresh session if the previous one might be in a bad state (optional, depends on error type)
                db = next(get_db())
                continue

        db.commit() # Commit all successfully added patients
        if imported_count > 0:
            emit_patient_changed('imported', extra={'imported_count': imported_count})
        return jsonify({
            'message': f'Successfully imported {imported_count} patients.',
            'errors': errors
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@router.route('/<int:patient_id>/latest-appointment', methods=['GET'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def get_patient_latest_appointment(user, patient_id):
    """Lấy appointment cuối cùng của patient để copy thông tin"""
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        from app.models.appointment import Appointment
        from app.models.examination import Examination

        # Lấy appointment cuối cùng của patient
        latest_appointment = db.query(Appointment).filter(
            Appointment.patient_id == patient_id
        ).order_by(Appointment.id.desc()).first()

        if not latest_appointment:
            return jsonify({
                'appointment': None,
                'examination': None
            }), 200

        # Lấy examination liên quan (nếu có)
        examination = db.query(Examination).filter(
            Examination.appointment_id == latest_appointment.id
        ).first()

        # Format response
        appointment_data = {
            'id': latest_appointment.id,
            'appointment_date': latest_appointment.appointment_date.isoformat() if latest_appointment.appointment_date else None,
            'doctor_id': latest_appointment.doctor_id,
            'doctor_name': latest_appointment.doctor.full_name if latest_appointment.doctor else None,
            'appointment_type': latest_appointment.appointment_type.value if latest_appointment.appointment_type else None,
            'service_id': latest_appointment.service_id,
            'service_name': latest_appointment.service.name if latest_appointment.service else None,
            'package_id': latest_appointment.package_id,
            'package_name': latest_appointment.package.name if latest_appointment.package else None,
            'status': latest_appointment.status.value if latest_appointment.status else None,
            'notes': latest_appointment.notes
        }

        examination_data = None
        if examination:
            examination_data = {
                'id': examination.id,
                'main_reason': examination.main_reason,
                'main_symptoms': examination.main_symptoms,
                'weight': float(examination.weight) if examination.weight else None,
                'height': float(examination.height) if examination.height else None,
                'bmi': float(examination.bmi) if examination.bmi else None,
                'pulse': float(examination.pulse) if examination.pulse else None,
                'blood_pressure': examination.blood_pressure,
                'temperature': float(examination.temperature) if examination.temperature else None,
                'breathing': float(examination.breathing) if examination.breathing else None,
            }

        return jsonify({
            'appointment': appointment_data,
            'examination': examination_data
        }), 200

    finally:
        db.close()


@router.route('/<int:patient_id>/examinations', methods=['GET'])
@require_auth
@api_error_boundary(detail='Internal server error')
def get_patient_examinations(user, patient_id):
    """Return examination history for patient (used in doctor examination modal)"""
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        limit = request.args.get('limit', default=20, type=int)
        if not limit or limit < 1:
            limit = 20
        limit = min(limit, 100)

        examinations_query = (
            db.query(Examination)
            .options(joinedload(Examination.details))
            .join(Appointment, Examination.appointment_id == Appointment.id)
            .filter(
                Examination.patient_id == patient_id,
                Examination.is_active == True,
                Appointment.is_deleted == False,
                # Loại bỏ appointments chưa xác nhận (SCHEDULED) - chỉ hiển thị lượt khám đã diễn ra
                Appointment.status != 'SCHEDULED'
            )
            .order_by(Appointment.appointment_date.desc(), Examination.id.desc())
            .limit(limit)
        )

        examinations = examinations_query.all()
        result = []
        for exam in examinations:
            # Keep the psychologist-only history summary separate from Doctor data.
            psychologist_summary = None
            for detail in exam.details or []:
                if (
                    detail.section == 'tam_ly_gia_kham_form_kham'
                    and detail.field_name == 'trieu_chung_va_hanh_vi_hien_tai'
                ):
                    psychologist_summary = detail.field_value
                    break

            from app.utils.examination_utils import build_icd_display_contract
            diagnosis_contract = build_icd_display_contract(db, exam.diagnosis)
            benh_kem_theo_contract = build_icd_display_contract(db, exam.benh_kem_theo)
            result.append({
                'id': exam.id,
                'examination_code': exam.examination_code,
                'examination_date': exam.examination_date.isoformat() if exam.examination_date else None,
                'appointment_date': exam.appointment.appointment_date.isoformat() if exam.appointment and exam.appointment.appointment_date else None,
                'diagnosis': diagnosis_contract['text'],
                'diagnosis_ids': diagnosis_contract['ids'],
                'psychologist_summary': psychologist_summary,
                'benh_kem_theo': benh_kem_theo_contract['text'],
                'benh_kem_theo_ids': benh_kem_theo_contract['ids'],
                'weight': float(exam.weight) if exam.weight is not None else None,
                'height': float(exam.height) if exam.height is not None else None,
                'bmi': float(exam.bmi) if exam.bmi is not None else None,
                'pulse': float(exam.pulse) if exam.pulse is not None else None,
                'blood_pressure': exam.blood_pressure,
                'temperature': float(exam.temperature) if exam.temperature is not None else None,
                'breathing': float(exam.breathing) if exam.breathing is not None else None,
                'payment_status': exam.payment_status,
                'status': exam.status.value if exam.status else None,
                'appointment_id': exam.appointment_id,
                'appointment_code': exam.appointment.appointment_code if exam.appointment else None,
                'doctor': {
                    'id': exam.doctor.id if exam.doctor else None,
                    'full_name': exam.doctor.full_name if exam.doctor else None
                },
                'service': {
                    'id': exam.service.id,
                    'name': exam.service.name
                } if exam.service else None,
                'package': {
                    'id': exam.package.id,
                    'name': exam.package.name
                } if exam.package else None
            })

        return jsonify({'examinations': result}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
