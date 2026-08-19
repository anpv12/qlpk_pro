from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class ICD(Base):
    __tablename__ = "icd"
    
    id = Column(Integer, primary_key=True, index=True)
    icd_code = Column(String(20), unique=True, nullable=False, index=True, comment="Mã ICD")
    disease_name = Column(String(500), nullable=False, comment="Tên bệnh")
    description = Column(Text, comment="Mô tả")
    disease_group = Column(String(200), comment="Nhóm bệnh")
    
    # Soft delete fields
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    def __repr__(self):
        return f"<ICD(id={self.id}, icd_code='{self.icd_code}', disease_name='{self.disease_name}')>"
