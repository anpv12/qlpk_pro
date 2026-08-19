from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Occupation(Base):
    __tablename__ = 'occupations'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # updated_at = Column(DateTime(timezone=True), onupdate=func.now())  # Comment out vì bảng không có
    
    def __repr__(self):
        return f"<Occupation(id={self.id}, name='{self.name}', is_active={self.is_active})>"
