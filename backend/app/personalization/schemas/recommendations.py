from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.personalization.schemas.candidates import CandidateSourceType, PrerequisiteStatus


ReasonCode = Literal[
    "IMPROVE_WEAK_SKILL",
    "REVIEW_BEFORE_FORGETTING",
    "FILL_PREREQUISITE_GAP",
    "MATCH_LEARNING_GOAL",
    "SUITABLE_DIFFICULTY",
    "CONTINUE_LEARNING_PATH",
    "EXPLORE_RELATED_TOPIC",
]


class RecommendationItemResponse(BaseModel):
    recommendation_log_id: Optional[str] = None
    item_id: str
    source_types: list[CandidateSourceType] = Field(default_factory=list)
    component_scores: dict[str, float] = Field(default_factory=dict)
    final_score: float = Field(..., ge=0.0, le=1.0)
    rank_before_rerank: int = Field(..., ge=1)
    rank_after_rerank: int = Field(..., ge=1)
    reason_codes: list[ReasonCode] = Field(default_factory=list)
    knowledge_component_ids: list[str] = Field(default_factory=list)
    difficulty: Optional[float] = Field(None, ge=0.0, le=1.0)
    quality_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    prerequisite_status: PrerequisiteStatus
    generated_at: datetime


class RecommendationResponse(BaseModel):
    user_id: str
    recommendations: list[RecommendationItemResponse] = Field(default_factory=list)
    candidate_count: int = Field(default=0, ge=0)
    filtered_count: int = Field(default=0, ge=0)
    generated_at: datetime
    model_versions: dict[str, str] = Field(default_factory=dict)


FeedbackType = Literal[
    "clicked",
    "skipped",
    "completed",
    "too_easy",
    "too_hard",
    "not_relevant",
    "helpful",
    "not_helpful",
]


class AIRecommendationExplanation(BaseModel):
    short_reason: str = Field(..., min_length=1, max_length=500)
    learning_objective: str = Field(..., min_length=1, max_length=500)
    expected_benefit: str = Field(..., min_length=1, max_length=500)
    suggested_action: str = Field(..., min_length=1, max_length=500)
    confidence: float = Field(..., ge=0.0, le=1.0)


class RecommendationAPIItemResponse(BaseModel):
    recommendation_log_id: Optional[str] = None
    item_id: str
    item_type: str
    title: str
    preview: Optional[str] = None
    difficulty: Optional[float] = Field(None, ge=0.0, le=1.0)
    knowledge_components: list[dict[str, str]] = Field(default_factory=list)
    final_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    reason_codes: list[ReasonCode] = Field(default_factory=list)
    explanation: AIRecommendationExplanation
    source_document: Optional[dict[str, str]] = None
    estimated_duration: Optional[int] = Field(None, ge=0)
    model_versions: dict[str, str] = Field(default_factory=dict)
    generated_at: datetime


class RecommendationAPIResponse(BaseModel):
    user_id: str
    items: list[RecommendationAPIItemResponse] = Field(default_factory=list)
    generated_at: datetime
    model_versions: dict[str, str] = Field(default_factory=dict)


class RecommendationFeedbackRequest(BaseModel):
    recommendation_log_id: str = Field(..., min_length=1)
    item_id: str = Field(..., min_length=1)
    feedback_type: FeedbackType


class RecommendationFeedbackResponse(BaseModel):
    recommendation_log_id: str
    item_id: str
    feedback_type: FeedbackType
    recorded_at: datetime
    duplicate: bool = False


class RecommendationHistoryItem(BaseModel):
    recommendation_log_id: str
    item_id: str
    candidate_sources: list[str] = Field(default_factory=list)
    component_scores: dict[str, float] = Field(default_factory=dict)
    final_score: float
    rank_position: int
    reason_codes: list[str] = Field(default_factory=list)
    generated_at: datetime
    feedback: dict[str, datetime] = Field(default_factory=dict)


class RecommendationHistoryResponse(BaseModel):
    user_id: str
    items: list[RecommendationHistoryItem] = Field(default_factory=list)
