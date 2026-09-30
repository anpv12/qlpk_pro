"""app.api.patient: phần 2 — tách từ patient.py (import ở cuối patient.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from datetime import datetime
from app.utils import generate_patient_code
from app.utils.patient_utils import calculate_age
from app.utils.address_contract import apply_patient_address_update, build_full_address
from app.utils.medical_history_contract import (
    MedicalHistoryContractError,
    normalize_family_history,
    normalize_physical_history,
    normalize_safety_plan,
    normalize_substance_use_history,
)
from app.utils.allergy_contract import normalize_allergy_entries
from app.utils.referral_source import apply_referral_source, build_referral_source_fields
from app.utils.safety_plan_upload import SafetyPlanUploadError, save_safety_plan_file
from app.utils.clinical_access import patient_access_error
from app.api.auth import require_auth
from app.realtime.events import emit_document_changed, emit_patient_changed
from app.models.patient import Patient
from app.api.patient import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    logger,
    router,
)
from app.utils.api_error_contract import api_error_boundary


def _patient_created_response(patient):
    # Return a more comprehensive response for the created patient
    return jsonify({
        'id': patient.id,
        'patient_code': patient.patient_code,
        'full_name': patient.full_name,
        'phone': patient.phone,
        'address': patient.address,
        'is_active': patient.is_active,
        'emergency_contact': patient.emergency_contact,
        'allergies': patient.allergies,
        # Address components
        'address_detail': patient.address_detail,
        'ward': patient.ward,
        'district': patient.district,
        'province': patient.province,
        # Personal info
        'nationality': patient.nationality,
        'religion': patient.religion,
        'ethnicity': patient.ethnicity,
        'education_level': patient.education_level,
        'occupation': patient.occupation,
        'don_vi_cong_tac': patient.don_vi_cong_tac,
        'dia_chi_cong_ty': patient.dia_chi_cong_ty,
        'marital_status': patient.marital_status,
        'sexual_orientation': patient.sexual_orientation,
        'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        'age': patient.age
    }), 201, {'Content-Type': 'application/json; charset=utf-8'} # 201 Created


def _build_new_patient(age, data, date_of_birth, db, expected_delivery_date, full_address, referral_source_fields, so_tuan_thai):
    patient = Patient(
        patient_code=data.get('patient_code'),
        full_name=data.get('full_name'),
        phone=data.get('phone'),
        date_of_birth=date_of_birth,
        age=age,
        address=full_address,
        # Address components
        address_detail=data.get('address_detail'),
        ward=data.get('ward'),
        district=data.get('district'),
        province=data.get('province'),
        # Personal info
        nationality=data.get('nationality'),
        religion=data.get('religion'),
        ethnicity=data.get('ethnicity'),
        education_level=data.get('education_level'),
        occupation=data.get('occupation'),
        don_vi_cong_tac=data.get('don_vi_cong_tac'),
        dia_chi_cong_ty=data.get('dia_chi_cong_ty'),
        marital_status=data.get('marital_status'),
        sexual_orientation=data.get('sexual_orientation'),
        # Other fields
        emergency_contact=data.get('emergency_contact'),
        allergies=normalize_allergy_entries(data.get('allergies')),
        # Missing fields - BỔ SUNG
        nickname=data.get('nickname'),
        gender=data.get('gender'),
        mang_thai=data.get('mang_thai', False),
        so_tuan_thai=so_tuan_thai,
        expected_delivery_date=expected_delivery_date,
        id_number=data.get('id_number'),
        email=data.get('email'),
        current_medication=data.get('current_medication'),
        # New fields from modal "Hỏi bệnh"
        referral_source=referral_source_fields['referral_source'],
        referral_source_tag=referral_source_fields['referral_source_tag'],
        referral_source_detail=referral_source_fields['referral_source_detail'],
        problem_start_time=data.get('problem_start_time'),
        symptom_progression=data.get('symptom_progression'),
        family_history=normalize_family_history(data.get('family_history')),
        physical_history=normalize_physical_history(db, data.get('physical_history')),
        severity_level=data.get('severity_level'),
        current_behavior=data.get('current_behavior'),
        substance_use_history=normalize_substance_use_history(data.get('substance_use_history', {})),
        safety_plan=normalize_safety_plan(data.get('safety_plan', {})),
        is_active=data.get('is_active', True) # Default to True if not provided
    )
    return patient


def _parse_new_patient_dates(data):
    # Parse date_of_birth if provided
    date_of_birth = None
    if data.get('date_of_birth'):
        try:
            date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
        except ValueError:
            return (jsonify({'detail': 'Invalid date format for date_of_birth. Use YYYY-MM-DD'}), 400, {'Content-Type': 'application/json; charset=utf-8'}), None, None, None, None

    # Calculate age from date_of_birth
    age = calculate_age(date_of_birth) if date_of_birth else None

    # Parse expected_delivery_date if provided and calculate so_tuan_thai
    expected_delivery_date = None
    so_tuan_thai = data.get('so_tuan_thai')
    if data.get('expected_delivery_date'):
        try:
            expected_delivery_date = datetime.strptime(data['expected_delivery_date'], '%Y-%m-%d').date()
            # Tính lại so_tuan_thai từ expected_delivery_date
            from datetime import date
            today = date.today()
            days_until_delivery = (expected_delivery_date - today).days
            weeks_remaining = (days_until_delivery + 6) // 7  # Làm tròn lên
            pregnancy_week = 40 - weeks_remaining
            if 0 <= pregnancy_week <= 42:
                so_tuan_thai = pregnancy_week
            else:
                so_tuan_thai = None
        except ValueError as exc:
            logger.warning("Bỏ qua ngày dự sinh không hợp lệ khi tính tuần thai: %s", exc)
    return None, age, date_of_birth, expected_delivery_date, so_tuan_thai


# Tạo mới bệnh nhân
@router.route('/', methods=['POST'])
@require_auth
def create_patient(user):
    db = next(get_db())
    try:
        data = request.get_json()

        # Validate required fields (only full_name is required now)
        if not data.get('full_name'):
            return jsonify({'detail': 'Full name is required to create a patient.'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        # Check for existing patient with the same phone number to avoid duplicates (only if phone is provided)
        # Skip duplicate check if skip_duplicate_check flag is set (used for copy mode)
        if data.get('phone') and data.get('phone').strip() and not data.get('skip_duplicate_check', False):
            existing_patient = db.query(Patient).filter(Patient.phone == data['phone']).first()
            if existing_patient:
                return jsonify({'detail': 'A patient with this phone number already exists.'}), 409, {'Content-Type': 'application/json; charset=utf-8'} # 409 Conflict

        # Sinh mã bệnh nhân tự động nếu chưa có
        if not data.get('patient_code'):
            data['patient_code'] = generate_patient_code(db) # Use the utility function

        error_response, age, date_of_birth, expected_delivery_date, so_tuan_thai = _parse_new_patient_dates(data)
        if error_response is not None:
            return error_response

        # Remove skip_duplicate_check flag from data before creating Patient object
        data.pop('skip_duplicate_check', None)

        # Build full address from components if not provided directly
        full_address = data.get('address')
        if not full_address:
            full_address = build_full_address(
                address_detail=data.get('address_detail'),
                ward=data.get('ward'),
                district=data.get('district'),
                province=data.get('province')
            )
        referral_source_fields = build_referral_source_fields(data.get('referral_source'))

        patient = _build_new_patient(age, data, date_of_birth, db, expected_delivery_date, full_address, referral_source_fields, so_tuan_thai)
        db.add(patient)
        db.commit()
        db.refresh(patient)
        emit_patient_changed('created', patient=patient)

        return _patient_created_response(patient)
    except MedicalHistoryContractError as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback() # Rollback changes in case of an error
        logger.error(f"Error creating patient: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


def _apply_patient_field_updates(data, db, patient):
    # Update other fields
    # Chỉ update field nếu có giá trị (không phải None và không phải empty string)
    for field in [
        'patient_code', 'full_name', 'phone', 'email',
        'emergency_contact',
        'allergies', 'current_medication', 'is_active', 'occupation', 'don_vi_cong_tac', 'dia_chi_cong_ty', 'marital_status', 'sexual_orientation',
        'nationality', 'religion', 'ethnicity', 'education_level',
        # Missing fields - BỔ SUNG
        'nickname', 'gender', 'mang_thai', 'id_number',
        # New fields from form
        'reminder', 'reminder_time',
        # New fields from modal "Hỏi bệnh"
        'physical_history', 'severity_level',
        # Medical history fields from modal "Hỏi bệnh"
        'referral_source', 'problem_start_time', 'symptom_progression',
        'family_history',
        'current_behavior', 'substance_use_history', 'safety_plan'
    ]:
        if field in data:
            value = data[field]
            if field == 'referral_source':
                apply_referral_source(patient, value)
                continue
            if field == 'physical_history':
                value = normalize_physical_history(db, value)
            if field == 'family_history':
                value = normalize_family_history(value)
            if field == 'substance_use_history':
                value = normalize_substance_use_history(value)
            if field == 'safety_plan':
                value = normalize_safety_plan(value)
            if field == 'allergies':
                value = normalize_allergy_entries(value)
            # Chỉ update nếu có giá trị (không phải None, không phải empty string)
            # Cho phép 0 và False (có thể là giá trị hợp lệ)
            if value is not None and value != '':
                setattr(patient, field, value)
            # Nếu là empty string, set thành None để clear field
            elif value == '':
                setattr(patient, field, None)


def _apply_patient_date_updates(data, patient):
    # Update date_of_birth (accept 'YYYY-MM-DD' or 'DD/MM/YYYY') if provided
    if 'date_of_birth' in data and data['date_of_birth']:
        dob_raw = data['date_of_birth']
        parsed_dob = None
        try:
            # Try ISO format first
            parsed_dob = datetime.strptime(dob_raw, '%Y-%m-%d').date()
        except Exception:
            try:
                parsed_dob = datetime.strptime(dob_raw, '%d/%m/%Y').date()
            except Exception:
                parsed_dob = None
        if parsed_dob:
            patient.date_of_birth = parsed_dob
            # Tính lại age khi date_of_birth thay đổi
            patient.age = calculate_age(parsed_dob)

    # Update expected_delivery_date if provided and recalculate so_tuan_thai
    if 'expected_delivery_date' in data and data['expected_delivery_date']:
        try:
            expected_delivery_date = datetime.strptime(data['expected_delivery_date'], '%Y-%m-%d').date()
            patient.expected_delivery_date = expected_delivery_date
            # Tính lại so_tuan_thai từ expected_delivery_date
            from datetime import date
            today = date.today()
            days_until_delivery = (expected_delivery_date - today).days
            weeks_remaining = (days_until_delivery + 6) // 7  # Làm tròn lên
            pregnancy_week = 40 - weeks_remaining
            if 0 <= pregnancy_week <= 42:
                patient.so_tuan_thai = pregnancy_week
            else:
                patient.so_tuan_thai = None
        except ValueError as exc:
            logger.warning("Bỏ qua ngày dự sinh không hợp lệ khi tính tuần thai: %s", exc)
    elif 'expected_delivery_date' in data and data['expected_delivery_date'] is None:
        # Clear expected_delivery_date if explicitly set to None
        patient.expected_delivery_date = None
        patient.so_tuan_thai = None


def _patient_updated_response(patient):
    return jsonify({
        'id': patient.id,
        'patient_code': patient.patient_code,
        'full_name': patient.full_name,
        'phone': patient.phone,
        'address': patient.address,
        'is_active': patient.is_active,
        'emergency_contact': patient.emergency_contact,
        'allergies': patient.allergies,
        # Address components
        'address_detail': patient.address_detail,
        'ward': patient.ward,
        'district': patient.district,
        'province': patient.province,
        # Personal info
        'nationality': patient.nationality,
        'religion': patient.religion,
        'ethnicity': patient.ethnicity,
        'education_level': patient.education_level,
        'occupation': patient.occupation,
        'don_vi_cong_tac': patient.don_vi_cong_tac,
        'dia_chi_cong_ty': patient.dia_chi_cong_ty,
        'marital_status': patient.marital_status,
        'sexual_orientation': patient.sexual_orientation,
        'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        'age': patient.age,
        'mang_thai': patient.mang_thai,
        'so_tuan_thai': patient.so_tuan_thai,
        'expected_delivery_date': patient.expected_delivery_date.isoformat() if patient.expected_delivery_date else None,
        'substance_use_history': patient.substance_use_history or {}
    }), 200, {'Content-Type': 'application/json; charset=utf-8'}


# Cập nhật thông tin bệnh nhân
@router.route('/<int:patient_id>', methods=['PUT'])
@require_auth
def update_patient(user, patient_id):
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403, {'Content-Type': 'application/json; charset=utf-8'}
        data = request.get_json()
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({'detail': 'Patient not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}

        apply_patient_address_update(patient, data)

        _apply_patient_date_updates(data, patient)

        # safety_plan: MERGE thay vì replace để không mất uploaded_file khi auto-save
        if 'safety_plan' in data:
            current = normalize_safety_plan(patient.safety_plan or {})
            current.update(normalize_safety_plan(data.get('safety_plan')))
            data['safety_plan'] = current

        _apply_patient_field_updates(data, db, patient)

        db.commit()

        db.refresh(patient)
        emit_patient_changed('updated', patient=patient)

        return _patient_updated_response(patient)
    except MedicalHistoryContractError as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating patient: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


# ── Kế hoạch an toàn: Upload file đã ký ──
@router.route('/<int:patient_id>/safety-plan/upload', methods=['POST'])
@require_auth
@api_error_boundary(detail='{error}')
def upload_safety_plan_file(user, patient_id):
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({'detail': 'Patient not found'}), 404

        file = request.files.get('file')
        if not file or not file.filename:
            return jsonify({'detail': 'No file provided'}), 400

        file_path, _stored_path = save_safety_plan_file(file, patient_id)

        # Lưu path vào safety_plan JSONB
        current_plan = normalize_safety_plan(patient.safety_plan or {})
        current_plan['uploaded_file'] = file_path
        patient.safety_plan = current_plan
        db.commit()
        emit_patient_changed('safety_plan_uploaded', patient=patient)
        emit_document_changed('safety_plan_uploaded', entity='safety_plan', entity_id=patient_id, extra={
            'patient_id': patient_id,
        }, rooms=[
            'workflow:operations',
            'page:receptionist-new',
            'page:doctor-examination',
            'page:psychologist-examination',
            'role:staff',
            'role:doctor',
            'role:psychologist',
        ])

        return jsonify({'success': True, 'file_path': current_plan['uploaded_file']}), 200
    except SafetyPlanUploadError as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400
    finally:
        db.close()


# ── Kế hoạch an toàn: Serve file đã upload ──
@router.route('/<int:patient_id>/safety-plan/file', methods=['GET'])
@require_auth
def get_safety_plan_file(user, patient_id):
    from flask import send_file
    from pathlib import Path
    from app.utils.upload_storage import upload_path
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or not patient.safety_plan:
            return jsonify({'detail': 'No file'}), 404
        rel_path = patient.safety_plan.get('uploaded_file', '')
        if not rel_path:
            return jsonify({'detail': 'No file'}), 404
        prefix = '/uploads/safety_plans/'
        if not isinstance(rel_path, str) or not rel_path.startswith(prefix):
            return jsonify({'detail': 'Invalid safety-plan file path'}), 404
        filename = rel_path.removeprefix(prefix)
        if not filename or Path(filename).name != filename:
            return jsonify({'detail': 'Invalid safety-plan file path'}), 404
        abs_path = upload_path('safety_plans', filename)
        if not abs_path.is_file():
            return jsonify({'detail': 'File not found on disk'}), 404
        return send_file(str(abs_path))
    finally:
        db.close()


@router.route('/<int:patient_id>', methods=['DELETE'])
@require_auth
def delete_patient(user, patient_id):
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403, {'Content-Type': 'application/json; charset=utf-8'}
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({'detail': 'Patient not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}

        deleted_patient_id = patient.id
        db.delete(patient)
        db.commit()
        emit_patient_changed('deleted', patient_id=deleted_patient_id)
        return jsonify({'detail': 'Patient deleted successfully'}), 204 # 204 No Content for successful deletion
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting patient: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
