from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    default_price = Column(Numeric(10, 2), nullable=False, default=0.0)  # Thay thế price cũ
    duration_minutes = Column(Integer, default=60)
    category_id = Column(Integer, ForeignKey("service_categories.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    category = relationship("ServiceCategory", back_populates="services")
    appointments = relationship("Appointment", back_populates="service") 
    prices = relationship("ServicePrice", back_populates="service", cascade="all, delete-orphan")
    appointment_services = relationship("AppointmentService", back_populates="service")


class ServicePrice(Base):
    __tablename__ = "service_prices"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    target_type = Column(String(50), nullable=False)  # 'individual', 'couple', 'family'
    target_name = Column(String(100), nullable=False)  # 'Cá nhân', 'Cặp đôi', 'Gia đình'
    price = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    service = relationship("Service", back_populates="prices") 