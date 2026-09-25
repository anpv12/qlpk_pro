from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
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
    balance_after = Column(Numeric(10, 2), nullable=True)  # Snapshot; legacy stays unknown.
    stock_balance_after = Column(Numeric(10, 2), nullable=True)
    note = Column(Text, nullable=True)  # Ghi chú
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=True, index=True)
    operation_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    sale_unit_price = Column(Numeric(15, 2), nullable=True)
    original_transaction_id = Column(Integer, ForeignKey('medicine_transactions.id'), nullable=True, index=True)
    sale_amount_delta = Column(Numeric(15, 2), nullable=True)
    
    # Relationships
    medicine = relationship("Medicine", backref="transactions")
    batch = relationship("MedicineBatch", backref="transactions")
    creator = relationship("User", foreign_keys=[created_by])
    
    def to_dict(self):
        return {
            'id': self.id,
            'appointment_id': self.appointment_id,
            'operation_id': str(self.operation_id) if self.operation_id else None,
            'original_transaction_id': self.original_transaction_id,
            'sale_unit_price': float(self.sale_unit_price) if self.sale_unit_price is not None else None,
            'sale_amount_delta': float(self.sale_amount_delta) if self.sale_amount_delta is not None else None,
            'unit_cost_snapshot': float(self.price) if self.appointment_id is not None and self.price is not None else None,
            'cost_amount_delta': float(-self.quantity * self.price) if self.appointment_id is not None and self.price is not None else None,
            'financial_trace_complete': self.appointment_id is not None and self.sale_amount_delta is not None and self.price is not None and self.batch_id is not None,
            'medicine_id': self.medicine_id,
            'medicine_name': self.medicine.name if self.medicine else None,
            'unit': self.medicine.unit if self.medicine else None,
            'batch_id': self.batch_id,
            'batch_number': self.batch.batch_number if self.batch else None,
            'type': self.type,
            'quantity': float(self.quantity) if self.quantity else 0,
            'price': float(self.price) if self.price is not None else None,
            'balance_after': float(self.balance_after) if self.balance_after is not None else None,
            'stock_balance_after': float(self.stock_balance_after) if self.stock_balance_after is not None else None,
            'receipt_reference': f'NK-{self.batch_id}' if self.batch_id else None,
            'invoice_number': self.batch.invoice_number if self.batch else None,
            'note': self.note,
            'created_by': self.created_by,
            'created_by_name': self.creator.full_name if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'date': self.created_at.date().isoformat() if self.created_at else None
        }
