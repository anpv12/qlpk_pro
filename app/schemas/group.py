from pydantic import BaseModel
from typing import List, Optional

class GroupBase(BaseModel):
    code: str
    name: str
    desc: Optional[str] = None
    permissions: List[str]

class GroupCreate(GroupBase):
    pass

class GroupUpdate(GroupBase):
    pass

class GroupRead(GroupBase):
    id: int

    class Config:
        from_attributes = True 