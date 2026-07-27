import json
from datetime import datetime, timezone
from typing import Callable, Optional

import numpy as np

from app.core.config import settings
from app.personalization.algorithms.kmeans_clustering import (
    FEATURE_SCHEMAS,
    KMeansTrainingError,
    build_feature_matrix,
    choose_k_and_fit,
    nearest_centroid,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.clustering import ClusterPredictionResponse, ClusterTrainingResult
from app.personalization.schemas.data_models import ClusterModel, ClusterType


def _model_version(cluster_type: ClusterType, version: Optional[str] = None) -> str:
    if version:
        return version
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{cluster_type}-{settings.CLUSTERING_MODEL_VERSION}-{timestamp}"


def _distance_stats(feature_matrix: np.ndarray, labels: np.ndarray, centroids: np.ndarray) -> dict:
    distances = np.linalg.norm(feature_matrix - centroids[labels], axis=1)
    return {
        "mean_distance_to_centroid": float(np.mean(distances)),
        "std_distance_to_centroid": float(np.std(distances)),
        "max_distance_to_centroid": float(np.max(distances)),
    }


def _interpret_clusters(
    *,
    cluster_type: ClusterType,
    metrics: dict,
    labels: np.ndarray,
    samples: list[dict],
    ai_json_generator: Optional[Callable[[str], str | dict]],
) -> dict:
    if ai_json_generator is None:
        return {}

    summaries = []
    for cluster_id in sorted(set(int(label) for label in labels)):
        cluster_samples = [samples[idx] for idx, label in enumerate(labels) if int(label) == cluster_id]
        summaries.append({
            "cluster_id": cluster_id,
            "sample_count": len(cluster_samples),
            "aggregate_keys": sorted(
                key for key in set().union(*(sample.keys() for sample in cluster_samples))
                if key not in {"user_id", "id", "_id", "email", "full_name"}
            ),
        })

    prompt = (
        "Given anonymized K-Means cluster statistics, return JSON only with "
        "clusters: [{cluster_id, name, description, characteristics, educational_suggestions}]. "
        "Do not infer identity or change algorithm outputs.\n"
        + json.dumps({"cluster_type": cluster_type, "metrics": metrics, "clusters": summaries}, ensure_ascii=False)
    )
    try:
        raw = ai_json_generator(prompt)
        payload = json.loads(raw) if isinstance(raw, str) else raw
        clusters = payload.get("clusters", [])
        if not isinstance(clusters, list):
            return {"status": "failed", "reason": "AI interpretation clusters must be a list."}
        sanitized = []
        valid_ids = {item["cluster_id"] for item in summaries}
        for item in clusters:
            if not isinstance(item, dict) or item.get("cluster_id") not in valid_ids:
                continue
            sanitized.append({
                "cluster_id": int(item["cluster_id"]),
                "name": str(item.get("name", ""))[:120],
                "description": str(item.get("description", ""))[:1000],
                "characteristics": [str(value)[:240] for value in item.get("characteristics", [])[:8]],
                "educational_suggestions": [str(value)[:240] for value in item.get("educational_suggestions", [])[:8]],
            })
        return {"status": "ok", "clusters": sanitized} if sanitized else {"status": "failed", "reason": "No valid AI cluster labels."}
    except Exception as exc:
        return {"status": "failed", "reason": type(exc).__name__}


async def fit_cluster_model(
    cluster_type: ClusterType,
    samples: list[dict],
    *,
    version: Optional[str] = None,
    activate: bool = True,
    ai_json_generator: Optional[Callable[[str], str | dict]] = None,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> ClusterTrainingResult:
    repo = repository or PersonalizationMongoRepository()
    if len(samples) < settings.KMEANS_MIN_SAMPLES:
        return ClusterTrainingResult(
            status="skipped",
            cluster_type=cluster_type,
            sample_count=len(samples),
            reason="not_enough_samples",
        )

    schema = FEATURE_SCHEMAS[cluster_type]
    try:
        feature_matrix, feature_names, normalization_parameters = build_feature_matrix(samples, schema)
        model, metrics = choose_k_and_fit(
            feature_matrix,
            min_k=settings.KMEANS_MIN_K,
            max_k=settings.KMEANS_MAX_K,
            min_cluster_size=settings.KMEANS_MIN_CLUSTER_SIZE,
            random_state=settings.KMEANS_RANDOM_STATE,
            n_init=settings.KMEANS_N_INIT,
            max_iter=settings.KMEANS_MAX_ITER,
        )
    except KMeansTrainingError as exc:
        return ClusterTrainingResult(
            status="skipped",
            cluster_type=cluster_type,
            sample_count=len(samples),
            reason=str(exc),
        )

    labels = model.labels_
    metrics.update(_distance_stats(feature_matrix, labels, model.cluster_centers_))
    interpretation = _interpret_clusters(
        cluster_type=cluster_type,
        metrics=metrics,
        labels=labels,
        samples=samples,
        ai_json_generator=ai_json_generator,
    )
    now = datetime.now(timezone.utc)
    model_version = _model_version(cluster_type, version)
    cluster_model = ClusterModel(
        cluster_type=cluster_type,
        version=model_version,
        feature_schema_version=settings.FEATURE_SCHEMA_VERSION,
        feature_names=feature_names,
        normalization_parameters=normalization_parameters,
        number_of_clusters=int(metrics["selected_k"]),
        centroids=model.cluster_centers_.tolist(),
        metrics=metrics,
        training_sample_count=len(samples),
        random_state=settings.KMEANS_RANDOM_STATE,
        interpretation=interpretation,
        provenance={
            "fit_mode": "offline",
            "future_data_policy": "training job must receive only data available before trained_at",
        },
        status="draft",
        trained_at=now,
    )
    await repo.create_cluster_model(cluster_model)
    if activate:
        await repo.activate_cluster_model(cluster_type, model_version, now)
    return ClusterTrainingResult(
        status="trained",
        cluster_type=cluster_type,
        version=model_version,
        selected_k=int(metrics["selected_k"]),
        metrics=metrics,
        sample_count=len(samples),
    )


async def predict_cluster(
    cluster_type: ClusterType,
    sample: dict,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> ClusterPredictionResponse:
    repo = repository or PersonalizationMongoRepository()
    model = await repo.get_active_cluster_model(cluster_type)
    if not model:
        return ClusterPredictionResponse(
            cluster_type=cluster_type,
            provisional=True,
            confidence=0.0,
            reason="No active cluster model; use direct learner profile or cold-start defaults.",
        )

    schema = FEATURE_SCHEMAS[cluster_type]
    try:
        matrix, _, _ = build_feature_matrix([sample], schema, normalization_parameters=model["normalization_parameters"])
    except KMeansTrainingError as exc:
        return ClusterPredictionResponse(
            cluster_type=cluster_type,
            model_version=model["version"],
            provisional=True,
            confidence=0.1,
            reason=f"Could not build feature vector: {exc}",
        )

    cluster_id, distance = nearest_centroid(matrix[0], model["centroids"])
    mean_distance = float(model.get("metrics", {}).get("mean_distance_to_centroid", 0.0))
    std_distance = float(model.get("metrics", {}).get("std_distance_to_centroid", 0.0))
    threshold = mean_distance + settings.KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER * max(std_distance, 1e-9)
    outlier = distance > threshold
    confidence = 0.2 if outlier else max(0.2, min(1.0, 1.0 - (distance / max(threshold, 1e-9))))
    return ClusterPredictionResponse(
        cluster_type=cluster_type,
        model_version=model["version"],
        cluster_id=None if outlier else cluster_id,
        distance_to_centroid=distance,
        outlier=outlier,
        provisional=False,
        confidence=confidence,
        reason=(
            "Sample is far from active centroids; do not force a hard cluster."
            if outlier
            else "Assigned to nearest active centroid."
        ),
    )


async def rollback_cluster_model(
    cluster_type: ClusterType,
    target_version: str,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> Optional[dict]:
    repo = repository or PersonalizationMongoRepository()
    return await repo.rollback_cluster_model(cluster_type, target_version, datetime.now(timezone.utc))
