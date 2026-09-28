from sqlalchemy import Column, Integer, String, Text
from app.core.database import Base

class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    desc = Column(Text)
    permissions = Column(Text)  # Lưu JSON string các quyền 