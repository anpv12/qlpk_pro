from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.api.auth import require_auth
from app.models.user_shortcut import UserShortcut
from app.models.user import UserRole
from app.realtime.events import emit_catalog_changed
from app.utils.api_error_contract import api_error_boundary

shortcut_router = Blueprint('user_shortcuts', __name__, url_prefix='/api/user-shortcuts')


ALLOWED_TARGET_URLS = {
    '/index.html',
    '/receptionist-new.html',
    '/appointment-management.html',
    '/doctor-examination.html',
    '/psychologist-examination.html',
    '/payment-waiting.html',
    '/order-management.html',
    '/medicine-management.html',
    '/medicine-statistics',
    '/service-management.html',
    '/package-management.html',
    '/user-management.html',
    '/permission-management.html',
    '/group-management.html',
    '/icd-management.html',
    '/holiday-management.html',
    '/doctor-busy-schedule.html',
    '/survey-template-management.html',
    '/chi-tieu',
    '/shortcut-settings.html'
}


def _is_admin(user) -> bool:
    role = getattr(user, 'role', None)
    return str(role) in {str(UserRole.ADMIN), 'admin', 'UserRole.ADMIN'}


def _normalize_combo(combo_key: str) -> str:
    if not combo_key:
        return ''
    parts = [p.strip() for p in str(combo_key).split('+') if p.strip()]
    modifiers = []
    key = ''
    for p in parts:
        low = p.lower()
        if low in ('ctrl', 'control', 'controlormeta', 'meta', 'cmd', 'command'):
            if 'Ctrl' not in modifiers:
                modifiers.append('Ctrl')
        elif low == 'alt':
            if 'Alt' not in modifiers:
                modifiers.append('Alt')
        elif low == 'shift':
            if 'Shift' not in modifiers:
                modifiers.append('Shift')
        else:
            key = p.upper()
    if not key:
        return '+'.join(modifiers)
    return '+'.join(modifiers + [key])


def _validate_target_url(url: str) -> bool:
    return bool(url and url in ALLOWED_TARGET_URLS)


def _validate_combo(combo_key: str) -> bool:
    if not combo_key:
        return False
    parts = combo_key.split('+')
    return len(parts) >= 2


def _row_json(r):
    return {
        'id': r.id,
        'scope': r.scope,
        'user_id': r.user_id,
        'combo_key': r.combo_key,
        'target_url': r.target_url,
        'is_active': bool(r.is_active)
    }

def _emit_shortcut_changed(action: str, row=None, shortcut_id=None, extra=None):
    payload = {
        'scope': getattr(row, 'scope', None),
        'user_id': getattr(row, 'user_id', None),
        'target_url': getattr(row, 'target_url', None),
    }
    if extra:
        payload.update(extra)

    rooms = ['page:shortcut-settings', 'workflow:personal']
    if payload.get('scope') == 'global':
        rooms.append('global')
    if payload.get('user_id'):
        rooms.append(f"user:{payload['user_id']}")

    emit_catalog_changed(
        action,
        entity='user_shortcut',
        entity_id=shortcut_id or getattr(row, 'id', None),
        extra=payload,
        rooms=rooms,
    )


@shortcut_router.route('/routes', methods=['GET'])
@require_auth
def list_allowed_routes(user):
    return jsonify(sorted(list(ALLOWED_TARGET_URLS))), 200


@shortcut_router.route('', methods=['GET'])
@require_auth
def list_shortcuts(user):
    db = next(get_db())
    try:
        # trả về merged shortcuts cho runtime: user override > global
        global_rows = db.query(UserShortcut).filter(
            UserShortcut.scope == 'global',
            UserShortcut.is_active == True
        ).all()
        user_rows = db.query(UserShortcut).filter(
            UserShortcut.scope == 'user',
            UserShortcut.user_id == user.id,
            UserShortcut.is_active == True
        ).all()

        merged = {}
        for r in global_rows:
            merged[r.combo_key] = _row_json(r)
        for r in user_rows:
            merged[r.combo_key] = _row_json(r)

        return jsonify(list(merged.values())), 200
    finally:
        db.close()


@shortcut_router.route('/mine', methods=['GET'])
@require_auth
def list_my_shortcuts(user):
    db = next(get_db())
    try:
        rows = db.query(UserShortcut).filter(
            UserShortcut.scope == 'user',
            UserShortcut.user_id == user.id
        ).order_by(UserShortcut.combo_key.asc()).all()
        return jsonify([_row_json(r) for r in rows]), 200
    finally:
        db.close()


@shortcut_router.route('/global', methods=['GET'])
@require_auth
def list_global_shortcuts(user):
    if not _is_admin(user):
        return jsonify({'detail': 'Bạn không có quyền'}), 403
    db = next(get_db())
    try:
        rows = db.query(UserShortcut).filter(UserShortcut.scope == 'global').order_by(UserShortcut.combo_key.asc()).all()
        return jsonify([_row_json(r) for r in rows]), 200
    finally:
        db.close()


def _create_shortcut(db, scope: str, owner_user_id, data):
    combo_key = _normalize_combo(data.get('combo_key', ''))
    target_url = (data.get('target_url') or '').strip()

    if not combo_key:
        return None, ({'detail': 'combo_key là bắt buộc'}, 400)
    if not _validate_combo(combo_key):
        return None, ({'detail': 'combo_key không hợp lệ hoặc xung đột với phím hệ thống/trình duyệt'}, 400)
    if not _validate_target_url(target_url):
        return None, ({'detail': 'target_url không hợp lệ (phải là URL trong hệ thống)'}, 400)

    existed = db.query(UserShortcut).filter(
        UserShortcut.scope == scope,
        UserShortcut.user_id == owner_user_id,
        UserShortcut.combo_key == combo_key
    ).first()
    if existed:
        return None, ({'detail': 'Tổ hợp phím đã tồn tại trong phạm vi này'}, 409)

    row = UserShortcut(
        scope=scope,
        user_id=owner_user_id,
        combo_key=combo_key,
        target_url=target_url,
        is_active=bool(data.get('is_active', True))
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, None


@shortcut_router.route('/mine', methods=['POST'])
@require_auth
@api_error_boundary(detail='Không thể tạo phím tắt', error='{error}')
def create_my_shortcut(user):
    db = next(get_db())
    try:
        data = request.get_json() or {}
        row, err = _create_shortcut(db, 'user', user.id, data)
        if err:
            payload, code = err
            return jsonify(payload), code
        _emit_shortcut_changed('user_shortcut_created', row)
        return jsonify(_row_json(row)), 201
    finally:
        db.close()


@shortcut_router.route('/global', methods=['POST'])
@require_auth
@api_error_boundary(detail='Không thể tạo phím tắt global', error='{error}')
def create_global_shortcut(user):
    if not _is_admin(user):
        return jsonify({'detail': 'Bạn không có quyền'}), 403
    db = next(get_db())
    try:
        data = request.get_json() or {}
        row, err = _create_shortcut(db, 'global', None, data)
        if err:
            payload, code = err
            return jsonify(payload), code
        _emit_shortcut_changed('user_shortcut_created', row)
        return jsonify(_row_json(row)), 201
    finally:
        db.close()


@shortcut_router.route('/all-users', methods=['GET'])
@require_auth
def list_all_user_shortcuts(user):
    if not _is_admin(user):
        return jsonify({'detail': 'Bạn không có quyền'}), 403
    db = next(get_db())
    try:
        rows = db.query(UserShortcut).filter(UserShortcut.scope == 'user').order_by(UserShortcut.user_id.asc(), UserShortcut.combo_key.asc()).all()
        return jsonify([_row_json(r) for r in rows]), 200
    finally:
        db.close()


@shortcut_router.route('/user/<int:target_user_id>', methods=['GET'])
@require_auth
def list_shortcuts_by_user(user, target_user_id):
    if not _is_admin(user):
        return jsonify({'detail': 'Bạn không có quyền'}), 403
    db = next(get_db())
    try:
        rows = db.query(UserShortcut).filter(
            UserShortcut.scope == 'user',
            UserShortcut.user_id == target_user_id
        ).order_by(UserShortcut.combo_key.asc()).all()
        return jsonify([_row_json(r) for r in rows]), 200
    finally:
        db.close()


@shortcut_router.route('/user/<int:target_user_id>', methods=['POST'])
@require_auth
@api_error_boundary(detail='Không thể tạo phím tắt cho user', error='{error}')
def create_shortcut_for_user(user, target_user_id):
    if not _is_admin(user):
        return jsonify({'detail': 'Bạn không có quyền'}), 403
    db = next(get_db())
    try:
        data = request.get_json() or {}
        row, err = _create_shortcut(db, 'user', target_user_id, data)
        if err:
            payload, code = err
            return jsonify(payload), code
        _emit_shortcut_changed('user_shortcut_created', row)
        return jsonify(_row_json(row)), 201
    finally:
        db.close()


def _resolve_shortcut_target(data, is_admin, row, user):
    # Cho phép admin đổi scope/owner khi edit
    target_scope = row.scope
    target_user_id = row.user_id
    if is_admin:
        incoming_scope = (data.get('scope') or row.scope or 'user').strip().lower()
        if incoming_scope not in ('user', 'global'):
            return (jsonify({'detail': 'scope không hợp lệ'}), 400), None, None
        target_scope = incoming_scope
        if target_scope == 'global':
            target_user_id = None
        else:
            incoming_user_id = data.get('user_id', row.user_id)
            if incoming_user_id is None:
                return (jsonify({'detail': 'user_id là bắt buộc khi scope=user'}), 400), None, None
            try:
                target_user_id = int(incoming_user_id)
            except (TypeError, ValueError):
                return (jsonify({'detail': 'user_id không hợp lệ'}), 400), None, None
    else:
        target_scope = 'user'
        target_user_id = user.id
    return None, target_scope, target_user_id


@shortcut_router.route('/<int:shortcut_id>', methods=['PUT'])
@require_auth
@api_error_boundary(detail='Không thể cập nhật phím tắt', error='{error}')
def update_shortcut(user, shortcut_id):
    db = next(get_db())
    try:
        row = db.query(UserShortcut).filter(UserShortcut.id == shortcut_id).first()
        if not row:
            return jsonify({'detail': 'Không tìm thấy phím tắt'}), 404

        is_admin = _is_admin(user)
        if row.scope == 'global' and not is_admin:
            return jsonify({'detail': 'Bạn không có quyền'}), 403
        if row.scope == 'user' and row.user_id != user.id and not is_admin:
            return jsonify({'detail': 'Bạn không có quyền'}), 403

        data = request.get_json() or {}

        error_response, target_scope, target_user_id = _resolve_shortcut_target(data, is_admin, row, user)
        if error_response is not None:
            return error_response

        next_combo = row.combo_key
        if 'combo_key' in data:
            combo_key = _normalize_combo(data.get('combo_key', ''))
            if not combo_key or not _validate_combo(combo_key):
                return jsonify({'detail': 'combo_key không hợp lệ'}), 400
            next_combo = combo_key

        existed = db.query(UserShortcut).filter(
            UserShortcut.scope == target_scope,
            UserShortcut.user_id == target_user_id,
            UserShortcut.combo_key == next_combo,
            UserShortcut.id != row.id
        ).first()
        if existed:
            return jsonify({'detail': 'Tổ hợp phím đã tồn tại trong phạm vi này'}), 409

        row.scope = target_scope
        row.user_id = target_user_id
        row.combo_key = next_combo

        if 'target_url' in data:
            target_url = (data.get('target_url') or '').strip()
            if not _validate_target_url(target_url):
                return jsonify({'detail': 'target_url không hợp lệ (phải là URL trong hệ thống)'}), 400
            row.target_url = target_url

        if 'is_active' in data:
            row.is_active = bool(data.get('is_active'))

        db.commit()
        db.refresh(row)
        _emit_shortcut_changed('user_shortcut_updated', row)
        return jsonify(_row_json(row)), 200
    finally:
        db.close()


@shortcut_router.route('/<int:shortcut_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Không thể xóa phím tắt', error='{error}')
def delete_shortcut(user, shortcut_id):
    db = next(get_db())
    try:
        row = db.query(UserShortcut).filter(UserShortcut.id == shortcut_id).first()
        if not row:
            return jsonify({'detail': 'Không tìm thấy phím tắt'}), 404

        if row.scope == 'global' and not _is_admin(user):
            return jsonify({'detail': 'Bạn không có quyền'}), 403
        if row.scope == 'user' and row.user_id != user.id and not _is_admin(user):
            return jsonify({'detail': 'Bạn không có quyền'}), 403

        deleted_meta = _row_json(row)
        db.delete(row)
        db.commit()
        _emit_shortcut_changed(
            'user_shortcut_deleted',
            shortcut_id=shortcut_id,
            extra={
                'scope': deleted_meta.get('scope'),
                'user_id': deleted_meta.get('user_id'),
                'target_url': deleted_meta.get('target_url'),
            },
        )
        return jsonify({'detail': 'Đã xóa phím tắt'}), 200
    finally:
        db.close()
