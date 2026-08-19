from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class AdministrativeUnit(Base):
    """
    Bảng lưu trữ Đơn vị hành chính (Cấp 2)
    Dữ liệu chuẩn hoá từ AddressKit (gộp cả Quận/Huyện và Phường/Xã vào 1 cấp trực thuộc Tỉnh)
    """
    __tablename__ = "administrative_units"

    code = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)     # VD: 'Phường Ba Đình'
    name_en = Column(String, nullable=True)
    administrative_level = Column(String, nullable=True)  # VD: 'Phường', 'Xã', 'Thị trấn'
    
    province_code = Column(String, ForeignKey("administrative_regions.code"), nullable=False, index=True)
    
    # Relationship
    province = relationship("AdministrativeRegion", backref="units")

    def to_dict(self):
        return {
            'code': self.code,
            'name': self.name,
            'name_en': self.name_en,
            'administrative_level': self.administrative_level,
            'province_code': self.province_code
        }
