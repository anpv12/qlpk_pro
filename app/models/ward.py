from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Ward(Base):
    __tablename__ = "wards"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, index=True, nullable=False)  # Mã phường/xã
    name = Column(String(255), nullable=False)  # Tên phường/xã
    name_en = Column(String(255))  # Tên tiếng Anh
    full_name = Column(String(255))  # Tên đầy đủ
    full_name_en = Column(String(255))  # Tên đầy đủ tiếng Anh
    code_name = Column(String(50))  # Mã tên
    district_code = Column(String(10), ForeignKey('districts.code'), nullable=False)  # Mã quận/huyện
    administrative_unit_id = Column(Integer)  # ID đơn vị hành chính
    
    # Relationship
    district = relationship("District", back_populates="wards")
    
    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'name_en': self.name_en,
            'full_name': self.full_name,
            'full_name_en': self.full_name_en,
            'code_name': self.code_name,
            'district_code': self.district_code,
            'administrative_unit_id': self.administrative_unit_id
        }
