"""Service layer for personalization orchestration."""

from app.personalization.services.knowledge_extraction_service import (
    KnowledgeExtractionValidationError,
    build_knowledge_extraction_prompt,
    process_document_knowledge_graph,
)
from app.personalization.services.learning_event_service import (
    list_my_learning_events,
    record_learning_event,
)
from app.personalization.services.learner_model_service import (
    process_learning_event,
    update_learner_profile,
)
from app.personalization.services.learner_state_query_service import get_learner_summary
from app.personalization.services.clustering_service import (
    fit_cluster_model,
    predict_cluster,
    rollback_cluster_model,
)
from app.personalization.services.digital_twin_service import (
    get_current_user_digital_twin,
    invalidate_digital_twin_cache,
)
from app.personalization.services.candidate_generator_service import generate_candidates_for_user
from app.personalization.services.recommendation_ranking_service import recommend_for_user
from app.personalization.services.recommendation_api_service import (
    get_recommendation_history_for_current_user,
    get_recommendations_for_current_user,
    invalidate_recommendation_cache,
    record_recommendation_feedback,
)
from app.personalization.services.runtime_config_service import get_runtime_config
from app.personalization.services.advanced_diagnosis_service import (
    audit_advanced_model_readiness,
    build_advanced_diagnosis_experiment_report,
)
from app.personalization.services.contextual_bandit_service import (
    bandit_mode,
    evaluate_bandit_decision,
    simulate_bandit_from_synthetic_data,
    update_bandit_from_recommendation_feedback,
)

__all__ = [
    "KnowledgeExtractionValidationError",
    "build_knowledge_extraction_prompt",
    "get_runtime_config",
    "audit_advanced_model_readiness",
    "build_advanced_diagnosis_experiment_report",
    "bandit_mode",
    "evaluate_bandit_decision",
    "simulate_bandit_from_synthetic_data",
    "update_bandit_from_recommendation_feedback",
    "get_learner_summary",
    "get_current_user_digital_twin",
    "generate_candidates_for_user",
    "recommend_for_user",
    "get_recommendation_history_for_current_user",
    "get_recommendations_for_current_user",
    "invalidate_recommendation_cache",
    "record_recommendation_feedback",
    "invalidate_digital_twin_cache",
    "fit_cluster_model",
    "list_my_learning_events",
    "process_learning_event",
    "process_document_knowledge_graph",
    "record_learning_event",
    "predict_cluster",
    "rollback_cluster_model",
    "update_learner_profile",
]
