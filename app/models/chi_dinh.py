from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Date, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ChiDinh(Base):
    __tablename__ = "chi_dinh"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    survey_template_id = Column(Integer, ForeignKey("survey_templates.id"), nullable=True)  # Nếu là chỉ định khảo sát tâm lý
    order_name = Column(String(255), nullable=False)  # Tên chỉ định
    location_type = Column(String(20), nullable=False)  # 'in' hoặc 'out'
    in_house_unit = Column(String(255), nullable=True)  # Đơn vị/người thực hiện trong cơ sở (deprecated, dùng in_house_unit_id)
    in_house_unit_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # ID người thực hiện trong cơ sở
    out_facility = Column(String(255), nullable=True)  # Cơ sở ngoài
    scheduled_for = Column(Date, nullable=True)  # Ngày chỉ định
    status = Column(String(20), default='sent')  # sent, survey_sent, has_result, completed
    survey_sent_at = Column(DateTime(timezone=True), nullable=True)
    survey_expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    result_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completion_reason = Column(String(20), nullable=True)
    completed_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    is_completed = Column(Boolean, default=False)  # Đã hoàn tất
    note_nurse = Column(Text, nullable=True)  # Ghi chú của y tá
    note_patient = Column(Text, nullable=True)  # Ghi chú của bệnh nhân
    result_files = Column(JSON, nullable=True)  # Danh sách file kết quả: [{"id": 1, "filename": "...", "original_filename": "...", "upload_date": "..."}]
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    appointment = relationship("Appointment", back_populates="chi_dinh")
    survey_template = relationship("SurveyTemplate", foreign_keys=[survey_template_id])
    in_house_unit_user = relationship("User", foreign_keys=[in_house_unit_id])

    def __repr__(self):
        return f"<ChiDinh {self.order_name} - Appointment {self.appointment_id}>"

    def to_dict(self):
        # Load tên từ relationship nếu có in_house_unit_id, fallback về in_house_unit (backward compatibility)
        in_house_unit_name = None
        if self.in_house_unit_id and self.in_house_unit_user:
            in_house_unit_name = self.in_house_unit_user.full_name
        elif self.in_house_unit:
            in_house_unit_name = self.in_house_unit
        
        return {
            "id": self.id,
            "appointment_id": self.appointment_id,
            "survey_template_id": self.survey_template_id,
            "survey_template_name": self.survey_template.name if self.survey_template else None,
            "order_name": self.order_name,
            "location_type": self.location_type,
            "in_house_unit": in_house_unit_name,  # Tên để hiển thị (từ ID hoặc từ field cũ)
            "in_house_unit_id": self.in_house_unit_id,  # ID để lưu
            "out_facility": self.out_facility,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "status": self.status,
            "is_completed": self.status == "completed",
            "survey_sent_at": self.survey_sent_at.isoformat() if self.survey_sent_at else None,
            "survey_expires_at": self.survey_expires_at.isoformat() if self.survey_expires_at else None,
            "result_at": self.result_at.isoformat() if self.result_at else None,
            "completion_reason": self.completion_reason,
            "completed_by": self.completed_by,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "note_nurse": self.note_nurse,
            "note_patient": self.note_patient,
            "result_files": self.result_files if self.result_files else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
