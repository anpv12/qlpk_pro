"""google_calendar_service helpers split out by topic (credentials); re-exported by app.services.google_calendar_service."""

import logging
import requests
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from app.core.database import get_db
from app.models.google_calendar import GoogleCalendarConnection
from app.core.config import settings

logger = logging.getLogger('app.services.google_calendar_service')


# Google Calendar API Scopes
# Full calendar scope is required by validate/trace flows that read primary calendar info.
SCOPES = ['https://www.googleapis.com/auth/calendar']


TERMINAL_GOOGLE_TOKEN_ERRORS = {
    'invalid_grant',
    'invalid_client',
    'unauthorized_client',
}


def _set_connection_credential_error(connection, reason: str, terminal: bool = False) -> None:
    connection._qlpk_calendar_credential_error = reason
    connection._qlpk_calendar_credential_terminal = terminal


def _clear_connection_credential_error(connection) -> None:
    _set_connection_credential_error(connection, '', False)


def _parse_google_token_error(response) -> str:
    try:
        payload = response.json()
        error_code = payload.get('error')
        if error_code:
            return str(error_code)
    except (ValueError, AttributeError) as exc:
        logger.debug('Google Calendar error payload không phải JSON: %s', exc)
    return response.text or f'http_{response.status_code}'


def _is_terminal_google_token_error(response) -> bool:
    error_code = _parse_google_token_error(response).lower()
    return response.status_code == 400 and error_code in TERMINAL_GOOGLE_TOKEN_ERRORS


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
        logger.error(f"Error saving token to DB: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


_KEEP_CURRENT_TOKEN = object()


def _refresh_google_credentials(connection):
    """Refresh through the token endpoint: new Credentials, None on failure, or _KEEP_CURRENT_TOKEN when no token was issued."""
    from datetime import timezone
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
            logger.error(f"Refresh exception: {e}", exc_info=True)
            _set_connection_credential_error(connection, f'refresh_exception:{e}', False)
            return None
    return _KEEP_CURRENT_TOKEN
