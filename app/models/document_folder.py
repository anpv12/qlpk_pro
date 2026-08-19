from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class DocumentFolder(Base):
    __tablename__ = "document_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("document_folders.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    parent = relationship("DocumentFolder", remote_side=[id], back_populates="children")
    children = relationship("DocumentFolder", back_populates="parent", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="folder", cascade="all, delete-orphan")
