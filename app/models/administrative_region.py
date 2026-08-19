from sqlalchemy import Column, String
from app.core.database import Base

class AdministrativeRegion(Base):
    """
    Bảng lưu trữ Tỉnh/Thành phố (Cấp 1)
    Dữ liệu chuẩn hoá từ AddressKit
    """
    __tablename__ = "administrative_regions"

    code = Column(String, primary_key=True, index=True) # Mã tỉnh (VD: '01')
    name = Column(String, nullable=False, index=True)   # Tên (VD: 'Thành phố Hà Nội')
    name_en = Column(String, nullable=True)             # Tên tiếng Anh
    administrative_level = Column(String, nullable=True) # Cấp hành chính (Tỉnh/TP Trung ương)

    def to_dict(self):
        return {
            'code': self.code,
            'name': self.name,
            'name_en': self.name_en,
            'administrative_level': self.administrative_level
        }
