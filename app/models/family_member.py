from app.core.database import Base
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from datetime import datetime

class FamilyMember(Base):
    __tablename__ = 'family_members'
    
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    relative_patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # ID của người thân trong hệ thống
    name = Column(String(255))
    kinship = Column(String(100))  # Đổi tên từ 'relationship' sang 'kinship'
    diagnosis = Column(Text)
    examine_together = Column(Boolean, default=False)
    
    # Additional fields for detailed information
    date_of_birth = Column(Date)
    gender = Column(String(20))
    phone = Column(String(20))
    emergency_contact = Column(Boolean, default=False)  # Liên hệ khẩn cấp (true/false)
    joint_exam_date = Column(Date)  # Ngày khám cùng
    id_number = Column(String(20))  # CCCD/CMND
    occupation = Column(String(100))
    address = Column(Text)
    notes = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id], back_populates='family_members')
    relative_patient = relationship('Patient', foreign_keys=[relative_patient_id])
    
    def __repr__(self):
        return f'<FamilyMember {self.name} - {self.kinship}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'relative_patient_id': self.relative_patient_id,
            'name': self.name,
            'kinship': self.kinship,
            'diagnosis': self.diagnosis,
            'examine_together': self.examine_together,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'gender': self.gender,
            'phone': self.phone,
            'emergency_contact': self.emergency_contact,
            'joint_exam_date': self.joint_exam_date.isoformat() if self.joint_exam_date else None,
            'id_number': self.id_number,
            'occupation': self.occupation,
            'address': self.address,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        } 