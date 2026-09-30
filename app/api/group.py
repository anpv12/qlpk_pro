from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.group import Group
from app.models.user import UserGroup
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.utils.account_access import (
    require_account_permission, can_delegate_group, permission_set,
    forbidden_account_action,
)
from types import SimpleNamespace
import json
from app.utils.api_error_contract import api_error_boundary

router = Blueprint('group', __name__, url_prefix='/groups')

# Lấy danh sách nhóm quyền
@router.route('/', methods=['GET'])
@require_auth
@require_account_permission('ql-nhomquyen', 'ql-phanquyen')
def list_groups(user):
    db = next(get_db())
    try:
        groups = db.query(Group).all()
        result = []
        for g in groups:
            perms = json.loads(g.permissions) if g.permissions else []
            result.append({
                'id': g.id,
                'code': g.code,
                'name': g.name,
                'desc': g.desc,
                'permissions': perms
            })
        return jsonify(result)
    finally:
        db.close()

# Tạo mới nhóm quyền
@router.route('/', methods=['POST'])
@require_auth
@require_account_permission('ql-nhomquyen')
def create_group(user):
    db = next(get_db())
    try:
        data = request.get_json()
        if not isinstance(data, dict) or not isinstance(data.get('permissions', []), list) or permission_set(data.get('permissions', [])) is None:
            return jsonify(detail='Danh sách quyền không hợp lệ.'), 400
        if not can_delegate_group(user, SimpleNamespace(permissions=data.get('permissions', []))):
            return forbidden_account_action()
        if db.query(Group).filter(Group.code == data.get('code')).first():
            return jsonify({'detail': 'Mã nhóm quyền đã tồn tại!'}), 400
        
        group = Group(
            code=data.get('code'),
            name=data.get('name'),
            desc=data.get('desc'),
            permissions=json.dumps(data.get('permissions', []))
        )
        db.add(group)
        db.commit()
        db.refresh(group)
        emit_catalog_changed('group_created', entity='group', entity_id=group.id)
        
        return jsonify({
            'id': group.id,
            'code': group.code,
            'name': group.name,
            'desc': group.desc,
            'permissions': json.loads(group.permissions)
        })
    finally:
        db.close()

# Lấy chi tiết nhóm quyền
@router.route('/<int:group_id>', methods=['GET'])
@require_auth
@require_account_permission('ql-nhomquyen', 'ql-phanquyen')
def get_group(user, group_id):
    db = next(get_db())
    try:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            return jsonify({'detail': 'Không tìm thấy nhóm quyền!'}), 404
        
        return jsonify({
            'id': group.id,
            'code': group.code,
            'name': group.name,
            'desc': group.desc,
            'permissions': json.loads(group.permissions) if group.permissions else []
        })
    finally:
        db.close()

# Cập nhật nhóm quyền
@router.route('/<int:group_id>', methods=['PUT'])
@require_auth
@require_account_permission('ql-nhomquyen')
def update_group(user, group_id):
    db = next(get_db())
    try:
        data = request.get_json()
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            return jsonify({'detail': 'Không tìm thấy nhóm quyền!'}), 404
        if not isinstance(data, dict):
            return jsonify(detail='Danh sách quyền không hợp lệ.'), 400
        permissions = data.get('permissions', json.loads(group.permissions) if group.permissions else [])
        if not isinstance(permissions, list) or permission_set(permissions) is None:
            return jsonify(detail='Danh sách quyền không hợp lệ.'), 400
        if not can_delegate_group(user, group) or not can_delegate_group(user, SimpleNamespace(permissions=permissions)):
            return forbidden_account_action()
        
        group.code = data.get('code', group.code)
        group.name = data.get('name', group.name)
        group.desc = data.get('desc', group.desc)
        group.permissions = json.dumps(permissions)
        
        db.commit()
        db.refresh(group)
        emit_catalog_changed('group_updated', entity='group', entity_id=group.id)
        
        return jsonify({
            'id': group.id,
            'code': group.code,
            'name': group.name,
            'desc': group.desc,
            'permissions': json.loads(group.permissions)
        })
    finally:
        db.close()


# Xoá nhóm quyền
@router.route('/<int:group_id>', methods=['DELETE'])
@require_auth
@require_account_permission('ql-nhomquyen')
@api_error_boundary(detail='Lỗi khi xóa nhóm quyền: {error}')
def delete_group(user, group_id):
    db = next(get_db())
    try:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            return jsonify({'detail': 'Không tìm thấy nhóm quyền!'}), 404
        if not can_delegate_group(user, group):
            return forbidden_account_action()
        
        # Xóa tất cả UserGroup records liên quan trước khi xóa Group
        # Điều này cần thiết vì group_id có NOT NULL constraint
        db.query(UserGroup).filter(UserGroup.group_id == group_id).delete()
        
        # Sau đó mới xóa Group
        db.delete(group)
        db.commit()
        emit_catalog_changed('group_deleted', entity='group', entity_id=group_id)
        
        return jsonify({'detail': 'Đã xoá nhóm quyền!'}) 
    finally:
        db.close()
