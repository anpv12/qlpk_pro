"""Constants and helpers shared by NotificationService and its workflow mixin."""

from datetime import datetime, timezone

import logging

logger = logging.getLogger(__name__)

IN_APP_NOTIFICATION_TYPE = 'in_app'
UNREAD_STATUS = 'unread'
READ_STATUS = 'read'

ROLE_ALIASES = {
    'receptionist': 'staff',
    'staff': 'staff',
    'doctor': 'doctor',
    'psychologist': 'psychologist',
    'admin': 'admin',
    'userrole.staff': 'staff',
    'userrole.doctor': 'doctor',
    'userrole.psychologist': 'psychologist',
    'userrole.admin': 'admin',
}


def normalize_role(role) -> str:
    value = getattr(role, 'value', role) or ''
    normalized = str(value).strip().lower()
    return ROLE_ALIASES.get(normalized, normalized.replace('userrole.', ''))


def _now():
    return datetime.now(timezone.utc)
