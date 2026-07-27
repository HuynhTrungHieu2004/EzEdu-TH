from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


KnowledgeStatus = Literal[
    "weak",
    "uncertain",
    "unassessed",
    "mastered",
    "at_risk_of_forgetting",
]


class KnowledgeSignalResponse(BaseModel):
    knowledge_component_id: str
    status: KnowledgeStatus
    mastery_probability: Optional[float] = Field(None, ge=0.0, le=1.0)
    uncertainty: Optional[float] = Field(None, ge=0.0, le=1.0)
    attempt_count: int = Field(default=0, ge=0)
    recent_accuracy: Optional[float] = Field(None, ge=0.0, le=1.0)
    average_response_time_ms: Optional[float] = Field(None, ge=0.0)
    hint_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    forgetting_risk: Optional[float] = Field(None, ge=0.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    reason_codes: list[str] = Field(default_factory=list)
    reason: str


class ContentPreferencesResponse(BaseModel):
    preferred_subjects: list[str] = Field(default_factory=list)
    preferred_content_types: list[str] = Field(default_factory=list)
    preferred_explanation_style: Optional[str] = None
    preferred_session_minutes: Optional[int] = None


class BehaviorSummaryResponse(BaseModel):
    recent_event_count: int = Field(default=0, ge=0)
    question_answered_count: int = Field(default=0, ge=0)
    recent_accuracy: Optional[float] = Field(None, ge=0.0, le=1.0)
    average_response_time_ms: Optional[float] = Field(None, ge=0.0)
    hint_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    answer_change_rate: Optional[float] = Field(None, ge=0.0)
    skip_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    completion_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    active_session_count: int = Field(default=0, ge=0)


class ClusterMembershipResponse(BaseModel):
    cluster_type: str
    cluster_id: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    model_version: Optional[str] = None
    provisional: bool = False
    outlier: bool = False


class RecentProgressResponse(BaseModel):
    recent_event_count: int = Field(default=0, ge=0)
    question_answered_count: int = Field(default=0, ge=0)
    recent_accuracy: Optional[float] = Field(None, ge=0.0, le=1.0)
    completed_count: int = Field(default=0, ge=0)
    last_active_at: Optional[datetime] = None


class RecommendedDifficultyRangeResponse(BaseModel):
    min_difficulty: float = Field(..., ge=0.0, le=1.0)
    max_difficulty: float = Field(..., ge=0.0, le=1.0)
    target_probability_min: float = Field(..., ge=0.0, le=1.0)
    target_probability_max: float = Field(..., ge=0.0, le=1.0)
    basis: str


class DataQualityResponse(BaseModel):
    event_count: int = Field(default=0, ge=0)
    assessed_knowledge_count: int = Field(default=0, ge=0)
    unassessed_knowledge_count: int = Field(default=0, ge=0)
    recent_event_count: int = Field(default=0, ge=0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    issues: list[str] = Field(default_factory=list)


class DigitalTwinResponse(BaseModel):
    user_id: str
    current_level: Optional[str] = None
    grade_level: Optional[int] = Field(None, ge=6, le=12)
    strong_subjects: list[str] = Field(default_factory=list)
    weak_subjects: list[str] = Field(default_factory=list)
    target_exam_combinations: list[str] = Field(default_factory=list)
    onboarding_completed: bool = False
    global_ability: Optional[float] = None
    profile_confidence: float = Field(..., ge=0.0, le=1.0)
    strengths: list[KnowledgeSignalResponse] = Field(default_factory=list)
    weaknesses: list[KnowledgeSignalResponse] = Field(default_factory=list)
    prerequisite_gaps: list[KnowledgeSignalResponse] = Field(default_factory=list)
    at_risk_knowledge: list[KnowledgeSignalResponse] = Field(default_factory=list)
    learning_goals: list[str] = Field(default_factory=list)
    content_preferences: ContentPreferencesResponse
    behavior_summary: BehaviorSummaryResponse
    cluster_memberships: list[ClusterMembershipResponse] = Field(default_factory=list)
    cluster_distances: dict[str, Optional[float]] = Field(default_factory=dict)
    recent_progress: RecentProgressResponse
    recommended_difficulty_range: RecommendedDifficultyRangeResponse
    data_quality: DataQualityResponse
    model_versions: dict[str, str] = Field(default_factory=dict)
    generated_at: datetime


class LearningGoalsUpdateRequest(BaseModel):
    learning_goals: list[str] = Field(default_factory=list, max_length=20)
    preferred_subjects: list[str] = Field(default_factory=list, max_length=20)
    preferred_content_types: list[str] = Field(default_factory=list, max_length=20)
    preferred_explanation_style: Literal["concise", "normal", "detailed", "beginner"] = "normal"
    preferred_session_minutes: Optional[int] = Field(default=None, ge=1, le=240)

    @field_validator("learning_goals", "preferred_subjects", "preferred_content_types")
    @classmethod
    def clean_text_list(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw_value in values:
            value = raw_value.strip()
            if not value:
                continue
            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(value[:120])
        return cleaned


class DigitalTwinKnowledgeResponse(BaseModel):
    strengths: list[KnowledgeSignalResponse] = Field(default_factory=list)
    weaknesses: list[KnowledgeSignalResponse] = Field(default_factory=list)
    prerequisite_gaps: list[KnowledgeSignalResponse] = Field(default_factory=list)
    at_risk_knowledge: list[KnowledgeSignalResponse] = Field(default_factory=list)
    data_quality: DataQualityResponse
    model_versions: dict[str, str] = Field(default_factory=dict)
    generated_at: datetime


class DigitalTwinProgressResponse(BaseModel):
    current_level: Optional[str] = None
    global_ability: Optional[float] = None
    profile_confidence: float = Field(..., ge=0.0, le=1.0)
    behavior_summary: BehaviorSummaryResponse
    recent_progress: RecentProgressResponse
    recommended_difficulty_range: RecommendedDifficultyRangeResponse
    cluster_memberships: list[ClusterMembershipResponse] = Field(default_factory=list)
    data_quality: DataQualityResponse
    model_versions: dict[str, str] = Field(default_factory=dict)
    generated_at: datetime


def digital_twin_knowledge_view(twin: DigitalTwinResponse) -> DigitalTwinKnowledgeResponse:
    return DigitalTwinKnowledgeResponse(
        strengths=twin.strengths,
        weaknesses=twin.weaknesses,
        prerequisite_gaps=twin.prerequisite_gaps,
        at_risk_knowledge=twin.at_risk_knowledge,
        data_quality=twin.data_quality,
        model_versions=twin.model_versions,
        generated_at=twin.generated_at,
    )


def digital_twin_progress_view(twin: DigitalTwinResponse) -> DigitalTwinProgressResponse:
    return DigitalTwinProgressResponse(
        current_level=twin.current_level,
        global_ability=twin.global_ability,
        profile_confidence=twin.profile_confidence,
        behavior_summary=twin.behavior_summary,
        recent_progress=twin.recent_progress,
        recommended_difficulty_range=twin.recommended_difficulty_range,
        cluster_memberships=twin.cluster_memberships,
        data_quality=twin.data_quality,
        model_versions=twin.model_versions,
        generated_at=twin.generated_at,
    )
