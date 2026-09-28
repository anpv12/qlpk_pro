from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class DrugInteraction(Base):
    __tablename__ = "drug_interactions"

    id = Column(Integer, primary_key=True, index=True)
    # Lưu trực tiếp chuỗi hoạt chất thay vì foreign key
    hoat_chat_1 = Column(String(255), nullable=False, index=True)
    hoat_chat_2 = Column(String(255), nullable=False, index=True)
    
    # Loại tương tác: contraindicated (Chống chỉ định) / approved (Được đồng thuận)
    interaction_type = Column(String(20), nullable=False, default='contraindicated')
    # 3 field cố định + ghi chú
    consequence = Column(Text)       # Hậu quả
    mechanism = Column(Text)         # Cơ chế tương tác
    management = Column(Text)        # Cách xử trí
    notes = Column(Text)             # Ghi chú

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'hoat_chat_1': self.hoat_chat_1,
            'hoat_chat_2': self.hoat_chat_2,
            'interaction_type': self.interaction_type,
            'consequence': self.consequence,
            'mechanism': self.mechanism,
            'management': self.management,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
