"""Shared Socket.IO server for QLPK realtime updates."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable
from uuid import uuid4

from flask import request, session
from flask_socketio import SocketIO, disconnect, emit, join_room, leave_room

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.realtime.presence import mark_connected, mark_disconnected
from app.services.auth import decode_access_token, token_matches_user
from app.services.access_sessions import SessionStoreUnavailable
from app.services.browser_sessions import browser_cookie_token, browser_session_request_allowed
from app.realtime.access import allowed_subscription_rooms
from app.realtime.delivery import can_receive_clinical_payload, is_clinical_event, project_payload

logger = logging.getLogger(__name__)
_client_tokens = {}


def _redis_message_queue() -> str | None:
    value = getattr(settings, "REALTIME_REDIS_URL", None)
    return value.strip() if isinstance(value, str) and value.strip() else None


socketio = SocketIO(
    async_mode="eventlet",
    cors_allowed_origins=settings.BACKEND_CORS_ORIGINS,
    message_queue=_redis_message_queue(),
    logger=False,
    engineio_logger=False,
    transports=["websocket"],
    ping_interval=25,
    ping_timeout=60,
)


def init_realtime(app):
	socketio.init_app(app)
	socketio.on_event("connect", handle_connect, namespace="/")
	socketio.on_event("qlpk:subscribe", handle_subscribe, namespace="/")
	socketio.on_event("disconnect", handle_disconnect, namespace="/")


def normalize_role(role) -> str:
    value = getattr(role, "value", role) or ""
    value = str(value).replace("UserRole.", "").lower()
    if value == "psychologist":
        return "psychologist"
    return value


def _extract_token(auth_payload=None) -> str:
    if auth_payload is not None and not isinstance(auth_payload, dict):
        return ''
    auth_payload = auth_payload or {}
    cookie = browser_cookie_token()
    if cookie:
        csrf = auth_payload.get('csrf_token', '')
        return cookie if browser_session_request_allowed(cookie, socket_csrf=csrf) else ''
    token = auth_payload.get("token") or auth_payload.get("access_token") or ""
    if not token:
        token = request.args.get("token") or ""
    if not isinstance(token, str):
        return ''
    token = token.strip()
    if token.lower().startswith("bearer "):
        token = token.split(" ", 1)[1].strip()
    return token if browser_session_request_allowed(token) else ''


def _load_socket_user(token: str, *, with_rooms=False):
    if not token:
        return None
    username = decode_access_token(token)
    if not username:
        return None

    db = next(get_db())
    try:
        user = db.query(User).filter(User.username == username).first()
        if not token_matches_user(token, user):
            return None
        if with_rooms:
            return user, allowed_subscription_rooms(user)
        return user
    finally:
        db.close()


def _join_base_rooms(user) -> list[str]:
    role = normalize_role(getattr(user, "role", ""))
    rooms = ["global", f"user:{user.id}"]
    if role:
        rooms.append(f"role:{role}")

    for room in rooms:
        join_room(room)
    return rooms


def handle_connect(auth=None):
    token = _extract_token(auth)
    try:
        user = _load_socket_user(token)
    except SessionStoreUnavailable:
        return False
    if not user:
        logger.info("Realtime socket rejected: invalid token")
        return False

    role = normalize_role(user.role)
    session["realtime_user_id"] = user.id
    session["realtime_role"] = role
    session["realtime_token"] = token
    session["realtime_subscriptions"] = []
    socket_id = getattr(request, 'sid', None)
    if socket_id:
        _client_tokens[socket_id] = token
    mark_connected(user.id)

    rooms = _join_base_rooms(user)
    emit("qlpk:connected", {
        "user_id": user.id,
        "role": role,
        "rooms": rooms,
    })
    emit_realtime_event(
        "presence.changed",
        {"action": "connected", "user_id": user.id, "role": role},
        rooms=["page:dashboard", "workflow:operations"],
    )


def handle_subscribe(payload=None):
    try:
        loaded = _load_socket_user(session.get('realtime_token', ''), with_rooms=True)
    except SessionStoreUnavailable:
        emit('qlpk:subscription_error', {'code': 'system.unavailable'})
        return
    if not loaded:
        disconnect_current_client()
        return
    user, allowed = loaded
    if user.id != session.get('realtime_user_id') or normalize_role(user.role) != session.get('realtime_role'):
        disconnect_current_client()
        return
    requested = payload.get('rooms') if isinstance(payload, dict) else None
    if not isinstance(requested, list) or len(requested) > 128 or any(not isinstance(room, str) for room in requested):
        emit('qlpk:subscription_error', {'code': 'INVALID_SUBSCRIPTION'})
        return
    rooms = sorted(set(requested).intersection(allowed))
    previous = set(session.get('realtime_subscriptions', []))
    for room in previous.difference(rooms):
        leave_room(room)
    for room in set(rooms).difference(previous):
        join_room(room)
    session['realtime_subscriptions'] = rooms
    emit('qlpk:subscribed', {'rooms': rooms})


def handle_disconnect():
    _client_tokens.pop(getattr(request, 'sid', None), None)
    user_id = session.get("realtime_user_id")
    role = session.get("realtime_role")
    mark_disconnected(user_id)
    emit_realtime_event(
        "presence.changed",
        {"action": "disconnected", "user_id": user_id, "role": role},
        rooms=["page:dashboard", "workflow:operations"],
    )
    return None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _deliver_realtime_event(candidates, envelope, event_type, payload, server, target_rooms):
    decisions = {}
    for socket_id in candidates:
        token = _client_tokens.get(socket_id)
        if not token:
            continue
        try:
            if token not in decisions:
                decisions[token] = _prepare_delivery(token, event_type, payload or {}, target_rooms)
            decision = decisions[token]
            if decision is None:
                _client_tokens.pop(socket_id, None)
                server.disconnect(socket_id, namespace='/')
            elif decision is not False:
                socketio.emit('qlpk:event', {**envelope, 'payload': decision}, room=socket_id)
        except Exception:
            logger.exception('Failed to authorize/deliver realtime event %s', event_type)


def emit_realtime_event(event_type: str, payload: dict | None = None, rooms: Iterable[str] | None = None) -> None:
    """Emit a domain event safely after database commit.

    Import this helper inside route handlers to avoid circular imports. The client
    receives a stable envelope on `qlpk:event` and can filter by `type`.
    """
    if not event_type:
        return

    envelope = {
        "event_id": uuid4().hex,
        "type": event_type,
        "payload": payload or {},
        "emitted_at": utc_now_iso(),
    }
    target_rooms = list(dict.fromkeys([room for room in (rooms or ["global"]) if room]))
    if not target_rooms:
        target_rooms = ["global"]

    server = socketio.server
    if server is None:
        return
    candidates = set()
    try:
        for room in target_rooms:
            candidates.update(socket_id for socket_id, _ in server.manager.get_participants('/', room))
    except Exception:
        logger.exception('Failed to resolve realtime recipients')
        return
    _deliver_realtime_event(candidates, envelope, event_type, payload, server, target_rooms)


def _prepare_delivery(token, event_type, payload, target_rooms):
    loaded = _load_socket_user(token, with_rooms=True)
    if not loaded:
        return None
    user, allowed = loaded
    role = normalize_role(user.role)
    allowed = allowed | {'global', f'user:{user.id}', f'role:{role}'}
    if not allowed.intersection(target_rooms):
        return False
    if event_type == 'notification.changed':
        if payload.get('user_id'):
            if payload['user_id'] != user.id:
                return False
        elif normalize_role(payload.get('role')) != role:
            return False
    if not is_clinical_event(event_type, payload):
        return project_payload(event_type, payload)
    db = next(get_db())
    try:
        clinical_allowed = can_receive_clinical_payload(db, user, payload)
        return project_payload(event_type, payload, clinical_allowed=clinical_allowed)
    finally:
        db.close()


def disconnect_current_client() -> None:
    disconnect()


def disconnect_user_clients(user_id=None) -> None:
    server = socketio.server
    if server is None:
        return
    room = f'user:{user_id}' if user_id is not None else None
    try:
        participants = list(server.manager.get_participants('/', room))
    except Exception:
        logger.exception('Failed to resolve connections for revocation')
        return
    for socket_id, _ in participants:
        try:
            server.disconnect(socket_id, namespace='/')
        except Exception:
            logger.exception('Failed to revoke realtime connection')


def disconnect_token_clients(token):
    server = socketio.server
    if server is None:
        return
    for socket_id, client_token in list(_client_tokens.items()):
        if client_token != token:
            continue
        _client_tokens.pop(socket_id, None)
        try:
            server.disconnect(socket_id, namespace='/')
        except Exception:
            logger.exception('Failed to disconnect revoked session')
