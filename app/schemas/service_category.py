from pydantic import BaseModel
from typing import Optional


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
