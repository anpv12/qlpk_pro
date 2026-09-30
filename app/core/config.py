from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional, List
import time


class Settings(BaseSettings):
    # Server Configuration
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    BASE_URL: Optional[str] = None
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:123456@postgres:5432/qlpk_db"
    
    # JWT
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=480, ge=0, le=1440)
    
    # App
    APP_NAME: str = "QLPK - Hệ thống quản lý phòng khám tâm lý"
    DEBUG: bool = False
    AUTO_CREATE_TABLES: Optional[bool] = None

    # Realtime Socket.IO
    REALTIME_REDIS_URL: Optional[str] = None
    SESSION_REDIS_URL: Optional[str] = None
    LOGIN_REDIS_URL: Optional[str] = None
    LOGIN_ACCOUNT_ATTEMPTS: int = Field(default=10, ge=1, le=1000)
    LOGIN_IP_ATTEMPTS: int = Field(default=60, ge=1, le=10000)
    LOGIN_WINDOW_SECONDS: int = Field(default=300, ge=1, le=3600)
    
    # Versioning for Cache Invalidation
    APP_VERSION: str = str(int(time.time()))



    
    # CORS - sẽ được override từ .env (comma-separated string)
    # Trong .env file, dùng BACKEND_CORS_ORIGINS (không có dấu _)
    BACKEND_CORS_ORIGINS_STR: str = ""  # Lưu dạng string từ .env, sẽ parse thành list sau
    
    # Allowed Hosts - chỉ cho phép domain, không cho IP
    # Trong .env file, dùng ALLOWED_HOSTS_STR (comma-separated string)
    ALLOWED_HOSTS_STR: str = ""  # Lưu dạng string từ .env, sẽ parse thành list sau
    ALLOWED_HOSTS: List[str] = ['localhost', '127.0.0.1', 'pktamly.io.vn', 'www.pktamly.io.vn','qlpk.io.vn', 'www.qlpk.io.vn']  # Default allowed domains
    
    # Email Configuration
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SENDER_EMAIL: str = "anp65521@gmail.com"
    SENDER_PASSWORD: str = ""
    EMAIL_TIMEOUT_SECONDS: int = 30  # Timeout cho email sending
    EMAIL_USE_TLS: bool = True  # Sử dụng TLS encryption
    EMAIL_USE_SSL: bool = False  # Không sử dụng SSL
    
    # Clinic Configuration
    CLINIC_PHONE_NUMBER: str = "0123456789"  # Số điện thoại phòng khám
    
    # AI Usage Suggestion Configuration
    USAGE_AI_API_URL: Optional[str] = None
    USAGE_AI_API_KEY: Optional[str] = None
    USAGE_AI_MODEL: Optional[str] = None
    USAGE_AI_TIMEOUT_SECONDS: int = 30
    
    # Kinship normalization AI
    KINSHIP_AI_API_URL: Optional[str] = None
    KINSHIP_AI_API_KEY: Optional[str] = None
    KINSHIP_AI_MODEL: Optional[str] = None
    KINSHIP_AI_TIMEOUT_SECONDS: int = 15
    
    # Google Calendar Integration
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None  # Nếu set thì dùng cái này, không thì auto-detect từ request

    # Attachments
    ATTACHMENT_MAX_SIZE_MB: int = 50
    SAFETY_PLAN_MAX_SIZE_MB: int = 10
    
    class Config:
        # .env dùng chung (có thể chép lên server); .env.local chỉ ở máy dev, ghi đè .env.
        # Biến môi trường thật (vd. docker-compose `environment:`) luôn thắng cả hai file.
        env_file = (".env", ".env.local")
        extra = "allow"  # Cho phép các biến môi trường extra


settings = Settings()

# Parse BACKEND_CORS_ORIGINS từ string thành list
def get_cors_origins() -> List[str]:
    """Parse CORS origins từ string thành list"""
    cors_str = getattr(settings, 'BACKEND_CORS_ORIGINS_STR', '')
    if cors_str:
        # Parse comma-separated string thành list
        cors_list = [origin.strip() for origin in cors_str.split(',') if origin.strip()]
        if cors_list:
            return cors_list
    
    # Fallback về default nếu không có trong .env
    return [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

# Parse ALLOWED_HOSTS từ string thành list
def get_allowed_hosts() -> List[str]:
    """Parse ALLOWED_HOSTS từ string thành list"""
    allowed_hosts_str = getattr(settings, 'ALLOWED_HOSTS_STR', '')
    if allowed_hosts_str:
        # Parse comma-separated string thành list
        hosts_list = [host.strip() for host in allowed_hosts_str.split(',') if host.strip()]
        if hosts_list:
            return hosts_list
    
    # Fallback về default nếu không có trong .env
    return getattr(settings, 'ALLOWED_HOSTS', ['pktamly.io.vn', 'www.pktamly.io.vn','qlpk.io.vn', 'www.qlpk.io.vn'])

# Gán lại ALLOWED_HOSTS thành list
settings.ALLOWED_HOSTS = get_allowed_hosts()

# Gán lại BACKEND_CORS_ORIGINS thành list (để dùng trong CORS)
settings.BACKEND_CORS_ORIGINS = get_cors_origins() 
