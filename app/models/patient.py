from sqlalchemy import Column, Integer, String, Date, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    patient_code = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    nickname = Column(String)  # Tên thường gọi
    gender = Column(String)  # Giới tính
    mang_thai = Column(Boolean, default=False)  # Mang thai
    so_tuan_thai = Column(Integer)  # Số tuần thai (tính tự động từ ngày dự sinh)
    expected_delivery_date = Column(Date)  # Ngày dự sinh
    id_number = Column(String)  # CCCD/CMND
    phone = Column(String)  # Số điện thoại
    email = Column(String)  # Email
    date_of_birth = Column(Date)
    age = Column(Integer, nullable=True)  # Tuổi của bệnh nhân
    address = Column(Text)  # Giữ lại để tương thích
    province = Column(String)  # Tỉnh/Thành phố
    district = Column(String)  # Quận/Huyện
    ward = Column(String)  # Phường/Xã
    address_detail = Column(String)  # Địa chỉ chi tiết (số nhà, tên đường)
    
    # Thông tin cá nhân
    occupation = Column(String)  # Nghề nghiệp
    don_vi_cong_tac = Column(String)  # Đơn vị công tác
    dia_chi_cong_ty = Column(String)  # Địa chỉ công ty
    marital_status = Column(String)  # Tình trạng hôn nhân
    sexual_orientation = Column(String)  # Xu hướng tính dục
    religion = Column(String)  # Tôn giáo
    ethnicity = Column(String)  # Dân tộc
    nationality = Column(String)  # Quốc tịch
    education_level = Column(String)  # Trình độ học vấn
    
    # Thông tin liên hệ khẩn cấp
    emergency_contact = Column(String)
    
    # Thông tin mới từ modal "Hỏi bệnh"
    physical_history = Column(JSONB, default=list)  # Tiền sử bệnh lý cơ thể (Mảng JSONB chứa ICD hoặc text)
    severity_level = Column(String)  # Mức độ nghiêm trọng
    
    # Lý do tới khám
    referral_source = Column(String)  # Nguồn giới thiệu
    referral_source_tag = Column(String)  # Tag chuẩn hóa cho thống kê nguồn giới thiệu
    referral_source_detail = Column(Text)  # Nội dung nguồn giới thiệu gốc/chi tiết
    problem_start_time = Column(String)  # Thời gian bắt đầu vấn đề
    symptom_progression = Column(Text)  # Diễn biến các triệu chứng
    
    # Tiền sử cá nhân
    family_history = Column(JSONB, default=list)  # Tiền sử gia đình — JSONB hybrid: [{"type":"icd","id":45},{"type":"text","value":"..."}]
    substance_use_history = Column(JSONB, default=dict)  # Đặc điểm liên quan bệnh (10 chất) trọn đời
    # Hành vi hiện tại
    current_behavior = Column(Text)  # Hành vi hiện tại
    
    # Thông tin khác
    allergies = Column(JSONB, default=list)
    current_medication = Column(Text)  # Thuốc đang dùng
    safety_plan = Column(JSONB)  # Kế hoạch an toàn
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    appointments = relationship("Appointment", back_populates="patient")
    examinations = relationship("Examination", back_populates="patient", cascade="all, delete-orphan")
    survey_responses = relationship("SurveyResponse", back_populates="patient", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="patient")
    family_members = relationship("FamilyMember", foreign_keys="[FamilyMember.patient_id]", back_populates="patient", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="patient", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f'<Patient {self.full_name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'patient_code': self.patient_code,
            'full_name': self.full_name,
            'nickname': self.nickname,
            'gender': self.gender,
            'mang_thai': self.mang_thai,
            'so_tuan_thai': self.so_tuan_thai,
            'id_number': self.id_number,
            'phone': self.phone,
            'email': self.email,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'age': self.age,
            'address': self.address,
            'province': self.province,
            'district': self.district,
            'ward': self.ward,
            'address_detail': self.address_detail,
            'nationality': self.nationality,
            'religion': self.religion,
            'education_level': self.education_level,
            'occupation': self.occupation,
            'don_vi_cong_tac': self.don_vi_cong_tac,
            'dia_chi_cong_ty': self.dia_chi_cong_ty,
            'marital_status': self.marital_status,
            'sexual_orientation': self.sexual_orientation,
            'ethnicity': self.ethnicity,
            'emergency_contact': self.emergency_contact,
            'physical_history': self.physical_history or [],
            'severity_level': self.severity_level,
            'referral_source': self.referral_source,
            'referral_source_tag': self.referral_source_tag,
            'referral_source_detail': self.referral_source_detail,
            'problem_start_time': self.problem_start_time,
            'symptom_progression': self.symptom_progression,
            'family_history': self.family_history or [],
            'substance_use_history': self.substance_use_history or {},
            'current_behavior': self.current_behavior,
            'allergies': self.allergies or [],
            'current_medication': self.current_medication,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        } 
