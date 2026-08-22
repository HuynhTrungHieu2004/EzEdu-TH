from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, Field, model_validator


class ScheduleCreate(BaseModel):
    course_id: str
    title: str = Field(min_length=1, max_length=200)
    event_type: Literal["class", "exam", "meeting", "online"]
    start_at: datetime
    end_at: datetime
    join_url: AnyHttpUrl | None = None
    status: Literal["scheduled", "cancelled", "completed"] = "scheduled"

    @model_validator(mode="after")
    def validate_times(self):
        if self.end_at <= self.start_at:
            raise ValueError("Thời gian kết thúc phải sau thời gian bắt đầu.")
        self.start_at = self.start_at.astimezone(timezone.utc)
        self.end_at = self.end_at.astimezone(timezone.utc)
        return self


class ScheduleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    event_type: Literal["class", "exam", "meeting", "online"] | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    join_url: AnyHttpUrl | None = None
    status: Literal["scheduled", "cancelled", "completed"] | None = None


class ScheduleRead(ScheduleCreate):
    id: str
    course_title: str = ""
    created_by: str
    created_at: datetime
    updated_at: datetime | None = None
