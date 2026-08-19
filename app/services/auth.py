from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import JWTError, jwt
from app.core.config import settings
from app.models.user import User
from sqlalchemy.orm import Session

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Hash password
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# JWT
def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    
    # Nếu ACCESS_TOKEN_EXPIRE_MINUTES = 0, token sẽ không hết hạn
    if settings.ACCESS_TOKEN_EXPIRE_MINUTES == 0:
        # Không thêm trường "exp" vào token
        pass
    else:
        # Thêm thời gian hết hạn vào token
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    try:
        # Nếu token không có thời gian hết hạn, không cần verify exp
        if settings.ACCESS_TOKEN_EXPIRE_MINUTES == 0:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"verify_exp": False})
        else:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        
        username: str = payload.get("sub")
        if username is None:
            return None
        return username
    except JWTError:
        return None

# Xác thực user
def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user 