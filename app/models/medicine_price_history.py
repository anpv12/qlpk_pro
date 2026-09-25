from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey, CheckConstraint, Index, text
from app.core.database import Base


class MedicinePriceHistory(Base):
    __tablename__ = 'medicine_price_history'
    __table_args__ = (
        CheckConstraint('new_price >= 0 AND (old_price IS NULL OR old_price >= 0)', name='ck_medicine_price_nonnegative'),
        CheckConstraint('effective_to IS NULL OR effective_to > effective_from', name='ck_medicine_price_interval'),
        Index('uq_medicine_price_open', 'medicine_id', unique=True, postgresql_where=text('effective_to IS NULL')),
        Index('ix_medicine_price_timeline', 'medicine_id', 'id'),
    )
    id = Column(Integer, primary_key=True)
    medicine_id = Column(Integer, ForeignKey('medicines.id', ondelete='RESTRICT'), nullable=False)
    old_price = Column(Numeric(10, 2), nullable=True)
    new_price = Column(Numeric(10, 2), nullable=False)
    effective_from = Column(DateTime(timezone=True), nullable=False)
    effective_to = Column(DateTime(timezone=True), nullable=True)
    changed_by = Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
