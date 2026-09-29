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


class GoogleCalendarTransferJob(Base):
    __tablename__ = 'google_calendar_transfer_jobs'

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey('appointments.id', ondelete='CASCADE'), nullable=False, index=True)
    old_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    target_user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    event_id = Column(String(255), nullable=False, unique=True)
    attempts = Column(Integer, nullable=False, default=0, server_default='0')
    next_attempt_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GoogleCalendarSyncJob(Base):
    """Durable request to reconcile one appointment's Google events with its current state.

    Written in the caller's transaction; the worker reads the appointment at processing
    time, so several pending requests for the same appointment collapse into one job.
    """
    __tablename__ = 'google_calendar_sync_jobs'

    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey('appointments.id', ondelete='CASCADE'), nullable=False, index=True)
    token = Column(String(32), nullable=False)
    attempts = Column(Integer, nullable=False, default=0, server_default='0')
    next_attempt_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
