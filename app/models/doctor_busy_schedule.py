from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class DoctorBusySchedule(Base):
    __tablename__ = "doctor_busy_schedules"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    reason = Column(String(255), nullable=True)  # Lý do bận
    description = Column(Text, nullable=True, default='')  # Mô tả chi tiết
    status = Column(String(20), default='active')  # active, cancelled
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Ai tạo
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    doctor = relationship("User", foreign_keys=[doctor_id], backref="busy_schedules")
    creator = relationship("User", foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'doctor_id': self.doctor_id,
            'doctor_name': self.doctor.full_name if self.doctor else None,
            'start_datetime': self.start_datetime.isoformat() if self.start_datetime else None,
            'end_datetime': self.end_datetime.isoformat() if self.end_datetime else None,
            'reason': self.reason,
            'description': self.description,
            'status': self.status,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<DoctorBusySchedule {self.id}: {self.doctor.full_name if self.doctor else "Unknown"} - {self.start_datetime} to {self.end_datetime}>'
