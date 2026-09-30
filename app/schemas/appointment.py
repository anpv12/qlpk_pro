from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.appointment import AppointmentStatus, AppointmentType

class AppointmentBase(BaseModel):
    appointment_code: Optional[str] = None
    patient_id: int
    doctor_id: Optional[int] = None  # Made optional for doctor examination
    psychologist_id: Optional[int] = None  # Tâm lý gia
    appointment_date: Optional[datetime] = None  # Made optional for doctor examination
    duration_minutes: Optional[int] = 60
    status: Optional[AppointmentStatus] = AppointmentStatus.SCHEDULED
    appointment_category: Optional[str] = 'NEW'
    appointment_type: Optional[AppointmentType] = None
    service_id: Optional[int] = None
    package_id: Optional[int] = None
    original_appointment_id: Optional[int] = None
    target_type: Optional[str] = None
    target_name: Optional[str] = None
    notes: Optional[str] = None

class AppointmentCreate(AppointmentBase):
    @classmethod
    def validate(cls, v):
        # Chuyển đổi status và appointment_type thành uppercase
        if isinstance(v, dict):
            if 'status' in v and v['status']:
                v['status'] = v['status'].upper()
            if 'appointment_type' in v and v['appointment_type']:
                v['appointment_type'] = v['appointment_type'].upper()
        return v

class AppointmentUpdate(BaseModel):
    appointment_code: Optional[str] = None
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    psychologist_id: Optional[int] = None  # Tâm lý gia
    appointment_date: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: Optional[AppointmentStatus] = None
    appointment_category: Optional[str] = None
    appointment_type: Optional[AppointmentType] = None
    service_id: Optional[int] = None
    package_id: Optional[int] = None
    original_appointment_id: Optional[int] = None
    target_type: Optional[str] = None
    target_name: Optional[str] = None
    notes: Optional[str] = None

class AppointmentRead(AppointmentBase):
    doctor_queue_entered_at: Optional[datetime] = None
    id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
        # Hoặc sử dụng orm_mode = True cho Pydantic v1
        orm_mode = True 
