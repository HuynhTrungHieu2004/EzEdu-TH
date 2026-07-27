from __future__ import annotations

from datetime import datetime, timezone
from statistics import median
from typing import Any, Optional

from app.core.config import settings
from app.personalization.constants.collections import (
    KNOWLEDGE_COMPONENTS,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.advanced_diagnosis import (
    AdvancedDiagnosisExperimentReport,
    AdvancedModelReadinessAudit,
    AdvancedModelReadinessThresholds,
    AdvancedModelTrainingPlan,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def readiness_thresholds(app_settings=settings) -> AdvancedModelReadinessThresholds:
    return AdvancedModelReadinessThresholds(
        min_users=app_settings.ADVANCED_MODEL_MIN_USERS,
        min_items=app_settings.ADVANCED_MODEL_MIN_ITEMS,
        min_interactions=app_settings.ADVANCED_MODEL_MIN_INTERACTIONS,
        min_interactions_per_user=app_settings.ADVANCED_MODEL_MIN_INTERACTIONS_PER_USER,
        min_knowledge_components=app_settings.ADVANCED_MODEL_MIN_KNOWLEDGE_COMPONENTS,
        min_q_matrix_coverage=app_settings.ADVANCED_MODEL_MIN_Q_MATRIX_COVERAGE,
        max_sparsity=app_settings.ADVANCED_MODEL_MAX_SPARSITY,
        min_sequence_length=app_settings.ADVANCED_MODEL_MIN_SEQUENCE_LENGTH,
    )


async def audit_advanced_model_readiness(
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
    app_settings=settings,
) -> AdvancedModelReadinessAudit:
    repo = repository or PersonalizationMongoRepository()
    db = repo.db
    thresholds = readiness_thresholds(app_settings)

    user_count = len(await db[LEARNING_EVENTS].distinct("user_id", {"event_type": "question_answered"}))
    item_count = await db[LEARNING_ITEMS].count_documents({})
    interaction_count = await db[LEARNING_EVENTS].count_documents({"event_type": "question_answered"})
    knowledge_component_count = await db[KNOWLEDGE_COMPONENTS].count_documents({})
    q_matrix_item_count = await db[LEARNING_ITEMS].count_documents({"q_matrix_weights": {"$exists": True, "$ne": {}}})
    q_matrix_coverage = q_matrix_item_count / item_count if item_count else 0.0
    average_interactions_per_user = interaction_count / user_count if user_count else 0.0
    possible_interactions = user_count * item_count
    data_sparsity = 1.0 - (interaction_count / possible_interactions) if possible_interactions else 1.0
    sequence_lengths = await _sequence_lengths(db)
    median_sequence_length = float(median(sequence_lengths)) if sequence_lengths else 0.0
    max_sequence_length = max(sequence_lengths) if sequence_lengths else 0

    blocking_reasons = _blocking_reasons(
        user_count=user_count,
        item_count=item_count,
        interaction_count=interaction_count,
        average_interactions_per_user=average_interactions_per_user,
        knowledge_component_count=knowledge_component_count,
        q_matrix_coverage=q_matrix_coverage,
        data_sparsity=data_sparsity,
        median_sequence_length=median_sequence_length,
        thresholds=thresholds,
    )
    split_feasible = (
        user_count >= 3
        and item_count >= 3
        and interaction_count >= thresholds.min_interactions
        and max_sequence_length >= thresholds.min_sequence_length
    )

    return AdvancedModelReadinessAudit(
        user_count=user_count,
        item_count=item_count,
        interaction_count=interaction_count,
        average_interactions_per_user=average_interactions_per_user,
        knowledge_component_count=knowledge_component_count,
        q_matrix_coverage=q_matrix_coverage,
        data_sparsity=max(0.0, min(1.0, data_sparsity)),
        median_sequence_length=median_sequence_length,
        max_sequence_length=max_sequence_length,
        train_validation_test_split_feasible=split_feasible,
        production_ready=not blocking_reasons and split_feasible,
        blocking_reasons=blocking_reasons if split_feasible else [*blocking_reasons, "train_validation_test_split_not_feasible"],
        thresholds=thresholds,
        generated_at=_now(),
    )


async def build_advanced_diagnosis_experiment_report(
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
    app_settings=settings,
) -> AdvancedDiagnosisExperimentReport:
    readiness = await audit_advanced_model_readiness(repository=repository, app_settings=app_settings)
    neuralcd = build_research_training_plan("neuralcd", readiness, app_settings=app_settings)
    akt = build_research_training_plan("akt", readiness, app_settings=app_settings)
    return AdvancedDiagnosisExperimentReport(
        readiness=readiness,
        production_model="bkt_irt",
        neuralcd=neuralcd,
        akt=akt,
        baseline_comparison={
            "planned": ["bkt", "irt", "bkt_irt", "neuralcd", "akt"],
            "metrics": [
                "auc",
                "accuracy",
                "log_loss",
                "brier",
                "calibration",
                "training_time",
                "inference_time",
                "memory",
                "interpretability",
            ],
            "status": "blocked_until_real_or_research_dataset_available" if not readiness.production_ready else "ready_for_research_run",
        },
        generated_at=_now(),
    )


def build_research_training_plan(model_name: str, readiness: AdvancedModelReadinessAudit, *, app_settings=settings) -> AdvancedModelTrainingPlan:
    enabled = app_settings.NEURALCD_ENABLED if model_name == "neuralcd" else app_settings.AKT_ENABLED
    version = app_settings.NEURALCD_MODEL_VERSION if model_name == "neuralcd" else app_settings.AKT_MODEL_VERSION
    production_allowed = bool(enabled and readiness.production_ready)
    status = "skipped" if not production_allowed else "ready"
    mode = "production" if production_allowed else "research_only"
    notes = [
        "BKT/IRT remains the production learner model.",
        "No AI API is allowed to create labels, interactions, or accuracy metrics.",
    ]
    if not readiness.production_ready:
        notes.append("Readiness gate failed; use only a separate research dataset or fixture.")
    if not enabled:
        notes.append(f"{model_name.upper()} feature flag is disabled.")
    return AdvancedModelTrainingPlan(
        model_name=model_name,
        status=status,
        mode=mode,
        version=version,
        split_strategy="time_ordered_per_user_or_user_holdout_without_future_leakage",
        metrics={},
        notes=notes,
    )


async def _sequence_lengths(db) -> list[int]:
    pipeline: list[dict[str, Any]] = [
        {"$match": {"event_type": "question_answered"}},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]
    lengths: list[int] = []
    async for row in db[LEARNING_EVENTS].aggregate(pipeline):
        lengths.append(int(row.get("count", 0)))
    return lengths


def _blocking_reasons(
    *,
    user_count: int,
    item_count: int,
    interaction_count: int,
    average_interactions_per_user: float,
    knowledge_component_count: int,
    q_matrix_coverage: float,
    data_sparsity: float,
    median_sequence_length: float,
    thresholds: AdvancedModelReadinessThresholds,
) -> list[str]:
    reasons: list[str] = []
    if user_count < thresholds.min_users:
        reasons.append("not_enough_users")
    if item_count < thresholds.min_items:
        reasons.append("not_enough_items")
    if interaction_count < thresholds.min_interactions:
        reasons.append("not_enough_interactions")
    if average_interactions_per_user < thresholds.min_interactions_per_user:
        reasons.append("not_enough_interactions_per_user")
    if knowledge_component_count < thresholds.min_knowledge_components:
        reasons.append("not_enough_knowledge_components")
    if q_matrix_coverage < thresholds.min_q_matrix_coverage:
        reasons.append("low_q_matrix_coverage")
    if data_sparsity > thresholds.max_sparsity:
        reasons.append("data_too_sparse")
    if median_sequence_length < thresholds.min_sequence_length:
        reasons.append("sequence_too_short")
    return reasons
