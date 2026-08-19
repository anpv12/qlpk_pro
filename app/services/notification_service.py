import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from app.core.database import get_db
from app.models.notification import Notification
from app.models.appointment import Appointment
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
    
