from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    specialization = Column(String)  # Chuyên khoa
    phone = Column(String)
    email = Column(String)
    license_number = Column(String)  # Số chứng chỉ hành nghề
    license_certificate_file = Column(String)  # Đường dẫn file và tên file gốc (format: path|original_filename)
    license_issue_date = Column(Date)  # Ngày cấp chứng nhận
    experience_years = Column(Integer)  # Số năm kinh nghiệm
    education = Column(Text)  # Học vị, bằng cấp
    bio = Column(Text)  # Tiểu sử
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="doctor_profile")
    
    def __repr__(self):
        return f'<Doctor {self.name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'specialization': self.specialization,
            'phone': self.phone,
            'email': self.email,
            'license_number': self.license_number,
            'license_certificate_file': self.license_certificate_file,
            'license_issue_date': self.license_issue_date.isoformat() if self.license_issue_date else None,
            'experience_years': self.experience_years,
            'education': self.education,
            'bio': self.bio,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        } 