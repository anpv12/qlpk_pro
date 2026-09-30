from pydantic import BaseModel
from typing import Optional


class PackageBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    duration_minutes: int = 60
    is_active: bool = True


class PackageCreate(PackageBase):
    pass


class PackageUpdate(PackageBase):
    name: Optional[str] = None
    price: Optional[float] = None
    duration_minutes: Optional[int] = None
    is_active: Optional[bool] = None
