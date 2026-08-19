from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ServiceCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class ServiceCategoryCreate(ServiceCategoryBase):
    pass


class ServiceCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ServiceCategoryRead(ServiceCategoryBase):
    id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True 