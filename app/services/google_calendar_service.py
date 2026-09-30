import os
import logging
import requests  # Added missing import
from datetime import datetime, timedelta
from typing import Optional
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from app.core.database import get_db
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
from app.models.appointment import Appointment, AppointmentStatus
from app.core.config import settings

logger = logging.getLogger(__name__)


class CalendarEventRetired(Exception):
    """The provider positively confirmed that an event identity is retired."""


class CalendarVerificationUnavailable(Exception):
    """The provider did not establish whether an event exists."""


# Google Calendar API Scopes
# Full calendar scope is required by validate/trace flows that read primary calendar info.
SCOPES = ['https://www.googleapis.com/auth/calendar']

TERMINAL_GOOGLE_TOKEN_ERRORS = {
    'invalid_grant',
    'invalid_client',
    'unauthorized_client',
}


def _set_connection_credential_error(connection, reason: str, terminal: bool = False) -> None:
    setattr(connection, '_qlpk_calendar_credential_error', reason)
    setattr(connection, '_qlpk_calendar_credential_terminal', terminal)


def _clear_connection_credential_error(connection) -> None:
    _set_connection_credential_error(connection, '', False)


def _parse_google_token_error(response) -> str:
    try:
        payload = response.json()
        error_code = payload.get('error')
        if error_code:
            return str(error_code)
    except Exception as exc:
        logger.debug('Google Calendar error payload không phải JSON: %s', exc)
    return response.text or f'http_{response.status_code}'


def _is_terminal_google_token_error(response) -> bool:
    error_code = _parse_google_token_error(response).lower()
    return response.status_code == 400 and error_code in TERMINAL_GOOGLE_TOKEN_ERRORS

# Mapping AppointmentStatus -> Google Calendar properties
# CANCELLED sẽ xóa event, không cần mapping
APPOINTMENT_STATUS_TO_GOOGLE = {
    AppointmentStatus.SCHEDULED: {'status': 'tentative', 'colorId': '11'},  # Tomato (Đỏ đậm) - Chờ xác nhận
    AppointmentStatus.CONFIRMED: {'status': 'confirmed', 'colorId': '7'},   # Peacock (Xanh dương) - Đã xác nhận
    AppointmentStatus.NO_SHOW: {'status': 'confirmed', 'colorId': '8'},     # Graphite (Xám) - Không đến
}

def format_friendly_error(error) -> str:
    """
    Chuyển đổi lỗi kỹ thuật thành thông báo thân thiện với người dùng.
    """
    error_str = str(error).lower()
    
    # Mapping lỗi -> thông báo thân thiện
    error_mappings = [
        # Authentication errors
        ('401', 'Phiên đăng nhập Google đã hết hạn. Vui lòng kết nối lại Google Calendar.'),
        ('invalid credentials', 'Phiên đăng nhập Google đã hết hạn. Vui lòng kết nối lại Google Calendar.'),
        ('token has been expired or revoked', 'Quyền truy cập đã bị thu hồi. Vui lòng kết nối lại Google Calendar.'),
        ('invalid_grant', 'Quyền truy cập đã bị thu hồi. Vui lòng kết nối lại Google Calendar.'),
        
        # Permission errors
        ('403', 'Không có quyền truy cập lịch. Vui lòng kiểm tra lại quyền chia sẻ.'),
        ('forbidden', 'Không có quyền truy cập lịch. Vui lòng kiểm tra lại quyền chia sẻ.'),
        ('access denied', 'Không có quyền truy cập lịch. Vui lòng kiểm tra lại quyền chia sẻ.'),
        
        # Not found errors
        ('404', 'Lịch Google không tồn tại hoặc đã bị xoá.'),
        ('not found', 'Lịch Google không tồn tại hoặc đã bị xoá.'),
        
        # Quota errors
        ('429', 'Đã vượt quá giới hạn API. Vui lòng thử lại sau vài phút.'),
        ('quota', 'Đã vượt quá giới hạn API. Vui lòng thử lại sau vài phút.'),
        ('rate limit', 'Đã vượt quá giới hạn API. Vui lòng thử lại sau vài phút.'),
        
        # Network errors
        ('timeout', 'Mất kết nối mạng. Vui lòng kiểm tra internet và thử lại.'),
        ('connection', 'Mất kết nối mạng. Vui lòng kiểm tra internet và thử lại.'),
        ('network', 'Mất kết nối mạng. Vui lòng kiểm tra internet và thử lại.'),
        
        # Server errors
        ('500', 'Lỗi máy chủ Google. Vui lòng thử lại sau.'),
        ('502', 'Lỗi máy chủ Google. Vui lòng thử lại sau.'),
        ('503', 'Dịch vụ Google tạm thời không khả dụng. Vui lòng thử lại sau.'),
    ]
    
    for keyword, friendly_message in error_mappings:
        if keyword in error_str:
            return friendly_message
    
    # Fallback: trả về thông báo chung
    return 'Lỗi khi đồng bộ. Vui lòng thử lại hoặc liên hệ hỗ trợ.'

def _persist_refreshed_token(connection, new_access_token, new_expires_at):
    # Cập nhật vào Database
    # Note: Service tự mở DB session là pattern phổ biến trong Flask monolith
    # Cân nhắc inject db từ ngoài nếu cần test hoặc scale
    db = next(get_db())
    try:
        db_conn = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.id == connection.id
        ).first()
        if db_conn:
            db_conn.access_token = new_access_token
            db_conn.token_expires_at = new_expires_at
            db.commit()
            logger.info(f"Refreshed Google Calendar token for user {connection.user_id}")
        else:
            logger.error(f"Connection {connection.id} not found in DB")
    except Exception as e:
        logger.error(f"Error saving token to DB: {e}")
        db.rollback()
    finally:
        db.close()


class GoogleCalendarService:
    @staticmethod
    def get_credentials_file_path():
        """Lấy đường dẫn file credentials.json"""
        # Thử các vị trí có thể có file credentials.json
        possible_paths = [
            os.path.join(os.path.dirname(__file__), '../../credentials.json'),
            os.path.join(os.path.dirname(__file__), '../../../credentials.json'),
            'credentials.json',
            os.path.join(os.getcwd(), 'credentials.json')
        ]
        
        for path in possible_paths:
            abs_path = os.path.abspath(path)
            if os.path.exists(abs_path):
                return abs_path
        
        raise FileNotFoundError("credentials.json not found. Please place it in the project root.")
    
    @staticmethod
    def get_authorization_url(redirect_uri: str, state: str) -> tuple:
        """Return the Google consent URL and its PKCE verifier."""
        try:
            credentials_path = GoogleCalendarService.get_credentials_file_path()
            flow = Flow.from_client_secrets_file(
                credentials_path,
                scopes=SCOPES,
                redirect_uri=redirect_uri,
                autogenerate_code_verifier=True,
            )
            authorization_url, _ = flow.authorization_url(
                access_type='offline',
                prompt='consent',
                state=state,
            )
            return authorization_url, flow.code_verifier
        except Exception as e:
            logger.error('Error creating authorization URL: %s', type(e).__name__)
            raise
    
    @staticmethod
    def exchange_code_for_token(code: str, redirect_uri: str, code_verifier: str) -> dict:
        """Đổi authorization code lấy access token và refresh token"""
        try:
            credentials_path = GoogleCalendarService.get_credentials_file_path()
            flow = Flow.from_client_secrets_file(
                credentials_path,
                scopes=SCOPES,
                redirect_uri=redirect_uri,
                code_verifier=code_verifier,
                autogenerate_code_verifier=False,
            )
            flow.fetch_token(code=code)
            credentials = flow.credentials
            
            return {
                'access_token': credentials.token,
                'refresh_token': credentials.refresh_token,
                'expires_at': credentials.expiry
            }
        except Exception as e:
            logger.error('Error exchanging code for token: %s', type(e).__name__)
            raise
    
    @staticmethod
    def get_valid_credentials(connection: GoogleCalendarConnection) -> Optional[Credentials]:
        """Lấy credentials hợp lệ, tự động refresh bằng requests nếu cần"""
        try:
            _clear_connection_credential_error(connection)

            if not connection.access_token or not connection.refresh_token:
                logger.warning(f"Missing tokens for user {connection.user_id}")
                _set_connection_credential_error(connection, 'missing_tokens', True)
                return None
            
            # Kiểm tra xem có cần refresh không (dùng UTC để đảm bảo đúng timezone)
            # Nếu không có expiry hoặc còn hạn dưới 5 phút -> Refresh
            from datetime import timezone
            now_utc = datetime.now(timezone.utc).replace(tzinfo=None)  # Naive UTC để so sánh với DB
            
            should_refresh = False
            if not connection.token_expires_at:
                should_refresh = True
            elif connection.token_expires_at < now_utc + timedelta(minutes=5):
                should_refresh = True
                
            if should_refresh:
                # Retry logic: thử tối đa 2 lần với timeout ngắn
                max_retries = 2
                for attempt in range(max_retries):
                    try:
                        logger.info(f"Token expired or expiring soon, refreshing for user {connection.user_id} (attempt {attempt + 1}/{max_retries})...")
                        
                        token_url = "https://oauth2.googleapis.com/token"
                        payload = {
                            'client_id': settings.GOOGLE_CLIENT_ID,
                            'client_secret': settings.GOOGLE_CLIENT_SECRET,
                            'refresh_token': connection.refresh_token,
                            'grant_type': 'refresh_token'
                        }
                        
                        # Timeout 5s mỗi lần thử (tổng max 10s)
                        response = requests.post(token_url, data=payload, timeout=5)
                        
                        if response.status_code == 200:
                            data = response.json()
                            new_access_token = data.get('access_token')
                            expires_in = data.get('expires_in', 3599)  # Default 1h
                            
                            if new_access_token:
                                # Cập nhật vào đối tượng connection hiện tại
                                new_expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=expires_in)
                                connection.access_token = new_access_token
                                connection.token_expires_at = new_expires_at
                                
                                _persist_refreshed_token(connection, new_access_token, new_expires_at)
                                
                                # Trả về Credentials đầy đủ để SDK hoạt động đúng
                                return Credentials(
                                    token=new_access_token,
                                    refresh_token=connection.refresh_token,
                                    token_uri="https://oauth2.googleapis.com/token",
                                    client_id=settings.GOOGLE_CLIENT_ID,
                                    client_secret=settings.GOOGLE_CLIENT_SECRET,
                                    expiry=new_expires_at,
                                    scopes=SCOPES
                                )
                        else:
                            logger.error(f"Refresh failed: HTTP {response.status_code} - {response.text}")
                            reason = _parse_google_token_error(response)
                            _set_connection_credential_error(
                                connection,
                                f'refresh_failed:{reason}',
                                _is_terminal_google_token_error(response)
                            )
                            return None
                            
                    except requests.Timeout:
                        if attempt < max_retries - 1:
                            logger.warning(f"Refresh timeout for user {connection.user_id}, retrying...")
                            continue
                        else:
                            logger.error(f"Refresh timeout after {max_retries} attempts for user {connection.user_id}")
                            _set_connection_credential_error(connection, 'refresh_timeout', False)
                            return None
                    except Exception as e:
                        logger.error(f"Refresh exception: {e}")
                        _set_connection_credential_error(connection, f'refresh_exception:{e}', False)
                        return None

            # Token còn hạn -> trả về Credentials đầy đủ
            return Credentials(
                token=connection.access_token,
                refresh_token=connection.refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.GOOGLE_CLIENT_ID,
                client_secret=settings.GOOGLE_CLIENT_SECRET,
                expiry=connection.token_expires_at,
                scopes=SCOPES
            )
            
        except Exception as e:
            logger.error(f"Error getting valid credentials: {e}")
            _set_connection_credential_error(connection, f'credential_exception:{e}', False)
            return None

    @staticmethod
    def get_connection_credential_error(connection: GoogleCalendarConnection) -> str:
        return getattr(connection, '_qlpk_calendar_credential_error', '') or ''

    @staticmethod
    def is_terminal_connection_credential_error(connection: GoogleCalendarConnection) -> bool:
        return bool(getattr(connection, '_qlpk_calendar_credential_terminal', False))
    
    @staticmethod
    def build_event_payload(appointment: Appointment) -> dict:
        """Tạo payload cho Google Calendar event (DRY helper)"""
        # Format thời gian
        start_time = appointment.appointment_date.isoformat()
        end_time = (appointment.appointment_date + 
                   timedelta(minutes=appointment.duration_minutes or 60)).isoformat()
        
        # Lấy thông tin bệnh nhân và bác sĩ
        patient_name = appointment.patient.full_name if appointment.patient else "Bệnh nhân"
        doctor_name = appointment.doctor.full_name if appointment.doctor else "Bác sĩ"
        
        # Lấy status và colorId từ mapping
        google_props = APPOINTMENT_STATUS_TO_GOOGLE.get(
            appointment.status,
            {'status': 'confirmed', 'colorId': '7'}  # Default: CONFIRMED
        )
        
        # Tạo description
        description_parts = [
            f'Mã lịch hẹn: {appointment.appointment_code}',
            f'Bệnh nhân: {patient_name}',
            f'Bác sĩ: {doctor_name}',
        ]
        
        if appointment.patient and appointment.patient.phone:
            description_parts.append(f'Điện thoại: {appointment.patient.phone}')
        
        if appointment.notes:
            description_parts.append(f'Ghi chú: {appointment.notes}')
        
        description = '\n'.join(description_parts)
        
        # Build event payload với status và colorId từ mapping
        event = {
            'summary': f'Lịch hẹn - {patient_name}',
            'description': description,
            'status': google_props['status'],
            'colorId': google_props['colorId'],
            'start': {
                'dateTime': start_time,
                'timeZone': 'Asia/Ho_Chi_Minh',
            },
            'end': {
                'dateTime': end_time,
                'timeZone': 'Asia/Ho_Chi_Minh',
            },
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},  # Nhắc 1 ngày trước
                    {'method': 'popup', 'minutes': 30},  # Nhắc 30 phút trước
                ],
            },
        }
        
        # Thêm attendee nếu có email
        if appointment.patient and appointment.patient.email:
            event['attendees'] = [{'email': appointment.patient.email}]
        
        return event
    @staticmethod
    def create_event(appointment: Appointment, connection: GoogleCalendarConnection) -> Optional[str]:
        """Tạo event trên Google Calendar"""
        try:
            credentials = GoogleCalendarService.get_valid_credentials(connection)
            if not credentials:
                logger.error("Cannot get valid credentials")
                return None
            
            service = build('calendar', 'v3', credentials=credentials)
            
            # Sử dụng helper để tạo event payload (DRY)
            event = GoogleCalendarService.build_event_payload(appointment)
            
            created_event = service.events().insert(
                calendarId='primary',
                body=event
            ).execute()
            
            logger.info(f"Created Google Calendar event: {created_event.get('id')} for appointment {appointment.id}")
            return created_event.get('id')
            
        except HttpError as error:
            logger.error(f'Error creating Google Calendar event: {error}')
            return None
        except Exception as e:
            logger.error(f'Unexpected error creating Google Calendar event: {e}')
            return None
    
    @staticmethod
    def upsert_transfer_event(appointment, connection, event_id) -> bool:
        """Retry a committed transfer with the same provider-side event identity."""
        try:
            import httplib2
            from google_auth_httplib2 import AuthorizedHttp

            credentials = GoogleCalendarService.get_valid_credentials(connection)
            if not credentials:
                return False
            service = build('calendar', 'v3', http=AuthorizedHttp(credentials, http=httplib2.Http(timeout=15)))
            event = GoogleCalendarService.build_event_payload(appointment)
            marker = {'qlpk_transfer_event': event_id, 'qlpk_appointment_id': str(appointment.id)}
            event['extendedProperties'] = {'private': marker}
            try:
                service.events().insert(calendarId='primary', body={**event, 'id': event_id}).execute()
            except HttpError as error:
                if error.resp.status != 409:
                    raise
                try:
                    existing = service.events().get(calendarId='primary', eventId=event_id).execute()
                except HttpError as get_error:
                    if get_error.resp.status == 410:
                        raise CalendarEventRetired() from get_error
                    raise
                if existing.get('status') == 'cancelled':
                    raise CalendarEventRetired()
                if existing.get('extendedProperties', {}).get('private') != marker:
                    return False
                service.events().patch(calendarId='primary', eventId=event_id, body=event).execute()
            return True
        except CalendarEventRetired:
            raise
        except Exception:
            logger.warning('Google Calendar transfer event remains pending for appointment %s', appointment.id)
            return False

    @staticmethod
    def update_event(
        appointment: Appointment,
        calendar_event: GoogleCalendarEvent,
        connection: GoogleCalendarConnection,
        *, report_missing=False,
    ) -> Optional[bool]:
        """Update an event; report_missing opts into None for confirmed absence."""
        try:
            credentials = GoogleCalendarService.get_valid_credentials(connection)
            if not credentials:
                return False
            
            service = build('calendar', 'v3', credentials=credentials)
            
            # Lấy event hiện tại
            try:
                event = service.events().get(
                    calendarId='primary',
                    eventId=calendar_event.event_id
                ).execute()
            except HttpError as get_error:
                if get_error.resp.status in (404, 410):
                    # Event không tồn tại trên Google Calendar (có thể đã bị xóa thủ công)
                    # KHÔNG tạo mới ở đây vì không có DB session để commit
                    # Thay vào đó, log warning và return False
                    # Caller sẽ xử lý logic tạo mới nếu cần
                    logger.warning(f"Google Calendar event {calendar_event.event_id} not found (may have been deleted)")
                    return None if report_missing else False
                else:
                    # Lỗi khác (không phải 404)
                    raise
            
            if event.get('status') == 'cancelled':
                return None if report_missing else False

            # Sử dụng helper để tạo event payload (DRY)
            # Merge với event hiện tại để giữ lại các field của Google
            new_payload = GoogleCalendarService.build_event_payload(appointment)
            event.update(new_payload)
            
            # Đảm bảo attendees được xử lý đúng (xóa nếu không có email)
            if not (appointment.patient and appointment.patient.email):
                event.pop('attendees', None)
            
            service.events().update(
                calendarId='primary',
                eventId=calendar_event.event_id,
                body=event
            ).execute()
            
            logger.info(f"Updated Google Calendar event: {calendar_event.event_id} for appointment {appointment.id}")
            return True
            
        except HttpError as error:
            logger.error(f'Error updating Google Calendar event: {error}')
            return False
        except Exception as e:
            logger.error(f'Unexpected error updating Google Calendar event: {e}')
            return False
    
    @staticmethod
    def delete_event(
        calendar_event: GoogleCalendarEvent,
        connection: GoogleCalendarConnection
    ) -> bool:
        """Xóa event trên Google Calendar"""
        try:
            credentials = GoogleCalendarService.get_valid_credentials(connection)
            if not credentials:
                return False
            
            service = build('calendar', 'v3', credentials=credentials)
            service.events().delete(
                calendarId='primary',
                eventId=calendar_event.event_id
            ).execute()
            
            logger.info(f"Deleted Google Calendar event: {calendar_event.event_id}")
            return True
            
        except HttpError as error:
            # Nếu event đã bị xóa rồi, coi như thành công
            if error.resp.status in (404, 410):
                logger.warning(f"Google Calendar event {calendar_event.event_id} not found (may have been deleted)")
                return True
            logger.error(f'Error deleting Google Calendar event: {error}')
            return False
        except Exception as e:
            logger.error(f'Unexpected error deleting Google Calendar event: {e}')
            return False

    @staticmethod
    def verify_event(
        event_id: str,
        connection: GoogleCalendarConnection,
        *, strict=False,
    ) -> bool:
        """Verify existence; strict mode raises when absence cannot be established."""
        try:
            credentials = GoogleCalendarService.get_valid_credentials(connection)
            if not credentials:
                logger.warning(f"Cannot get credentials to verify event {event_id}")
                if strict:
                    raise CalendarVerificationUnavailable()
                return False
            
            service = build('calendar', 'v3', credentials=credentials)
            
            try:
                event = service.events().get(
                    calendarId='primary',
                    eventId=event_id
                ).execute()
                
                # Check event không bị cancelled
                if event.get('status') == 'cancelled':
                    logger.info(f"Event {event_id} exists but is cancelled")
                    return False
                    
                logger.debug(f"Event {event_id} verified: exists")
                return True
                
            except HttpError as error:
                if error.resp.status in (404, 410):
                    logger.info(f"Event {event_id} not found on Google Calendar")
                    return False
                else:
                    logger.error(f"Error verifying event {event_id}: {error}")
                    if strict:
                        raise CalendarVerificationUnavailable() from error
                    return False
                    
        except Exception as e:
            logger.error(f'Unexpected error verifying Google Calendar event: {e}')
            if strict:
                raise CalendarVerificationUnavailable('Chưa xác minh được lịch Google; liên kết được giữ để thử lại.') from e
            return False
