from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Attachment(Base):
    __tablename__ = "attachments"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    filename = Column(String(255), nullable=False)  # Tên file lưu trên server
    original_filename = Column(String(255), nullable=False)  # Tên file gốc
    file_size = Column(Integer, nullable=False)  # Kích thước file (bytes)
    file_type = Column(String(50), nullable=False)  # Loại file (pdf, doc, etc.)
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    description = Column(Text, nullable=True)  # Mô tả file
    
    # Relationship
    patient = relationship("Patient", back_populates="attachments")
    
    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_size': self.file_size,
            'file_type': self.file_type,
            'upload_date': self.upload_date.isoformat() if self.upload_date else None,
            'description': self.description
        } 