from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class SurveyTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    content: Dict[str, Any]
    default_performer_id: Optional[int] = None
    is_active: bool = True

class SurveyTemplateCreate(SurveyTemplateBase):
    created_by: int

class SurveyTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class SurveyTemplateResponse(SurveyTemplateBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class SurveyTemplateImport(BaseModel):
    name: str
    description: Optional[str] = None
    content: Dict[str, Any]
    version: Optional[str] = "1.0"

class SurveyTemplateExport(BaseModel):
    name: str
    description: Optional[str] = None
    content: Dict[str, Any]
    exported_at: str
    version: str = "1.0"

class SurveyTemplateDuplicate(BaseModel):
    new_name: str
    created_by: int

class SurveyTemplateTest(BaseModel):
    is_valid: bool
    questions_count: int
    errors: Optional[List[str]] = None
