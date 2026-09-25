from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime, timezone
import enum

class SurveySessionStatus(enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    expired = "expired"
    closed = "closed"

class SurveySession(Base):
    __tablename__ = 'survey_sessions'
    
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    examination_id = Column(Integer, ForeignKey('examinations.id'), nullable=False)
    order_id = Column(Integer, ForeignKey('chi_dinh.id', ondelete='SET NULL'), nullable=True, index=True)
    survey_template_id = Column(Integer, ForeignKey('survey_templates.id'), nullable=True)
    session_token = Column(String(255), unique=True, nullable=False)
    status = Column(Enum(SurveySessionStatus), default=SurveySessionStatus.pending, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    draft_responses = Column(JSON, nullable=True)
    draft_revision = Column(Integer, nullable=False, default=0, server_default='0')
    draft_updated_at = Column(DateTime(timezone=True), nullable=True)
    template_snapshot = Column(JSON, nullable=True)
    
    # Relationships
    # patient = relationship("Patient", back_populates="survey_sessions")
    # examination = relationship("Examination", back_populates="survey_sessions")
    
    def __repr__(self):
        return f"<SurveySession(id={self.id}, patient_id={self.patient_id}, status={self.status})>"
    
    def is_expired(self):
        """Check if session is expired - handles both timezone-aware and naive datetimes"""
        now = datetime.now(timezone.utc)
        expires_at = self.expires_at
        
        # Normalize both to timezone-aware UTC for comparison
        if expires_at.tzinfo is None:
            # If expires_at is naive, assume it's UTC
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        else:
            # Convert to UTC if it has timezone
            expires_at = expires_at.astimezone(timezone.utc)
        
        return now > expires_at
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'examination_id': self.examination_id,
            'session_token': self.session_token,
            'status': self.status.value,
            'expires_at': self.expires_at.isoformat(),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'started_at': self.started_at.isoformat() if self.started_at else None
        }
