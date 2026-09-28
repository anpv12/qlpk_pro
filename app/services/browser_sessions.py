import hashlib
import hmac
from time import time
from urllib.parse import urlsplit

from flask import request

from app.core.config import settings
from app.services.auth import decode_access_claims


def session_cookie_name():
    return 'qlpk_session_dev' if settings.DEBUG else '__Host-qlpk_session'


def browser_cookie_token():
    return request.cookies.get(session_cookie_name(), '')


def request_access_token():
    cookie = browser_cookie_token()
    if cookie:
        return cookie
    parts = request.headers.get('Authorization', '').split()
    return parts[1] if len(parts) == 2 and parts[0] == 'Bearer' else ''


def _origin(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            return None
        return parsed.scheme, parsed.hostname.lower(), parsed.port or (443 if parsed.scheme == 'https' else 80)
    except ValueError:
        return None


def same_origin_request():
    source = request.headers.get('Origin')
    if source is not None:
        return _origin(source) is not None and _origin(source) == _origin(request.host_url)
    referer = request.headers.get('Referer')
    if referer:
        return _origin(referer) is not None and _origin(referer) == _origin(request.host_url)
    return request.headers.get('Sec-Fetch-Site') == 'same-origin'


def browser_csrf_token(token):
    return hmac.new(settings.SECRET_KEY.encode(), b'qlpk-browser-csrf-v1\0' + token.encode(), hashlib.sha256).hexdigest()


def browser_session_request_allowed(token, *, socket_csrf=None):
    claims = decode_access_claims(token)
    if not browser_cookie_token():
        return not claims or claims.get('transport') != 'cookie'
    if not claims or claims.get('transport') != 'cookie' or not same_origin_request():
        return False
    expected_session = request.headers.get('X-QLPK-Session-Id')
    if expected_session is not None and expected_session != claims.get('jti'):
        return False
    if request.method in ('GET', 'HEAD', 'OPTIONS') and socket_csrf is None:
        return True
    provided = socket_csrf if socket_csrf is not None else request.headers.get('X-CSRF-Token', '')
    return isinstance(provided, str) and provided.isascii() and hmac.compare_digest(provided, browser_csrf_token(token))


def browser_session_payload(token):
    claims = decode_access_claims(token)
    return {'session_id': claims['jti'], 'csrf_token': browser_csrf_token(token), 'token_type': 'cookie'}


def set_browser_session(response, token):
    claims = decode_access_claims(token)
    lifetime = max(1, int(claims.get('exp', time() + 28800) - time()))
    response.set_cookie(session_cookie_name(), token, max_age=lifetime, httponly=True,
                        secure=not settings.DEBUG or request.is_secure, samesite='Lax', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return response


def clear_browser_session(response):
    response.delete_cookie(session_cookie_name(), httponly=True,
                           secure=not settings.DEBUG or request.is_secure, samesite='Lax', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return response
