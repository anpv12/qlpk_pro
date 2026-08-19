from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.patient import AllergyEntry


class UsageMedicine(BaseModel):
    name: Optional[str] = Field(default=None, description="Tên thuốc")
    dose: Optional[str] = Field(default=None, description="Liều mỗi lần dùng")
    frequency: Optional[str] = Field(default=None, description="Số lần dùng trong ngày")
    duration_days: Optional[int] = Field(default=None, description="Số ngày dùng thuốc")
    route: Optional[str] = Field(default=None, description="Đường dùng")
    note: Optional[str] = Field(default=None, description="Ghi chú bổ sung")
    quantity: Optional[float] = Field(default=None, description="Số lượng mỗi lần dùng (theo cột Số thuốc)")
    unit: Optional[str] = Field(default=None, description="Đơn vị tính (viên, ml, gói...)")
    strength: Optional[str] = Field(default=None, description="Hàm lượng/độ mạnh của thuốc")


class UsagePatient(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    allergies: Optional[List[AllergyEntry]] = None


class UsageDiagnosis(BaseModel):
    primary: Optional[str] = None
    symptoms: Optional[str] = None
    goal: Optional[str] = None


class UsageSuggestionRequest(BaseModel):
    patient: Optional[UsagePatient] = None
    diagnosis: Optional[UsageDiagnosis] = None
    medicines: List[UsageMedicine] = Field(default_factory=list)
    notes: Optional[str] = None
    raw_request: Optional[dict] = Field(
        default=None,
        description="Payload tuỳ biến gửi trực tiếp đến dịch vụ AI (override prompt mặc định).",
    )


class UsageSuggestionItem(BaseModel):
    text: str
    meta: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    schedule: Optional[str] = Field(default=None, description="Chuỗi thời điểm uống chuẩn hoá (ví dụ: Sáng, trưa, chiều)")


class UsageSuggestionResponse(BaseModel):
    suggestions: List[UsageSuggestionItem]
