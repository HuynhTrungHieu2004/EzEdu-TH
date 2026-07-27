from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any


def build_synthetic_evaluation_dataset() -> dict[str, Any]:
    """Create a clearly marked fixture for pipeline validation, not real results."""
    generated_at = datetime.now(timezone.utc).isoformat()
    learner_predictions = [
        {
            "predicted_probability": 0.82,
            "actual": 1,
            "knowledge_component_id": "kc-algebra",
            "cold_start": False,
        },
        {
            "predicted_probability": 0.68,
            "actual": 1,
            "knowledge_component_id": "kc-algebra",
            "cold_start": False,
        },
        {
            "predicted_probability": 0.28,
            "actual": 0,
            "knowledge_component_id": "kc-geometry",
            "cold_start": True,
        },
        {
            "predicted_probability": 0.61,
            "actual": 0,
            "knowledge_component_id": "kc-geometry",
            "cold_start": True,
        },
        {
            "predicted_probability": 0.44,
            "actual": 1,
            "knowledge_component_id": "kc-probability",
            "cold_start": False,
        },
        {
            "predicted_probability": 0.19,
            "actual": 0,
            "knowledge_component_id": "kc-probability",
            "cold_start": False,
        },
    ]

    content_cluster_samples = []
    for idx in range(6):
        content_cluster_samples.append({
            "semantic_embedding": [1.0, 0.0, 0.0],
            "difficulty": 0.15 + idx * 0.02,
            "bloom_level_encoded": 0.2,
            "estimated_duration_seconds": 240 + idx * 20,
            "topic": "foundation",
        })
    for idx in range(6):
        content_cluster_samples.append({
            "semantic_embedding": [0.0, 1.0, 0.0],
            "difficulty": 0.72 + idx * 0.02,
            "bloom_level_encoded": 0.8,
            "estimated_duration_seconds": 720 + idx * 25,
            "topic": "advanced",
        })

    weighted_sessions = [
        _session(
            ["item-1", "item-2", "item-3", "item-4"],
            relevant=["item-1", "item-3"],
            accepted=["item-1"],
            difficulties=[0.42, 0.51, 0.46, 0.80],
            prerequisite_statuses=["satisfied", "satisfied", "satisfied", "minor_gap"],
            kcs=[["kc-algebra"], ["kc-geometry"], ["kc-algebra", "kc-probability"], ["kc-calculus"]],
            mastery_gain=0.08,
            delayed_retention=0.71,
            completion_rate=0.75,
        ),
        _session(
            ["item-3", "item-5", "item-6"],
            relevant=["item-5"],
            accepted=["item-5"],
            difficulties=[0.46, 0.48, 0.32],
            prerequisite_statuses=["satisfied", "satisfied", "satisfied"],
            kcs=[["kc-probability"], ["kc-geometry"], ["kc-algebra"]],
            mastery_gain=0.03,
            delayed_retention=0.66,
            completion_rate=0.67,
        ),
    ]

    baseline_sessions = {
        "random": [_replace_order(weighted_sessions[0], ["item-4", "item-2", "item-1", "item-3"])],
        "popular_item": [_replace_order(weighted_sessions[0], ["item-2", "item-4", "item-1", "item-3"])],
        "kmeans_cluster_only": [_replace_order(weighted_sessions[0], ["item-3", "item-4", "item-2", "item-1"])],
        "weighted_ranking": weighted_sessions,
        "weighted_ranking_reranking": weighted_sessions,
    }

    ablation_sessions = {
        "without_knowledge_graph": [_mark_prereq_violation(weighted_sessions[0])],
        "without_bkt": [_replace_order(weighted_sessions[0], ["item-2", "item-1", "item-4", "item-3"])],
        "without_irt": [_replace_order(weighted_sessions[0], ["item-4", "item-1", "item-2", "item-3"])],
        "without_kmeans": [_replace_order(weighted_sessions[0], ["item-1", "item-2", "item-3", "item-4"])],
        "without_interest": [_replace_order(weighted_sessions[1], ["item-6", "item-3", "item-5"])],
        "without_forgetting": [_replace_order(weighted_sessions[1], ["item-3", "item-6", "item-5"])],
        "without_diversity_reranking": [_low_diversity(weighted_sessions[0])],
    }

    ai_explanations = [
        {
            "explanation": "Nội dung này giúp củng cố KC đại số với độ khó phù hợp.",
            "allowed_numbers": [],
            "grounded": True,
            "faithful_to_scores": True,
            "source_valid": True,
            "relevant": True,
            "fallback_used": False,
        },
        {
            "explanation": "Bạn thành thạo 99% nên nên học mục này.",
            "allowed_numbers": ["72%"],
            "grounded": False,
            "faithful_to_scores": False,
            "source_valid": True,
            "relevant": False,
            "fallback_used": False,
        },
        {
            "explanation": "Hệ thống dùng giải thích theo mẫu vì AI provider lỗi.",
            "allowed_numbers": [],
            "grounded": True,
            "faithful_to_scores": True,
            "source_valid": True,
            "relevant": True,
            "fallback_used": True,
        },
    ]

    return {
        "is_synthetic": True,
        "synthetic_notice": "Synthetic fixture for pipeline validation only; do not present these metrics as real system performance.",
        "generated_at": generated_at,
        "kmeans": {"content": content_cluster_samples},
        "learner_predictions": learner_predictions,
        "recommendation_sessions": weighted_sessions,
        "baseline_sessions": baseline_sessions,
        "ablation_sessions": ablation_sessions,
        "ai_explanations": ai_explanations,
    }


def _session(
    item_ids: list[str],
    *,
    relevant: list[str],
    accepted: list[str],
    difficulties: list[float],
    prerequisite_statuses: list[str],
    kcs: list[list[str]],
    mastery_gain: float,
    delayed_retention: float,
    completion_rate: float,
) -> dict[str, Any]:
    return {
        "catalog_size": 8,
        "relevant_item_ids": relevant,
        "accepted_item_ids": accepted,
        "difficulty_min": 0.35,
        "difficulty_max": 0.65,
        "mastery_gain": mastery_gain,
        "delayed_retention": delayed_retention,
        "completion_rate": completion_rate,
        "reduction_in_repeated_mistakes": 0.1,
        "time_to_mastery": 4.0,
        "recommended_items": [
            {
                "item_id": item_id,
                "difficulty": difficulties[index],
                "prerequisite_status": prerequisite_statuses[index],
                "knowledge_component_ids": kcs[index],
                "popularity": min(0.9, 0.2 + index * 0.1),
            }
            for index, item_id in enumerate(item_ids)
        ],
    }


def _replace_order(session: dict[str, Any], item_ids: list[str]) -> dict[str, Any]:
    copied = deepcopy(session)
    by_id = {item["item_id"]: item for item in copied["recommended_items"]}
    copied["recommended_items"] = [by_id[item_id] for item_id in item_ids if item_id in by_id]
    return copied


def _mark_prereq_violation(session: dict[str, Any]) -> dict[str, Any]:
    copied = deepcopy(session)
    if copied["recommended_items"]:
        copied["recommended_items"][0]["prerequisite_status"] = "severe_gap"
    return copied


def _low_diversity(session: dict[str, Any]) -> dict[str, Any]:
    copied = deepcopy(session)
    for item in copied["recommended_items"]:
        item["knowledge_component_ids"] = ["kc-algebra"]
    return copied
