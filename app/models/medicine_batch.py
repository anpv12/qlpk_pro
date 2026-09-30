from sqlalchemy import Column, Integer, String, DateTime, Numeric, Date, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class MedicineBatch(Base):
    __tablename__ = "medicine_batches"

    id = Column(Integer, primary_key=True, index=True)
    medicine_id = Column(Integer, ForeignKey('medicines.id'), nullable=False, index=True)
    # One row per receipt line; a manufacturer's lot may arrive more than once.
    batch_number = Column(String(50), nullable=False, index=True)
    import_date = Column(Date, nullable=False)  # Ngày nhập kho
    expiry_date = Column(Date, nullable=False, index=True)  # Ngày hết hạn
    quantity = Column(Numeric(10, 3), nullable=False)  # Số lượng nhập
    remaining_quantity = Column(Numeric(10, 3), nullable=False)  # Số lượng còn lại
    import_price = Column(Numeric(10, 2), nullable=True)  # Giá nhập
    supplier_id = Column(Integer, ForeignKey('suppliers.id'), nullable=True, index=True)  # Nhà cung cấp
    invoice_number = Column(String(100), nullable=True)  # Số hóa đơn
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)  # Người thực hiện nhập kho
    notes = Column(String(500), nullable=True)  # Ghi chú
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    medicine = relationship("Medicine", back_populates="batches")
    supplier = relationship("Supplier", back_populates="batches")
    creator = relationship("User")

    def to_dict(self):
        from datetime import date
        days_to_expiry = None
        if self.expiry_date:
            try:
                days_to_expiry = (self.expiry_date - date.today()).days
            except (TypeError, AttributeError):
                days_to_expiry = None

        # Xác định trạng thái lô
        status = "Bình thường"
        if days_to_expiry is not None:
            if days_to_expiry < 0:
                status = "Đã hết hạn"
            elif days_to_expiry <= 30:
                status = "Sắp hết hạn"
            elif self.remaining_quantity and float(self.remaining_quantity) <= float(self.quantity) * 0.1:
                status = "Sắp hết"

        return {
            'id': self.id,
            'medicine_id': self.medicine_id,
            'medicine_name': self.medicine.name if self.medicine else None,
            'batch_number': self.batch_number,
            'import_date': self.import_date.isoformat() if self.import_date else None,
            'expiry_date': self.expiry_date.isoformat() if self.expiry_date else None,
            'quantity': float(self.quantity) if self.quantity else 0,
            'remaining_quantity': float(self.remaining_quantity) if self.remaining_quantity else 0,
            'import_price': float(self.import_price) if self.import_price is not None else None,
            'receipt_reference': f'NK-{self.id}',
            'import_value': float(self.quantity * self.import_price) if self.import_price is not None else None,
            'stock_value': float(self.remaining_quantity * self.import_price) if self.import_price is not None else None,
            'supplier_id': self.supplier_id,
            'supplier_name': self.supplier.name if self.supplier else None,
            'invoice_number': self.invoice_number,
            'created_by': self.created_by,
            'creator_name': self.creator.full_name if self.creator else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'days_to_expiry': days_to_expiry,
            'status': status
        }
