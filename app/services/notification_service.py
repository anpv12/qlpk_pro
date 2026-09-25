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

class NotificationService:
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

    def create_survey_completed_notifications(
        self,
        db,
        session,
        template_id=None,
        actor_user=None,
    ):
        """Notify the performer of the indication whose survey just completed."""
        if not session or not getattr(session, 'examination_id', None):
            return []

        examination = db.query(Examination).filter(
            Examination.id == session.examination_id
        ).first()
        appointment = db.query(Appointment).filter(
            Appointment.id == getattr(examination, 'appointment_id', None)
        ).first() if examination else None
        if not appointment:
            return []

        query = db.query(ChiDinh).filter(
            ChiDinh.appointment_id == appointment.id,
            ChiDinh.survey_template_id.isnot(None),
            ChiDinh.location_type.in_(['in', 'in_house']),
            ChiDinh.in_house_unit_id.isnot(None),
        )
        if getattr(session, 'order_id', None):
            query = query.filter(ChiDinh.id == session.order_id)
        elif template_id:
            query = query.filter(ChiDinh.survey_template_id == template_id)
        orders = query.order_by(ChiDinh.created_at.desc(), ChiDinh.id.desc()).all()
        if not orders:
            return []

        patient_name = appointment.patient.full_name if appointment.patient else 'Bệnh nhân'
        notifications = []
        for order in orders:
            performer = db.query(User).filter(
                User.id == order.in_house_unit_id,
                User.is_active.is_(True),
            ).first()
            if not performer or normalize_role(getattr(performer, 'role', None)) not in ('doctor', 'psychologist'):
                continue

            event_type = 'survey_completed'
            dedupe_key = f'{event_type}:{session.id}:{order.id}:{performer.id}'
            if self._has_dedupe_key(
                db,
                appointment_id=appointment.id,
                recipient_user_id=performer.id,
                event_type=event_type,
                dedupe_key=dedupe_key,
            ):
                continue

            order_name = getattr(order, 'order_name', None) or 'khảo sát'
            notification = self.create_in_app_notification(
                db,
                appointment=appointment,
                recipient_user_id=performer.id,
                event_type=event_type,
                title='Kết quả khảo sát đã sẵn sàng',
                message=f'{patient_name} đã hoàn thành {order_name}. Bạn có thể xem kết quả.',
                action_url=self._performer_action_url(performer, appointment.id, order.id),
                payload={
                    'appointment_id': appointment.id,
                    'examination_id': session.examination_id,
                    'session_id': session.id,
                    'order_id': order.id,
                    'survey_template_id': order.survey_template_id,
                    'patient_id': appointment.patient_id,
                    'patient_name': patient_name,
                    'actor_user_id': getattr(actor_user, 'id', None),
                    'dedupe_key': dedupe_key,
                },
            )
            if notification:
                notifications.append(notification)
        return notifications

    def create_transfer_notifications(self, db, appointment_ids, to_role, to_person_id, actor_user=None):
        target_role = normalize_role(to_role)
        if target_role not in ('doctor', 'psychologist') or not to_person_id:
            return []

        page = '/doctor-examination.html' if target_role == 'doctor' else '/psychologist-examination.html'
        role_label = 'bác sĩ' if target_role == 'doctor' else 'tâm lý gia'
        event_type = f'appointment_transferred_to_{target_role}'
        notifications = []

        for appointment_id in appointment_ids or []:
            appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
            if not appointment:
                continue
            patient_name = appointment.patient.full_name if appointment.patient else 'Bệnh nhân'
            examination = (appointment.examinations or [None])[0]
            notification = self.create_in_app_notification(
                db,
                appointment=appointment,
                recipient_user_id=to_person_id,
                event_type=event_type,
                title='Lượt khám mới được chuyển đến',
                message=f'{patient_name} vừa được chuyển đến {role_label}.',
                action_url=f'{page}?appointment_id={appointment.id}',
                payload={
                    'appointment_id': appointment.id,
                    'appointment_date': appointment.appointment_date.isoformat() if appointment.appointment_date else None,
                    'examination_id': getattr(examination, 'id', None),
                    'patient_id': appointment.patient_id,
                    'patient_name': patient_name,
                    'target_role': target_role,
                    'actor_user_id': getattr(actor_user, 'id', None),
                },
            )
            if notification:
                notifications.append(notification)
        return notifications

    def create_return_to_receptionist_notifications(self, db, appointment, examination=None, actor_user=None):
        if not appointment:
            return []
        patient_name = appointment.patient.full_name if appointment.patient else 'Bệnh nhân'
        notifications = []
        for recipient in self._active_users_by_role(db, 'staff'):
            notification = self.create_in_app_notification(
                db,
                appointment=appointment,
                recipient_user_id=recipient.id,
                recipient_role='staff',
                event_type='examination_returned_to_receptionist',
                title='Lượt khám được trả về lễ tân',
                message=f'Lượt khám của {patient_name} vừa được trả về lễ tân.',
                action_url=f'/receptionist-new.html?appointment_id={appointment.id}',
                payload={
                    'appointment_id': appointment.id,
                    'appointment_date': appointment.appointment_date.isoformat() if appointment.appointment_date else None,
                    'examination_id': getattr(examination, 'id', None),
                    'patient_id': appointment.patient_id,
                    'patient_name': patient_name,
                    'actor_user_id': getattr(actor_user, 'id', None),
                },
            )
            if notification:
                notifications.append(notification)
        return notifications

    def create_return_to_doctor_notification(self, db, appointment, examination=None, actor_user=None):
        if not appointment or not appointment.doctor_id:
            return []
        patient_name = appointment.patient.full_name if appointment.patient else 'Bệnh nhân'
        notification = self.create_in_app_notification(
            db,
            appointment=appointment,
            recipient_user_id=appointment.doctor_id,
            event_type='examination_returned_to_doctor',
            title='Lượt khám được trả về bác sĩ',
            message=f'Lượt khám của {patient_name} vừa được trả về bác sĩ.',
            action_url=f'/doctor-examination.html?appointment_id={appointment.id}',
            payload={
                'appointment_id': appointment.id,
                'appointment_date': appointment.appointment_date.isoformat() if appointment.appointment_date else None,
                'examination_id': getattr(examination, 'id', None),
                'patient_id': appointment.patient_id,
                'patient_name': patient_name,
                'actor_user_id': getattr(actor_user, 'id', None),
            },
        )
        return [notification] if notification else []

    def build_realtime_payloads(self, db, notifications):
        payloads = []
        for notification in notifications or []:
            if not notification or not notification.recipient_user_id:
                continue
            recipient = db.query(User).filter(User.id == notification.recipient_user_id).first()
            unread_count = self.count_unread_for_user(db, recipient) if recipient else 0
            payloads.append({
                'notification_id': notification.id,
                'user_id': notification.recipient_user_id,
                'unread_count': unread_count,
                'notification': self.serialize_notification(notification),
            })
        return payloads

    def emit_realtime_payloads(self, payloads):
        for payload in payloads or []:
            emit_notification_changed(
                payload.get('action') or 'created',
                user_id=payload.get('user_id'),
                extra={
                    'notification_id': payload.get('notification_id'),
                    'unread_count': payload.get('unread_count'),
                    'notification': payload.get('notification'),
                },
            )
        
    def create_appointment_reminder(self, appointment_id, reminder_hours=24, notification_type='email'):
        """
        Tạo và gửi thông báo nhắc lịch cho lịch hẹn.
        Hỗ trợ gửi email và/hoặc SMS.
        """
        db = next(get_db()) # Get a new DB session for this operation
        try:
            appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
            if not appointment:
                logger.warning(f"Appointment with ID {appointment_id} not found for reminder creation.")
                return False, "Không tìm thấy lịch hẹn"
            
            # Tính thời gian gửi thông báo (trước lịch hẹn)
            # Đảm bảo appointment_date có timezone nếu bạn muốn tính toán chính xác
            # Nếu appointment_date là naive (không có timezone), ta giả định nó là UTC
            # và tính toán reminder_time dựa trên đó.
            if appointment.appointment_date.tzinfo is None:
                # Giả định appointment_date là UTC nếu không có timezone
                reminder_time = appointment.appointment_date - timedelta(hours=reminder_hours)
            else:
                reminder_time = appointment.appointment_date - timedelta(hours=reminder_hours)
            
            notifications_created = 0
            
            # --- Gửi Email ---
            patient_email = getattr(appointment.patient, 'email', None) if appointment.patient else None
            if appointment.patient and patient_email and patient_email.strip():
                email_message_body = self._generate_email_message(appointment)
                success, error_msg = False, "Không gửi được email" # Default values

                try:
                    success, error_msg = self.send_email(
                        patient_email,
                        "Nhắc lịch hẹn khám",
                        email_message_body
                    )
                except Exception as e:
                    error_msg = f"Lỗi gửi email: {str(e)}"
                    logger.error(f"Error sending email for appointment {appointment_id}: {e}")
                
                email_notification = Notification(
                    appointment_id=appointment_id,
                    patient_id=appointment.patient_id,
                    notification_type='email',
                    scheduled_time=reminder_time,
                    message=email_message_body,
                    status='sent' if success else 'failed',
                    sent_time=datetime.now() if success else None,
                    error_message=error_msg if not success else None
                )
                db.add(email_notification)
                if success:
                    notifications_created += 1
            
            # --- SMS đã được bỏ khỏi hệ thống ---
            # Chỉ gửi email notifications
            
            # Commit all notification records at once
            if notifications_created > 0:
                db.commit()
                emit_notification_changed(
                    'reminder_created',
                    extra={
                        'appointment_id': appointment_id,
                        'patient_id': appointment.patient_id,
                        'count': notifications_created,
                    },
                    rooms=['global'],
                )
                logger.info(f"Successfully created {notifications_created} notifications for appointment {appointment_id}")
                return True, f"Đã tạo {notifications_created} thông báo nhắc lịch"
            else:
                # Kiểm tra lý do cụ thể
                if not appointment.patient:
                    logger.info(f"No patient found for appointment {appointment_id}")
                    return False, "Không tìm thấy thông tin bệnh nhân"
                elif not patient_email or not patient_email.strip():
                    logger.info(f"No email found for patient {appointment.patient_id} in appointment {appointment_id}")
                    return False, "Bệnh nhân chưa có email. Vui lòng cập nhật thông tin email trước khi gửi nhắc lịch."
                else:
                    logger.info(f"No notifications created for appointment {appointment_id}")
                    return False, "Không thể tạo thông báo"
            
        except Exception as e:
            db.rollback() # Rollback if any unexpected error occurs during the process
            logger.error(f"Lỗi tổng quát khi tạo thông báo cho lịch hẹn {appointment_id}: {e}", exc_info=True)
            return False, f"Lỗi tạo thông báo: {str(e)}"
        finally:
            db.close() # Always close the DB session

    def _generate_email_message(self, appointment: Appointment) -> str:
        """Tạo nội dung email nhắc lịch"""
        patient_name = appointment.patient.full_name if appointment.patient else "Bệnh nhân"
        # Fetch doctor's full_name from User model using appointment.doctor_id
        db = next(get_db())
        doctor_user = db.query(User).filter(User.id == appointment.doctor_id).first()
        db.close()
        doctor_name = doctor_user.full_name if doctor_user else "Bác sĩ"
        
        # Format appointment time - appointment_date đã là giờ Việt Nam (UTC+7) trong DB
        appointment_time_str = appointment.appointment_date.strftime("%H:%M ngày %d/%m/%Y")
        
        message = f"""
        Kính gửi {patient_name},
        
        Đây là thông báo nhắc lịch hẹn khám của bạn:
        
        - Thời gian: {appointment_time_str}
        - Bác sĩ: {doctor_name}
        - Địa điểm: Phòng khám [Tên phòng khám của bạn]
        
        Vui lòng đến đúng giờ để được phục vụ tốt nhất.
        
        Nếu có bất kỳ thay đổi nào hoặc cần hỗ trợ, vui lòng liên hệ với chúng tôi qua số điện thoại: {settings.CLINIC_PHONE_NUMBER}
        
        Trân trọng,
        Phòng khám [Tên phòng khám của bạn]
        """
        return message.strip()
    

    
    def send_email(self, to_email: str, subject: str, message: str) -> tuple[bool, str]:
        """Gửi email"""
        try:
            msg = MIMEMultipart()
            msg['From'] = self.sender_email
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # Attach plain text message with UTF-8 encoding
            msg.attach(MIMEText(message, 'plain', 'utf-8'))
            
            # Sử dụng timeout trong SMTP connection
            with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=settings.EMAIL_TIMEOUT_SECONDS) as server:
                server.starttls() # Enable TLS encryption
                server.login(self.sender_email, self.sender_password)
                server.sendmail(self.sender_email, to_email, msg.as_string())
            
            logger.info(f"Email sent successfully to {to_email} for subject '{subject}'")
            return True, "Email đã được gửi thành công"
        except smtplib.SMTPAuthenticationError:
            logger.error(f"Lỗi xác thực SMTP: Tên đăng nhập hoặc mật khẩu không đúng cho {self.sender_email}")
            return False, "Lỗi xác thực SMTP: Vui lòng kiểm tra tài khoản và mật khẩu email."
        except smtplib.SMTPConnectError as e:
            logger.error(f"Lỗi kết nối SMTP: Không thể kết nối đến máy chủ {self.smtp_server}:{self.smtp_port} - {e}")
            return False, "Lỗi kết nối máy chủ email. Vui lòng kiểm tra cấu hình SMTP."
        except smtplib.SMTPException as e:
            logger.error(f"Lỗi SMTP khi gửi email đến {to_email}: {e}")
            return False, f"Lỗi SMTP khi gửi email: {str(e)}"
        except Exception as e:
            logger.error(f"Lỗi không xác định khi gửi email đến {to_email}: {e}", exc_info=True)
            return False, f"Lỗi gửi email: {str(e)}"
    
