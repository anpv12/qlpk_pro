"""Shared Socket.IO server for QLPK realtime updates."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable
from uuid import uuid4

from flask import request, session
from flask_socketio import SocketIO, disconnect, emit, join_room

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.realtime.presence import mark_connected, mark_disconnected
from app.services.auth import decode_access_token

logger = logging.getLogger(__name__)


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
    auth_payload = auth_payload or {}
    token = auth_payload.get("token") or auth_payload.get("access_token") or ""
    if not token:
        token = request.args.get("token") or ""
    token = str(token).strip()
    if token.lower().startswith("bearer "):
        token = token.split(" ", 1)[1].strip()
    return token


def _load_socket_user(token: str):
    if not token:
        return None
    username = decode_access_token(token)
    if not username:
        return None

    db = next(get_db())
    try:
        return db.query(User).filter(User.username == username).first()
    finally:
        db.close()


def _join_base_rooms(user) -> list[str]:
    role = normalize_role(getattr(user, "role", ""))
    rooms = ["global", f"user:{user.id}"]
    if role:
        rooms.append(f"role:{role}")
    if role == "admin":
        rooms.extend(["role:staff", "role:doctor", "role:psychologist"])

    for room in rooms:
        join_room(room)
    return rooms


def handle_connect(auth=None):
    user = _load_socket_user(_extract_token(auth))
    if not user:
        logger.info("Realtime socket rejected: invalid token")
        return False

    role = normalize_role(user.role)
    session["realtime_user_id"] = user.id
    session["realtime_role"] = role
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
    payload = payload or {}
    rooms = []
    for room in payload.get("rooms") or []:
        room = str(room or "").strip()
        if not room.startswith(("page:", "workflow:", "entity:")):
            continue
        join_room(room)
        rooms.append(room)
    emit("qlpk:subscribed", {"rooms": rooms})


def handle_disconnect():
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

    for room in target_rooms:
        try:
            socketio.emit("qlpk:event", envelope, room=room)
        except Exception:
            logger.exception("Failed to emit realtime event %s to %s", event_type, room)


def disconnect_current_client() -> None:
    disconnect()
