from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


KnowledgeComponentStatus = Literal["draft", "active", "archived", "needs_review"]
KnowledgeGraphRelationType = Literal["prerequisite", "related"]
KnowledgeGraphEdgeStatus = Literal["proposed", "verified", "rejected"]
LearningItemType = Literal["question", "lesson", "review_chunk", "document_chunk", "other"]
LearningItemVerificationStatus = Literal["unverified", "verified", "rejected", "needs_review"]
LearningEventType = Literal[
    "item_viewed",
    "lesson_started",
    "lesson_completed",
    "question_started",
    "question_answered",
    "hint_requested",
    "explanation_viewed",
    "recommendation_shown",
    "recommendation_clicked",
    "recommendation_skipped",
]
ColdStartStatus = Literal["new", "collecting", "ready"]
ClusterType = Literal[
    "content",
    "question",
    "learner_ability",
    "learner_behavior",
    "learner_interest",
]
ClusterModelStatus = Literal["draft", "training", "active", "retired", "failed"]
ExplanationStyle = Literal["concise", "normal", "detailed", "beginner"]


class PersonalizationDocument(BaseModel):
    """Base schema for MongoDB-backed personalization documents."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: Optional[str] = None


class KnowledgeComponent(PersonalizationDocument):
    name: str = Field(..., min_length=1, max_length=240)
    normalized_name: str = Field(..., min_length=1, max_length=240)
    description: Optional[str] = Field(None, max_length=4000)
    subject: Optional[str] = Field(None, max_length=160)
    topic: Optional[str] = Field(None, max_length=240)
    parent_id: Optional[str] = None
    prerequisite_ids: List[str] = Field(default_factory=list)
    related_ids: List[str] = Field(default_factory=list)
    difficulty: Optional[float] = Field(None, ge=0.0, le=1.0)
    source_document_ids: List[str] = Field(default_factory=list)
    evidence_chunk_ids: List[str] = Field(default_factory=list)
    embedding_reference: Optional[str] = Field(None, max_length=512)
    aliases: List[str] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)
    status: KnowledgeComponentStatus = "draft"
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    created_by: str = Field(..., min_length=1)
    created_at: datetime
    updated_at: datetime
    model_version: str = Field(..., min_length=1)


class KnowledgeGraphEdge(PersonalizationDocument):
    source_knowledge_component_id: str = Field(..., min_length=1)
    target_knowledge_component_id: str = Field(..., min_length=1)
    relation_type: KnowledgeGraphRelationType
    document_id: str = Field(..., min_length=1)
    evidence_chunk_ids: List[str] = Field(default_factory=list)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    status: KnowledgeGraphEdgeStatus = "proposed"
    created_by: str = Field(..., min_length=1)
    created_at: datetime
    updated_at: datetime
    model_version: str = Field(..., min_length=1)
    provenance: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_no_self_loop(self) -> "KnowledgeGraphEdge":
        if self.source_knowledge_component_id == self.target_knowledge_component_id:
            raise ValueError("Knowledge graph edge cannot self-reference.")
        return self


class LearningItem(PersonalizationDocument):
    item_type: LearningItemType
    document_id: Optional[str] = None
    source_chunk_ids: List[str] = Field(default_factory=list)
    knowledge_component_ids: List[str] = Field(default_factory=list)
    primary_knowledge_component_id: Optional[str] = None
    q_matrix_weights: Dict[str, float] = Field(default_factory=dict)
    difficulty: Optional[float] = Field(None, ge=0.0, le=1.0)
    discrimination: Optional[float] = Field(None, ge=0.0)
    guessing: Optional[float] = Field(None, ge=0.0, le=1.0)
    bloom_level: Optional[Literal["remember", "understand", "apply", "analyze"]] = None
    estimated_duration_seconds: Optional[int] = Field(None, ge=0)
    content_cluster_id: Optional[str] = None
    quality_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    verification_status: LearningItemVerificationStatus = "unverified"
    language: str = Field(default="vi", min_length=2, max_length=16)
    question_set_id: Optional[str] = None
    question_id: Optional[str] = None
    question_index: Optional[int] = Field(None, ge=0)
    created_at: datetime
    updated_at: datetime
    model_version: str = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_primary_component(self) -> "LearningItem":
        if (
            self.primary_knowledge_component_id
            and self.knowledge_component_ids
            and self.primary_knowledge_component_id not in self.knowledge_component_ids
        ):
            raise ValueError("primary_knowledge_component_id must be in knowledge_component_ids.")
        return self


class LearningEvent(PersonalizationDocument):
    user_id: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    item_id: str = Field(..., min_length=1)
    document_id: Optional[str] = None
    event_type: LearningEventType
    knowledge_component_ids: List[str] = Field(default_factory=list)
    answer: Optional[str] = None
    is_correct: Optional[bool] = None
    score: Optional[float] = Field(None, ge=0.0)
    response_time_ms: Optional[int] = Field(None, ge=0)
    hint_count: int = Field(default=0, ge=0)
    answer_change_count: int = Field(default=0, ge=0)
    attempt_number: int = Field(default=1, ge=1)
    skipped: bool = False
    completed: bool = False
    device_context: Optional[Dict[str, Any]] = None
    idempotency_key: Optional[str] = Field(None, min_length=8, max_length=160)
    occurred_at: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)
    schema_version: str = Field(..., min_length=1)


class LearningSession(PersonalizationDocument):
    user_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=8, max_length=160)
    document_id: Optional[str] = None
    subject: Optional[str] = Field(None, max_length=160)
    started_at: datetime
    last_activity_at: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)
    schema_version: str = Field(..., min_length=1)


class LearnerProfile(PersonalizationDocument):
    user_id: str = Field(..., min_length=1)
    grade_level: Optional[int] = Field(None, ge=6, le=12)
    strong_subjects: List[str] = Field(default_factory=list)
    weak_subjects: List[str] = Field(default_factory=list)
    target_exam_combinations: List[str] = Field(default_factory=list)
    onboarding_completed: bool = False
    onboarding_completed_at: Optional[datetime] = None
    education_system: Optional[str] = Field(default=None, max_length=80)
    learning_goals: List[str] = Field(default_factory=list)
    preferred_subjects: List[str] = Field(default_factory=list)
    preferred_content_types: List[str] = Field(default_factory=list)
    preferred_explanation_style: ExplanationStyle = "normal"
    preferred_session_minutes: Optional[int] = Field(None, ge=1, le=240)
    global_ability: Optional[float] = None
    current_level: Optional[str] = Field(None, max_length=80)
    ability_cluster_id: Optional[str] = None
    behavior_cluster_id: Optional[str] = None
    interest_cluster_id: Optional[str] = None
    profile_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    total_learning_events: int = Field(default=0, ge=0)
    cold_start_status: ColdStartStatus = "new"
    last_active_at: Optional[datetime] = None
    updated_at: datetime
    model_version: str = Field(..., min_length=1)


class LearnerKnowledgeState(PersonalizationDocument):
    user_id: str = Field(..., min_length=1)
    knowledge_component_id: str = Field(..., min_length=1)
    mastery_probability: Optional[float] = Field(None, ge=0.0, le=1.0)
    uncertainty: Optional[float] = Field(None, ge=0.0, le=1.0)
    ability_estimate: Optional[float] = None
    forgetting_risk: Optional[float] = Field(None, ge=0.0, le=1.0)
    attempt_count: int = Field(default=0, ge=0)
    correct_count: int = Field(default=0, ge=0)
    recent_accuracy: Optional[float] = Field(None, ge=0.0, le=1.0)
    average_response_time_ms: Optional[float] = Field(None, ge=0.0)
    hint_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    last_practiced_at: Optional[datetime] = None
    last_updated_at: datetime
    bkt_state: Dict[str, Any] = Field(default_factory=dict)
    irt_state: Dict[str, Any] = Field(default_factory=dict)
    model_version: str = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_correct_count(self) -> "LearnerKnowledgeState":
        if self.correct_count > self.attempt_count:
            raise ValueError("correct_count cannot exceed attempt_count.")
        return self


class RecommendationLog(PersonalizationDocument):
    user_id: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    item_id: str = Field(..., min_length=1)
    candidate_sources: List[str] = Field(default_factory=list)
    feature_snapshot: Dict[str, Any] = Field(default_factory=dict)
    component_scores: Dict[str, float] = Field(default_factory=dict)
    final_score: float
    rank_position: int = Field(..., ge=1)
    reason_codes: List[str] = Field(default_factory=list)
    shown: bool = False
    clicked: bool = False
    completed: bool = False
    reward: Optional[float] = None
    generated_at: datetime
    learner_model_version: str = Field(..., min_length=1)
    ranking_model_version: str = Field(..., min_length=1)
    bandit_policy_version: str = Field(..., min_length=1)


class ClusterModel(PersonalizationDocument):
    cluster_type: ClusterType
    version: str = Field(..., min_length=1)
    feature_schema_version: str = Field(..., min_length=1)
    feature_names: List[str] = Field(default_factory=list)
    normalization_parameters: Dict[str, Any] = Field(default_factory=dict)
    number_of_clusters: int = Field(..., ge=1)
    centroids: List[List[float]] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    training_sample_count: int = Field(..., ge=0)
    random_state: Optional[int] = None
    interpretation: Dict[str, Any] = Field(default_factory=dict)
    provenance: Dict[str, Any] = Field(default_factory=dict)
    status: ClusterModelStatus = "draft"
    trained_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None
