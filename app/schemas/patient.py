from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime

class AllergyEntry(BaseModel):
    name: str
    level: str = ""
    symptom: str = ""


class PatientBase(BaseModel):
    full_name: str
    phone: str
    email: Optional[EmailStr] = None
    patient_code: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    allergies: Optional[List[AllergyEntry]] = None
    is_active: bool = True

class PatientCreate(PatientBase):
    pass

class Patient(PatientBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True 
