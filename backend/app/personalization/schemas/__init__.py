"""Pydantic schemas for personalization APIs and internal contracts."""

from app.personalization.schemas.config import (
    PersonalizationFeatureFlags,
    PersonalizationModelVersions,
    PersonalizationRuntimeConfig,
)
from app.personalization.schemas.data_models import (
    ClusterModel,
    KnowledgeGraphEdge,
    KnowledgeComponent,
    LearnerKnowledgeState,
    LearnerProfile,
    LearningEvent,
    LearningItem,
    LearningSession,
    RecommendationLog,
)
from app.personalization.schemas.knowledge_extraction import (
    AIItemMappingCandidate,
    AIKnowledgeComponentCandidate,
    AIKnowledgeExtractionResponse,
)
from app.personalization.schemas.learning_events import (
    LearningEventCreateRequest,
    LearningEventResponse,
    LearningSessionResponse,
)
from app.personalization.schemas.learner_state import (
    LearnerKnowledgeStateResponse,
    LearnerProfileResponse,
    LearnerSummaryResponse,
)
from app.personalization.schemas.clustering import (
    ClusterPredictionResponse,
    ClusterTrainingResult,
)
from app.personalization.schemas.digital_twin import (
    BehaviorSummaryResponse,
    ClusterMembershipResponse,
    ContentPreferencesResponse,
    DataQualityResponse,
    DigitalTwinKnowledgeResponse,
    DigitalTwinProgressResponse,
    DigitalTwinResponse,
    KnowledgeSignalResponse,
    RecentProgressResponse,
    RecommendedDifficultyRangeResponse,
)
from app.personalization.schemas.candidates import (
    CandidateGenerationResponse,
    CandidateResponse,
)
from app.personalization.schemas.recommendations import (
    AIRecommendationExplanation,
    RecommendationAPIItemResponse,
    RecommendationAPIResponse,
    RecommendationFeedbackRequest,
    RecommendationFeedbackResponse,
    RecommendationHistoryItem,
    RecommendationHistoryResponse,
    RecommendationItemResponse,
    RecommendationResponse,
)
from app.personalization.schemas.advanced_diagnosis import (
    AdvancedDiagnosisExperimentReport,
    AdvancedModelCheckpoint,
    AdvancedModelReadinessAudit,
    AdvancedModelReadinessThresholds,
    AdvancedModelTrainingPlan,
)
from app.personalization.schemas.contextual_bandit import (
    BanditContextVector,
    BanditDecision,
    BanditRewardBreakdown,
    BanditSimulationResult,
    ContextualBanditPolicy,
)

__all__ = [
    "ClusterModel",
    "KnowledgeGraphEdge",
    "KnowledgeComponent",
    "LearnerKnowledgeState",
    "LearnerProfile",
    "LearningEvent",
    "LearningItem",
    "LearningSession",
    "PersonalizationFeatureFlags",
    "PersonalizationModelVersions",
    "PersonalizationRuntimeConfig",
    "RecommendationLog",
    "AIItemMappingCandidate",
    "AIKnowledgeComponentCandidate",
    "AIKnowledgeExtractionResponse",
    "LearningEventCreateRequest",
    "LearningEventResponse",
    "LearningSessionResponse",
    "LearnerKnowledgeStateResponse",
    "LearnerProfileResponse",
    "LearnerSummaryResponse",
    "ClusterPredictionResponse",
    "ClusterTrainingResult",
    "CandidateGenerationResponse",
    "CandidateResponse",
    "RecommendationItemResponse",
    "RecommendationResponse",
    "AIRecommendationExplanation",
    "RecommendationAPIItemResponse",
    "RecommendationAPIResponse",
    "RecommendationFeedbackRequest",
    "RecommendationFeedbackResponse",
    "RecommendationHistoryItem",
    "RecommendationHistoryResponse",
    "BehaviorSummaryResponse",
    "ClusterMembershipResponse",
    "ContentPreferencesResponse",
    "DataQualityResponse",
    "DigitalTwinKnowledgeResponse",
    "DigitalTwinProgressResponse",
    "DigitalTwinResponse",
    "KnowledgeSignalResponse",
    "RecentProgressResponse",
    "RecommendedDifficultyRangeResponse",
    "AdvancedDiagnosisExperimentReport",
    "AdvancedModelCheckpoint",
    "AdvancedModelReadinessAudit",
    "AdvancedModelReadinessThresholds",
    "AdvancedModelTrainingPlan",
    "BanditContextVector",
    "BanditDecision",
    "BanditRewardBreakdown",
    "BanditSimulationResult",
    "ContextualBanditPolicy",
]
