"""In-process realtime presence tracker.

Gunicorn is configured with a single eventlet worker for Socket.IO, so an
in-memory counter is enough for the current deployment shape. If the app is
scaled to multiple workers, move this state to Redis alongside the Socket.IO
message queue.
"""

from __future__ import annotations

from threading import Lock

_lock = Lock()
_user_connection_counts: dict[int, int] = {}


def mark_connected(user_id: int | None) -> None:
    if not user_id:
        return
    with _lock:
        _user_connection_counts[user_id] = _user_connection_counts.get(user_id, 0) + 1


def mark_disconnected(user_id: int | None) -> None:
    if not user_id:
        return
    with _lock:
        current = _user_connection_counts.get(user_id, 0)
        if current <= 1:
            _user_connection_counts.pop(user_id, None)
        else:
            _user_connection_counts[user_id] = current - 1


def get_online_user_ids() -> set[int]:
    with _lock:
        return set(_user_connection_counts.keys())
