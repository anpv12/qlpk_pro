from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class District(Base):
    __tablename__ = "districts"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, index=True, nullable=False)  # Mã quận/huyện
    name = Column(String(255), nullable=False)  # Tên quận/huyện
    name_en = Column(String(255))  # Tên tiếng Anh
    full_name = Column(String(255))  # Tên đầy đủ
    full_name_en = Column(String(255))  # Tên đầy đủ tiếng Anh
    code_name = Column(String(50))  # Mã tên
    province_code = Column(String(10), ForeignKey('provinces.code'), nullable=False)  # Mã tỉnh/thành phố
    administrative_unit_id = Column(Integer)  # ID đơn vị hành chính
    
    # Relationship
    province = relationship("Province", back_populates="districts")
    wards = relationship("Ward", back_populates="district")
    
    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'name_en': self.name_en,
            'full_name': self.full_name,
            'full_name_en': self.full_name_en,
            'code_name': self.code_name,
            'province_code': self.province_code,
            'administrative_unit_id': self.administrative_unit_id
        }
