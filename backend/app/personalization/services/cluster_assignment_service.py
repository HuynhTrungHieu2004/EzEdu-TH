"""Gán nhãn cụm cho đối tượng — khâu [2] trước đây thiếu hoàn toàn.

Một quy trình phân cụm hoàn chỉnh có ba khâu:

    [1] Huấn luyện        [2] Gán nhãn           [3] Sử dụng
        tìm tâm cụm   →      gán mỗi đối tượng  →   đổi đầu ra cho người dùng
                             vào cụm gần nhất

Hệ thống vốn có khâu [1] rất tốt (chọn k đa chỉ số, kiểm định ổn định bằng ARI,
quản lý version mô hình) nhưng **không có khâu [2]**: `predict_cluster` tồn tại
mà không nơi nào gọi, và năm trường `*_cluster_id` không dòng mã nào ghi vào.
Nên khâu [3] luôn đọc ra `None` và chạy rỗng.

Mô-đun này lấp đúng chỗ đó: với mỗi loại cụm, lấy các cặp (id đối tượng, đặc
trưng) từ cùng một đường dựng đặc trưng mà huấn luyện dùng, chạy `predict_cluster`,
rồi ghi kết quả về đúng trường.

Tôn trọng quyết định của `predict_cluster`: mẫu quá xa mọi tâm cụm được trả về
`cluster_id=None`, và ở đây **không ép gán** — ghi `None` và đếm riêng. Ép một
đối tượng bất thường vào cụm gần nhất là bịa ra một kết luận mà mô hình không
đưa ra.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.personalization.constants.collections import LEARNER_PROFILES, LEARNING_ITEMS
from app.personalization.jobs.kmeans_training_job import collect_labelled_cluster_samples
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import ClusterType
from app.personalization.services.clustering_service import predict_cluster

logger = logging.getLogger(__name__)

# Loại cụm → (collection, trường lưu kết quả, trường khoá để tìm bản ghi).
CLUSTER_TARGET_FIELD: Dict[str, tuple[str, str, str]] = {
    "content": (LEARNING_ITEMS, "content_cluster_id", "_id"),
    "question": (LEARNING_ITEMS, "question_cluster_id", "_id"),
    "learner_ability": (LEARNER_PROFILES, "ability_cluster_id", "user_id"),
    "learner_behavior": (LEARNER_PROFILES, "behavior_cluster_id", "user_id"),
    "learner_interest": (LEARNER_PROFILES, "interest_cluster_id", "user_id"),
}


async def assign_clusters(
    cluster_type: ClusterType,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> Dict[str, Any]:
    """Gán nhãn cụm cho mọi đối tượng thuộc một loại cụm."""
    repo = repository or PersonalizationMongoRepository()

    target = CLUSTER_TARGET_FIELD.get(cluster_type)
    if target is None:
        return {"status": "unknown_cluster_type", "cluster_type": cluster_type,
                "assigned": 0, "outliers": 0}

    collection_name, field_name, key_field = target

    model = await repo.get_active_cluster_model(cluster_type)
    if not model:
        # Chưa huấn luyện thì không có gì để gán — không phải lỗi.
        return {"status": "no_active_model", "cluster_type": cluster_type,
                "assigned": 0, "outliers": 0, "skipped": 0}

    labelled = await collect_labelled_cluster_samples(cluster_type, repository=repo)
    if not labelled:
        return {"status": "no_samples", "cluster_type": cluster_type,
                "assigned": 0, "outliers": 0, "skipped": 0}

    assigned = 0
    outliers = 0
    skipped = 0
    for owner_id, sample in labelled:
        try:
            prediction = await predict_cluster(cluster_type, sample, repository=repo)
        except Exception as exc:  # noqa: BLE001 - một mẫu hỏng không được chặn cả lượt
            skipped += 1
            logger.warning(
                "Không dự đoán được cụm %s cho %s: %s: %s",
                cluster_type, owner_id, exc.__class__.__name__, exc,
            )
            continue

        if prediction.provisional:
            skipped += 1
            continue

        # `cluster_id is None` nghĩa là mẫu nằm ngoài mọi cụm — ghi None thay vì
        # ép vào cụm gần nhất, và vẫn ghi để xoá nhãn cũ đã lỗi thời.
        if prediction.cluster_id is None:
            outliers += 1
        else:
            assigned += 1

        await repo.db[collection_name].update_one(
            {key_field: owner_id},
            {"$set": {
                field_name: prediction.cluster_id,
                f"{field_name}_model_version": model["version"],
            }},
        )

    return {
        "status": "ok",
        "cluster_type": cluster_type,
        "model_version": model["version"],
        "assigned": assigned,
        "outliers": outliers,
        "skipped": skipped,
        "total": len(labelled),
    }


async def assign_all_clusters(
    *, repository: Optional[PersonalizationMongoRepository] = None
) -> Dict[str, Any]:
    """Chạy gán nhãn cho mọi loại cụm — dùng cho job định kỳ."""
    repo = repository or PersonalizationMongoRepository()
    return {
        cluster_type: await assign_clusters(cluster_type, repository=repo)
        for cluster_type in CLUSTER_TARGET_FIELD
    }
