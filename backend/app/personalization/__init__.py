"""Personalization bounded module.

Runtime behavior is guarded by personalization feature flags so new capabilities
can be wired into FastAPI without changing the legacy learning flows by default.
"""

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
from app.personalization.services.runtime_config_service import get_runtime_config

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
    "get_runtime_config",
]
