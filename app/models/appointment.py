from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class AppointmentStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"       # Đã lên lịch
    CONFIRMED = "CONFIRMED"       # Đã xác nhận
    CANCELLED = "CANCELLED"       # Đã hủy
    NO_SHOW = "NO_SHOW"          # Không đến


class AppointmentType(str, enum.Enum):
    SERVICE = "SERVICE"  # Dịch vụ
    PACKAGE = "PACKAGE"  # Gói khám


class AppointmentCategory(str, enum.Enum):
    NEW = "NEW"  # Khám mới
    RE_EXAMINATION = "RE_EXAMINATION"  # Tái khám


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    appointment_code = Column(String, unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    psychologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    appointment_date = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=60)
    status = Column(Enum(AppointmentStatus), default=AppointmentStatus.SCHEDULED)
    
    # Loại hẹn
    appointment_category = Column(Enum(AppointmentCategory), default=AppointmentCategory.NEW)  # Khám mới/Tái khám
    appointment_type = Column(Enum(AppointmentType), nullable=True)  # SERVICE/PACKAGE
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)
    
    # Link appointment tái khám với appointment gốc
    original_appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    
    # Thông tin khác
    target_type = Column(String(50), nullable=True)  # 'individual', 'couple', 'family'
    target_name = Column(String(100), nullable=True)  # 'Cá nhân', 'Cặp đôi', 'Gia đình'
    notes = Column(Text)  # Ghi chú lịch hẹn
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    doctor_queue_entered_at = Column(DateTime(timezone=True), nullable=True)
    
    # Soft delete fields
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("User", foreign_keys=[doctor_id])
    psychologist = relationship("User", foreign_keys=[psychologist_id])
    service = relationship("Service", back_populates="appointments")
    package = relationship("Package", back_populates="appointments")
    notifications = relationship("Notification", back_populates="appointment")
    examinations = relationship("Examination", back_populates="appointment", cascade="all, delete-orphan")
    appointment_services = relationship("AppointmentService", back_populates="appointment", cascade="all, delete-orphan")
    prescriptions = relationship("Prescription", back_populates="appointment", cascade="all, delete-orphan")
    chi_dinh = relationship("ChiDinh", back_populates="appointment", cascade="all, delete-orphan")
    appointment_relatives = relationship("AppointmentRelative", back_populates="appointment", cascade="all, delete-orphan") 
    
    def __repr__(self):
        return f'<Appointment {self.appointment_code} - {self.patient.full_name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'appointment_code': self.appointment_code,
            'patient_id': self.patient_id,
            'doctor_id': self.doctor_id,
            'psychologist_id': self.psychologist_id,
            'appointment_date': self.appointment_date.isoformat() if self.appointment_date else None,
            'duration_minutes': self.duration_minutes,
            'status': self.status.value if self.status else None,
            'appointment_category': self.appointment_category.value if self.appointment_category else None,
            'appointment_type': self.appointment_type.value if self.appointment_type else None,
            'service_id': self.service_id,
            'package_id': self.package_id,
            'target_type': self.target_type,
            'target_name': self.target_name,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'doctor_queue_entered_at': self.doctor_queue_entered_at.isoformat() if self.doctor_queue_entered_at else None,
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'original_appointment_id': self.original_appointment_id,
            'patient': self.patient.to_dict() if self.patient else None,
            'doctor': {
                'id': self.doctor.id,
                'name': self.doctor.full_name
            } if self.doctor else None,
            'psychologist': {
                'id': self.psychologist.id,
                'name': self.psychologist.full_name
            } if self.psychologist else None,
            'service': self.service.to_dict() if self.service else None,
            'package': self.package.to_dict() if self.package else None
        } 
