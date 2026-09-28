from sqlalchemy import Column, Integer, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class SurveyResponse(Base):
    __tablename__ = 'survey_responses'
    
    id = Column(Integer, primary_key=True, index=True)
    examination_id = Column(Integer, ForeignKey('examinations.id'), nullable=False)
    survey_template_id = Column(Integer, ForeignKey('survey_templates.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    order_id = Column(Integer, ForeignKey('chi_dinh.id', ondelete='SET NULL'), nullable=True, index=True)
    session_id = Column(Integer, ForeignKey('survey_sessions.id', ondelete='SET NULL'), nullable=True, unique=True)
    template_snapshot = Column(JSON, nullable=True)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    responses = Column(JSON, nullable=True)  # Lưu câu trả lời: {question_id: answer_id, score}
    total_scores = Column(JSON, nullable=True)  # Tổng điểm theo tiêu chí: {anxiety: 10, depression: 15, stress: 8}
    notes = Column(Text, nullable=True)  # Ghi chú của bác sĩ
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    examination = relationship("Examination", back_populates="survey_responses")
    survey_template = relationship("SurveyTemplate", back_populates="responses")
    patient = relationship("Patient", back_populates="survey_responses")
    doctor = relationship("User", back_populates="survey_responses")
    
    def to_dict(self):
        return {
            'id': self.id,
            'order_id': self.order_id,
            'session_id': self.session_id,
            'examination_id': self.examination_id,
            'survey_template_id': self.survey_template_id,
            'patient_id': self.patient_id,
            'doctor_id': self.doctor_id,
            'responses': self.responses,
            'total_scores': self.total_scores,
            'result_summary': (self.template_snapshot or {}).get('result_summary'),
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
