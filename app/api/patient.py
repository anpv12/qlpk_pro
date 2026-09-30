from flask import Blueprint, request, jsonify
from app.core.database import get_db
from sqlalchemy import or_, text, select
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
from app.utils.search_normalization import (
    VIETNAMESE_SEARCH_FROM,
    VIETNAMESE_SEARCH_TO,
    normalize_search_text,
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

def _list_patient_rows(patients):
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
    return result_list


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
            normalized_search = f"%{normalize_search_text(search)}%"
            query = text("""
                SELECT id, patient_code, full_name, phone, date_of_birth,
                       address, address_detail, province, district, ward,
                       is_active, emergency_contact,
                       allergies, gender, occupation, don_vi_cong_tac, dia_chi_cong_ty, marital_status,
                       sexual_orientation, id_number, nationality, religion, ethnicity,
                       education_level, nickname
                FROM patients
                WHERE LOWER(TRANSLATE(full_name, :search_from, :search_to)) LIKE :search
                   OR LOWER(TRANSLATE(phone, :search_from, :search_to)) LIKE :search
                ORDER BY id DESC
            """)
            result = db.execute(query, {
                'search': normalized_search,
                'search_from': VIETNAMESE_SEARCH_FROM,
                'search_to': VIETNAMESE_SEARCH_TO,
            })
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
        result_list = _list_patient_rows(patients)
        return jsonify(result_list), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error listing patients: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

def _modal_patient_rows(doctor_id, patients, psychologist_id):
    from app.models.appointment import AppointmentStatus
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
    return data


def _filter_patients_by_clinician(db, doctor_id, patient_query, psychologist_id):
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
    return patient_query


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

        patient_query = _filter_patients_by_clinician(db, doctor_id, patient_query, psychologist_id)

        all_patients = (
            patient_query
            .options(joinedload(Patient.appointments))
            .order_by(Patient.updated_at.desc(), Patient.id.desc())
            .all()
        )

        # Python-side filter uses the same case/accent-insensitive key as the
        # shared SQL search expression above.
        if query_str:
            query_lower = normalize_search_text(query_str)
            all_patients = [p for p in all_patients if (
                query_lower in normalize_search_text(p.full_name) or
                query_lower in normalize_search_text(p.phone) or
                query_lower in normalize_search_text(p.patient_code) or
                query_lower in normalize_search_text(p.id_number)
            )]

        patients = all_patients[:limit]

        data = _modal_patient_rows(doctor_id, patients, psychologist_id)

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
                'current_medication': patient.current_medication,
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

# Route/hàm còn lại nằm ở patient_part2.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.patient_part2 import (  # noqa: E402,F401
    create_patient,
    update_patient,
    upload_safety_plan_file,
    get_safety_plan_file,
    delete_patient,
)

# Route/hàm còn lại nằm ở patient_part3.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.patient_part3 import (  # noqa: E402,F401
    check_duplicate_patient,
    import_patients,
    get_patient_latest_appointment,
    get_patient_examinations,
)
