"""Gán nhãn cụm nội dung cho câu hỏi ứng viên trước khi sinh đề.

Vì sao cần: ma trận đề phân loại câu theo chủ đề / mức Bloom / độ khó, đều là
nhãn do con người khai báo nên có thể thô. Một đề "đúng chủ đề Hàm số, đúng
mức Vận dụng" vẫn có thể vô tình dồn hết vào một dạng bài duy nhất — đúng ma
trận trên giấy nhưng hẹp về nội dung.

K-Means trên embedding nội dung câu hỏi phát hiện được sự trùng lặp mà nhãn
thủ công không thấy. Nhãn cụm sinh ra ở đây **không thay thế** phân loại theo
chương trình học, mà bổ sung một chiều ràng buộc nữa cho bộ giải.

Ranh giới trách nhiệm: mô-đun này chỉ **gán nhãn**. Việc chọn câu vẫn hoàn
toàn do CP-SAT quyết định — nhãn cụm chỉ trở thành một ràng buộc số học nữa
trong mô hình, nên bộ giải vẫn chứng minh được tối ưu và vẫn báo được
INFEASIBLE. Không có bước nào ở đây thay thế kiểm tra ràng buộc.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import numpy as np

from app.core.config import settings
from app.personalization.algorithms.kmeans_clustering import choose_k_and_fit
from app.services.rag_service import build_embeddings

logger = logging.getLogger(__name__)

# Dưới ngưỡng này thì phân cụm không còn ý nghĩa phân biệt.
MIN_CANDIDATES_FOR_CLUSTERING = 4


def assign_content_clusters(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Gán `content_cluster` cho từng câu ứng viên, sửa trực tiếp trên dict.

    Trả về thống kê. Khi không phân cụm được, các dict được giữ nguyên (không
    có khoá `content_cluster`) để tầng gọi biết mà bỏ qua ràng buộc — sinh đề
    không bao giờ được hỏng chỉ vì bước bổ trợ này.
    """
    if len(candidates) < MIN_CANDIDATES_FOR_CLUSTERING:
        return {"applied": False, "reason": "not_enough_candidates", "candidate_count": len(candidates)}

    texts = [str(item.get("content") or "").strip() for item in candidates]
    if any(not text for text in texts):
        return {"applied": False, "reason": "blank_content", "candidate_count": len(candidates)}

    try:
        embedding_model, vectors = build_embeddings(texts)
        matrix = np.asarray(vectors, dtype=float)
        if matrix.ndim != 2 or matrix.shape[0] != len(candidates):
            raise ValueError("Embedding trả về sai kích thước.")

        # Để dữ liệu tự quyết số cụm thay vì áp một tỉ lệ cố định — cùng cách
        # chọn k đa chỉ số đang dùng ở ba chức năng K-Means còn lại.
        model, metrics = choose_k_and_fit(
            matrix,
            min_k=settings.KMEANS_MIN_K,
            max_k=settings.KMEANS_MAX_K,
            min_cluster_size=settings.KMEANS_MIN_CLUSTER_SIZE,
            random_state=settings.KMEANS_RANDOM_STATE,
            n_init=settings.KMEANS_N_INIT,
            max_iter=settings.KMEANS_MAX_ITER,
        )
        labels = model.predict(matrix)
        for item, label in zip(candidates, labels):
            item["content_cluster"] = int(label)

        return {
            "applied": True,
            "candidate_count": len(candidates),
            "cluster_count": metrics["selected_k"],
            "cluster_sizes": metrics["cluster_sizes"],
            "silhouette_score": metrics["silhouette_score"],
            "embedding_model": embedding_model,
        }
    except Exception as exc:  # noqa: BLE001 - không được phép làm hỏng luồng sinh đề
        logger.warning(
            "Bỏ qua gán cụm nội dung cho câu hỏi: %s: %s", exc.__class__.__name__, exc
        )
        for item in candidates:
            item.pop("content_cluster", None)
        return {"applied": False, "reason": "error", "error": exc.__class__.__name__,
                "candidate_count": len(candidates)}
