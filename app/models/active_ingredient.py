from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class ActiveIngredient(Base):
    __tablename__ = "active_ingredients"

    id = Column(Integer, primary_key=True, index=True)
    ten_hoat_chat = Column(String(255), nullable=False, unique=True, index=True)
    mo_ta = Column(Text)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'ten_hoat_chat': self.ten_hoat_chat,
            'mo_ta': self.mo_ta,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
