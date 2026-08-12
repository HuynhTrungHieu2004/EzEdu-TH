"""Chọn tập câu hỏi đa dạng ngữ nghĩa bằng K-Means.

Bài toán: LLM sinh dư câu hỏi thì hay lặp ý — khác chữ nhưng hỏi cùng một
thứ ("Parabol có bề lõm quay lên khi nào?" và "Khi nào parabol có bề lõm
hướng lên?"). Bước khử trùng hiện có trong `question_generation_service`
chỉ so khớp chuỗi chính xác nên không bắt được loại trùng này.

Cách giải: phân cụm embedding của các câu ứng viên thành đúng `target_count`
cụm, mỗi cụm chỉ giữ một câu. Trong cụm, ưu tiên câu có điểm thẩm định chéo
(`avg_score`) cao nhất — phân cụm lo phần đa dạng, điểm thẩm định lo phần
chất lượng, hai tiêu chí không giành việc của nhau.

Nguyên tắc an toàn: hàm này không bao giờ được làm hỏng luồng sinh câu hỏi.
Mọi lỗi (embedding hỏng, K-Means không hội tụ) đều rơi về hành vi cũ —
lấy `target_count` câu đầu theo thứ tự điểm.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

import numpy as np
from sklearn.cluster import KMeans

from app.core.config import settings
from app.services.rag_service import build_embeddings

logger = logging.getLogger(__name__)


def _question_text(question: Dict[str, Any]) -> str:
    return str(question.get("question") or "").strip()


def _score(question: Dict[str, Any]) -> float:
    """Điểm thẩm định chéo; câu chưa được chấm coi như trung bình (3.0)."""
    try:
        return float(question.get("avg_score", 3.0))
    except (TypeError, ValueError):
        return 3.0


def select_diverse_questions(
    questions: List[Dict[str, Any]],
    target_count: int,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Chọn `target_count` câu hỏi trải đều các cụm ngữ nghĩa.

    `questions` phải được sắp xếp sẵn theo chất lượng giảm dần — thứ tự này
    được giữ nguyên trong kết quả trả về.

    Trả về `(danh_sách_đã_chọn, thống_kê)`. Thống kê luôn có khoá `applied`
    cho biết K-Means có thực sự chạy hay đã rơi về đường dự phòng.
    """
    fallback = questions[:target_count]

    if target_count <= 0:
        return [], {"applied": False, "reason": "invalid_target", "pool_size": len(questions)}

    if len(questions) <= target_count:
        return list(questions), {
            "applied": False,
            "reason": "pool_not_larger_than_target",
            "pool_size": len(questions),
            "selected": len(questions),
            "duplicates_dropped": 0,
        }

    texts = [_question_text(item) for item in questions]
    if any(not text for text in texts):
        # Câu rỗng không có nội dung để so tương đồng — không mạo hiểm phân cụm.
        return fallback, {
            "applied": False,
            "reason": "blank_question_text",
            "pool_size": len(questions),
            "selected": len(fallback),
            "duplicates_dropped": 0,
        }

    try:
        embedding_model, vectors = build_embeddings(texts)
        matrix = np.asarray(vectors, dtype=float)
        if matrix.ndim != 2 or matrix.shape[0] != len(questions):
            raise ValueError("Embedding trả về sai kích thước.")

        model = KMeans(
            n_clusters=target_count,
            random_state=settings.KMEANS_RANDOM_STATE,
            n_init=settings.KMEANS_N_INIT,
            max_iter=settings.KMEANS_MAX_ITER,
        )
        labels = model.fit_predict(matrix)
        distances = np.linalg.norm(matrix - model.cluster_centers_[labels], axis=1)

        # Trong mỗi cụm: điểm thẩm định cao nhất thắng; hoà thì lấy câu gần
        # tâm cụm nhất (câu đại diện nhất cho vùng ngữ nghĩa đó).
        best_by_cluster: Dict[int, int] = {}
        for index, label in enumerate(labels):
            current = best_by_cluster.get(int(label))
            if current is None:
                best_by_cluster[int(label)] = index
                continue
            challenger = (-_score(questions[index]), distances[index])
            incumbent = (-_score(questions[current]), distances[current])
            if challenger < incumbent:
                best_by_cluster[int(label)] = index

        chosen = sorted(best_by_cluster.values())

        # K-Means có thể trả về ít cụm hơn yêu cầu khi có điểm trùng nhau —
        # bù thêm câu điểm cao nhất chưa được chọn cho đủ số lượng.
        if len(chosen) < target_count:
            remaining = [i for i in range(len(questions)) if i not in set(chosen)]
            remaining.sort(key=lambda i: (-_score(questions[i]), i))
            chosen = sorted(chosen + remaining[: target_count - len(chosen)])

        selected = [questions[i] for i in chosen]
        return selected, {
            "applied": True,
            "pool_size": len(questions),
            "selected": len(selected),
            "duplicates_dropped": len(questions) - len(selected),
            "embedding_model": embedding_model,
            "clusters": target_count,
        }
    except Exception as exc:  # noqa: BLE001 - không được phép làm hỏng luồng sinh câu hỏi
        logger.warning(
            "Bỏ qua bước chọn câu hỏi đa dạng, dùng thứ tự điểm gốc: %s: %s",
            exc.__class__.__name__,
            exc,
        )
        return fallback, {
            "applied": False,
            "reason": "error",
            "error": exc.__class__.__name__,
            "pool_size": len(questions),
            "selected": len(fallback),
            "duplicates_dropped": 0,
        }
