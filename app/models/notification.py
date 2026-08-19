from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    recipient_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    recipient_role = Column(String(50), nullable=True, index=True)
    notification_type = Column(String(20), nullable=False)  # 'email', 'sms', 'both'
    event_type = Column(String(80), nullable=True)
    title = Column(String(255), nullable=True)
    scheduled_time = Column(DateTime, nullable=False)  # Thời gian gửi thông báo
    sent_time = Column(DateTime, nullable=True)  # Thời gian đã gửi
    read_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default='pending')  # 'pending', 'sent', 'failed'
    message = Column(Text, nullable=True)  # Nội dung thông báo
    action_url = Column(String(255), nullable=True)
    payload = Column(JSONB, nullable=True, default=dict)
    error_message = Column(Text, nullable=True)  # Lỗi nếu gửi thất bại
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    appointment = relationship("Appointment", back_populates="notifications")
    patient = relationship("Patient", back_populates="notifications")
    recipient_user = relationship("User", foreign_keys=[recipient_user_id])
