from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class UserShortcut(Base):
    __tablename__ = "user_shortcuts"

    id = Column(Integer, primary_key=True, index=True)
    # user_id nullable cho scope=global
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    scope = Column(String(16), nullable=False, default='user')  # user | global

    combo_key = Column(String(64), nullable=False)
    target_url = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('scope', 'user_id', 'combo_key', name='uq_user_shortcut_scope_user_combo'),
    )
