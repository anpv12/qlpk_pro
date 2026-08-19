from sqlalchemy import Column, Integer, String, JSON, ForeignKey, DateTime, Boolean
from app.core.database import Base
from datetime import datetime


class ExpenseColumn(Base):
    """Cấu hình cột hiển thị cho bảng chi tiêu"""
    __tablename__ = 'expense_columns'

    id = Column(Integer, primary_key=True, index=True)
    col_id = Column(String(50), nullable=False, unique=True)
    name = Column(String(100), nullable=False)
    col_type = Column(String(30), nullable=False)
    options = Column(JSON, nullable=True)
    formula = Column(String(500), nullable=True)
    width = Column(Integer, default=100)
    position = Column(Integer, default=0)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    deleted_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.col_id,
            'name': self.name,
            'type': self.col_type,
            'options': self.options or [],
            'formula': self.formula or '',
            'width': self.width or 100,
        }
