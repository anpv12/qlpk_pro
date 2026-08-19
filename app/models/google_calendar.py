from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class GoogleCalendarConnection(Base):
    __tablename__ = "google_calendar_connections"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    google_email = Column(String(255), nullable=True)  # Email Google đang liên kết
    access_token = Column(Text)
    refresh_token = Column(Text)
    token_expires_at = Column(DateTime)
    is_active = Column(Boolean, default=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)  # Lần cuối verify connection
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("User", backref="google_calendar_connection")

class GoogleCalendarEvent(Base):
    __tablename__ = "google_calendar_events"
    
    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False, unique=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL for old data
    event_id = Column(String(255), nullable=False)  # Google Calendar event ID
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    appointment = relationship("Appointment", backref="google_calendar_event")
    user = relationship("User")
