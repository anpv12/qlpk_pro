from flask import Blueprint, request, jsonify
from app.core.database import get_db
from sqlalchemy import or_, text, select, exists, func
from datetime import datetime # Added for date parsing if needed for date_of_birth
from app.utils import generate_patient_code # New: Import the utility function
from app.utils.patient_utils import calculate_age # Import function to calculate age
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
from app.utils.clinical_access import (
    has_full_patient_scope,
    patient_access_error,
    scoped_patient_ids,
    user_role_value,
)
from app.api.auth import require_auth
from app.realtime.events import emit_document_changed, emit_patient_changed
from app.models.patient import Patient # Import Patient model
from app.models.appointment import Appointment
from app.models.examination import Examination
from sqlalchemy.orm import joinedload

import logging

def populate_history_icd_details(db, history_list):
    if not history_list or not isinstance(history_list, list):
        return []
    
    # Lấy ra tất cả các ICD IDs trong list
    icd_ids = [item.get('id') for item in history_list if item.get('type') == 'icd' and item.get('id') is not None]
    if not icd_ids:
        return history_list
        
    from app.models.icd import ICD
    # Query tất cả ICD một lần để tối ưu hóa hiệu năng (DRY, no N+1 query leak)
    icd_map = {icd.id: icd for icd in db.query(ICD).filter(ICD.id.in_(icd_ids), ICD.is_deleted == False).all()}
    
    populated_list = []
    for item in history_list:
        if item.get('type') == 'icd':
            icd_id = item.get('id')
            icd_obj = icd_map.get(icd_id)
            if icd_obj:
                populated_list.append({
                    'type': 'icd',
                    'id': icd_id,
                    'icd_code': icd_obj.icd_code,
                    'disease_name': icd_obj.disease_name
                })
            else:
                populated_list.append(item)
        else:
            populated_list.append(item)
            
    return populated_list

logger = logging.getLogger(__name__)

router = Blueprint('patients', __name__, url_prefix='/patients')

# Lấy danh sách bệnh nhân (có thể filter theo tên, sđt, appointment_status)
@router.route('/', methods=['GET'])
@require_auth
def list_patients(user):
    db = next(get_db())
    try:
        scoped_ids = scoped_patient_ids(db, user)
        search = request.args.get('search')
        appointment_status = request.args.get('appointment_status')  # Filter by appointment status
        
        # Nếu có filter appointment_status, JOIN với bảng appointments
        if appointment_status:
            from app.models.appointment import AppointmentStatus
            status_filter = appointment_status.upper()
            
            # Query với JOIN để lấy patients có appointments với status cụ thể
            query = text("""
                SELECT DISTINCT p.id, p.patient_code, p.full_name, p.phone, p.date_of_birth,
                       p.address, p.address_detail, p.province, p.district, p.ward,
                       p.is_active, p.emergency_contact,
                       p.allergies, p.gender, p.occupation, p.don_vi_cong_tac, p.dia_chi_cong_ty, p.marital_status,
                       p.sexual_orientation, p.id_number, p.nationality, p.religion, p.ethnicity,
                       p.education_level, p.nickname
                FROM patients p
                INNER JOIN appointments a ON a.patient_id = p.id
                WHERE a.status = :status AND a.is_deleted = false
                ORDER BY p.id DESC
            """)
            result = db.execute(query, {'status': status_filter})
        elif search:
            query = text("""
                SELECT id, patient_code, full_name, phone, date_of_birth,
                       address, address_detail, province, district, ward,
                       is_active, emergency_contact,
                       allergies, gender, occupation, don_vi_cong_tac, dia_chi_cong_ty, marital_status,
                       sexual_orientation, id_number, nationality, religion, ethnicity,
                       education_level, nickname
                FROM patients
                WHERE full_name ILIKE :search OR phone ILIKE :search
                ORDER BY id DESC
            """)
            result = db.execute(query, {'search': f'%{search}%'})
        else:
            query = text("""
                SELECT id, patient_code, full_name, phone, date_of_birth,
                       address, address_detail, province, district, ward,
                       is_active, emergency_contact,
                       allergies, gender, occupation, don_vi_cong_tac, dia_chi_cong_ty, marital_status,
                       sexual_orientation, id_number, nationality, religion, ethnicity,
                       education_level, nickname
                FROM patients
                ORDER BY id DESC
            """)
            result = db.execute(query)
        
        patients = result.fetchall()
        if scoped_ids is not None:
            patients = [patient for patient in patients if patient.id in scoped_ids]
        result_list = []
        for p in patients:
            result_list.append({
                'id': p.id,
                'patient_code': p.patient_code,
                'full_name': p.full_name,
                'phone': p.phone,
                'date_of_birth': p.date_of_birth.isoformat() if p.date_of_birth else None,
                'address': p.address,
                'address_detail': p.address_detail,
                'province': p.province,
                'district': p.district,
                'ward': p.ward,
                'is_active': p.is_active,
                'emergency_contact': p.emergency_contact,
                'allergies': p.allergies,
                'gender': p.gender,
                'occupation': p.occupation,
                'don_vi_cong_tac': p.don_vi_cong_tac,
                'dia_chi_cong_ty': p.dia_chi_cong_ty,
                'marital_status': p.marital_status,
                'sexual_orientation': p.sexual_orientation,
                'id_card': p.id_number,
                'nationality': p.nationality,
                'religion': p.religion,
                'ethnicity': p.ethnicity,
                'education_level': p.education_level,
                'nickname': p.nickname
            })
        return jsonify(result_list), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error listing patients: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

# Modal search patients (used in doctor examination page)
@router.route('/modal-search', methods=['GET'])
@require_auth
def modal_search_patients(user):
    """Tìm kiếm bệnh nhân trong modal, tự động filter theo doctor_id của user hiện tại"""
    db = next(get_db())
    try:
        query_str = (request.args.get('query') or '').strip()
        # Lấy doctor_id hoặc psychologist_id từ query parameter hoặc tự động từ user hiện tại
        doctor_id = request.args.get('doctor_id', type=int)
        psychologist_id = request.args.get('psychologist_id', type=int)
        user_role = user_role_value(user)
        if user_role in {'doctor', 'psychologist'} and not has_full_patient_scope(user):
            # Never trust actor filters supplied by a restricted clinical client.
            doctor_id = user.id if user_role == 'doctor' else None
            psychologist_id = user.id if user_role == 'psychologist' else None
        elif user_role in {'doctor', 'psychologist'} and has_full_patient_scope(user):
            # The explicit full-scope grant means the Doctor search is unrestricted.
            doctor_id = None
            psychologist_id = None
        elif not doctor_id and not psychologist_id:
            # Nếu user có quyền xem tất cả bệnh nhân → không filter
            if getattr(user, 'can_view_all_patients', False):
                logger.info(f"User {user.username} has can_view_all_patients=True - no filter applied")
            else:
                # Tự động lấy doctor_id hoặc psychologist_id từ user hiện tại
                # Kiểm tra role dưới dạng string để đảm bảo tương thích
                user_role = str(user.role) if user.role else ''
                if user_role in ['doctor', 'DOCTOR'] or (hasattr(user.role, 'value') and user.role.value == 'doctor'):
                    doctor_id = user.id
                    logger.info(f"Auto-filtering patients by doctor_id={doctor_id} (user: {user.username}, role: {user_role})")
                elif user_role in ['PSYCHOLOGIST', 'psychologist'] or (hasattr(user.role, 'value') and user.role.value == 'PSYCHOLOGIST'):
                    psychologist_id = user.id
                    logger.info(f"Auto-filtering patients by psychologist_id={psychologist_id} (user: {user.username}, role: {user_role})")
                else:
                    # Nếu không phải doctor hoặc psychologist, không filter (admin có thể xem tất cả)
                    logger.info(f"User {user.username} (role: {user_role}) - no doctor/psychologist filter applied")
        
        limit = request.args.get('limit', default=50000, type=int)
        if not limit or limit < 1:
            limit = 50000
        limit = min(limit, 50000)

        patient_query = db.query(Patient)

        # Không filter bằng SQL cho query_str nữa (PostgreSQL lower()/ILIKE với collation C 
        # không xử lý đúng Vietnamese Unicode). Filter sẽ thực hiện ở Python bên dưới.

        # Tìm kiếm bệnh nhân chỉ hiển thị hồ sơ có ít nhất một lịch hẹn đã
        # xác nhận và chưa bị xóa. Với tài khoản có full scope cũng không được
        # đưa hồ sơ chỉ có lịch SCHEDULED/CANCELLED/NO_SHOW vào kết quả.
        from app.models.appointment import AppointmentStatus
        appointment_filter = (
            (Appointment.is_deleted == False)
            & (Appointment.status == AppointmentStatus.CONFIRMED)
        )
        if doctor_id:
            appointment_filter = appointment_filter & (Appointment.doctor_id == doctor_id)
            logger.info(f"Filtering patients by doctor_id={doctor_id} with CONFIRMED status")
        if psychologist_id:
            # TLG: check cả psychologist_id OR doctor_id (vì khi TLG khám,
            # cả 2 field đều = TLG_id; dữ liệu cũ có thể chỉ còn doctor_id).
            appointment_filter = appointment_filter & (
                (Appointment.psychologist_id == psychologist_id)
                | (Appointment.doctor_id == psychologist_id)
            )
            logger.info(f"Filtering patients by psychologist_id OR doctor_id={psychologist_id} with CONFIRMED status")

        appointment_patient_ids = (
            db.query(Appointment.patient_id)
            .filter(appointment_filter)
            .distinct()
            .all()
        )
        # Chuyển từ list of tuples sang list of ids.
        patient_ids = [pid[0] for pid in appointment_patient_ids] if appointment_patient_ids else []
        if patient_ids:
            patient_query = patient_query.filter(Patient.id.in_(patient_ids))
        else:
            # Không có lịch hẹn CONFIRMED nào thì không trả hồ sơ bệnh nhân.
            patient_query = patient_query.filter(Patient.id == -1)
        filter_type = f"doctor_id={doctor_id}" if doctor_id else f"psychologist_id={psychologist_id}" if psychologist_id else "confirmed_appointments"
        logger.info(f"After filter, query will return {len(patient_ids)} patients with {filter_type}")

        all_patients = (
            patient_query
            .options(joinedload(Patient.appointments))
            .order_by(Patient.updated_at.desc(), Patient.id.desc())
            .all()
        )

        # Python-side filter cho search (xử lý đúng Vietnamese case-insensitive)
        if query_str:
            query_lower = query_str.lower()
            all_patients = [p for p in all_patients if (
                query_lower in (p.full_name or '').lower() or
                query_lower in (p.phone or '').lower() or
                query_lower in (p.patient_code or '').lower() or
                query_lower in (p.id_number or '').lower()
            )]

        patients = all_patients[:limit]

        data = []
        for patient in patients:
            last_appointment = None
            for appt in patient.appointments or []:
                if appt.is_deleted or appt.status != AppointmentStatus.CONFIRMED:
                    continue
                # Chỉ lấy appointments với doctor_id hoặc psychologist_id hiện tại (nếu có filter)
                if doctor_id and appt.doctor_id != doctor_id:
                    continue
                if psychologist_id and not (
                    appt.psychologist_id == psychologist_id
                    or appt.doctor_id == psychologist_id
                ):
                    continue
                if not last_appointment or (appt.appointment_date and appt.appointment_date > last_appointment.appointment_date):
                    last_appointment = appt

            data.append({
                'id': patient.id,
                'patient_code': patient.patient_code,
                'full_name': patient.full_name,
                'phone': patient.phone,
                'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                'gender': patient.gender,
                'id_number': patient.id_number,
                'last_appointment': {
                    'id': last_appointment.id,
                    'appointment_date': last_appointment.appointment_date.isoformat() if last_appointment and last_appointment.appointment_date else None,
                    'doctor_id': last_appointment.doctor_id,
                    'doctor_name': last_appointment.doctor.full_name if last_appointment and last_appointment.doctor else None,
                    'status': last_appointment.status.value if last_appointment and last_appointment.status else None
                } if last_appointment else None
            })

        return jsonify({'patients': data}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error in modal_search_patients: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

# Lấy chi tiết bệnh nhân theo ID
@router.route('/<int:patient_id>', methods=['GET'])
@require_auth
def get_patient(user, patient_id):
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403, {'Content-Type': 'application/json; charset=utf-8'}
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({'detail': 'Patient not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Return full patient details
        return jsonify({
            'success': True,
            'data': {
                'id': patient.id,
                'patient_code': patient.patient_code,
                'full_name': patient.full_name,
                'nickname': patient.nickname,
                'gender': patient.gender,
                'id_number': patient.id_number,
                'phone': patient.phone,
                'email': patient.email,
                'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                'address': patient.address,
                'address_detail': patient.address_detail,
                'province': patient.province,
                'district': patient.district,
                'ward': patient.ward,
                'occupation': patient.occupation,
                'don_vi_cong_tac': patient.don_vi_cong_tac,
                'dia_chi_cong_ty': patient.dia_chi_cong_ty,
                'marital_status': patient.marital_status,
                'sexual_orientation': patient.sexual_orientation,
                'mang_thai': patient.mang_thai,
                'so_tuan_thai': patient.so_tuan_thai,
                'expected_delivery_date': patient.expected_delivery_date.isoformat() if patient.expected_delivery_date else None,
                'nationality': patient.nationality,
                'religion': patient.religion,
                'ethnicity': patient.ethnicity,
                'education_level': patient.education_level,
                'is_active': patient.is_active,
                'emergency_contact': patient.emergency_contact,
                'allergies': patient.allergies,
                # Medical history fields
                'referral_source': patient.referral_source,
                'problem_start_time': patient.problem_start_time,
                'symptom_progression': patient.symptom_progression,
                'family_history': populate_history_icd_details(db, patient.family_history),
                'current_behavior': getattr(patient, 'current_behavior', None),
                # New fields from modal "Hỏi bệnh"
                'physical_history': populate_history_icd_details(db, patient.physical_history),
                'severity_level': patient.severity_level,
                'allergies': patient.allergies,
                'current_medication': patient.current_medication,
                # New address fields
                'province': patient.province,
                'district': patient.district,
                'ward': patient.ward,
                'address_detail': patient.address_detail,
                # New personal info fields
                'nationality': patient.nationality,
                'religion': patient.religion,
                'ethnicity': patient.ethnicity,
                'education_level': patient.education_level,
                'substance_use_history': patient.substance_use_history or {},
                'safety_plan': patient.safety_plan or {}
            }
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error getting patient details: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@router.route('/<int:patient_id>/public', methods=['GET'])
def get_patient_public(patient_id):
    """Public patient profile used by survey pages."""
    db = next(get_db())
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy bệnh nhân'
            }), 404, {'Content-Type': 'application/json; charset=utf-8'}

        def safe_isoformat(value):
            if value is None:
                return None
            return value.isoformat() if hasattr(value, 'isoformat') else str(value)

        return jsonify({
            'success': True,
            'data': {
                'id': patient.id,
                'full_name': patient.full_name or '',
                'date_of_birth': safe_isoformat(patient.date_of_birth),
                'age': patient.age,
                'gender': patient.gender,
                'phone': patient.phone or '',
                'address': patient.address,
                'province': patient.province,
                'district': patient.district,
                'ward': patient.ward,
                'address_detail': patient.address_detail,
                'nationality': patient.nationality,
                'religion': patient.religion,
                'ethnicity': patient.ethnicity,
                'education_level': patient.education_level,
                'emergency_contact': patient.emergency_contact,
                'created_at': safe_isoformat(patient.created_at),
                'updated_at': safe_isoformat(patient.updated_at)
            }
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as exc:
        logger.error("Error getting public patient %s: %s", patient_id, exc, exc_info=True)
        return jsonify({
            'success': False,
            'message': 'Lỗi khi lấy thông tin bệnh nhân'
        }), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

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
            
        # Parse date_of_birth if provided
        date_of_birth = None
        if data.get('date_of_birth'):
            try:
                date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'detail': 'Invalid date format for date_of_birth. Use YYYY-MM-DD'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
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
            except ValueError:
                pass  # Invalid date format, skip
            
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
        db.add(patient)
        db.commit()
        db.refresh(patient)
        emit_patient_changed('created', patient=patient)
                
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
    except MedicalHistoryContractError as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback() # Rollback changes in case of an error
        logger.error(f"Error creating patient: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

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
            except ValueError:
                pass  # Invalid date format, skip
        elif 'expected_delivery_date' in data and data['expected_delivery_date'] is None:
            # Clear expected_delivery_date if explicitly set to None
            patient.expected_delivery_date = None
            patient.so_tuan_thai = None
        
        # safety_plan: MERGE thay vì replace để không mất uploaded_file khi auto-save
        if 'safety_plan' in data:
            current = normalize_safety_plan(patient.safety_plan or {})
            current.update(normalize_safety_plan(data.get('safety_plan')))
            data['safety_plan'] = current

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
        
        db.commit()

        db.refresh(patient)
        emit_patient_changed('updated', patient=patient)

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
    except Exception as e:
        db.rollback()
        logger.error(f'Error uploading safety plan: {e}')
        return jsonify({'detail': str(e)}), 500
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

# Check for duplicate patients
@router.route('/check-duplicate', methods=['POST'])
@require_auth
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
            
    except Exception as e:
        logging.error(f"Error checking duplicate patient: {str(e)}")
        return jsonify({'detail': 'Lỗi khi kiểm tra trùng lặp bệnh nhân'}), 500
    finally:
        db.close()

# Import bệnh nhân từ file (dữ liệu JSON)
@router.route('/import', methods=['POST'])
@require_auth
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
    except Exception as e:
        db.rollback()
        logger.error(f"Error during bulk import: {e}")
        return jsonify({'detail': f'Internal server error during import: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@router.route('/<int:patient_id>/latest-appointment', methods=['GET'])
@require_auth
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
        
    except Exception as e:
        logger.error(f"Error getting patient latest appointment: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()

@router.route('/<int:patient_id>/examinations', methods=['GET'])
@require_auth
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
    except Exception as e:
        logger.error(f"Error getting examinations for patient {patient_id}: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
