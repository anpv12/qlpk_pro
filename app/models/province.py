from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class Province(Base):
    __tablename__ = "provinces"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, index=True, nullable=False)  # Mã tỉnh/thành phố
    name = Column(String(255), nullable=False)  # Tên tỉnh/thành phố
    name_en = Column(String(255))  # Tên tiếng Anh
    full_name = Column(String(255))  # Tên đầy đủ
    full_name_en = Column(String(255))  # Tên đầy đủ tiếng Anh
    code_name = Column(String(50))  # Mã tên
    administrative_unit_id = Column(Integer)  # ID đơn vị hành chính
    administrative_region_id = Column(Integer)  # ID vùng hành chính
    
    # Relationship
    districts = relationship("District", back_populates="province")
    
    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'name_en': self.name_en,
            'full_name': self.full_name,
            'full_name_en': self.full_name_en,
            'code_name': self.code_name,
            'administrative_unit_id': self.administrative_unit_id,
            'administrative_region_id': self.administrative_region_id
        }
