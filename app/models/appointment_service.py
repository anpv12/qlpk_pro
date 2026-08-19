from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AppointmentService(Base):
    __tablename__ = "appointment_services"

    # Cột gốc
    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    price = Column(Numeric(10, 2), nullable=False)  # Giá gốc (không đổi)
    description = Column(Text, nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Cột mới từ examination_services
    service_name = Column(String(255), nullable=True)  # Tên dịch vụ (có thể chỉnh sửa)
    unit_price = Column(Numeric(10, 2), nullable=True)  # Giá đơn vị (có thể chỉnh sửa)
    discount_percent = Column(Numeric(5, 2), nullable=True, default=0)  # Chiết khấu
    tax_percent = Column(Numeric(5, 2), nullable=True, default=0)  # Thuế GTGT
    total_amount = Column(Numeric(10, 2), nullable=True)  # Thành tiền sau tính toán
    paid_before = Column(Boolean, nullable=True, default=False)  # Đã thanh toán trước
    is_package = Column(Boolean, nullable=True, default=False)  # Là gói dịch vụ
    duration_minutes = Column(Integer, nullable=True)  # Thời gian thực hiện dịch vụ (phút)

    # Relationships
    appointment = relationship("Appointment", back_populates="appointment_services")
    service = relationship("Service", back_populates="appointment_services") 