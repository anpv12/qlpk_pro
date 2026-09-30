"""user helpers split out by topic (account); re-exported by app.api.user."""

import logging
from flask import request, jsonify
from app.models.doctor import Doctor
from app.schemas.user import UserRead
from app.services.auth import get_password_hash
from app.services.access_sessions import revoke_account_sessions
from app.realtime.events import emit_catalog_changed
from app.utils.upload_storage import normalize_upload_url
from app.utils.account_access import is_account_admin, forbidden_account_action

logger = logging.getLogger('app.api.user')


def _user_read_payload(user):
    payload = UserRead.model_validate(user).model_dump()
    payload['avatar'] = normalize_upload_url(payload.get('avatar'))
    return payload


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
