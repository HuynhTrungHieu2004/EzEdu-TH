"""Phân nhóm hành vi sử dụng của người dùng bằng K-Means.

Bài toán quản trị: vai trò (`student` / `lecturer`) là nhãn hành chính, không
phản ánh mức độ dùng thật — có giáo viên đăng ký rồi bỏ đó, có học sinh dùng
gấp mười lần trung bình. Đặt hạn mức AI theo vai trò vì thế vừa chặt với người
dùng thật vừa lỏng với tài khoản lạm dụng.

Phân cụm hành vi cho ra phân khúc đúng thực tế, và khoảng cách tới tâm cụm
chỉ ra tài khoản không giống bất kỳ nhóm nào — dấu hiệu cần xem lại.

Khác với bài toán phân nhóm lớp (mọi chiều đều là phần trăm nên giữ nguyên
thang), ở đây các đặc trưng lệch thang nhau rất xa: số lượt hoạt động là hàng
trăm, tỉ lệ lỗi nằm trong [0, 1], thời gian phản hồi là hàng nghìn mili-giây.
Không chuẩn hoá thì cột nào số lớn sẽ nuốt trọn khoảng cách Euclid. Vì vậy:

- Phân cụm trên dữ liệu đã z-score.
- Nhưng **báo cáo ra ngoài bằng số gốc** — toạ độ tâm cụm ở thang z không đọc
  được, còn "trung bình nhóm này 18 lượt/6 ngày, lỗi 0%" thì quản trị viên
  hiểu ngay.
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

MIN_USERS_FOR_GROUPING = 4

FEATURE_NAMES = (
    "activity_count",
    "active_days",
    "actions_per_active_day",
    "distinct_action_count",
    "error_rate",
    "avg_duration_ms",
    "ai_call_count",
    "ai_total_tokens",
)


def build_user_behavior_profiles(
    activity_logs: List[Dict[str, Any]],
    ai_events: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Tổng hợp hành vi mỗi người dùng từ nhật ký hoạt động và lượt gọi AI."""
    per_user: Dict[str, Dict[str, Any]] = {}

    for record in activity_logs:
        user_id = record.get("user_id")
        if not user_id:
            continue
        bucket = per_user.setdefault(user_id, {
            "count": 0, "failures": 0, "days": set(), "actions": set(), "durations": [],
        })
        bucket["count"] += 1
        if record.get("status") == "failure":
            bucket["failures"] += 1
        timestamp = record.get("timestamp")
        if timestamp is not None:
            bucket["days"].add(timestamp.date())
        action = record.get("action")
        if action:
            bucket["actions"].add(action)
        duration = record.get("duration_ms")
        if isinstance(duration, (int, float)):
            bucket["durations"].append(float(duration))

    ai_per_user: Dict[str, Dict[str, float]] = {}
    for event in ai_events or []:
        user_id = event.get("user_id")
        if not user_id:
            continue
        bucket = ai_per_user.setdefault(user_id, {"calls": 0.0, "tokens": 0.0, "cost": 0.0})
        bucket["calls"] += 1
        bucket["tokens"] += float(event.get("total_tokens") or 0)
        bucket["cost"] += float(event.get("estimated_cost") or 0)

    profiles: List[Dict[str, Any]] = []
    for user_id, bucket in per_user.items():
        active_days = len(bucket["days"]) or 1
        ai = ai_per_user.get(user_id, {"calls": 0.0, "tokens": 0.0, "cost": 0.0})
        profiles.append({
            "user_id": user_id,
            "metrics": {
                "activity_count": bucket["count"],
                "active_days": len(bucket["days"]),
                "actions_per_active_day": round(bucket["count"] / active_days, 3),
                "distinct_action_count": len(bucket["actions"]),
                "error_rate": round(bucket["failures"] / bucket["count"], 4) if bucket["count"] else 0.0,
                "avg_duration_ms": round(float(np.mean(bucket["durations"])), 2) if bucket["durations"] else 0.0,
                "ai_call_count": int(ai["calls"]),
                "ai_total_tokens": int(ai["tokens"]),
                "ai_estimated_cost": round(ai["cost"], 6),
            },
        })

    profiles.sort(key=lambda p: p["user_id"])
    return profiles


def analyze_user_behavior_groups(
    activity_logs: List[Dict[str, Any]],
    ai_events: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Chia người dùng thành các nhóm hành vi và chỉ ra tài khoản bất thường."""
    profiles = build_user_behavior_profiles(activity_logs, ai_events)

    base: Dict[str, Any] = {
        "user_count": len(profiles),
        "features": [],
        "dropped_features": [],
        "groups": [],
        "users": [
            {
                "user_id": p["user_id"],
                "cluster_id": None,
                "distance_to_centroid": 0.0,
                "is_anomalous": False,
                "metrics": p["metrics"],
            }
            for p in profiles
        ],
        "clustering": None,
    }

    if len(profiles) < MIN_USERS_FOR_GROUPING:
        return {**base, "status": "insufficient_users",
                "min_users_required": MIN_USERS_FOR_GROUPING}

    raw = np.asarray(
        [[float(p["metrics"][name]) for name in FEATURE_NAMES] for p in profiles],
        dtype=float,
    )

    # Cột không biến thiên không mang thông tin phân biệt, và làm z-score chia
    # cho 0. Loại thẳng, đồng thời báo ra ngoài để người đọc biết cột nào bị bỏ.
    stds = raw.std(axis=0)
    keep = stds > 0
    kept_features = [name for name, ok in zip(FEATURE_NAMES, keep) if ok]
    dropped_features = [name for name, ok in zip(FEATURE_NAMES, keep) if not ok]

    if not kept_features:
        return {**base, "status": "clustering_unavailable",
                "dropped_features": list(FEATURE_NAMES)}

    kept = raw[:, keep]
    standardized = (kept - kept.mean(axis=0)) / kept.std(axis=0)

    try:
        model, metrics = choose_k_and_fit(
            standardized,
            min_k=settings.KMEANS_MIN_K,
            max_k=settings.KMEANS_MAX_K,
            min_cluster_size=settings.KMEANS_MIN_CLUSTER_SIZE,
            random_state=settings.KMEANS_RANDOM_STATE,
            n_init=settings.KMEANS_N_INIT,
            max_iter=settings.KMEANS_MAX_ITER,
        )
    except (KMeansTrainingError, ValueError) as exc:
        logger.info("Bỏ qua phân nhóm hành vi người dùng: %s", exc)
        return {**base, "status": "clustering_unavailable",
                "features": kept_features, "dropped_features": dropped_features}

    centroids = model.cluster_centers_.tolist()
    users: List[Dict[str, Any]] = []
    distances: List[float] = []
    for profile, row in zip(profiles, standardized):
        cluster_id, distance = nearest_centroid(row, centroids)
        distances.append(distance)
        users.append({
            "user_id": profile["user_id"],
            "cluster_id": cluster_id,
            "distance_to_centroid": round(distance, 4),
            "is_anomalous": False,
            "metrics": profile["metrics"],
        })

    for user, is_outlier in zip(
        users, flag_distance_outliers(distances, multiplier=settings.KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER)
    ):
        user["is_anomalous"] = is_outlier

    return {
        **base,
        "status": "ok",
        "users": users,
        "groups": _describe_groups(users, kept_features),
        "features": kept_features,
        "dropped_features": dropped_features,
        "clustering": {**metrics, "features": kept_features},
    }


def _describe_groups(users: List[Dict[str, Any]], features: List[str]) -> List[Dict[str, Any]]:
    """Mô tả nhóm bằng trung bình các chỉ số GỐC, không phải toạ độ đã chuẩn hoá."""
    groups: List[Dict[str, Any]] = []
    cluster_ids = sorted({u["cluster_id"] for u in users if u["cluster_id"] is not None})

    for cluster_id in cluster_ids:
        members = [u for u in users if u["cluster_id"] == cluster_id]
        if not members:
            continue
        profile = {
            name: round(float(np.mean([m["metrics"][name] for m in members])), 3)
            for name in features
        }
        groups.append({
            "cluster_id": cluster_id,
            "size": len(members),
            "user_ids": [m["user_id"] for m in members],
            "profile": profile,
        })

    groups.sort(key=lambda g: g["profile"].get("activity_count", 0), reverse=True)

    # Gợi ý đọc nhanh: nhóm nào dùng nhiều nhất, nhóm nào tỉ lệ lỗi cao nhất.
    if groups:
        busiest = max(groups, key=lambda g: g["profile"].get("activity_count", 0))
        busiest["hint"] = "dùng nhiều nhất"
        if "error_rate" in features:
            most_errors = max(groups, key=lambda g: g["profile"].get("error_rate", 0))
            if most_errors["profile"].get("error_rate", 0) > 0:
                existing = most_errors.get("hint")
                most_errors["hint"] = f"{existing}, tỉ lệ lỗi cao nhất" if existing else "tỉ lệ lỗi cao nhất"

    return groups
