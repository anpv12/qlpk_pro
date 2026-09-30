from app.models.notification import Notification
from app.models.user import User
from app.core.config import settings
from app.services.notification_service_helpers import (  # noqa: F401 — giữ tên cũ trên module này
    IN_APP_NOTIFICATION_TYPE,
    READ_STATUS,
    ROLE_ALIASES,
    UNREAD_STATUS,
    _now,
    logger,
    normalize_role,
)
from app.services.notification_service_workflows import NotificationWorkflowMixin

class NotificationService(NotificationWorkflowMixin):
    def __init__(self):
        # Cấu hình email từ settings
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.sender_email = settings.SENDER_EMAIL
        self.sender_password = settings.SENDER_PASSWORD
        
        # SMS đã được bỏ khỏi hệ thống
        self.stringee_sms = None
        logger.info("SMS notifications removed from system")

    def serialize_notification(self, notification: Notification) -> dict:
        appointment = notification.appointment
        patient = notification.patient or (appointment.patient if appointment else None)
        appointment_date = appointment.appointment_date if appointment else None
        return {
            'id': notification.id,
            'notification_type': notification.notification_type,
            'event_type': notification.event_type,
            'title': notification.title or 'Thông báo',
            'message': notification.message or '',
            'status': notification.status,
            'is_read': bool(notification.read_at) or notification.status == READ_STATUS,
            'read_at': notification.read_at.isoformat() if notification.read_at else None,
            'created_at': notification.created_at.isoformat() if notification.created_at else None,
            'appointment_date': appointment_date.isoformat() if appointment_date else None,
            'appointment_id': notification.appointment_id,
            'examination_id': (notification.payload or {}).get('examination_id'),
            'patient_id': notification.patient_id,
            'patient_name': getattr(patient, 'full_name', None),
            'recipient_user_id': notification.recipient_user_id,
            'recipient_role': notification.recipient_role,
            'action_url': notification.action_url,
            'payload': notification.payload or {},
        }

    def query_user_notifications(self, db, user, unread_only=False):
        query = db.query(Notification).filter(Notification.notification_type == IN_APP_NOTIFICATION_TYPE)
        visible_roles = [normalize_role(user.role)]
        if normalize_role(user.role) == 'admin':
            visible_roles.extend(['staff', 'doctor', 'psychologist'])

        role_filters = list(dict.fromkeys(filter(None, visible_roles)))
        query = query.filter(
            (Notification.recipient_user_id == user.id)
            | (Notification.recipient_user_id.is_(None) & Notification.recipient_role.in_(role_filters))
        )
        if unread_only:
            query = query.filter(Notification.read_at.is_(None), Notification.status == UNREAD_STATUS)
        return query

    def count_unread_for_user(self, db, user) -> int:
        return self.query_user_notifications(db, user, unread_only=True).count()

    def list_user_notifications(self, db, user, limit=20, unread_only=False):
        try:
            safe_limit = int(limit or 20)
        except (TypeError, ValueError):
            safe_limit = 20
        safe_limit = max(1, min(safe_limit, 100))
        rows = self.query_user_notifications(db, user, unread_only=unread_only) \
            .order_by(Notification.created_at.desc(), Notification.id.desc()) \
            .limit(safe_limit) \
            .all()
        return [self.serialize_notification(row) for row in rows]

    def mark_notification_read(self, db, user, notification_id):
        notification = self.query_user_notifications(db, user, unread_only=False) \
            .filter(Notification.id == notification_id) \
            .first()
        if not notification:
            return None
        if not notification.read_at:
            notification.read_at = _now()
        notification.status = READ_STATUS
        db.flush()
        return notification

    def mark_all_read(self, db, user):
        rows = self.query_user_notifications(db, user, unread_only=True).all()
        now = _now()
        for notification in rows:
            notification.read_at = now
            notification.status = READ_STATUS
        db.flush()
        return len(rows)

    def create_in_app_notification(
        self,
        db,
        *,
        appointment,
        recipient_user_id=None,
        recipient_role=None,
        event_type,
        title,
        message,
        action_url,
        payload=None,
    ):
        if not appointment or not appointment.patient_id:
            return None
        notification = Notification(
            appointment_id=appointment.id,
            patient_id=appointment.patient_id,
            recipient_user_id=recipient_user_id,
            recipient_role=normalize_role(recipient_role) if recipient_role else None,
            notification_type=IN_APP_NOTIFICATION_TYPE,
            event_type=event_type,
            title=title,
            message=message,
            scheduled_time=_now(),
            sent_time=_now(),
            status=UNREAD_STATUS,
            action_url=action_url,
            payload=payload or {},
        )
        db.add(notification)
        db.flush()
        return notification

    def _active_users_by_role(self, db, role):
        normalized = normalize_role(role)
        users = db.query(User).filter(User.is_active.is_(True)).all()
        return [user for user in users if normalize_role(user.role) == normalized]

    def _has_dedupe_key(self, db, *, appointment_id, recipient_user_id, event_type, dedupe_key):
        """Avoid replaying the same workflow notification after a retry."""
        if not dedupe_key or not recipient_user_id:
            return False
        rows = db.query(Notification).filter(
            Notification.appointment_id == appointment_id,
            Notification.recipient_user_id == recipient_user_id,
            Notification.event_type == event_type,
        ).all()
        return any((row.payload or {}).get('dedupe_key') == dedupe_key for row in rows)

    @staticmethod
    def _performer_action_url(performer, appointment_id, order_id=None):
        role = normalize_role(getattr(performer, 'role', None))
        page = '/psychologist-examination.html' if role == 'psychologist' else '/doctor-examination.html'
        query = f'?appointment_id={appointment_id}'
        if order_id:
            query += f'&order_id={order_id}'
        return f'{page}{query}'

    def create_clinical_order_assignment_notifications(
        self,
        db,
        appointment,
        assignments,
        actor_user=None,
    ):
        """Create one inbox notification for each newly assigned performer.

        ``assignments`` is a list of ``{'order': ChiDinh, 'kind': 'created'|
        'assigned'|'reassigned'}`` entries prepared by the order mutation route.  The
        route remains the source of truth for what changed; this service only
        validates the recipient and builds the notification payload.
        """
        if not appointment:
            return []

        patient_name = appointment.patient.full_name if appointment.patient else 'Bệnh nhân'
        notifications = []
        for assignment in assignments or []:
            order = assignment.get('order') if isinstance(assignment, dict) else None
            kind = assignment.get('kind', 'created') if isinstance(assignment, dict) else 'created'
            if not order or not order.id:
                continue
            if getattr(order, 'location_type', None) != 'in' or not getattr(order, 'in_house_unit_id', None):
                continue

            performer = db.query(User).filter(
                User.id == order.in_house_unit_id,
                User.is_active.is_(True),
            ).first()
            if not performer or normalize_role(getattr(performer, 'role', None)) not in ('doctor', 'psychologist'):
                continue

            event_type = 'clinical_order_reassigned' if kind == 'reassigned' else 'clinical_order_assigned'
            timestamp = getattr(order, 'updated_at', None) or getattr(order, 'created_at', None)
            timestamp_value = timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp or '')
            dedupe_key = f'{event_type}:{order.id}:{performer.id}:{timestamp_value}'
            if self._has_dedupe_key(
                db,
                appointment_id=appointment.id,
                recipient_user_id=performer.id,
                event_type=event_type,
                dedupe_key=dedupe_key,
            ):
                continue

            order_name = getattr(order, 'order_name', None) or 'chỉ định CLS'
            title = 'Có chỉ định CLS mới' if kind != 'reassigned' else 'Chỉ định CLS được giao lại'
            message = f'{patient_name} có {order_name} cần bạn thực hiện.'
            notification = self.create_in_app_notification(
                db,
                appointment=appointment,
                recipient_user_id=performer.id,
                event_type=event_type,
                title=title,
                message=message,
                action_url=self._performer_action_url(performer, appointment.id, order.id),
                payload={
                    'appointment_id': appointment.id,
                    'order_id': order.id,
                    'patient_id': appointment.patient_id,
                    'patient_name': patient_name,
                    'performer_id': performer.id,
                    'assignment_kind': kind,
                    'actor_user_id': getattr(actor_user, 'id', None),
                    'dedupe_key': dedupe_key,
                },
            )
            if notification:
                notifications.append(notification)
        return notifications
