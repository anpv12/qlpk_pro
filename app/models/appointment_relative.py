from app.core.database import Base
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

class AppointmentRelative(Base):
    __tablename__ = 'appointment_relatives'
    
    id = Column(Integer, primary_key=True)
    appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=False)
    examination_id = Column(Integer, ForeignKey('examinations.id'), nullable=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    
    # Link với family_member nếu người đi cùng là người thân
    # Lưu ý: Không có ForeignKey constraint để cho phép xóa family_member tự do
    family_member_id = Column(Integer, nullable=True)
    
    # Thông tin người đi cùng
    name = Column(String(255), nullable=False)
    kinship = Column(String(100), nullable=False)  # Quan hệ (VD: Bạn, Người quen, Mẹ, Vợ...) - Bắt buộc
    id_number = Column(String(20), nullable=True)  # CCCD/CMND (Bắt buộc nếu nhập thủ công, optional nếu chọn từ hệ thống)
    phone = Column(String(20))
    emergency_contact = Column(Boolean, default=False)
    notes = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    appointment = relationship('Appointment', back_populates='appointment_relatives')
    examination = relationship('Examination')
    patient = relationship('Patient')
    # Không có relationship family_member vì không có ForeignKey constraint
    # Code đang query trực tiếp: db.query(FamilyMember).filter(FamilyMember.id == family_member_id)
    
    def __repr__(self):
        return f'<AppointmentRelative {self.name} - Appointment {self.appointment_id}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'appointment_id': self.appointment_id,
            'examination_id': self.examination_id,
            'patient_id': self.patient_id,
            'family_member_id': self.family_member_id,
            'name': self.name,
            'kinship': self.kinship,
            'id_number': self.id_number,
            'phone': self.phone,
            'emergency_contact': self.emergency_contact,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

