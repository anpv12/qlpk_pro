from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

# Import Group model for relationship


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    DOCTOR = "doctor"
    PSYCHOLOGIST = "PSYCHOLOGIST"
    STAFF = "staff"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True)
    avatar = Column(String(255), nullable=True)
    gender = Column(String(10), nullable=True)  # Male, Female, Other
    address = Column(Text, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.STAFF)
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now()) 
    can_view_all_patients = Column(Boolean, default=False, server_default='false')
    calendar_color = Column(String(7), nullable=True)  # Hex color: #e91e63

    groups = relationship("UserGroup", backref="user", cascade="all, delete-orphan")
    doctor_profile = relationship("Doctor", back_populates="user", uselist=False)
    survey_templates = relationship(
        "SurveyTemplate",
        back_populates="creator",
        foreign_keys="SurveyTemplate.created_by",
        cascade="all, delete-orphan",
    )
    assigned_survey_templates = relationship(
        "SurveyTemplate",
        back_populates="default_performer",
        foreign_keys="SurveyTemplate.default_performer_id",
    )
    survey_responses = relationship("SurveyResponse", back_populates="doctor", cascade="all, delete-orphan")


class UserGroup(Base):
    __tablename__ = "user_group"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    
    # Add relationship to Group
    group = relationship("Group", backref="user_groups") 
