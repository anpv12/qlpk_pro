from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class TextExpansion(Base):
    __tablename__ = "text_expansions"

    id = Column(Integer, primary_key=True, index=True)
    abbreviation = Column(String(20), nullable=False, index=True)  # từ viết tắt (bt, tt, kq...)
    full_text = Column(Text, nullable=False)  # từ đầy đủ (bình thường, tình trạng...)
    category = Column(String(50), default="general")  # phân loại (medical, psychological, general...)
    description = Column(Text)  # mô tả
    is_active = Column(Boolean, default=True)  # trạng thái
    created_by = Column(Integer, ForeignKey("users.id"))  # người tạo
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<TextExpansion(id={self.id}, abbreviation='{self.abbreviation}', full_text='{self.full_text}')>"
