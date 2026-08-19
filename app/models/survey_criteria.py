from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class SurveyCriteria(Base):
    __tablename__ = 'survey_criteria'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, comment='Tên tiêu chí khảo sát')
    description = Column(String(500), nullable=True, comment='Mô tả tiêu chí')
    is_active = Column(Boolean, default=True, comment='Trạng thái hoạt động')
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment='Thời gian tạo')
    
    def __repr__(self):
        return f"<SurveyCriteria(id={self.id}, name='{self.name}')>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
