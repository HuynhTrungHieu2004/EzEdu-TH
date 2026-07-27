from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from itertools import combinations
from statistics import mean
from typing import Any, Iterable, Optional

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    roc_auc_score,
    silhouette_score,
)

from app.personalization.algorithms.kmeans_clustering import (
    FEATURE_SCHEMAS,
    KMeansTrainingError,
    build_feature_matrix,
    choose_k_and_fit,
)
from app.personalization.schemas.data_models import ClusterType


def _clamp_probability(value: float) -> float:
    return max(0.001, min(0.999, float(value)))


def _mean(values: Iterable[float]) -> Optional[float]:
    clean = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    return mean(clean) if clean else None


def _status_metric(status: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"status": status, "message": message, **extra}


def _binary_prediction_metrics(rows: list[dict[str, Any]], *, include_per_kc: bool = True) -> dict[str, Any]:
    if not rows:
        return _status_metric("no_data", "No valid prediction rows.")

    y_true: list[int] = []
    y_score: list[float] = []
    skipped_missing_label = 0
    skipped_invalid_prediction = 0

    for row in rows:
        if row.get("actual") is None:
            skipped_missing_label += 1
            continue
        try:
            probability = _clamp_probability(float(row["predicted_probability"]))
            actual_value = max(0.0, min(1.0, float(row["actual"])))
        except (TypeError, ValueError):
            skipped_invalid_prediction += 1
            continue
        y_score.append(probability)
        y_true.append(1 if actual_value >= 0.5 else 0)

    if not y_true:
        return _status_metric(
            "no_valid_rows",
            "Rows were present, but none had both a valid prediction and label.",
            skipped_missing_label=skipped_missing_label,
            skipped_invalid_prediction=skipped_invalid_prediction,
        )

    accuracy = sum(int((score >= 0.5) == bool(label)) for score, label in zip(y_score, y_true)) / len(y_true)
    log_loss = -sum(
        label * math.log(score) + (1 - label) * math.log(1 - score)
        for score, label in zip(y_score, y_true)
    ) / len(y_true)
    brier = sum((score - label) ** 2 for score, label in zip(y_score, y_true)) / len(y_true)

    buckets: dict[str, dict[str, float]] = {}
    for score, label in zip(y_score, y_true):
        floor = min(0.9, int(score * 10) / 10)
        name = f"{floor:.1f}-{floor + 0.1:.1f}"
        bucket = buckets.setdefault(name, {"count": 0, "predicted_sum": 0.0, "actual_sum": 0.0})
        bucket["count"] += 1
        bucket["predicted_sum"] += score
        bucket["actual_sum"] += label

    calibration = [
        {
            "bucket": name,
            "count": int(bucket["count"]),
            "avg_predicted": bucket["predicted_sum"] / bucket["count"],
            "avg_actual": bucket["actual_sum"] / bucket["count"],
        }
        for name, bucket in sorted(buckets.items())
    ]

    roc_auc: dict[str, Any]
    if len(set(y_true)) < 2:
        roc_auc = {"status": "insufficient_classes", "value": None}
    else:
        roc_auc = {"status": "ok", "value": float(roc_auc_score(y_true, y_score))}

    result: dict[str, Any] = {
        "status": "ok",
        "sample_count": len(y_true),
        "skipped_missing_label": skipped_missing_label,
        "skipped_invalid_prediction": skipped_invalid_prediction,
        "accuracy": accuracy,
        "roc_auc": roc_auc,
        "log_loss": log_loss,
        "brier_score": brier,
        "calibration_buckets": calibration,
    }

    if include_per_kc:
        by_kc: dict[str, list[dict[str, Any]]] = defaultdict(list)
        cold_start_rows: list[dict[str, Any]] = []
        for row in rows:
            # Keep grouping best-effort; invalid rows are handled by the recursive metric call.
            kc_id = row.get("knowledge_component_id")
            if kc_id:
                by_kc[str(kc_id)].append(row)
            if row.get("cold_start"):
                cold_start_rows.append(row)
        result["per_knowledge_component"] = {
            kc_id: _binary_prediction_metrics(kc_rows, include_per_kc=False)
            for kc_id, kc_rows in sorted(by_kc.items())
        }
        result["cold_start_performance"] = (
            _binary_prediction_metrics(cold_start_rows, include_per_kc=False)
            if cold_start_rows
            else _status_metric("no_data", "No cold-start prediction rows.")
        )

    return result


def evaluate_learner_models(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Evaluate BKT/IRT probability predictions without using AI-generated scores."""
    metrics = _binary_prediction_metrics(rows)
    return {
        "bkt_irt": metrics,
        "notes": [
            "ROC-AUC is reported only when both positive and negative labels exist.",
            "Partial scores are converted to binary labels with threshold >= 0.5.",
        ],
    }


def evaluate_kmeans(
    samples: list[dict[str, Any]],
    *,
    cluster_type: ClusterType,
    min_k: int = 2,
    max_k: int = 8,
    min_cluster_size: int = 2,
    seeds: tuple[int, ...] = (13, 29, 47),
) -> dict[str, Any]:
    if not samples:
        return _status_metric("no_data", "No clustering samples supplied.")
    schema = FEATURE_SCHEMAS[cluster_type]
    try:
        feature_matrix, feature_names, _ = build_feature_matrix(samples, schema)
    except KMeansTrainingError as exc:
        return _status_metric("invalid_features", str(exc))

    if feature_matrix.shape[0] < min_k + 1:
        return _status_metric(
            "insufficient_data",
            "Not enough samples to compute clustering validity metrics.",
            sample_count=int(feature_matrix.shape[0]),
        )

    try:
        model, selection_metrics = choose_k_and_fit(
            feature_matrix,
            min_k=min_k,
            max_k=max_k,
            min_cluster_size=min_cluster_size,
            random_state=seeds[0],
            n_init=10,
            max_iter=300,
        )
    except KMeansTrainingError as exc:
        return _status_metric("skipped", str(exc), sample_count=int(feature_matrix.shape[0]))

    labels = model.predict(feature_matrix)
    distances = np.linalg.norm(model.cluster_centers_[labels] - feature_matrix, axis=1)
    cluster_sizes = dict(sorted(Counter(int(label) for label in labels).items()))

    stability_scores = []
    label_runs = []
    selected_k = int(selection_metrics["selected_k"])
    for seed in seeds:
        seeded_model = KMeans(n_clusters=selected_k, random_state=seed, n_init=10, max_iter=300)
        label_runs.append(seeded_model.fit_predict(feature_matrix))
    for left, right in combinations(label_runs, 2):
        stability_scores.append(float(adjusted_rand_score(left, right)))

    return {
        "status": "ok",
        "sample_count": int(feature_matrix.shape[0]),
        "feature_count": int(feature_matrix.shape[1]),
        "feature_names": feature_names,
        "selected_k": selected_k,
        "silhouette_score": float(silhouette_score(feature_matrix, labels)) if selected_k > 1 else None,
        "davies_bouldin_index": float(davies_bouldin_score(feature_matrix, labels)) if selected_k > 1 else None,
        "calinski_harabasz_score": float(calinski_harabasz_score(feature_matrix, labels)) if selected_k > 1 else None,
        "cluster_size_distribution": cluster_sizes,
        "stability": {
            "seeds": list(seeds),
            "adjusted_rand_index_mean": _mean(stability_scores),
            "pairwise_adjusted_rand_index": stability_scores,
        },
        "outlier_distance": {
            "mean": float(np.mean(distances)),
            "p95": float(np.percentile(distances, 95)),
            "max": float(np.max(distances)),
        },
        "cluster_interpretability_review": {
            "status": "requires_human_review",
            "message": "Review representative samples and AI-proposed labels before using cluster names in product UI.",
        },
        "selection_metrics": selection_metrics,
    }


def _recommended_ids(session: dict[str, Any], k: int) -> list[Any]:
    raw_items = session.get("recommended_items", [])
    ids = [item.get("item_id") if isinstance(item, dict) else item for item in raw_items]
    return [item_id for item_id in ids if item_id is not None][:k]


def _item_dicts(session: dict[str, Any], k: int) -> list[dict[str, Any]]:
    return [item for item in session.get("recommended_items", [])[:k] if isinstance(item, dict)]


def _dcg(relevance: list[int]) -> float:
    return sum(value / math.log2(index + 2) for index, value in enumerate(relevance))


def _pairwise_diversity(items: list[dict[str, Any]]) -> Optional[float]:
    if len(items) < 2:
        return None
    distances = []
    for left, right in combinations(items, 2):
        left_kcs = set(left.get("knowledge_component_ids") or [])
        right_kcs = set(right.get("knowledge_component_ids") or [])
        if not left_kcs and not right_kcs:
            continue
        union = left_kcs | right_kcs
        distances.append(1.0 - (len(left_kcs & right_kcs) / len(union)))
    return _mean(distances)


def evaluate_recommendations(sessions: list[dict[str, Any]], *, k: int = 5) -> dict[str, Any]:
    if not sessions:
        return _status_metric("no_data", "No recommendation sessions supplied.")

    precision_values = []
    recall_values = []
    ndcg_values = []
    hit_values = []
    acceptance_values = []
    diversity_values = []
    novelty_values = []
    repetition_values = []
    prereq_violations = 0
    prereq_checked = 0
    difficulty_fit_values = []
    unique_recommended: set[Any] = set()
    catalog_size = max(int(session.get("catalog_size") or 0) for session in sessions)

    learning_fields = {
        "mastery_gain": [],
        "delayed_retention": [],
        "completion_rate": [],
        "reduction_in_repeated_mistakes": [],
        "time_to_mastery": [],
    }

    for session in sessions:
        recommended = _recommended_ids(session, k)
        recommended_set = set(recommended)
        relevant = set(session.get("relevant_item_ids") or [])
        accepted = set(session.get("accepted_item_ids") or session.get("clicked_item_ids") or [])
        unique_recommended.update(recommended_set)
        if not recommended:
            repetition_values.append(0.0)
        else:
            repetition_values.append(1.0 - (len(recommended_set) / len(recommended)))

        if relevant:
            hits = len(recommended_set & relevant)
            precision_values.append(hits / max(1, len(recommended)))
            recall_values.append(hits / len(relevant))
            hit_values.append(1.0 if hits else 0.0)
            relevance = [1 if item_id in relevant else 0 for item_id in recommended]
            ideal = sorted(relevance, reverse=True)
            ndcg_values.append(_dcg(relevance) / max(_dcg(ideal), 1e-9))

        if recommended:
            acceptance_values.append(len(recommended_set & accepted) / len(recommended))

        item_dicts = _item_dicts(session, k)
        diversity = _pairwise_diversity(item_dicts)
        if diversity is not None:
            diversity_values.append(diversity)
        for item in item_dicts:
            popularity = item.get("popularity")
            if popularity is not None:
                novelty_values.append(1.0 - max(0.0, min(1.0, float(popularity))))
            prereq = item.get("prerequisite_status")
            if prereq is not None:
                prereq_checked += 1
                prereq_violations += int(str(prereq) in {"severe_gap", "violation", "failed"})
            difficulty = item.get("difficulty")
            low = session.get("difficulty_min")
            high = session.get("difficulty_max")
            if difficulty is not None and low is not None and high is not None:
                difficulty_fit_values.append(1.0 if float(low) <= float(difficulty) <= float(high) else 0.0)

        for field_name, values in learning_fields.items():
            if session.get(field_name) is not None:
                values.append(float(session[field_name]))

    return {
        "status": "ok",
        "session_count": len(sessions),
        f"precision@{k}": _mean(precision_values),
        f"recall@{k}": _mean(recall_values),
        f"ndcg@{k}": _mean(ndcg_values),
        f"hit_rate@{k}": _mean(hit_values),
        "coverage": (len(unique_recommended) / catalog_size) if catalog_size else None,
        "diversity": _mean(diversity_values),
        "novelty": _mean(novelty_values),
        "repetition_rate": _mean(repetition_values),
        "prerequisite_violation_rate": (prereq_violations / prereq_checked) if prereq_checked else None,
        "difficulty_fit": _mean(difficulty_fit_values),
        "recommendation_acceptance": _mean(acceptance_values),
        "learning_metrics": {
            field_name: (_mean(values) if values else None)
            for field_name, values in learning_fields.items()
        },
    }


def compare_recommendation_baselines(
    baseline_sessions: dict[str, list[dict[str, Any]]],
    *,
    k: int = 5,
) -> dict[str, Any]:
    expected = [
        "random",
        "popular_item",
        "kmeans_cluster_only",
        "weighted_ranking",
        "weighted_ranking_reranking",
    ]
    return {
        name: evaluate_recommendations(baseline_sessions.get(name, []), k=k)
        for name in expected
    }


def run_ablation_study(ablation_sessions: dict[str, list[dict[str, Any]]], *, k: int = 5) -> dict[str, Any]:
    expected = [
        "without_knowledge_graph",
        "without_bkt",
        "without_irt",
        "without_kmeans",
        "without_interest",
        "without_forgetting",
        "without_diversity_reranking",
    ]
    return {name: evaluate_recommendations(ablation_sessions.get(name, []), k=k) for name in expected}


def evaluate_ai_explanations(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return _status_metric("no_data", "No AI explanation rows supplied.")

    grounded = []
    faithful = []
    hallucinated_number = []
    source_valid = []
    relevant = []
    fallback = []
    number_pattern = re.compile(r"\d+(?:[\.,]\d+)?%?")

    for row in rows:
        text = str(row.get("explanation") or "")
        allowed_numbers = {str(value) for value in row.get("allowed_numbers", [])}
        found_numbers = {match.group(0).replace(",", ".") for match in number_pattern.finditer(text)}
        if found_numbers:
            hallucinated_number.append(0.0 if found_numbers <= allowed_numbers else 1.0)
        else:
            hallucinated_number.append(0.0)
        grounded.append(1.0 if row.get("grounded") else 0.0)
        faithful.append(1.0 if row.get("faithful_to_scores") else 0.0)
        source_valid.append(1.0 if row.get("source_valid") else 0.0)
        relevant.append(1.0 if row.get("relevant") else 0.0)
        fallback.append(1.0 if row.get("fallback_used") else 0.0)

    return {
        "status": "ok",
        "sample_count": len(rows),
        "groundedness": _mean(grounded),
        "faithfulness_to_input_scores": _mean(faithful),
        "hallucinated_number_rate": _mean(hallucinated_number),
        "source_validity": _mean(source_valid),
        "explanation_relevance": _mean(relevant),
        "fallback_rate": _mean(fallback),
    }
