from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


CandidateSourceType = Literal[
    "weak_knowledge",
    "prerequisite_gap",
    "forgetting_review",
    "current_learning_goal",
    "similar_to_recent_error",
    "appropriate_difficulty",
    "learner_interest",
    "cluster_match",
    "exploration",
    "continue_current_path",
]

PrerequisiteStatus = Literal["satisfied", "minor_gap", "severe_gap", "unknown"]


class CandidateResponse(BaseModel):
    item_id: str
    source_types: list[CandidateSourceType] = Field(default_factory=list)
    source_scores: dict[CandidateSourceType, float] = Field(default_factory=dict)
    knowledge_component_ids: list[str] = Field(default_factory=list)
    difficulty: Optional[float] = Field(None, ge=0.0, le=1.0)
    quality_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    verification_status: str
    prerequisite_status: PrerequisiteStatus
    recently_seen: bool
    generated_at: datetime


class CandidateGenerationResponse(BaseModel):
    user_id: str
    candidates: list[CandidateResponse] = Field(default_factory=list)
    source_counts: dict[CandidateSourceType, int] = Field(default_factory=dict)
    fallback_sources: list[CandidateSourceType] = Field(default_factory=list)
    generated_at: datetime
    model_versions: dict[str, str] = Field(default_factory=dict)
