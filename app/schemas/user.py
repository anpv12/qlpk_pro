from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    admin = "admin"
    doctor = "doctor"
    staff = "staff"
    psychologist = "PSYCHOLOGIST"

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    username: str
    full_name: str
    phone: Optional[str] = None
    avatar: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    role: UserRole = UserRole.staff
    is_active: bool = True
    can_view_all_patients: bool = False
    calendar_color: Optional[str] = None
    notes: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
