from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AttachmentBase(BaseModel):
    description: Optional[str] = None

class AttachmentCreate(AttachmentBase):
    pass

class AttachmentUpdate(AttachmentBase):
    pass

class AttachmentResponse(AttachmentBase):
    id: int
    patient_id: int
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    upload_date: Optional[datetime] = None
    icon_class: Optional[str] = None
    
    class Config:
        from_attributes = True 