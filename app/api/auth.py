from flask import Blueprint, request, jsonify
from app.models.user import User
from app.core.database import get_db
from app.services.auth import authenticate_user, create_access_token, decode_access_token, get_password_hash, token_matches_user
from app.schemas.user import UserCreate
from app.services.session_identity import ALL_PERMISSIONS, session_user_payload
from app.core.login_throttle import limit_login_attempts
from app.services.auth import decode_access_claims
from app.services.access_sessions import revoke_session, SessionStoreUnavailable
from app.services.browser_sessions import (
    browser_cookie_token, request_access_token, browser_session_request_allowed,
    same_origin_request, browser_session_payload, set_browser_session, clear_browser_session,
)
from datetime import datetime, timedelta
from functools import wraps

import logging

logger = logging.getLogger(__name__)

router = Blueprint('auth', __name__, url_prefix='/auth')
check_router = Blueprint('check', __name__, url_prefix='/check')

# JWT Configuration
from app.core.config import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES


def get_current_user(token: str):
    """
    Decodes a JWT token and retrieves the corresponding user from the database.
    Manages its own database session.
    """
    username = decode_access_token(token)
    if not username:
        return None
    
    db = next(get_db()) # Get a new database session
    try:
        user = db.query(User).filter(User.username == username).first()
        return user if token_matches_user(token, user) else None
    finally:
        db.close() # Ensure the database session is closed

def require_auth(f):
    """
    Decorator to protect routes, ensuring a valid JWT token is provided.
    Passes the authenticated user object as the first argument to the decorated function.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request_access_token()
        if not token:
            return jsonify({'detail': 'Not authenticated: Missing or malformed Authorization header'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        if not browser_session_request_allowed(token):
            return jsonify(code='auth.csrf_invalid', detail='Yêu cầu không đúng nguồn hoặc mã bảo vệ phiên.'), 403
        try:
            user = get_current_user(token)
        except SessionStoreUnavailable:
            return jsonify(code='system.unavailable', detail='Tạm thời không thể xác minh phiên.'), 503
        if not user or user.is_active is not True:
            return jsonify({'detail': 'Invalid or expired token'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Update last_login for online tracking
        activity_db = None
        try:
            from datetime import timezone as tz
            activity_db = next(get_db())
            activity_db.query(User).filter(User.id == user.id).update(
                {'last_login': datetime.now(tz.utc)})
            activity_db.commit()
        except Exception as exc:
            if activity_db is not None:
                activity_db.rollback()
            logger.warning('Không cập nhật được last_login cho user %s: %s', getattr(user, 'id', None), exc)
        finally:
            if activity_db is not None:
                activity_db.close()

        # Pass the user object to the decorated function
        return f(user, *args, **kwargs)
    return decorated_function

def require_admin(f):
    """
    Decorator to protect routes, ensuring a valid JWT token is provided
    and the authenticated user has an 'admin' role.
    Passes the authenticated user object as the first argument to the decorated function.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request_access_token()
        if not token:
            return jsonify({'detail': 'Not authenticated: Missing or malformed Authorization header'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        if not browser_session_request_allowed(token):
            return jsonify(code='auth.csrf_invalid', detail='Yêu cầu không đúng nguồn hoặc mã bảo vệ phiên.'), 403
        try:
            user = get_current_user(token)
        except SessionStoreUnavailable:
            return jsonify(code='system.unavailable', detail='Tạm thời không thể xác minh phiên.'), 503
        if not user or user.is_active is not True:
            return jsonify({'detail': 'Invalid or expired token'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        
        if user.role != 'admin':
            return jsonify({'detail': 'Admin access required'}), 403, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Pass the user object to the decorated function
        return f(user, *args, **kwargs)
    return decorated_function

@router.route('/login', methods=['POST'])
@limit_login_attempts
def login(): # Corrected function name from 'cllogin' to 'login'
    """
    Handles user login, authenticates credentials, and issues a JWT access token.
    Retrieves and returns user-specific permissions based on roles and groups.
    """
    cookie_mode = request.headers.get('X-QLPK-Session') == 'cookie'
    if browser_cookie_token() and not cookie_mode:
        return jsonify(code='auth.cookie_required', detail='Phiên trình duyệt không thể đổi sang Bearer ngầm.'), 403
    if cookie_mode and (not same_origin_request() or (not settings.DEBUG and not request.is_secure)):
        return jsonify(code='auth.origin_invalid', detail='Đăng nhập trình duyệt yêu cầu đúng nguồn và HTTPS.'), 403
    db = next(get_db())
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({'detail': 'Username and password required'}), 400
        username = data.get('username')
        password = data.get('password')
            
        if not isinstance(username, str) or not username.strip() or not isinstance(password, str) or not password:
            return jsonify({'detail': 'Username and password required'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
            
        user = authenticate_user(db, username, password)
        if not user or user.is_active is not True:
            return jsonify({'detail': 'Invalid credentials'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
            
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username, **({'transport': 'cookie'} if cookie_mode else {})},
            expires_delta=access_token_expires, user=user
        )

        # Update last_login
        from datetime import timezone as tz
        user.last_login = datetime.now(tz.utc)
        db.commit()

        payload = {'user': session_user_payload(user)}
        if cookie_mode:
            payload.update(browser_session_payload(access_token))
            return set_browser_session(jsonify(payload), access_token)
        payload.update(access_token=access_token, token_type='bearer')
        response = jsonify(payload)
        response.headers['Cache-Control'] = 'no-store'
        return response
    except SessionStoreUnavailable:
        db.rollback()
        return jsonify(code='system.unavailable', detail='Chưa thể tạo phiên đăng nhập.'), 503
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@router.route('/logout', methods=['POST'])
@require_auth
def logout(user):
    token = request_access_token()
    claims = decode_access_claims(token)
    try:
        revoke_session(claims)
    except Exception:
        return jsonify(code='system.unavailable', detail='Chưa thể thu hồi phiên đăng nhập.'), 503
    from app.realtime.socket import disconnect_token_clients
    disconnect_token_clients(token)
    response = jsonify(success=True)
    return clear_browser_session(response) if browser_cookie_token() else response


@router.route('/session', methods=['GET'])
@require_auth
def browser_session_info(user):
    if not browser_cookie_token():
        return jsonify(code='auth.cookie_required', detail='Phiên trình duyệt chưa được thiết lập.'), 400
    db = next(get_db())
    try:
        current = db.query(User).filter(User.id == user.id).first()
        if not current or current.is_active is not True:
            return jsonify(detail='Phiên đăng nhập không còn hiệu lực.'), 401
        response = jsonify(**browser_session_payload(request_access_token()), user=session_user_payload(current))
        response.headers['Cache-Control'] = 'no-store'
        return response
    finally:
        db.close()


@router.route('/register', methods=['POST'])
@require_admin
def register(user):
    """
    Registers a new user.
    """
    db = next(get_db())
    try:
        data = request.get_json()
        
        # Validate input data using Pydantic schema
        try:
            user_data = UserCreate(**data)
        except Exception as e:
            # Catch Pydantic validation errors and return a 400
            return jsonify({'detail': f'Invalid input data: {e.errors() if hasattr(e, "errors") else str(e)}'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Check if user already exists by username or email
        existing_user = db.query(User).filter(
            (User.username == user_data.username) | (User.email == user_data.email)
        ).first()
        
        if existing_user:
            # Return 409 Conflict if username or email already exists
            return jsonify({'detail': 'Username or email already registered'}), 409, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Create new user
        hashed_password = get_password_hash(user_data.password)
        db_user = User(
            username=user_data.username,
            email=user_data.email,
            full_name=user_data.full_name,
            hashed_password=hashed_password,
            # Set role; default to 'user' if not provided or invalid
            role=user_data.role if user_data.role in ['admin', 'doctor', 'staff', 'user'] else 'user'
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return jsonify({
            "id": db_user.id,
            "username": db_user.username,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "role": db_user.role
        }), 201, {'Content-Type': 'application/json; charset=utf-8'} # 201 Created
    except Exception as e:
        db.rollback() # Rollback changes in case of an error
        logger.error(f"Registration error: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@check_router.route('/me', methods=['GET'])
@require_auth
def get_current_user_info(user: User):
    """
    Returns information about the currently authenticated user.
    The 'user' object is passed directly from the require_auth decorator.
    """
    db = next(get_db())
    try:
        current = db.query(User).filter(User.id == user.id).first()
        if not current or current.is_active is not True:
            return jsonify(detail='Phiên đăng nhập không còn hiệu lực.'), 401
        response = jsonify(session_user_payload(current))
        response.headers['Cache-Control'] = 'no-store'
        return response
    except Exception as e:
        logger.error(f"Error getting user info: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@check_router.route('/admin-status', methods=['GET'])
@require_admin
def check_admin_status(user: User):
    """
    An example endpoint that only administrators can access.
    The 'user' object is passed directly from the require_admin decorator.
    """
    return jsonify({
        "message": f"Welcome, admin {user.username}! You have administrative privileges.",
        "user_id": user.id,
        "user_role": user.role
    }), 200, {'Content-Type': 'application/json; charset=utf-8'}
