from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ResourceType = Literal["document", "exam", "question_set", "course"]


class FavoriteCreate(BaseModel):
    resource_type: ResourceType
    resource_id: str = Field(min_length=1)


class FavoriteRead(FavoriteCreate):
    id: str
    user_id: str
    title: str
    created_at: datetime
