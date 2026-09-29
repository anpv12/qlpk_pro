"""Constants and helpers shared by NotificationService and its workflow mixin."""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from app.core.database import get_db
from app.models.notification import Notification
from app.models.appointment import Appointment
from app.models.chi_dinh import ChiDinh
from app.models.examination import Examination
from app.models.user import User
from app.core.config import settings
from app.realtime.events import emit_notification_changed

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
