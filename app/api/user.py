from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User as UserModel, UserRole, UserGroup
from app.models.doctor import Doctor
from app.models.group import Group
# NEW: Import Patient model and schema for the debug route
from app.models.patient import Patient as PatientModel 
from app.schemas.patient import Patient as PatientSchema 
from app.schemas.user import UserBase, UserCreate, UserRead 
from typing import List, Optional
from app.services.auth import get_password_hash, verify_password
from app.api.auth import require_auth, ALL_PERMISSIONS
from app.realtime.events import emit_catalog_changed
from app.utils.upload_storage import normalize_upload_url, upload_dir, upload_url
import json

# Changed Blueprint name for clarity (e.g., if you also have an 'auth' blueprint)
import logging

logger = logging.getLogger(__name__)

user_router = Blueprint('users', __name__, url_prefix='/users')


def _user_read_payload(user):
    payload = UserRead.model_validate(user).model_dump()
    payload['avatar'] = normalize_upload_url(payload.get('avatar'))
    return payload

@user_router.route("/", methods=['POST'])
@require_auth
def create_user(current_user):
    """
    Creates a new user in the database.
    Requires 'full_name', 'email', 'password', 'role', and 'is_active' in the request body.
    """
    db = next(get_db())
    try:
        data = request.get_json()
        
        # Convert empty email string to None
        if 'email' in data and data['email'] == '':
            data['email'] = None
            
        user_data = UserCreate(**data) # Validate incoming data with Pydantic schema
        
        # Check if email already exists (only if email is provided)
        if user_data.email:
            db_user = db.query(UserModel).filter(UserModel.email == user_data.email).first()
            if db_user:
                return jsonify({"detail": "Email already registered"}), 409, {'Content-Type': 'application/json; charset=utf-8'} # Use 409 Conflict for existing resource
            
        hashed_password = get_password_hash(user_data.password)
        new_user = UserModel(
            username=user_data.username,
            full_name=user_data.full_name,
            email=user_data.email,
            phone=getattr(user_data, 'phone', None),
            avatar=normalize_upload_url(getattr(user_data, 'avatar', None)),
            gender=getattr(user_data, 'gender', None),
            address=getattr(user_data, 'address', None),
            notes=getattr(user_data, 'notes', None),
            hashed_password=hashed_password,
            role=user_data.role,
            is_active=user_data.is_active
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        emit_catalog_changed('user_created', entity='user', entity_id=new_user.id, extra={'role': getattr(new_user.role, 'value', new_user.role)})
        # Return the created user's data using the UserRead schema
        return jsonify(UserRead.model_validate(new_user).model_dump()), 201, {'Content-Type': 'application/json; charset=utf-8'} # 201 Created
    except Exception as e:
        db.rollback() # Rollback changes on error
        logger.error(f"Error creating user: {e}") # Log the error for debugging
        # Return a more generic error for security, or specific if appropriate
        return jsonify({"detail": "Failed to create user", "error": str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@user_router.route("/", methods=['GET'])
@require_auth
def read_users(current_user):
    """
    Retrieves a list of all users, with optional filtering by 'role'.
    """
    db = next(get_db())
    try:
        role = request.args.get('role')
        query = db.query(UserModel).filter(UserModel.is_active == True)
        if role:
            query = query.filter(UserModel.role == role)
        users = query.all()
        # Return a list of users, each transformed by UserRead schema
        return jsonify([_user_read_payload(u) for u in users]), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error reading users: {e}")
        return jsonify({"detail": "Failed to retrieve users", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@user_router.route("/<int:user_id>", methods=['GET', 'PUT', 'DELETE'])
@require_auth
def read_user(current_user, user_id):
    """
    Retrieves a single user by their ID.
    """
    db = next(get_db())
    try:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if user is None:
            return jsonify({"detail": "User not found"}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        if request.method == 'GET':
            # Return the user's data transformed by UserRead schema and include license_number if any
            user_json = _user_read_payload(user)
            try:
                if user.role in ['doctor', 'DOCTOR', 'PSYCHOLOGIST']:
                    doctor_profile = db.query(Doctor).filter(Doctor.user_id == user.id).first()
                    if doctor_profile:
                        if doctor_profile.license_number:
                            user_json['license_number'] = doctor_profile.license_number
                        if doctor_profile.license_certificate_file:
                            # Parse format: path|original_filename
                            parts = doctor_profile.license_certificate_file.split('|', 1)
                            user_json['license_certificate_file'] = normalize_upload_url(parts[0])  # Đường dẫn file
                            if len(parts) > 1:
                                user_json['license_certificate_original_filename'] = parts[1]  # Tên file gốc
                            else:
                                # Backward compatibility: nếu không có format mới, lấy tên từ URL
                                user_json['license_certificate_original_filename'] = parts[0].split('/')[-1]
                        if doctor_profile.license_issue_date:
                            user_json['license_issue_date'] = doctor_profile.license_issue_date.isoformat()
            except Exception:
                pass
            return jsonify(user_json), 200, {'Content-Type': 'application/json; charset=utf-8'}
        elif request.method == 'PUT':
            # Update user
            data = request.get_json()
            
            # Update fields if provided
            if 'full_name' in data:
                user.full_name = data['full_name']
            if 'email' in data:
                user.email = data['email']
            if 'phone' in data:
                user.phone = data['phone']
            if 'gender' in data:
                user.gender = data['gender']
            if 'address' in data:
                user.address = data['address']
            if 'avatar' in data:
                user.avatar = normalize_upload_url(data['avatar'])
            if 'notes' in data:
                user.notes = data['notes']
            if 'is_active' in data:
                user.is_active = data['is_active']
            if 'can_view_all_patients' in data:
                user.can_view_all_patients = data['can_view_all_patients']
                logger.info(f"Setting can_view_all_patients={data['can_view_all_patients']} for user {user.id}")
            if 'role' in data:
                user.role = data['role']
            if 'calendar_color' in data:
                user.calendar_color = data['calendar_color']
            
            # Update license fields into Doctor profile if provided
            if user.role in ['doctor', 'DOCTOR', 'PSYCHOLOGIST']:
                doctor_profile = db.query(Doctor).filter(Doctor.user_id == user.id).first()
                if not doctor_profile:
                    doctor_profile = Doctor(user_id=user.id, name=user.full_name, email=user.email, phone=user.phone, is_active=True)
                    db.add(doctor_profile)
                    db.flush()
                
                if 'license_number' in data and data['license_number'] is not None:
                    doctor_profile.license_number = data['license_number']
                
                if 'license_issue_date' in data:
                    from datetime import datetime
                    if data['license_issue_date']:
                        doctor_profile.license_issue_date = datetime.fromisoformat(data['license_issue_date'].split('T')[0]).date()
                    else:
                        doctor_profile.license_issue_date = None
            
            # Update password if provided
            if 'password' in data and data['password']:
                user.hashed_password = get_password_hash(data['password'])
            
            db.commit()
            db.refresh(user)
            emit_catalog_changed('user_updated', entity='user', entity_id=user.id, extra={'role': getattr(user.role, 'value', user.role)})

            return jsonify(UserRead.model_validate(user).model_dump()), 200, {'Content-Type': 'application/json; charset=utf-8'}
        elif request.method == 'DELETE':
            # Delete user (soft delete by setting is_active = False)
            user.is_active = False
            db.commit()
            emit_catalog_changed('user_deleted', entity='user', entity_id=user_id, extra={'role': getattr(user.role, 'value', user.role)})
            return jsonify({"detail": "User deleted successfully"}), 200, {'Content-Type': 'application/json; charset=utf-8'}
            
    except Exception as e:
        db.rollback()
        logger.error(f"Error with user {user_id}: {e}")
        return jsonify({"detail": "Failed to process user", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@user_router.route("/<int:user_id>/avatar", methods=['POST'])
@require_auth
def upload_avatar(current_user, user_id):
    db = next(get_db())
    try:
        if 'file' not in request.files:
            return jsonify({'detail': 'Không có file'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        file = request.files['file']
        if file.filename == '':
            return jsonify({'detail': 'Tên file rỗng'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        # Simple validation
        allowed = {'png','jpg','jpeg','gif'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in allowed:
            return jsonify({'detail': 'Định dạng không hỗ trợ'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        import uuid
        avatar_dir = upload_dir('avatars')
        filename = f"{uuid.uuid4().hex}.{ext}"
        save_path = avatar_dir / filename
        file.save(save_path)

        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            return jsonify({'detail': 'User không tồn tại'}), 404, {'Content-Type': 'application/json; charset=utf-8'}

        public_url = upload_url('avatars', filename)
        user.avatar = public_url
        db.commit()
        emit_catalog_changed('user_avatar_updated', entity='user', entity_id=user_id, extra={'role': getattr(user.role, 'value', user.role)})

        return jsonify({'success': True, 'avatar': public_url}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        return jsonify({'detail': 'Upload thất bại', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@user_router.route("/<int:user_id>/license-certificate", methods=['POST'])
@require_auth
def upload_license_certificate(current_user, user_id):
    db = next(get_db())
    try:
        if 'file' not in request.files:
            return jsonify({'detail': 'Không có file'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        file = request.files['file']
        if file.filename == '':
            return jsonify({'detail': 'Tên file rỗng'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        # Validation - cho phép PDF, hình ảnh, và Word
        allowed = {'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in allowed:
            return jsonify({'detail': 'Định dạng không hỗ trợ. Chỉ chấp nhận: PDF, JPG, PNG, DOC, DOCX'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            return jsonify({'detail': 'User không tồn tại'}), 404, {'Content-Type': 'application/json; charset=utf-8'}

        # Chỉ cho phép với role doctor hoặc PSYCHOLOGIST
        if user.role not in ['doctor', 'DOCTOR', 'PSYCHOLOGIST']:
            return jsonify({'detail': 'Chỉ bác sĩ và tâm lý gia mới có thể upload chứng nhận hành nghề'}), 403, {'Content-Type': 'application/json; charset=utf-8'}

        import uuid
        certificate_dir = upload_dir('license_certificates')
        filename = f"{uuid.uuid4().hex}.{ext}"
        save_path = certificate_dir / filename
        file.save(save_path)

        # Lấy hoặc tạo doctor profile
        doctor_profile = db.query(Doctor).filter(Doctor.user_id == user_id).first()
        if not doctor_profile:
            doctor_profile = Doctor(user_id=user_id, name=user.full_name, email=user.email, phone=user.phone, is_active=True)
            db.add(doctor_profile)
            db.flush()

        public_url = upload_url('license_certificates', filename)
        original_filename = file.filename  # Lưu tên file gốc
        # Lưu cả đường dẫn và tên file gốc trong cùng một cột (format: path|original_filename)
        doctor_profile.license_certificate_file = f"{public_url}|{original_filename}"
        db.commit()
        emit_catalog_changed('user_license_certificate_updated', entity='user', entity_id=user_id, extra={'role': getattr(user.role, 'value', user.role)})

        return jsonify({
            'success': True, 
            'license_certificate_file': public_url,
            'license_certificate_original_filename': original_filename
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading license certificate: {e}")
        return jsonify({'detail': 'Upload thất bại', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@user_router.route("/me", methods=['GET'])
@require_auth
def get_current_user(user):
    """
    Retrieves information about the currently authenticated user.
    """
    db = next(get_db())
    try:
        # Lấy permissions của user
        user_permissions = []
        if user.role == UserRole.ADMIN:
            user_permissions = ALL_PERMISSIONS
        else:
            groups = db.query(Group).join(UserGroup).filter(UserGroup.user_id == user.id).all()
            for group in groups:
                if group.permissions:
                    try:
                        group_perms = json.loads(group.permissions)
                        if isinstance(group_perms, list):
                            user_permissions.extend(group_perms)
                    except json.JSONDecodeError as e:
                        logger.warning(f"Could not decode permissions for group {group.name}: {e}")
            user_permissions = list(set(user_permissions))  # Remove duplicates
        
        user_data = {
            'id': user.id,
            'username': user.username,
            'full_name': user.full_name,
            'email': user.email,
            'avatar': normalize_upload_url(user.avatar),
            'role': user.role,
            'phone': user.phone,
            'is_active': user.is_active,
            'permissions': user_permissions  # Thêm permissions
        }
        
        # Thêm license_number nếu có
        try:
            if user.role in ['doctor', 'DOCTOR', 'PSYCHOLOGIST']:
                doctor_profile = db.query(Doctor).filter(Doctor.user_id == user.id).first()
                if doctor_profile and doctor_profile.license_number:
                    user_data['license_number'] = doctor_profile.license_number
        except Exception:
            pass
            
        return jsonify(user_data), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error getting current user: {e}")
        return jsonify({"detail": "Failed to retrieve current user", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@user_router.route("/me/password", methods=['PUT'])
@require_auth
def change_current_user_password(current_user):
    db = next(get_db())
    try:
        data = request.get_json(silent=True) or {}
        current_password = data.get('current_password') or data.get('currentPassword')
        new_password = data.get('new_password') or data.get('newPassword')

        if not current_password or not new_password:
            return jsonify({'detail': 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        if len(str(new_password)) < 6:
            return jsonify({'detail': 'Mật khẩu mới phải có ít nhất 6 ký tự'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
        if not user:
            return jsonify({'detail': 'Không tìm thấy tài khoản'}), 404, {'Content-Type': 'application/json; charset=utf-8'}

        if not verify_password(current_password, user.hashed_password):
            return jsonify({'detail': 'Mật khẩu hiện tại không đúng'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        user.hashed_password = get_password_hash(new_password)
        db.commit()

        return jsonify({'success': True, 'detail': 'Đổi mật khẩu thành công'}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error changing password for user {getattr(current_user, 'id', None)}: {e}")
        return jsonify({'detail': 'Không thể đổi mật khẩu'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@user_router.route("/doctors", methods=['GET'])
@require_auth
def get_doctors(user):
    """
    Trả về danh sách người khám (bác sĩ và tâm lý gia) để chọn trong lịch hẹn.
    """
    db = next(get_db())
    try:
        users_q = db.query(UserModel).filter(UserModel.is_active == True, UserModel.role.in_(['doctor', 'PSYCHOLOGIST']))
        people = users_q.all()
        return jsonify([{
            'id': u.id,
            'name': u.full_name,
            'specialization': 'Tâm lý gia' if u.role == 'PSYCHOLOGIST' else 'Bác sĩ',
            'phone': u.phone,
            'email': u.email,
            'role': u.role,
            'avatar': normalize_upload_url(u.avatar),
            'calendar_color': u.calendar_color
        } for u in people]), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error getting doctors: {e}")
        return jsonify({"detail": "Failed to retrieve doctors", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@user_router.route("/psychologists", methods=['GET'])
@require_auth
def get_psychologists(user):
    """
    Retrieves a list of all psychologists (users with role 'PSYCHOLOGIST').
    """
    db = next(get_db())
    try:
        psychologists = db.query(UserModel).filter(UserModel.role == 'PSYCHOLOGIST', UserModel.is_active == True).all()
        return jsonify([{
            'id': psychologist.id,
            'full_name': psychologist.full_name,
            'email': psychologist.email,
            'role': psychologist.role
        } for psychologist in psychologists]), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error reading psychologists: {e}")
        return jsonify({"detail": "Failed to retrieve psychologists", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@user_router.route("/patients/<int:patient_id>", methods=['GET'])
@require_auth
def get_patient_by_id(current_user, patient_id):
    """
    DEBUG API: Retrieves a single patient by their ID.
    (Note: This route is unusual in a 'users' blueprint and likely for testing.)
    """
    db = next(get_db())
    try:
        db_patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
        if db_patient is None:
            return jsonify({"detail": "Patient not found"}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        return jsonify(PatientSchema.from_orm(db_patient).dict()), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error getting patient {patient_id} (DEBUG): {e}")
        return jsonify({"detail": "Failed to retrieve patient (DEBUG)", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
