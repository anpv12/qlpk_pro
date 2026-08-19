from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ExaminationDetail(Base):
    __tablename__ = "examination_details"

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "section",
            "field_name",
            name="uq_examination_details_examination_section_field",
        ),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False)
    section = Column(String(50), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)
    field_value = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationship
    examination = relationship("Examination", back_populates="details")
    
    def __repr__(self):
        return f"<ExaminationDetail(id={self.id}, examination_id={self.examination_id}, section='{self.section}', field_name='{self.field_name}')>" 
