"""Phân nhóm năng lực học sinh trong một lớp bằng K-Means.

Bài toán: sĩ số 40 em, giáo viên không thể dạy phân hoá nếu không biết lớp
thực tế chia thành mấy nhóm và mỗi nhóm hổng ở đâu. Xếp hạng theo điểm trung
bình không trả lời được câu đó — hai em cùng 6.5 điểm có thể hổng hai mảng
kiến thức hoàn toàn khác nhau.

Đặc trưng dùng để phân cụm: **điểm phần trăm của học sinh trên từng bộ đề**,
không gộp thành một con số trung bình. Nhờ vậy toạ độ tâm cụm đọc thẳng ra
được chân dung của nhóm — "nhóm này đạt 90% ở bộ Hàm số nhưng chỉ 40% ở bộ
Lượng giác" — tức là chỉ đúng chỗ cần phụ đạo.

Không chuẩn hoá đặc trưng: mọi chiều đều là phần trăm 0-100, cùng đơn vị và
cùng thang. Giữ nguyên thang gốc khiến toạ độ tâm cụm đọc được trực tiếp,
đó chính là giá trị sư phạm của kết quả.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

import numpy as np

from app.core.config import settings
from app.personalization.algorithms.kmeans_clustering import (
    KMeansTrainingError,
    choose_k_and_fit,
    flag_distance_outliers,
    nearest_centroid,
)

logger = logging.getLogger(__name__)

# Cần đủ học sinh để cụm có nghĩa (tối thiểu min_k * min_cluster_size).
MIN_STUDENTS_FOR_GROUPING = 4


def build_student_vectors(
    attempts: List[Dict[str, Any]],
    student_ids: List[str],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Dựng vector điểm theo từng bộ đề cho mỗi học sinh trong lớp.

    Học sinh chưa làm bộ đề nào đó được điền bằng điểm trung bình của cả lớp
    ở bộ đó — nếu bỏ trống thì không phân cụm được, còn điền 0 thì oan cho em
    chưa kịp làm. Các ô được điền đều được đánh dấu trong `imputed_set_ids`
    để giáo viên biết chỗ nào là suy đoán.
    """
    allowed = set(student_ids)
    per_student: Dict[str, Dict[str, List[float]]] = {}
    set_ids: List[str] = []

    for record in attempts:
        user_id = record.get("user_id")
        set_id = record.get("question_set_id")
        percent = record.get("percent")
        if user_id not in allowed or set_id is None or percent is None:
            continue
        if set_id not in set_ids:
            set_ids.append(set_id)
        per_student.setdefault(user_id, {}).setdefault(set_id, []).append(float(percent))

    set_ids.sort()

    # Trung bình lớp từng bộ đề, dùng để điền chỗ trống.
    class_average: Dict[str, float] = {}
    for set_id in set_ids:
        values = [
            float(np.mean(scores[set_id]))
            for scores in per_student.values()
            if set_id in scores
        ]
        class_average[set_id] = float(np.mean(values)) if values else 0.0

    vectors: List[Dict[str, Any]] = []
    for user_id in student_ids:
        scores = per_student.get(user_id)
        if not scores:
            continue
        averaged = {sid: float(np.mean(values)) for sid, values in scores.items()}
        imputed = [sid for sid in set_ids if sid not in averaged]
        vectors.append({
            "user_id": user_id,
            "scores": averaged,
            "vector": [averaged.get(sid, class_average[sid]) for sid in set_ids],
            "imputed_set_ids": imputed,
            "attempted_set_count": len(averaged),
            "average_percent": round(float(np.mean(list(averaged.values()))), 2),
        })

    return vectors, set_ids


def analyze_class_ability_groups(
    attempts: List[Dict[str, Any]],
    student_ids: List[str],
) -> Dict[str, Any]:
    """Chia lớp thành các nhóm năng lực và mô tả điểm mạnh/yếu từng nhóm."""
    vectors, set_ids = build_student_vectors(attempts, student_ids)

    base: Dict[str, Any] = {
        "student_count": len(student_ids),
        "analyzed_count": len(vectors),
        "question_set_ids": set_ids,
        "groups": [],
        "students": [],
        "clustering": None,
    }

    if len(vectors) < MIN_STUDENTS_FOR_GROUPING or not set_ids:
        return {**base, "status": "insufficient_students",
                "min_students_required": MIN_STUDENTS_FOR_GROUPING}

    matrix = np.asarray([item["vector"] for item in vectors], dtype=float)

    try:
        model, metrics = choose_k_and_fit(
            matrix,
            min_k=settings.KMEANS_MIN_K,
            max_k=settings.KMEANS_MAX_K,
            min_cluster_size=settings.KMEANS_MIN_CLUSTER_SIZE,
            random_state=settings.KMEANS_RANDOM_STATE,
            n_init=settings.KMEANS_N_INIT,
            max_iter=settings.KMEANS_MAX_ITER,
        )
    except (KMeansTrainingError, ValueError) as exc:
        logger.info("Bỏ qua phân nhóm lớp: %s", exc)
        return {
            **base,
            "status": "clustering_unavailable",
            "students": [
                {
                    "user_id": item["user_id"],
                    "cluster_id": None,
                    "distance_to_centroid": 0.0,
                    "average_percent": item["average_percent"],
                    "imputed_set_ids": item["imputed_set_ids"],
                    "needs_attention": False,
                }
                for item in vectors
            ],
        }

    centroids = model.cluster_centers_.tolist()
    students: List[Dict[str, Any]] = []
    distances: List[float] = []
    for item, row in zip(vectors, matrix):
        cluster_id, distance = nearest_centroid(row, centroids)
        distances.append(distance)
        students.append({
            "user_id": item["user_id"],
            "cluster_id": cluster_id,
            "distance_to_centroid": round(distance, 4),
            "average_percent": item["average_percent"],
            "scores": item["scores"],
            "imputed_set_ids": item["imputed_set_ids"],
            "needs_attention": False,
        })

    _flag_outlying_students(students, distances)

    return {
        **base,
        "status": "ok",
        "students": students,
        "groups": _describe_groups(students, centroids, set_ids),
        "clustering": {**metrics, "features": set_ids},
    }


def _flag_outlying_students(students: List[Dict[str, Any]], distances: List[float]) -> None:
    """Đánh dấu em nằm xa tâm nhóm của chính mình.

    Em này không giống ai trong lớp — dạy theo nhóm sẽ không trúng, cần nhìn
    riêng. Đây là thông tin K-Means cho mà xếp hạng điểm không cho được.
    """
    flags = flag_distance_outliers(
        distances, multiplier=settings.KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER
    )
    for student, is_outlier in zip(students, flags):
        student["needs_attention"] = is_outlier


def _describe_groups(
    students: List[Dict[str, Any]],
    centroids: List[List[float]],
    set_ids: List[str],
) -> List[Dict[str, Any]]:
    """Mô tả từng nhóm bằng chính toạ độ tâm cụm."""
    groups: List[Dict[str, Any]] = []
    for cluster_id, centroid in enumerate(centroids):
        members = [s["user_id"] for s in students if s["cluster_id"] == cluster_id]
        if not members:
            continue
        centroid_map = {sid: round(float(value), 2) for sid, value in zip(set_ids, centroid)}
        weakest = min(centroid_map, key=centroid_map.get)
        strongest = max(centroid_map, key=centroid_map.get)
        groups.append({
            "cluster_id": cluster_id,
            "size": len(members),
            "student_ids": members,
            "centroid": centroid_map,
            "average_percent": round(float(np.mean(list(centroid_map.values()))), 2),
            "weakest_set_id": weakest,
            "strongest_set_id": strongest,
        })
    groups.sort(key=lambda g: g["average_percent"])
    return groups
