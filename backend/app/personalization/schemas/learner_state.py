from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LearnerKnowledgeStateResponse(BaseModel):
    knowledge_component_id: str
    mastery_probability: Optional[float] = None
    uncertainty: Optional[float] = None
    ability_estimate: Optional[float] = None
    attempt_count: int
    correct_count: int
    recent_accuracy: Optional[float] = None
    average_response_time_ms: Optional[float] = None
    hint_rate: Optional[float] = None
    last_practiced_at: Optional[datetime] = None
    model_version: str
    confidence: float
    reason: str


class LearnerProfileResponse(BaseModel):
    user_id: str
    global_ability: Optional[float] = None
    current_level: Optional[str] = None
    profile_confidence: Optional[float] = None
    total_learning_events: int
    cold_start_status: str
    updated_at: datetime
    model_version: str


class LearnerSummaryResponse(BaseModel):
    profile: Optional[LearnerProfileResponse] = None
    mastery: list[LearnerKnowledgeStateResponse] = Field(default_factory=list)
    strengths: list[LearnerKnowledgeStateResponse] = Field(default_factory=list)
    weaknesses: list[LearnerKnowledgeStateResponse] = Field(default_factory=list)
    confidence: float
    reasons: list[str] = Field(default_factory=list)
