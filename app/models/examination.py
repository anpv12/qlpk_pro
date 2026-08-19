from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum, Numeric, Date, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class ExaminationStatus(str, enum.Enum):
    WAITING_TRANSFER = "WAITING_TRANSFER"      # Chờ chuyển khám
    DOCTOR_EXAM = "DOCTOR_EXAM"                # Bác sĩ khám
    PSYCHOLOGIST_EXAM = "PSYCHOLOGIST_EXAM"    # Tâm lý gia khám
    CONCLUSION = "CONCLUSION"                  # Kết luận
    WAITING_PAYMENT = "WAITING_PAYMENT"        # Chờ thanh toán
    PAID = "PAID"                             # Đã thanh toán
    COMPLETED = "COMPLETED"                    # Hoàn thành


class ExaminationType(str, enum.Enum):
    PACKAGE = "PACKAGE"  # Theo gói
    SERVICE = "SERVICE"  # Theo dịch vụ


class Examination(Base):
    __tablename__ = "examinations"

    id = Column(Integer, primary_key=True, index=True)
    examination_code = Column(String, unique=True, index=True, nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)  # Liên kết với lịch hẹn
    
    # Thông tin bệnh nhân (copy từ appointment để độc lập)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Thông tin khám
    examination_date = Column(DateTime, nullable=False)  # Ngày khám thực tế
    examination_type = Column(Enum(ExaminationType), nullable=True)  # Theo gói/Theo dịch vụ
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)
    
    # Trạng thái khám
    status = Column(Enum(ExaminationStatus), default=ExaminationStatus.WAITING_TRANSFER)
    
    # Thông tin khám chi tiết
    main_reason = Column(Text)  # Lý do chính đến khám (MOVED FROM PATIENT)
    main_symptoms = Column(Text)  # Triệu chứng chính (MOVED FROM PATIENT)
    diagnosis = Column(JSONB)  # Chẩn đoán (array ICD ID integers)
    benh_kem_theo = Column(JSONB)  # Bệnh kèm theo (array ICD ID integers)
    treatment_plan = Column(Text)  # Kế hoạch điều trị
    loi_dan = Column(Text)  # Lời dặn
    current_medications = Column(Text)  # Thuốc đang dùng (JSON array string)
    risk_assessment = Column(JSONB, nullable=True)  # Đánh giá nguy cơ có cấu trúc (theo từng lần khám)
    
    # Thông tin thể chất
    weight = Column(Numeric(5, 2), nullable=True)  # Cân nặng (kg)
    height = Column(Numeric(5, 2), nullable=True)  # Chiều cao (cm)
    bmi = Column(Numeric(6, 2), nullable=True)  # BMI (tự động tính)
    
    # Vital signs - BỔ SUNG
    pulse = Column(Numeric(5, 2), nullable=True)  # Mạch (lần/phút)
    blood_pressure = Column(String(20), nullable=True)  # Huyết áp (mmHg)
    temperature = Column(Numeric(5, 2), nullable=True)  # Nhiệt độ (độ C)
    breathing = Column(Numeric(5, 2), nullable=True)  # Nhịp thở (lần/phút)
    
    # Thông tin thanh toán
    actual_price = Column(Numeric(10, 2), nullable=True)  # Giá thực tế
    payment_status = Column(String(20), default="UNPAID")  # Trạng thái thanh toán
    advance_payment = Column(Numeric(10, 2), default=0)  # Đã nhận trước
    amount_paid = Column(Numeric(10, 2), default=0)  # Số tiền trả
    
    # Thông tin khác
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    appointment = relationship("Appointment", back_populates="examinations")
    patient = relationship("Patient", back_populates="examinations")
    doctor = relationship("User", foreign_keys=[doctor_id])
    service = relationship("Service")
    package = relationship("Package")
    details = relationship("ExaminationDetail", back_populates="examination", cascade="all, delete-orphan")
    survey_responses = relationship("SurveyResponse", back_populates="examination", cascade="all, delete-orphan")
    # survey_sessions = relationship("SurveySession", back_populates="examination", cascade="all, delete-orphan")
    # services relationship removed - using appointment_services instead
    
    def __repr__(self):
        return f'<Examination {self.examination_code} - {self.patient.full_name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'examination_code': self.examination_code,
            'appointment_id': self.appointment_id,
            'patient_id': self.patient_id,
            'doctor_id': self.doctor_id,
            'examination_date': self.examination_date.isoformat() if self.examination_date else None,
            'examination_type': self.examination_type.value if self.examination_type else None,
            'service_id': self.service_id,
            'package_id': self.package_id,
            'status': self.status.value if self.status else None,
            'main_reason': self.main_reason,
            'main_symptoms': self.main_symptoms,  # MOVED FROM PATIENT
            'diagnosis': self.diagnosis,
            'benh_kem_theo': self.benh_kem_theo,
            'treatment_plan': self.treatment_plan,
            'loi_dan': self.loi_dan,
            'current_medications': self.current_medications,
            'risk_assessment': self.risk_assessment,
            'weight': float(self.weight) if self.weight else None,
            'height': float(self.height) if self.height else None,
            'bmi': float(self.bmi) if self.bmi else None,
            # Vital signs - BỔ SUNG
            'pulse': float(self.pulse) if self.pulse else None,
            'blood_pressure': self.blood_pressure,
            'temperature': float(self.temperature) if self.temperature else None,
            'breathing': float(self.breathing) if self.breathing else None,
            'actual_price': float(self.actual_price) if self.actual_price else None,
            'payment_status': self.payment_status,
            'advance_payment': float(self.advance_payment) if self.advance_payment else 0,
            'amount_paid': float(self.amount_paid) if self.amount_paid else 0,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        } 
