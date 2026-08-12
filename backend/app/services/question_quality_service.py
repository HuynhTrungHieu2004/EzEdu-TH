"""Phân tích chất lượng câu hỏi từ dữ liệu làm bài thật, dùng K-Means.

Bài toán: giáo viên không có cách nào biết câu nào trong bộ đề của mình bị
lỗi — sai đáp án, diễn đạt mơ hồ, hoặc quá dễ nên không phân loại được học
sinh. Nhìn bằng mắt không phát hiện được, phải nhìn vào cách học sinh trả lời.

Cách giải, hai lớp bổ sung nhau:

1. Thống kê trắc nghiệm cổ điển cho từng câu:
   - Độ khó `p` = tỉ lệ trả lời đúng.
   - Độ phân biệt (point-biserial) = tương quan giữa "làm đúng câu này" và
     "tổng điểm cả bài". Độ phân biệt ÂM là dấu hiệu gần như chắc chắn sai
     đáp án: học sinh giỏi lại sai nhiều hơn học sinh yếu.

2. K-Means trên không gian (độ khó, độ phân biệt) của chính bộ đề này, rồi
   đo khoảng cách tới tâm cụm. Câu nào nằm quá xa mọi cụm là câu không giống
   bất kỳ nhóm nào — bất thường so với chính bộ đề đó.

Vì sao cần K-Means chứ không chỉ đặt ngưỡng cứng: ngưỡng "p < 0.2 là quá khó"
chỉ đúng với một mức đề nhất định. Đề khó và đề dễ có phân bố khác hẳn nhau.
K-Means tìm các nhóm tự nhiên ngay trong bộ đề đang xét, nên "bất thường"
được đo tương đối với chính bộ đề chứ không so với một con số cố định.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np

from app.core.config import settings
from app.personalization.algorithms.kmeans_clustering import (
    KMeansTrainingError,
    choose_k_and_fit,
    flag_distance_outliers,
    nearest_centroid,
)

logger = logging.getLogger(__name__)

# Dưới ngưỡng này thì thống kê chỉ là nhiễu, không kết luận được gì.
MIN_ATTEMPTS_FOR_ANALYSIS = 5
# Cần đủ câu để phân cụm có nghĩa (tối thiểu min_k + 1 điểm dữ liệu).
MIN_QUESTIONS_FOR_CLUSTERING = 4
# Câu quá dễ: gần như ai cũng đúng nên không phân loại được học sinh.
CEILING_P_VALUE = 0.95


def compute_item_statistics(
    attempts: List[Dict[str, Any]],
    question_count: int,
) -> List[Dict[str, Any]]:
    """Tính độ khó và độ phân biệt cho từng câu trong bộ đề.

    `attempts` là các bản ghi `question_attempts`, mỗi bản ghi có `answers` gồm
    `question_index` và `is_correct`.
    """
    correct_flags: List[List[bool]] = [[] for _ in range(question_count)]
    totals: List[List[float]] = [[] for _ in range(question_count)]

    for record in attempts:
        answers = record.get("answers") or []
        graded = {
            int(a["question_index"]): bool(a.get("is_correct"))
            for a in answers
            if a.get("question_index") is not None
        }
        if not graded:
            continue
        # Tổng điểm của chính lượt làm này, dùng làm mốc so sánh năng lực.
        total = float(sum(1 for ok in graded.values() if ok))
        for index, is_correct in graded.items():
            if 0 <= index < question_count:
                correct_flags[index].append(is_correct)
                totals[index].append(total)

    statistics: List[Dict[str, Any]] = []
    for index in range(question_count):
        flags = correct_flags[index]
        scores = totals[index]
        attempt_count = len(flags)
        correct_count = sum(1 for ok in flags if ok)

        if attempt_count == 0:
            statistics.append({
                "question_index": index,
                "attempt_count": 0,
                "correct_count": 0,
                "p_value": None,
                "discrimination": None,
            })
            continue

        p_value = correct_count / attempt_count
        statistics.append({
            "question_index": index,
            "attempt_count": attempt_count,
            "correct_count": correct_count,
            "p_value": p_value,
            "discrimination": _point_biserial(flags, scores, p_value),
        })

    return statistics


def _point_biserial(flags: List[bool], totals: List[float], p_value: float) -> float:
    """Tương quan point-biserial giữa kết quả một câu và tổng điểm cả bài.

    r = (M1 - M0) / SD * sqrt(p * q), công thức chuẩn của phân tích câu hỏi.
    Trả về 0.0 khi không xác định được (mọi người cùng đúng, cùng sai, hoặc
    tổng điểm không biến thiên) — không có bằng chứng thì không kết luận.
    """
    q_value = 1.0 - p_value
    if p_value <= 0.0 or q_value <= 0.0:
        return 0.0

    scores = np.asarray(totals, dtype=float)
    std = float(scores.std())
    if std == 0.0:
        return 0.0

    mask = np.asarray(flags, dtype=bool)
    mean_correct = float(scores[mask].mean())
    mean_wrong = float(scores[~mask].mean())
    return round(((mean_correct - mean_wrong) / std) * float(np.sqrt(p_value * q_value)), 4)


def analyze_question_set_quality(
    attempts: List[Dict[str, Any]],
    question_count: int,
) -> Dict[str, Any]:
    """Phân tích chất lượng cả bộ đề và gắn cờ các câu đáng rà soát lại."""
    statistics = compute_item_statistics(attempts, question_count)
    attempt_count = len(attempts)

    base: Dict[str, Any] = {
        "attempt_count": attempt_count,
        "question_count": question_count,
        "items": statistics,
        "clustering": None,
        "flagged": [],
    }

    if attempt_count < MIN_ATTEMPTS_FOR_ANALYSIS:
        return {**base, "status": "insufficient_attempts",
                "min_attempts_required": MIN_ATTEMPTS_FOR_ANALYSIS}

    # Chỉ phân cụm các câu thực sự có người làm.
    usable = [item for item in statistics if item["attempt_count"] > 0]
    if len(usable) < MIN_QUESTIONS_FOR_CLUSTERING:
        graded = _apply_rule_based_flags(statistics)
        return {**base, "items": graded, "status": "insufficient_questions",
                "flagged": _collect_flagged(graded)}

    matrix = np.asarray(
        [[item["p_value"], item["discrimination"]] for item in usable], dtype=float
    )

    status = "ok"
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
        centroids = model.cluster_centers_.tolist()
        distances: List[float] = []
        for item, vector in zip(usable, matrix):
            cluster_id, distance = nearest_centroid(vector, centroids)
            item["cluster_id"] = cluster_id
            item["distance_to_centroid"] = round(distance, 6)
            distances.append(distance)

        _apply_outlier_flags(usable, distances)
        base["clustering"] = {**metrics, "centroids": centroids,
                              "features": ["p_value", "discrimination"]}
    except (KMeansTrainingError, ValueError) as exc:
        # Bộ đề quá đồng đều để tách cụm — vẫn giữ nguyên phần thống kê,
        # chỉ mất lớp phát hiện bất thường theo khoảng cách.
        logger.info("Bỏ qua phân cụm chất lượng câu hỏi: %s", exc)
        status = "clustering_unavailable"

    graded = _apply_rule_based_flags(statistics)
    return {**base, "items": graded, "status": status, "flagged": _collect_flagged(graded)}


def _apply_outlier_flags(items: List[Dict[str, Any]], distances: List[float]) -> None:
    """Gắn cờ câu nằm quá xa tâm cụm so với mặt bằng chung của bộ đề."""
    flags = flag_distance_outliers(
        distances, multiplier=settings.KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER
    )
    for item, is_outlier in zip(items, flags):
        if is_outlier:
            item.setdefault("reasons", []).append("cluster_outlier")


def _apply_rule_based_flags(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Các dấu hiệu lỗi đã được thừa nhận trong đo lường giáo dục.

    Tách riêng khỏi K-Means: đây là quy tắc xác định, không phải phát hiện
    của thuật toán — trình bày lẫn lộn hai thứ là không trung thực.
    """
    for item in items:
        discrimination = item.get("discrimination")
        p_value = item.get("p_value")
        if discrimination is not None and discrimination < 0:
            item.setdefault("reasons", []).append("negative_discrimination")
        if p_value is not None and p_value >= CEILING_P_VALUE:
            item.setdefault("reasons", []).append("too_easy")
    return items


def _collect_flagged(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "question_index": item["question_index"],
            "reasons": item["reasons"],
            "p_value": item.get("p_value"),
            "discrimination": item.get("discrimination"),
        }
        for item in items
        if item.get("reasons")
    ]
