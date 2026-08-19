from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)  # Tên nhà cung cấp
    phone = Column(String(20), nullable=True)  # Số điện thoại
    email = Column(String(255), nullable=True)  # Email
    address = Column(Text, nullable=True)  # Địa chỉ
    tax_code = Column(String(50), nullable=True)  # Mã số thuế
    contact_person = Column(String(100), nullable=True)  # Người liên hệ
    notes = Column(Text, nullable=True)  # Ghi chú
    is_active = Column(Integer, default=1)  # 1 = active, 0 = inactive
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    batches = relationship("MedicineBatch", back_populates="supplier")

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'phone': self.phone,
            'email': self.email,
            'address': self.address,
            'tax_code': self.tax_code,
            'contact_person': self.contact_person,
            'notes': self.notes,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

