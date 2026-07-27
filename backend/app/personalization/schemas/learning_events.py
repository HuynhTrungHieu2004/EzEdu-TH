from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.personalization.schemas.data_models import LearningEventType


MAX_RESPONSE_TIME_MS = 6 * 60 * 60 * 1000


class LearningEventCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: LearningEventType
    item_id: str = Field(..., min_length=1, max_length=240)
    document_id: Optional[str] = Field(None, min_length=1, max_length=80)
    session_id: Optional[str] = Field(None, min_length=8, max_length=160)
    idempotency_key: Optional[str] = Field(None, min_length=8, max_length=160)
    knowledge_component_ids: List[str] = Field(default_factory=list, max_length=12)
    is_correct: Optional[bool] = None
    score: Optional[float] = Field(None, ge=0.0)
    response_time_ms: Optional[int] = Field(None, ge=0, le=MAX_RESPONSE_TIME_MS)
    hint_count: int = Field(default=0, ge=0, le=100)
    answer_change_count: int = Field(default=0, ge=0, le=1000)
    attempt_number: int = Field(default=1, ge=1, le=1000)
    skipped: bool = False
    completed: bool = False
    device_context: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_question_answered_payload(self) -> "LearningEventCreateRequest":
        if self.event_type == "question_answered":
            if self.is_correct is None:
                raise ValueError("question_answered requires is_correct.")
            if self.response_time_ms is None:
                raise ValueError("question_answered requires response_time_ms.")
        return self


class LearningEventResponse(BaseModel):
    id: str
    user_id: str
    session_id: Optional[str] = None
    item_id: str
    document_id: Optional[str] = None
    event_type: LearningEventType
    knowledge_component_ids: List[str] = Field(default_factory=list)
    is_correct: Optional[bool] = None
    score: Optional[float] = None
    response_time_ms: Optional[int] = None
    hint_count: int
    answer_change_count: int
    attempt_number: int
    skipped: bool
    completed: bool
    idempotency_key: Optional[str] = None
    occurred_at: datetime
    schema_version: str
    duplicate: bool = False


class LearningSessionResponse(BaseModel):
    id: str
    user_id: str
    session_id: str
    document_id: Optional[str] = None
    subject: Optional[str] = None
    started_at: datetime
    last_activity_at: datetime
    schema_version: str
