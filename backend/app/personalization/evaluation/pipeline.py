from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database
from app.personalization.constants.collections import (
    CLUSTER_MODELS,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
    LEARNER_KNOWLEDGE_STATES,
    LEARNER_PROFILES,
    RECOMMENDATION_LOGS,
)
from app.personalization.evaluation.metrics import (
    compare_recommendation_baselines,
    evaluate_ai_explanations,
    evaluate_kmeans,
    evaluate_learner_models,
    evaluate_recommendations,
    run_ablation_study,
)
from app.personalization.evaluation.synthetic import build_synthetic_evaluation_dataset


def run_synthetic_evaluation() -> dict[str, Any]:
    dataset = build_synthetic_evaluation_dataset()
    return evaluate_dataset(dataset)


def evaluate_dataset(dataset: dict[str, Any]) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    kmeans_results = {}
    for cluster_type, samples in (dataset.get("kmeans") or {}).items():
        kmeans_results[cluster_type] = evaluate_kmeans(samples, cluster_type=cluster_type)

    return {
        "generated_at": generated_at,
        "is_synthetic": bool(dataset.get("is_synthetic")),
        "synthetic_notice": dataset.get("synthetic_notice"),
        "data_inventory": _dataset_inventory(dataset),
        "kmeans": kmeans_results or {"status": "no_data", "message": "No clustering samples supplied."},
        "learner_model": evaluate_learner_models(dataset.get("learner_predictions") or []),
        "recommendations": evaluate_recommendations(dataset.get("recommendation_sessions") or [], k=5),
        "baseline_comparison": compare_recommendation_baselines(dataset.get("baseline_sessions") or {}, k=5),
        "ablation_study": run_ablation_study(dataset.get("ablation_sessions") or {}, k=5),
        "ai_explanations": evaluate_ai_explanations(dataset.get("ai_explanations") or []),
    }


async def run_real_evaluation(limit: int = 2000) -> dict[str, Any]:
    await connect_to_mongo()
    try:
        db = get_database()
        dataset = {
            "is_synthetic": False,
            "kmeans": {},
            "learner_predictions": await _load_real_learner_predictions(db, limit),
            "recommendation_sessions": await _load_real_recommendation_sessions(db, limit),
            "baseline_sessions": {},
            "ablation_sessions": {},
            "ai_explanations": await _load_real_ai_explanations(db, limit),
        }
        result = evaluate_dataset(dataset)
        result["data_inventory"] = await _real_inventory(db)
        result["kmeans"] = await _real_kmeans_summary(db)
        return result
    finally:
        await close_mongo_connection()


def _dataset_inventory(dataset: dict[str, Any]) -> dict[str, Any]:
    return {
        "is_synthetic": bool(dataset.get("is_synthetic")),
        "kmeans_sample_groups": {key: len(value) for key, value in (dataset.get("kmeans") or {}).items()},
        "learner_prediction_rows": len(dataset.get("learner_predictions") or []),
        "recommendation_sessions": len(dataset.get("recommendation_sessions") or []),
        "ai_explanation_rows": len(dataset.get("ai_explanations") or []),
    }


async def _real_inventory(db) -> dict[str, Any]:
    return {
        "is_synthetic": False,
        "learning_events": await db[LEARNING_EVENTS].count_documents({}),
        "question_answered_events": await db[LEARNING_EVENTS].count_documents({"event_type": "question_answered"}),
        "learner_profiles": await db[LEARNER_PROFILES].count_documents({}),
        "learner_knowledge_states": await db[LEARNER_KNOWLEDGE_STATES].count_documents({}),
        "learning_items": await db[LEARNING_ITEMS].count_documents({}),
        "recommendation_logs": await db[RECOMMENDATION_LOGS].count_documents({}),
        "cluster_models": await db[CLUSTER_MODELS].count_documents({}),
    }


async def _load_real_learner_predictions(db, limit: int) -> list[dict[str, Any]]:
    cursor = (
        db[LEARNING_EVENTS]
        .find({
            "event_type": "question_answered",
            "learner_model_prediction.probability_before": {"$exists": True},
            "learner_model_prediction.actual": {"$exists": True},
        })
        .sort("occurred_at", -1)
        .limit(limit)
    )
    rows = []
    async for event in cursor:
        prediction = event.get("learner_model_prediction") or {}
        rows.append({
            "predicted_probability": prediction.get("probability_before"),
            "actual": prediction.get("actual"),
            "knowledge_component_id": (event.get("knowledge_component_ids") or [None])[0],
            "cold_start": bool(prediction.get("cold_start")),
        })
    return rows


async def _load_real_recommendation_sessions(db, limit: int) -> list[dict[str, Any]]:
    cursor = db[RECOMMENDATION_LOGS].find({}).sort("generated_at", -1).limit(limit)
    grouped: dict[str, dict[str, Any]] = {}
    async for log in cursor:
        session_key = str(log.get("session_id") or log.get("user_id") or "unknown")
        session = grouped.setdefault(
            session_key,
            {
                "catalog_size": await db[LEARNING_ITEMS].count_documents({}),
                "recommended_items": [],
                "accepted_item_ids": [],
                "relevant_item_ids": [],
            },
        )
        item_id = str(log.get("item_id"))
        session["recommended_items"].append({
            "item_id": item_id,
            "difficulty": (log.get("feature_snapshot") or {}).get("difficulty"),
            "prerequisite_status": (log.get("feature_snapshot") or {}).get("prerequisite_status"),
            "knowledge_component_ids": [],
        })
        if log.get("clicked") or log.get("completed") or (log.get("feedback") or {}).get("helpful"):
            session["accepted_item_ids"].append(item_id)
        # Real relevance labels are not inferred from clicks; keep empty unless an explicit label is stored later.
    return list(grouped.values())


async def _load_real_ai_explanations(db, limit: int) -> list[dict[str, Any]]:
    cursor = db[RECOMMENDATION_LOGS].find({"ai_explanation_evaluation": {"$exists": True}}).limit(limit)
    rows = []
    async for log in cursor:
        rows.append(log["ai_explanation_evaluation"])
    return rows


async def _real_kmeans_summary(db) -> dict[str, Any]:
    cursor = db[CLUSTER_MODELS].find({"status": "active"})
    active_models = []
    async for model in cursor:
        active_models.append({
            "cluster_type": model.get("cluster_type"),
            "version": model.get("version"),
            "feature_schema_version": model.get("feature_schema_version"),
            "number_of_clusters": model.get("number_of_clusters"),
            "training_sample_count": model.get("training_sample_count"),
            "metrics": model.get("metrics") or {},
            "status": "stored_model_metrics_only",
        })
    if not active_models:
        return {
            "status": "no_active_models",
            "message": "No active cluster model is stored; K-Means validity metrics require training samples or stored model metrics.",
        }
    return {
        "status": "stored_model_metrics_only",
        "message": "Real training samples are not reconstructed here; reporting persisted cluster model metrics only.",
        "active_models": active_models,
    }
