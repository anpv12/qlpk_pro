from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ICDBase(BaseModel):
    icd_code: str = Field(..., min_length=1, max_length=20, description="Mã ICD")
    disease_name: str = Field(..., min_length=1, max_length=500, description="Tên bệnh")
    description: Optional[str] = Field(None, description="Mô tả")
    disease_group: Optional[str] = Field(None, max_length=200, description="Nhóm bệnh")

class ICDCreate(ICDBase):
    pass

class ICDUpdate(BaseModel):
    icd_code: Optional[str] = Field(None, min_length=1, max_length=20, description="Mã ICD")
    disease_name: Optional[str] = Field(None, min_length=1, max_length=500, description="Tên bệnh")
    description: Optional[str] = Field(None, description="Mô tả")
    disease_group: Optional[str] = Field(None, max_length=200, description="Nhóm bệnh")

class ICDResponse(ICDBase):
    id: int
    is_deleted: bool
    deleted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ICDListResponse(BaseModel):
    id: int
    icd_code: str
    disease_name: str
    description: Optional[str]
    disease_group: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True
