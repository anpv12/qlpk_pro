from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class SurveyTemplate(Base):
    __tablename__ = 'survey_templates'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, comment='Tên mẫu khảo sát')
    description = Column(Text, comment='Mô tả mẫu khảo sát')
    content = Column(JSON, comment='Nội dung cấu trúc khảo sát (JSON)')
    file_path = Column(String(500), comment='Đường dẫn file nếu có')
    file_name = Column(String(255), comment='Tên file gốc')
    file_size = Column(Integer, comment='Kích thước file (bytes)')
    file_type = Column(String(50), comment='Loại file (pdf, docx, xlsx, etc.)')
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False, comment='ID người tạo')
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment='Thời gian tạo')
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment='Thời gian cập nhật')
    is_active = Column(Boolean, default=True, comment='Trạng thái hoạt động')
    
    # Liên kết với dịch vụ để tính tiền
    service_id = Column(Integer, ForeignKey('services.id'), nullable=True, comment='ID dịch vụ liên kết (để tính tiền)')
    # Cấu hình tính tiền theo thời gian (nếu không dùng giá cố định từ service)
    pricing_type = Column(String(20), default='fixed', comment='Loại tính giá: fixed (theo service), time_based (theo thời gian)')
    price_per_minute = Column(Numeric(10, 2), nullable=True, comment='Giá mỗi phút (nếu tính theo thời gian)')
    min_price = Column(Numeric(10, 2), nullable=True, comment='Giá tối thiểu')
    max_price = Column(Numeric(10, 2), nullable=True, comment='Giá tối đa')
    
    # Relationships
    creator = relationship("User", back_populates="survey_templates")
    responses = relationship("SurveyResponse", back_populates="survey_template", cascade="all, delete-orphan")
    service = relationship("Service", foreign_keys=[service_id])
    
    def __repr__(self):
        return f"<SurveyTemplate(id={self.id}, name='{self.name}')>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'content': self.content,
            'file_path': self.file_path,
            'file_name': self.file_name,
            'file_size': self.file_size,
            'file_type': self.file_type,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_active': self.is_active,
            'creator_name': self.creator.full_name if self.creator else None,
            # Thông tin liên kết dịch vụ và tính tiền
            'service_id': self.service_id,
            'service_name': self.service.name if self.service else None,
            'pricing_type': self.pricing_type,
            'price_per_minute': float(self.price_per_minute) if self.price_per_minute else None,
            'min_price': float(self.min_price) if self.min_price else None,
            'max_price': float(self.max_price) if self.max_price else None
        }
