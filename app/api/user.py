from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.user import User as UserModel, UserRole
from app.models.doctor import Doctor
# NEW: Import Patient model and schema for the debug route
from app.models.patient import Patient as PatientModel 
from app.schemas.patient import Patient as PatientSchema 
from app.schemas.user import UserCreate, UserRead
from app.services.auth import get_password_hash, verify_password, create_access_token, token_matches_user
from app.services.access_sessions import revoke_account_sessions, SessionStoreUnavailable
from app.services.session_identity import session_user_payload
from app.services.browser_sessions import browser_cookie_token, request_access_token, browser_session_payload, set_browser_session
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.realtime.socket import disconnect_user_clients
from app.utils.upload_storage import normalize_upload_url, upload_dir, upload_url
from app.utils.image_optimizer import InvalidImageError, optimize_image
from app.utils.account_access import (
    require_account_permission, is_account_admin, can_manage_account,
    forbidden_account_action,
)
from app.utils.clinical_access import patient_access_error, user_role_value

# Changed Blueprint name for clarity (e.g., if you also have an 'auth' blueprint)
import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

user_router = Blueprint('users', __name__, url_prefix='/users')


def _user_read_payload(user):
    payload = UserRead.model_validate(user).model_dump()
    payload['avatar'] = normalize_upload_url(payload.get('avatar'))
    return payload

@user_router.route("/", methods=['POST'])
@require_auth
@require_account_permission('ql-taikhoan')
def create_user(current_user):
    """
    Creates a new user in the database.
    Requires 'full_name', 'email', 'password', 'role', and 'is_active' in the request body.
    """
    db = next(get_db())
    try:
        if not is_account_admin(current_user):
            return forbidden_account_action()
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
        logger.error(f"Error creating user: {e}", exc_info=True) # Log the error for debugging
        # Return a more generic error for security, or specific if appropriate
        return jsonify({"detail": "Failed to create user", "error": str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@user_router.route("/", methods=['GET'])
@require_auth
@require_account_permission('ql-taikhoan', 'ql-phanquyen')
@api_error_boundary(detail='Failed to retrieve users', error='{error}')
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
    finally:
        db.close()

def _apply_doctor_license_update(data, db, user):
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


USER_ACCOUNT_FIELDS = ('full_name', 'email', 'phone', 'gender', 'address', 'avatar', 'notes', 'is_active',
                       'can_view_all_patients', 'role', 'calendar_color')


def _apply_user_account_fields(data, user):
    # Update fields if provided
    for field in USER_ACCOUNT_FIELDS:
        if field not in data:
            continue
        value = normalize_upload_url(data[field]) if field == 'avatar' else data[field]
        setattr(user, field, value)
        if field == 'can_view_all_patients':
            logger.info(f"Setting can_view_all_patients={data['can_view_all_patients']} for user {user.id}")


def _update_user_account(current_user, db, user):
    # Update user
    data = request.get_json()
    if not isinstance(data, dict):
        return jsonify(detail='Dữ liệu tài khoản không hợp lệ.'), 400
    if any(key in data and type(data[key]) is not bool for key in ('is_active', 'can_view_all_patients')):
        return jsonify(detail='Trạng thái tài khoản phải là giá trị đúng/sai.'), 400
    if not is_account_admin(current_user):
        protected_fields = ('role', 'is_active', 'can_view_all_patients')
        if any(key in data and data[key] != getattr(user, key) for key in protected_fields) or data.get('password'):
            return forbidden_account_action()
    if any(key in data and data[key] != getattr(user, key) for key in ('is_active', 'role', 'can_view_all_patients')) or data.get('password'):
        revoke_account_sessions(user.id)

    _apply_user_account_fields(data, user)

    _apply_doctor_license_update(data, db, user)

    # Update password if provided
    if 'password' in data and data['password']:
        user.hashed_password = get_password_hash(data['password'])

    db.commit()
    db.refresh(user)
    emit_catalog_changed('user_updated', entity='user', entity_id=user.id, extra={'role': getattr(user.role, 'value', user.role)})

    return jsonify(UserRead.model_validate(user).model_dump()), 200, {'Content-Type': 'application/json; charset=utf-8'}


def _user_detail_response(db, user, user_id):
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
    except Exception as exc:
        logger.warning('Không đọc được hồ sơ bác sĩ của user %s: %s', user_id, exc, exc_info=True)
    return jsonify(user_json), 200, {'Content-Type': 'application/json; charset=utf-8'}


@user_router.route("/<int:user_id>", methods=['GET', 'PUT', 'DELETE'])
@require_auth
@require_account_permission('ql-taikhoan')
@api_error_boundary(detail='Failed to process user', error='{error}')
def read_user(current_user, user_id):
    """
    Retrieves a single user by their ID.
    """
    db = next(get_db())
    try:
        query = db.query(UserModel).filter(UserModel.id == user_id)
        if request.method != 'GET':
            query = query.with_for_update()
        user = query.first()
        if user is None:
            return jsonify({"detail": "User not found"}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        if request.method != 'GET' and not can_manage_account(current_user, user):
            return forbidden_account_action()
        if request.method == 'DELETE' and not is_account_admin(current_user):
            return forbidden_account_action()
        
        if request.method == 'GET':
            return _user_detail_response(db, user, user_id)
        elif request.method == 'PUT':
            return _update_user_account(current_user, db, user)
        elif request.method == 'DELETE':
            # Delete user (soft delete by setting is_active = False)
            revoke_account_sessions(user.id)
            user.is_active = False
            db.commit()
            emit_catalog_changed('user_deleted', entity='user', entity_id=user_id, extra={'role': getattr(user.role, 'value', user.role)})
            return jsonify({"detail": "User deleted successfully"}), 200, {'Content-Type': 'application/json; charset=utf-8'}
            
    except SessionStoreUnavailable:
        db.rollback()
        return jsonify(code='system.unavailable', detail='Chưa thể thu hồi phiên; tài khoản chưa được cập nhật.'), 503
    finally:
        db.close()


@user_router.route("/<int:user_id>/avatar", methods=['POST'])
@require_auth
@require_account_permission('ql-taikhoan')
@api_error_boundary(detail='Upload thất bại', error='{error}')
def upload_avatar(current_user, user_id):
    db = next(get_db())
    try:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            return jsonify(detail='User không tồn tại'), 404
        if not can_manage_account(current_user, user):
            return forbidden_account_action()
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
        try:
            optimized, ext = optimize_image(file.read(), ext)
        except InvalidImageError:
            return jsonify({'detail': 'Tệp không phải ảnh hợp lệ'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        avatar_dir = upload_dir('avatars')
        filename = f"{uuid.uuid4().hex}.{ext}"
        save_path = avatar_dir / filename
        save_path.write_bytes(optimized)

        public_url = upload_url('avatars', filename)
        user.avatar = public_url
        db.commit()
        emit_catalog_changed('user_avatar_updated', entity='user', entity_id=user_id, extra={'role': getattr(user.role, 'value', user.role)})

        return jsonify({'success': True, 'avatar': public_url}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@user_router.route("/<int:user_id>/license-certificate", methods=['POST'])
@require_auth
@require_account_permission('ql-taikhoan')
@api_error_boundary(detail='Upload thất bại', error='{error}')
def upload_license_certificate(current_user, user_id):
    db = next(get_db())
    try:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            return jsonify(detail='User không tồn tại'), 404
        if not can_manage_account(current_user, user):
            return forbidden_account_action()
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
    finally:
        db.close()


@user_router.route("/me", methods=['GET'])
@require_auth
@api_error_boundary(detail='Failed to retrieve current user', error='{error}')
def get_current_user(user):
    """
    Retrieves information about the currently authenticated user.
    """
    db = next(get_db())
    try:
        user = db.query(UserModel).filter(UserModel.id == user.id).first()
        if not user or user.is_active is not True:
            return jsonify(detail='Phiên đăng nhập không còn hiệu lực.'), 401
        user_data = {
            **session_user_payload(user),
            'avatar': normalize_upload_url(user.avatar),
            'phone': user.phone,
            'is_active': user.is_active,
        }
        
        # Thêm license_number nếu có
        try:
            if user.role in ['doctor', 'DOCTOR', 'PSYCHOLOGIST']:
                doctor_profile = db.query(Doctor).filter(Doctor.user_id == user.id).first()
                if doctor_profile and doctor_profile.license_number:
                    user_data['license_number'] = doctor_profile.license_number
        except Exception as exc:
            logger.warning('Không đọc được số chứng chỉ của user %s: %s', user.id, exc, exc_info=True)
            
        response = jsonify(user_data)
        response.headers['Cache-Control'] = 'no-store'
        return response
    finally:
        db.close()

@user_router.route("/me/password", methods=['PUT'])
@require_auth
@api_error_boundary(detail='Không thể đổi mật khẩu')
def change_current_user_password(current_user):
    db = next(get_db())
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(detail='Dữ liệu mật khẩu không hợp lệ.'), 400
        current_password = data.get('current_password') or data.get('currentPassword')
        new_password = data.get('new_password') or data.get('newPassword')

        if not isinstance(current_password, str) or not isinstance(new_password, str) or not current_password or not new_password:
            return jsonify({'detail': 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        if len(str(new_password)) < 6:
            return jsonify({'detail': 'Mật khẩu mới phải có ít nhất 6 ký tự'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        user = db.query(UserModel).filter(UserModel.id == current_user.id).with_for_update().first()
        if not user:
            return jsonify({'detail': 'Không tìm thấy tài khoản'}), 404, {'Content-Type': 'application/json; charset=utf-8'}

        if not token_matches_user(request_access_token(), user):
            return jsonify(detail='Phiên đăng nhập không còn hiệu lực.'), 401

        if not verify_password(current_password, user.hashed_password):
            return jsonify({'detail': 'Mật khẩu hiện tại không đúng'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        user.hashed_password = get_password_hash(new_password)
        cookie_mode = bool(browser_cookie_token())
        replacement_token = create_access_token({'sub': user.username, **({'transport': 'cookie'} if cookie_mode else {})}, user=user)
        db.commit()
        disconnect_user_clients(user.id)

        payload = {'success': True, 'detail': 'Đổi mật khẩu thành công'}
        if cookie_mode:
            payload.update(browser_session_payload(replacement_token))
            payload['user'] = session_user_payload(user)
            return set_browser_session(jsonify(payload), replacement_token)
        payload.update(access_token=replacement_token, token_type='bearer')
        response = jsonify(payload)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except SessionStoreUnavailable:
        db.rollback()
        return jsonify(code='system.unavailable', detail='Chưa thể cập nhật phiên đăng nhập; mật khẩu chưa được lưu.'), 503
    finally:
        db.close()


TRANSFER_RECIPIENT_ROLES = {'doctor': UserRole.DOCTOR, 'psychologist': UserRole.PSYCHOLOGIST, 'staff': UserRole.STAFF}


@user_router.route("/transfer-recipients", methods=['GET'])
@require_auth
def get_transfer_recipients(current_user):
    """Minimal active recipients for the transfer workflow; full account data stays admin-only."""
    role = TRANSFER_RECIPIENT_ROLES.get(str(request.args.get('role', '')).lower())
    if role is None:
        return jsonify({'detail': 'Nhóm nhận chuyển khám không hợp lệ'}), 400
    db = next(get_db())
    try:
        actor = db.query(UserModel).filter(UserModel.id == current_user.id, UserModel.is_active.is_(True)).first()
        if not actor or user_role_value(actor) not in {'admin', 'staff', 'doctor', 'psychologist'}:
            return jsonify({'detail': 'Không có quyền chuyển khám'}), 403
        people = db.query(UserModel).filter(UserModel.is_active.is_(True), UserModel.role == role,
                                            UserModel.id != actor.id).order_by(UserModel.full_name, UserModel.id).all()
        return jsonify([{'id': person.id, 'full_name': person.full_name, 'role': role.value} for person in people])
    finally:
        db.close()


@user_router.route("/doctors", methods=['GET'])
@require_auth
@api_error_boundary(detail='Failed to retrieve doctors', error='{error}')
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
    finally:
        db.close()

@user_router.route("/psychologists", methods=['GET'])
@require_auth
@api_error_boundary(detail='Failed to retrieve psychologists', error='{error}')
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
    finally:
        db.close()

@user_router.route("/patients/<int:patient_id>", methods=['GET'])
@require_auth
@api_error_boundary(detail='Failed to retrieve patient (DEBUG)', error='{error}')
def get_patient_by_id(current_user, patient_id):
    """
    DEBUG API: Retrieves a single patient by their ID.
    (Note: This route is unusual in a 'users' blueprint and likely for testing.)
    """
    db = next(get_db())
    try:
        access_error = patient_access_error(db, current_user, patient_id)
        if access_error:
            return jsonify(detail=access_error), 403
        db_patient = db.query(PatientModel).filter(PatientModel.id == patient_id).first()
        if db_patient is None:
            return jsonify({"detail": "Patient not found"}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        return jsonify(PatientSchema.from_orm(db_patient).dict()), 200, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
