from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("document_folders.id"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False) # 'file' or 'link'
    mime_type = Column(String(255), nullable=True) # file mime type or 'link'
    google_drive_file_id = Column(String(255), nullable=True) # for Drive API
    url = Column(String(2048), nullable=True) # download/view link or external URL
    size_bytes = Column(BigInteger, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    folder = relationship("DocumentFolder", back_populates="documents")
