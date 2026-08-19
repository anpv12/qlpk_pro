from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class MedicineTransaction(Base):
    """Model lưu lịch sử giao dịch thuốc"""
    __tablename__ = 'medicine_transactions'
    
    id = Column(Integer, primary_key=True, index=True)
    medicine_id = Column(Integer, ForeignKey('medicines.id'), nullable=False)
    batch_id = Column(Integer, ForeignKey('medicine_batches.id'), nullable=True)
    type = Column(String(50), nullable=False)  # 'import', 'export', 'adjustment'
    quantity = Column(Numeric(10, 2), nullable=False)  # Số lượng (dương = nhập, âm = xuất)
    price = Column(Numeric(15, 2), nullable=True)  # Giá
    note = Column(Text, nullable=True)  # Ghi chú
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    
    # Relationships
    medicine = relationship("Medicine", backref="transactions")
    batch = relationship("MedicineBatch", backref="transactions")
    creator = relationship("User", foreign_keys=[created_by])
    
    def to_dict(self):
        return {
            'id': self.id,
            'medicine_id': self.medicine_id,
            'medicine_name': self.medicine.name if self.medicine else None,
            'batch_id': self.batch_id,
            'batch_number': self.batch.batch_number if self.batch else None,
            'type': self.type,
            'quantity': float(self.quantity) if self.quantity else 0,
            'price': float(self.price) if self.price else 0,
            'note': self.note,
            'created_by': self.created_by,
            'created_by_name': self.creator.full_name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'date': self.created_at.date().isoformat() if self.created_at else None
        }
