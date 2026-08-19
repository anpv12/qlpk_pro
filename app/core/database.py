from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Tạo engine kết nối database với cấu hình pool ổn định hơn
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=20,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800
)

# Tạo SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Tạo Base class cho models
Base = declarative_base()


# Dependency để inject database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 