from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import datetime


class ServicePriceBase(BaseModel):
    target_type: str
    target_name: str
    price: Decimal


class ServicePriceCreate(ServicePriceBase):
    pass


class ServicePriceUpdate(BaseModel):
    target_type: Optional[str] = None
    target_name: Optional[str] = None
    price: Optional[Decimal] = None


class ServicePrice(ServicePriceBase):
    id: int
    service_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ServiceBase(BaseModel):
    name: str
    description: Optional[str] = None
    default_price: Decimal
    duration_minutes: Optional[int] = 60
    category_id: int
    is_active: Optional[bool] = True


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_price: Optional[Decimal] = None
    duration_minutes: Optional[int] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None


class Service(ServiceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    prices: List[ServicePrice] = []

    class Config:
        from_attributes = True 


class ServiceWithPrices(Service):
    prices: List[ServicePrice] = [] 