"""Lọc theo nội dung (Content-Based Filtering) cho gợi ý học tập.

Chỗ này trước đây không phải CBF thật. Hàm `_collect_learner_interest` chấm
điểm bằng công thức `0.5 + chất_lượng × 0.25` — hằng số cộng với một đại lượng
không liên quan gì tới người học, nên **mọi item cùng môn, cùng loại đều nhận
điểm bằng nhau**. Đó là lọc theo nhãn, không phải lọc theo nội dung.

CBF thật cần ba thứ, nay đã đủ:

1. Vector đặc trưng nội dung — `learning_items.semantic_embedding`.
2. Vector hồ sơ người học — dựng ở đây, từ nội dung họ đã thực sự tương tác.
3. Độ đo tương đồng — cosine.

Hai lựa chọn thiết kế đáng nói:

**Trọng số theo mức tương tác.** Hoàn thành một bài thể hiện quan tâm rõ hơn
là chỉ xem lướt, và bỏ qua thì không thể hiện quan tâm gì. Riêng câu trả lời
SAI vẫn tính như tương tác bình thường: đây là hồ sơ *sở thích nội dung*, không
phải hồ sơ *năng lực* — làm sai không có nghĩa là không quan tâm.

**Suy giảm theo thời gian.** Sở thích đổi theo thời gian, nên hoạt động cũ
được giảm cân theo hàm mũ với chu kỳ bán rã cấu hình được. Không có bước này
thì hồ sơ bị đóng băng theo những gì học sinh học từ đầu năm.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

# Mức tương tác thể hiện quan tâm tới đâu. Bỏ qua = không quan tâm.
ENGAGEMENT_WEIGHT: Dict[str, float] = {
    "completed": 1.0,
    "recommendation_clicked": 1.0,
    "question_answered": 0.7,
    "lesson_started": 0.5,
    "item_viewed": 0.4,
    "explanation_viewed": 0.4,
    "skipped": 0.0,
    "recommendation_skipped": 0.0,
}

# Sau chừng này ngày, một lần tương tác chỉ còn nửa trọng số.
DEFAULT_HALF_LIFE_DAYS = 30.0


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    """Cosine giữa hai vector. Trả 0.0 khi không tính được thay vì ném lỗi."""
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for a, b in zip(left, right):
        dot += a * b
        left_norm += a * a
        right_norm += b * b
    if left_norm <= 0.0 or right_norm <= 0.0:
        return 0.0
    return dot / (math.sqrt(left_norm) * math.sqrt(right_norm))


def _event_weight(event: Dict[str, Any], now: datetime, half_life_days: float) -> float:
    """Trọng số của một lần tương tác = mức quan tâm × độ mới."""
    if event.get("skipped"):
        return 0.0

    if event.get("completed"):
        engagement = ENGAGEMENT_WEIGHT["completed"]
    else:
        engagement = ENGAGEMENT_WEIGHT.get(str(event.get("event_type")), 0.4)
    if engagement <= 0.0:
        return 0.0

    occurred_at = event.get("occurred_at") or event.get("created_at")
    if not isinstance(occurred_at, datetime):
        return engagement
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)

    age_days = max(0.0, (now - occurred_at).total_seconds() / 86400.0)
    return engagement * math.pow(0.5, age_days / max(half_life_days, 1e-9))


def build_learner_profile_vector(
    events: List[Dict[str, Any]],
    items_by_id: Dict[str, Dict[str, Any]],
    *,
    now: Optional[datetime] = None,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> List[float]:
    """Dựng vector hồ sơ người học: trung bình có trọng số embedding nội dung
    họ đã tương tác.

    Trả về danh sách rỗng khi chưa đủ dữ liệu — tầng gọi phải coi đó là "chưa
    có hồ sơ" và dùng đường dự phòng, không được hiểu nhầm là "không giống gì".
    """
    now = now or datetime.now(timezone.utc)

    total: Optional[List[float]] = None
    total_weight = 0.0

    for event in events:
        item = items_by_id.get(str(event.get("item_id")))
        if not item:
            continue
        embedding = item.get("semantic_embedding") or []
        if not embedding:
            continue

        weight = _event_weight(event, now, half_life_days)
        if weight <= 0.0:
            continue

        if total is None:
            total = [0.0] * len(embedding)
        elif len(embedding) != len(total):
            # Đổi mô hình nhúng giữa chừng — bỏ qua vector lệch chiều thay vì
            # cộng bừa vào rồi cho ra hồ sơ vô nghĩa.
            continue

        for index, value in enumerate(embedding):
            total[index] += float(value) * weight
        total_weight += weight

    if total is None or total_weight <= 0.0:
        return []
    return [value / total_weight for value in total]


def score_item_similarity(profile_vector: Sequence[float], item: Dict[str, Any]) -> float:
    """Điểm CBF của một item với hồ sơ người học, đưa về khoảng [0, 1].

    Cosine nằm trong [-1, 1]; phần âm nghĩa là ngược hướng sở thích, gộp hết
    về 0 vì "ngược hướng" và "không liên quan" đều đáng xếp cuối như nhau.
    """
    if not profile_vector:
        return 0.0
    similarity = cosine_similarity(profile_vector, item.get("semantic_embedding") or [])
    return max(0.0, min(1.0, similarity))
