from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.user import UserGroup, User # Ensure User model is imported for validation
from app.models.group import Group
from app.schemas.user import UserGroupCreate
from app.realtime.events import emit_catalog_changed
from app.api.auth import require_auth
from app.utils.account_access import (
    require_account_permission, can_manage_account, can_delegate_group,
    forbidden_account_action,
)

import logging

logger = logging.getLogger(__name__)

router = Blueprint('user_group', __name__, url_prefix='/user-groups')

# Lấy danh sách nhóm quyền của user
@router.route('/<int:user_id>', methods=['GET'])
@require_auth
@require_account_permission('ql-phanquyen')
def get_user_groups(current_user, user_id):
    db = next(get_db())
    try:
        # Check if the user exists
        user_exists = db.query(User).filter(User.id == user_id).first()
        if not user_exists:
            return jsonify({'detail': 'User not found!'}), 404

        user_groups = db.query(UserGroup).filter(UserGroup.user_id == user_id).all()
        result = []
        for ug in user_groups:
            group = db.query(Group).filter(Group.id == ug.group_id).first()
            result.append({
                'id': ug.id,
                'user_id': ug.user_id,
                'group_id': ug.group_id,
                'group_code': group.code if group else '',
                'group_name': group.name if group else ''
            })
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in get_user_groups: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:    
        db.close()

# Gán nhóm quyền cho user (thêm mới)
@router.route('/', methods=['POST'])
@require_auth
@require_account_permission('ql-phanquyen')
def add_user_group(current_user):
    db = next(get_db())
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify(detail='Dữ liệu phân quyền không hợp lệ.'), 400
        user_id = data.get('user_id')
        group_id = data.get('group_id')

        # Basic validation for presence of user_id and group_id
        if not user_id or not group_id:
            return jsonify({'detail': 'user_id and group_id are required!'}), 400

        # Check if user and group actually exist
        user_exists = db.query(User).filter(User.id == user_id).first()
        group_exists = db.query(Group).filter(Group.id == group_id).first()

        if not user_exists:
            return jsonify({'detail': 'User not found!'}), 404
        if not group_exists:
            return jsonify({'detail': 'Group not found!'}), 404
        if not can_manage_account(current_user, user_exists) or not can_delegate_group(current_user, group_exists):
            return forbidden_account_action()

        # Check for existing assignment
        if db.query(UserGroup).filter_by(user_id=user_id, group_id=group_id).first():
            return jsonify({'detail': 'User đã có nhóm quyền này!'}), 400
        
        ug = UserGroup(user_id=user_id, group_id=group_id)
        db.add(ug)
        db.commit()
        db.refresh(ug)
        emit_catalog_changed('user_group_added', entity='user_group', entity_id=ug.id, extra={
            'user_id': user_id,
            'group_id': group_id,
        })
        
        return jsonify({'id': ug.id, 'user_id': ug.user_id, 'group_id': ug.group_id})
    except Exception as e:
        db.rollback() # Rollback on error
        logger.error(f"Error in add_user_group: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()

# Xoá nhóm quyền khỏi user
@router.route('/<int:user_group_id>', methods=['DELETE'])
@require_auth
@require_account_permission('ql-phanquyen')
def delete_user_group(current_user, user_group_id):
    db = next(get_db())
    try:
        ug = db.query(UserGroup).filter(UserGroup.id == user_group_id).first()
        if not ug:
            return jsonify({'detail': 'Không tìm thấy user_group!'}), 404
        target = db.query(User).filter(User.id == ug.user_id).first()
        group = db.query(Group).filter(Group.id == ug.group_id).first()
        if not target or not group or not can_manage_account(current_user, target) or not can_delegate_group(current_user, group):
            return forbidden_account_action()
        
        user_id = ug.user_id
        group_id = ug.group_id
        db.delete(ug)
        db.commit()
        emit_catalog_changed('user_group_deleted', entity='user_group', entity_id=user_group_id, extra={
            'user_id': user_id,
            'group_id': group_id,
        })
        
        return jsonify({'detail': 'Đã xoá nhóm quyền khỏi user!'})
    except Exception as e:
        db.rollback() # Rollback on error
        logger.error(f"Error in delete_user_group: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()

# Cập nhật nhóm quyền cho user (ghi đè toàn bộ)
@router.route('/<int:user_id>', methods=['POST'])
@require_auth
@require_account_permission('ql-phanquyen')
def update_user_groups(current_user, user_id):
    db = next(get_db())
    try:
        data = request.get_json()
        if not isinstance(data, dict) or not isinstance(data.get('group_ids'), list):
            return jsonify(detail='Danh sách nhóm quyền không hợp lệ.'), 400
        group_ids = data['group_ids']
        if any(
            not (type(group_id) is int or isinstance(group_id, str) and group_id.isascii() and group_id.isdecimal())
            or int(group_id) <= 0 for group_id in group_ids
        ):
            return jsonify(detail='Mã nhóm quyền không hợp lệ.'), 400
        group_ids = list(dict.fromkeys(int(group_id) for group_id in group_ids))

        # Check if the user exists
        user_exists = db.query(User).filter(User.id == user_id).first()
        if not user_exists:
            return jsonify({'detail': 'User not found!'}), 404
        if not can_manage_account(current_user, user_exists):
            return forbidden_account_action()
        for group_id in group_ids:
            group = db.query(Group).filter(Group.id == group_id).first()
            if not group:
                return jsonify(detail='Không tìm thấy nhóm quyền.'), 404
            if not can_delegate_group(current_user, group):
                return forbidden_account_action()

        # Delete all existing user groups for this user
        db.query(UserGroup).filter_by(user_id=user_id).delete()
        
        # Add new groups
        for gid in group_ids:
            db.add(UserGroup(user_id=user_id, group_id=gid))
        
        db.commit() # Commit all changes at once after the loop
        emit_catalog_changed('user_groups_updated', entity='user_group', extra={
            'user_id': user_id,
            'group_ids': group_ids,
        })
        
        return jsonify({'message': 'OK'}) 
    except Exception as e:
        db.rollback() # Rollback on error
        logger.error(f"Error in update_user_groups: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()
