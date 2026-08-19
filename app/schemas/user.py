from pydantic import BaseModel, EmailStr
from typing import Optional, List
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

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    can_view_all_patients: Optional[bool] = None
    calendar_color: Optional[str] = None
    notes: Optional[str] = None
    password: Optional[str] = None

class UserList(BaseModel):
    id: int
    username: str
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    role: UserRole
    is_active: bool
    calendar_color: Optional[str] = None
    last_login: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class UserFilter(BaseModel):
    search: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    page: int = 1
    size: int = 10

class UserResponse(BaseModel):
    users: list[UserList]
    total: int
    page: int
    size: int
    pages: int 

class UserGroupBase(BaseModel):
    user_id: int
    group_id: int

class UserGroupCreate(UserGroupBase):
    pass

class UserGroupRead(UserGroupBase):
    id: int
    class Config:
        from_attributes = True 