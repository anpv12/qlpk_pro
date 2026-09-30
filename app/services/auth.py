from passlib.context import CryptContext
from datetime import datetime, timedelta
import jwt
from jwt import PyJWTError as JWTError
from app.core.config import settings
from app.core.security_config import validate_security_config
from app.models.user import User
from sqlalchemy.orm import Session
import hashlib
import hmac
import json
from uuid import uuid4
from app.services.access_sessions import register_session, session_is_active, account_session_generation

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Hash password
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# JWT
def credential_binding(user):
    password_hash = getattr(user, 'hashed_password', None)
    user_id = getattr(user, 'id', None)
    username = getattr(user, 'username', None)
    if type(user_id) is not int or user_id <= 0 or not isinstance(username, str) or not username:
        raise ValueError('Invalid account identity')
    if not isinstance(password_hash, str) or not password_hash:
        raise ValueError('Missing account credential')
    material = json.dumps(['qlpk-access-v1', user_id, username, password_hash], separators=(',', ':')).encode()
    return hmac.new(settings.SECRET_KEY.encode(), material, hashlib.sha256).hexdigest()


def create_access_token(data: dict, expires_delta: timedelta = None, *, user):
    validate_security_config(settings)
    to_encode = data.copy()
    if to_encode.get('sub') != user.username:
        raise ValueError('Token subject must match account')
    if user.is_active is not True:
        raise ValueError('Inactive account')
    to_encode['credential_version'] = credential_binding(user)
    to_encode['jti'] = uuid4().hex
    to_encode['session_user_id'] = user.id
    to_encode['session_generation'] = account_session_generation(user.id)
    
    # Nếu ACCESS_TOKEN_EXPIRE_MINUTES = 0, token sẽ không hết hạn
    if settings.ACCESS_TOKEN_EXPIRE_MINUTES == 0:
        # Không thêm trường "exp" vào token
        pass
    else:
        # Thêm thời gian hết hạn vào token
        configured_lifetime = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        lifetime = min(expires_delta, configured_lifetime) if expires_delta is not None else configured_lifetime
        expire = datetime.utcnow() + lifetime
        to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    session_expires = to_encode.get('exp') or datetime.utcnow() + timedelta(hours=8)
    if isinstance(session_expires, datetime):
        from datetime import timezone
        session_expires = session_expires.replace(tzinfo=timezone.utc).timestamp()
    register_session(encoded_jwt, to_encode['jti'], session_expires,
                     user_id=user.id, generation=to_encode['session_generation'])
    return encoded_jwt

def decode_access_claims(token):
    try:
        validate_security_config(settings)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if not settings.DEBUG and type(payload.get('exp')) is not int:
            return None
        
        username: str = payload.get("sub")
        if not isinstance(username, str) or not username.strip():
            return None
        return payload
    except (JWTError, TypeError, ValueError, AttributeError, RuntimeError):
        return None


def decode_access_token(token: str):
    payload = decode_access_claims(token)
    return payload['sub'] if payload else None


def token_matches_user(token, user):
    if not user or user.is_active is not True:
        return False
    claims = decode_access_claims(token)
    if not claims or claims['sub'] != user.username or claims.get('session_user_id') != user.id:
        return False
    binding = claims.get('credential_version')
    if not isinstance(binding, str) or len(binding) != 64 or not binding.isascii():
        return False
    try:
        return hmac.compare_digest(binding, credential_binding(user)) and session_is_active(token, claims)
    except (TypeError, ValueError):
        return False

# Xác thực user
def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.username == username).with_for_update().first()
    if not user or user.is_active is not True or not verify_password(password, user.hashed_password):
        return None
    return user
