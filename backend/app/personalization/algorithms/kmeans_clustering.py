from dataclasses import dataclass
from typing import Any, Literal
import warnings

import numpy as np
from sklearn.cluster import KMeans
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score

from app.personalization.schemas.data_models import ClusterType


FORBIDDEN_FEATURE_KEYS = {"user_id", "id", "_id", "email", "full_name", "document_id", "item_id", "question_id"}


@dataclass(frozen=True)
class ClusterFeatureSchema:
    cluster_type: ClusterType
    embedding_field: str | None
    numeric_fields: tuple[str, ...]
    categorical_fields: tuple[str, ...] = ()
    embedding_weight: float = 0.7
    numeric_weight: float = 0.3


FEATURE_SCHEMAS: dict[ClusterType, ClusterFeatureSchema] = {
    "content": ClusterFeatureSchema(
        cluster_type="content",
        embedding_field="semantic_embedding",
        numeric_fields=("difficulty", "bloom_level_encoded", "estimated_duration_seconds"),
        categorical_fields=("topic",),
    ),
    "question": ClusterFeatureSchema(
        cluster_type="question",
        embedding_field="semantic_embedding",
        numeric_fields=(
            "difficulty",
            "bloom_level_encoded",
            "average_correctness",
            "average_response_time_ms",
            "discrimination",
            "required_knowledge_component_count",
        ),
    ),
    "learner_ability": ClusterFeatureSchema(
        cluster_type="learner_ability",
        embedding_field=None,
        numeric_fields=("global_theta", "average_mastery", "recent_accuracy", "solved_difficulty", "prerequisite_gaps"),
        embedding_weight=0.0,
        numeric_weight=1.0,
    ),
    "learner_behavior": ClusterFeatureSchema(
        cluster_type="learner_behavior",
        embedding_field=None,
        numeric_fields=(
            "average_response_time_ms",
            "completion_rate",
            "hint_rate",
            "answer_change_rate",
            "skip_rate",
            "session_consistency",
        ),
        embedding_weight=0.0,
        numeric_weight=1.0,
    ),
    "learner_interest": ClusterFeatureSchema(
        cluster_type="learner_interest",
        embedding_field=None,
        numeric_fields=(
            "topic_interaction_distribution",
            "content_type_preference",
            "document_category_preference",
            "recommendation_click_distribution",
        ),
        embedding_weight=0.0,
        numeric_weight=1.0,
    ),
}


class KMeansTrainingError(ValueError):
    pass


def _flatten_numeric(value: Any) -> list[float]:
    if value is None:
        return [np.nan]
    if isinstance(value, dict):
        return [float(value[key]) for key in sorted(value) if isinstance(value[key], (int, float))]
    if isinstance(value, (list, tuple)):
        return [float(item) if item is not None else np.nan for item in value]
    return [float(value)]


def _extract_embedding(sample: dict, field_name: str | None) -> list[float]:
    if not field_name:
        return []
    value = sample.get(field_name)
    if value is None:
        return []
    return [float(item) for item in value]


def _validate_no_identifier_features(samples: list[dict]) -> None:
    for sample in samples:
        leaked = FORBIDDEN_FEATURE_KEYS.intersection(sample)
        if leaked:
            raise KMeansTrainingError(f"Identifier-like keys are not allowed in clustering features: {sorted(leaked)}")


def _fit_normalization(raw_numeric: np.ndarray) -> dict:
    means = np.nanmean(raw_numeric, axis=0)
    means = np.where(np.isnan(means), 0.0, means)
    imputed = np.where(np.isnan(raw_numeric), means, raw_numeric)
    stds = np.std(imputed, axis=0)
    stds = np.where(stds < 1e-9, 1.0, stds)
    return {"means": means.tolist(), "stds": stds.tolist()}


def _apply_normalization(raw_numeric: np.ndarray, params: dict) -> np.ndarray:
    means = np.asarray(params["means"], dtype=float)
    stds = np.asarray(params["stds"], dtype=float)
    imputed = np.where(np.isnan(raw_numeric), means, raw_numeric)
    return (imputed - means) / stds


def _l2_normalize(matrix: np.ndarray) -> np.ndarray:
    if matrix.size == 0:
        return matrix
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms < 1e-9, 1.0, norms)
    return matrix / norms


def build_feature_matrix(
    samples: list[dict],
    schema: ClusterFeatureSchema,
    *,
    normalization_parameters: dict | None = None,
) -> tuple[np.ndarray, list[str], dict]:
    _validate_no_identifier_features(samples)
    if not samples:
        raise KMeansTrainingError("No samples supplied.")

    embedding_rows = [_extract_embedding(sample, schema.embedding_field) for sample in samples]
    embedding_dim = max((len(row) for row in embedding_rows), default=0)
    embeddings = np.zeros((len(samples), embedding_dim), dtype=float)
    for row_index, row in enumerate(embedding_rows):
        if row and len(row) != embedding_dim:
            raise KMeansTrainingError("Embedding dimensions must be consistent within one model.")
        if row:
            embeddings[row_index] = np.asarray(row, dtype=float)
    embeddings = _l2_normalize(embeddings) * schema.embedding_weight

    numeric_rows: list[list[float]] = []
    numeric_names: list[str] = []
    category_maps: dict[str, list[str]] = {}
    existing_categories = (normalization_parameters or {}).get("category_maps", {})

    for sample in samples:
        row: list[float] = []
        current_names: list[str] = []
        for field_name in schema.numeric_fields:
            values = _flatten_numeric(sample.get(field_name))
            row.extend(values)
            current_names.extend(
                [field_name] if len(values) == 1 else [f"{field_name}_{idx}" for idx in range(len(values))]
            )
        for field_name in schema.categorical_fields:
            if normalization_parameters:
                categories = existing_categories.get(field_name, [])
            else:
                categories = sorted({str(item.get(field_name, "")) for item in samples if item.get(field_name) is not None})
            category_maps[field_name] = categories
            value = str(sample.get(field_name, ""))
            row.extend([1.0 if value == category else 0.0 for category in categories])
            current_names.extend([f"{field_name}={category}" for category in categories])
        numeric_rows.append(row)
        if not numeric_names:
            numeric_names = current_names
        elif len(row) != len(numeric_names):
            raise KMeansTrainingError("Numeric feature dimensions are inconsistent.")

    raw_numeric = np.asarray(numeric_rows, dtype=float)
    if normalization_parameters:
        norm_params = dict(normalization_parameters)
    else:
        norm_params = _fit_normalization(raw_numeric)
        norm_params["category_maps"] = category_maps
        norm_params["schema"] = {
            "cluster_type": schema.cluster_type,
            "embedding_field": schema.embedding_field,
            "numeric_fields": list(schema.numeric_fields),
            "categorical_fields": list(schema.categorical_fields),
            "embedding_weight": schema.embedding_weight,
            "numeric_weight": schema.numeric_weight,
        }
    scaled_numeric = _apply_normalization(raw_numeric, norm_params) * schema.numeric_weight
    feature_matrix = np.concatenate([embeddings, scaled_numeric], axis=1)
    feature_names = [f"{schema.embedding_field}_{idx}" for idx in range(embedding_dim)] + numeric_names
    return feature_matrix, feature_names, norm_params


def choose_k_and_fit(
    feature_matrix: np.ndarray,
    *,
    min_k: int,
    max_k: int,
    min_cluster_size: int,
    random_state: int,
    n_init: int,
    max_iter: int,
) -> tuple[KMeans, dict]:
    sample_count = feature_matrix.shape[0]
    if sample_count < min_k:
        raise KMeansTrainingError("Not enough samples for K-Means.")

    upper_k = min(max_k, sample_count - 1)
    candidates = []
    for k in range(min_k, upper_k + 1):
        model = KMeans(n_clusters=k, random_state=random_state, n_init=n_init, max_iter=max_iter)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ConvergenceWarning)
            labels = model.fit_predict(feature_matrix)
        if len(set(labels)) < 2:
            continue
        sizes = np.bincount(labels, minlength=k)
        if np.min(sizes) < min_cluster_size:
            continue
        silhouette = silhouette_score(feature_matrix, labels)
        davies_bouldin = davies_bouldin_score(feature_matrix, labels)
        calinski_harabasz = calinski_harabasz_score(feature_matrix, labels)
        candidates.append({
            "k": k,
            "model": model,
            "silhouette": float(silhouette),
            "davies_bouldin": float(davies_bouldin),
            "calinski_harabasz": float(calinski_harabasz),
            "cluster_sizes": sizes.tolist(),
        })

    if not candidates:
        raise KMeansTrainingError("No valid K satisfied minimum cluster size.")

    db_values = np.asarray([item["davies_bouldin"] for item in candidates], dtype=float)
    ch_values = np.asarray([item["calinski_harabasz"] for item in candidates], dtype=float)
    db_min, db_max = float(np.min(db_values)), float(np.max(db_values))
    ch_min, ch_max = float(np.min(ch_values)), float(np.max(ch_values))
    for item in candidates:
        db_score = 1.0 if db_max == db_min else 1.0 - ((item["davies_bouldin"] - db_min) / (db_max - db_min))
        ch_score = 1.0 if ch_max == ch_min else (item["calinski_harabasz"] - ch_min) / (ch_max - ch_min)
        item["selection_score"] = 0.6 * item["silhouette"] + 0.2 * db_score + 0.2 * ch_score

    selected = max(candidates, key=lambda item: (item["selection_score"], item["silhouette"]))
    metrics = {
        "selected_k": selected["k"],
        "silhouette_score": selected["silhouette"],
        "davies_bouldin_index": selected["davies_bouldin"],
        "calinski_harabasz_score": selected["calinski_harabasz"],
        "cluster_sizes": selected["cluster_sizes"],
        "candidate_metrics": [
            {
                "k": item["k"],
                "silhouette_score": item["silhouette"],
                "davies_bouldin_index": item["davies_bouldin"],
                "calinski_harabasz_score": item["calinski_harabasz"],
                "selection_score": item["selection_score"],
                "cluster_sizes": item["cluster_sizes"],
            }
            for item in candidates
        ],
    }
    return selected["model"], metrics


def nearest_centroid(feature_vector: np.ndarray, centroids: list[list[float]]) -> tuple[int, float]:
    centroid_matrix = np.asarray(centroids, dtype=float)
    distances = np.linalg.norm(centroid_matrix - feature_vector.reshape(1, -1), axis=1)
    cluster_id = int(np.argmin(distances))
    return cluster_id, float(distances[cluster_id])


def flag_distance_outliers(distances: list[float], *, multiplier: float) -> list[bool]:
    """Đánh dấu các điểm nằm xa tâm cụm bất thường so với phần còn lại.

    Dùng median và MAD (median absolute deviation) thay cho trung bình và độ
    lệch chuẩn. Lý do: một điểm quá xa sẽ tự thổi phồng độ lệch chuẩn và kéo
    ngưỡng vượt lên trên chính nó — hiệu ứng che lấp (masking) khiến ngoại
    lai rõ ràng nhất lại lọt lưới. Median/MAD không bị điểm cực trị kéo đi.

    Hệ số 0.6745 quy MAD về cùng thang với độ lệch chuẩn của phân phối chuẩn,
    nhờ đó `multiplier` vẫn đọc được như "bao nhiêu sigma".

    Chỉ đánh dấu điểm nằm XA hơn mức thường — gần tâm cụm không phải bất thường.
    """
    if len(distances) < 2:
        return [False] * len(distances)

    array = np.asarray(distances, dtype=float)
    median = float(np.median(array))
    mad = float(np.median(np.abs(array - median)))

    if mad > 0:
        threshold = median + multiplier * (mad / 0.6745)
    else:
        # Quá nửa số điểm trùng nhau: MAD = 0 nên công thức trên vô dụng.
        # Lùi về độ lệch chuẩn, vẫn tốt hơn là bỏ qua hoàn toàn.
        std = float(array.std())
        if std == 0.0:
            return [False] * len(distances)
        threshold = median + multiplier * std

    return [bool(value > threshold) for value in array]
