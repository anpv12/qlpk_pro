from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class Expense(Base):
    """Model lưu khoản chi tiêu phòng khám"""
    __tablename__ = 'expenses'

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    type = Column(String(100), nullable=True)  # Loại chi: Lương, Vật tư, Mượn phòng...
    category = Column(String(100), nullable=True)  # Hạng mục: Chi phát sinh, Chi thường xuyên...
    description = Column(Text, nullable=True)  # Mô tả
    person = Column(String(200), nullable=True)  # Người liên quan
    amount = Column(Numeric(15, 2), nullable=True)  # Số tiền (đơn vị: nghìn đồng)
    payment = Column(String(50), nullable=True)  # Hình thức: Tiền mặt, Chuyển khoản
    note = Column(Text, nullable=True)  # Ghi chú
    extra_data = Column(JSON, nullable=True, default=dict)  # Data cột tự thêm
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])

    def to_dict(self):
        result = {
            'id': self.id,
            'date': self.date.strftime('%d/%m/%Y') if self.date else '',
            'type': self.type or '',
            'category': self.category or '',
            'desc': self.description or '',
            'person': self.person or '',
            'amount': float(self.amount) if self.amount else 0,
            'payment': self.payment or '',
            'note': self.note or '',
            'created_by': self.created_by,
            'created_by_name': self.creator.full_name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if self.extra_data:
            result.update(self.extra_data)
        return result
