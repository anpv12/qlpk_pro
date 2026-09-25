from sqlalchemy import Column, Integer, String, Text, DateTime, Numeric, Boolean, Date, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Medicine(Base):
    __tablename__ = "medicines"
    __table_args__ = (UniqueConstraint('reference_catalog_id', name='uq_medicines_reference_catalog'),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False, index=True)
    reference_catalog_id = Column(Integer, ForeignKey('medicine_reference_catalog.id', name='fk_medicines_reference_catalog', ondelete='RESTRICT'), nullable=True)
    reference_snapshot = Column(JSONB, nullable=True)
    reference_catalog = relationship('MedicineReferenceCatalog')
    # Tên gốc/biệt dược
    generic_name = Column(Text)
    # Mã thuốc nội bộ (duy nhất)
    internal_code = Column(String(50), unique=True, index=True, nullable=True)
    # Mã dược quốc gia (không bắt buộc)
    national_code = Column(String(50), index=True)
    unit_price = Column(Numeric(10, 2), nullable=False)
    # Đơn vị bán (viên, gói, chai...)
    unit = Column(String(50), nullable=False)
    strength = Column(Text)  # Full DAV strength; never truncate identity.
    stock_quantity = Column(Numeric(10, 2), default=0)  # Hỗ trợ số thập phân (0.5, 0.25 viên)
    expiry_date = Column(Date)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    # New catalog entries are DRUG only; legacy classification is retained until verified.
    category_type = Column(String(20), default='DRUG')
    # Loại đơn thuốc: BASIC/H/N/TOXIC (Cơ bản/Thuốc H/Thuốc N/Thuốc độc)
    prescription_type = Column(String(20), default='BASIC')
    # Thuốc nội (False) / ngoại nhập (True)
    is_imported = Column(Boolean, default=False)
    # Phương thức dùng (uống/tiêm/bôi...)
    administration_method = Column(String(50))
    # Cảnh báo tồn kho
    low_stock_threshold = Column(Integer, default=0)
    # Cảnh báo hạn dùng theo số ngày
    expiry_warning_days = Column(Integer, default=0)
    # Quy cách đóng gói, nguồn gốc
    packaging = Column(String(255))
    # Số đơn vị trong một đơn vị đóng gói (ví dụ: 10 viên trong 1 hộp)
    units_per_box = Column(Integer, nullable=True)
    # Đơn vị đóng gói (ví dụ: hộp, vỉ, lọ)
    packaging_unit = Column(String(50), nullable=True)
    origin = Column(String(255))
    import_price = Column(Numeric(10, 2), nullable=True)  # Đơn giá nhập
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    batches = relationship("MedicineBatch", back_populates="medicine", cascade="all, delete-orphan")

    def to_dict(self):
        from datetime import date
        from app.modules.medicines.services.catalog_service import reference_state
        # `Medicine.expiry_date` is a legacy column no writer ever sets; hạn
        # dùng thật nằm ở từng lô (`MedicineBatch.expiry_date`). Cảnh báo và
        # hiển thị phải theo lô còn tồn (remaining_quantity > 0), gần hạn
        # nhất trong số đó, chứ không đọc field chết này.
        nearest_expiry_date = None
        try:
            active_batches = [b for b in (self.batches or [])
                               if b.expiry_date and (b.remaining_quantity or 0) > 0]
            if active_batches:
                nearest_expiry_date = min(b.expiry_date for b in active_batches)
        except Exception:
            nearest_expiry_date = None

        days_to_expiry = None
        if nearest_expiry_date:
            try:
                days_to_expiry = (nearest_expiry_date - date.today()).days
            except Exception:
                days_to_expiry = None

        is_low_stock = None
        if self.low_stock_threshold is not None:
            try:
                stock_qty = float(self.stock_quantity) if self.stock_quantity is not None else 0.0
                threshold = float(self.low_stock_threshold) if self.low_stock_threshold else 0.0
                is_low_stock = stock_qty <= threshold and threshold > 0
            except Exception:
                is_low_stock = None

        is_expiring_soon = None
        if days_to_expiry is not None and self.expiry_warning_days is not None:
            is_expiring_soon = days_to_expiry <= self.expiry_warning_days and self.expiry_warning_days > 0

        # Tính số lô (batch_count)
        batch_count = 0
        try:
            if self.batches:
                batch_count = len(self.batches)
        except Exception:
            pass

        return {
            'id': self.id,
            **reference_state(self),
            'name': self.name,
            'generic_name': self.generic_name,
            'internal_code': self.internal_code,
            'national_code': self.national_code,
            'unit_price': float(self.unit_price) if self.unit_price else 0,
            'unit': self.unit,
            'strength': self.strength,
            'stock_quantity': float(self.stock_quantity) if self.stock_quantity is not None else 0.0,  # Hỗ trợ số thập phân
            'expiry_date': self.expiry_date.isoformat() if self.expiry_date else None,
            'nearest_expiry_date': nearest_expiry_date.isoformat() if nearest_expiry_date else None,
            'description': self.description,
            'is_active': self.is_active,
            'category_type': self.category_type,
            'prescription_type': self.prescription_type,
            'is_imported': self.is_imported,
            'administration_method': self.administration_method,
            'low_stock_threshold': self.low_stock_threshold,
            'expiry_warning_days': self.expiry_warning_days,
            'packaging': self.packaging,
            'units_per_box': self.units_per_box,
            'packaging_unit': self.packaging_unit,
            'origin': self.origin,
            'import_price': float(self.import_price) if self.import_price else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            # Cờ tính toán
            'days_to_expiry': days_to_expiry,
            'is_low_stock': is_low_stock,
            'is_expiring_soon': is_expiring_soon,
            'batch_count': batch_count
        }
