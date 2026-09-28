import json
from functools import wraps

from flask import jsonify

from app.core.database import get_db
from app.models.user import User
from app.utils.clinical_access import user_role_value


def is_account_admin(user):
    return user_role_value(user) == 'admin'


def permission_set(raw):
    try:
        values = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return None
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        return None
    return set(values)


def account_permissions(user):
    permissions = set()
    for membership in user.groups:
        if membership.group is not None:
            permissions.update(permission_set(membership.group.permissions) or set())
    return permissions


def forbidden_account_action():
    return jsonify(detail='Bạn không có quyền thực hiện thao tác quản trị này.'), 403


def require_account_permission(*permissions):
    def decorate(handler):
        @wraps(handler)
        def authorized(user, *args, **kwargs):
            db = next(get_db())
            try:
                actor = db.query(User).filter(User.id == user.id, User.is_active.is_(True)).first()
                if not actor or actor.is_active is not True:
                    return forbidden_account_action()
                if not is_account_admin(actor) and not account_permissions(actor).intersection(permissions):
                    return forbidden_account_action()
                return handler(actor, *args, **kwargs)
            finally:
                db.close()
        return authorized
    return decorate


def can_manage_account(actor, target):
    if is_account_admin(actor):
        return True
    return not is_account_admin(target) and account_permissions(target).issubset(account_permissions(actor))


def can_delegate_group(actor, group):
    permissions = permission_set(group.permissions)
    if is_account_admin(actor):
        return True
    return permissions is not None and permissions.issubset(account_permissions(actor))
