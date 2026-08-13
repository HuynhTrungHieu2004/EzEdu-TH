"""Nguồn `learner_interest` phải chọn item theo điểm CBF, không theo thứ tự duyệt.

Bộ thu này tính độ tương đồng cosine giữa hồ sơ nội dung của người học và từng
item — đó chính là phần Content-Based Filtering. Nhưng nó chỉ duyệt tuần tự rồi
`break` khi đủ số lượng, nên item được chọn là 5 item **gặp trước**, không phải
5 item **hợp gu nhất**. Điểm CBF được tính xong rồi bỏ đi.

Bộ thu láng giềng `_collect_appropriate_difficulty` làm đúng: sắp xếp rồi lấy
top-N. Test này khoá `learner_interest` vào cùng hành vi đó.
"""

import unittest

from app.personalization.services.candidate_generator_service import (
    _Accumulator,
    _collect_learner_interest,
)
from datetime import datetime, timezone
from types import SimpleNamespace

NOW = datetime(2026, 8, 13, tzinfo=timezone.utc)
KC_ID = "kc-toan"

# Hồ sơ người học trỏ hẳn về một hướng trong không gian 3 chiều.
PROFILE_VECTOR = [1.0, 0.0, 0.0]

# Item hợp gu nhất được đặt ở CUỐI danh sách. Nếu bộ thu duyệt tuần tự rồi cắt,
# nó sẽ không bao giờ tới được item này.
EMBEDDINGS = [
    [0.0, 1.0, 0.0],   # lech han
    [0.0, 0.9, 0.1],
    [0.1, 0.9, 0.0],
    [0.2, 0.8, 0.0],
    [0.2, 0.9, 0.0],
    [0.1, 0.8, 0.2],
    [1.0, 0.0, 0.0],   # hop gu nhat
]


def make_items() -> dict:
    return {
        f"item-{index}": {
            "id": f"item-{index}",
            "_id": f"item-{index}",
            "item_type": "question",
            "knowledge_component_ids": [KC_ID],
            "quality_score": 0.8,
            "semantic_embedding": embedding,
        }
        for index, embedding in enumerate(EMBEDDINGS)
    }


def make_twin():
    return SimpleNamespace(
        content_preferences=SimpleNamespace(
            preferred_content_types=["question"],
            preferred_subjects=["Toán"],
        )
    )


COMPONENTS = {KC_ID: {"name": "Hàm số bậc hai", "subject": "Toán", "topic": "Hàm số"}}


class LearnerInterestSelectionTests(unittest.TestCase):
    def test_picks_the_best_matching_items_not_the_first_ones_seen(self):
        accumulator = _Accumulator(NOW)

        _collect_learner_interest(
            accumulator, make_items(), make_twin(), COMPONENTS,
            per_source_limit=3, profile_vector=PROFILE_VECTOR,
        )

        chosen = set(accumulator.items)
        self.assertEqual(len(chosen), 3)
        self.assertIn(
            "item-6", chosen,
            "item hợp gu nhất bị bỏ qua — điểm CBF không quyết định việc chọn",
        )

    def test_scores_are_ordered_by_content_similarity(self):
        accumulator = _Accumulator(NOW)

        _collect_learner_interest(
            accumulator, make_items(), make_twin(), COMPONENTS,
            per_source_limit=3, profile_vector=PROFILE_VECTOR,
        )

        best = accumulator.items["item-6"]["source_scores"]["learner_interest"]
        others = [
            entry["source_scores"]["learner_interest"]
            for item_id, entry in accumulator.items.items()
            if item_id != "item-6"
        ]
        self.assertTrue(all(best > other for other in others))

    def test_without_a_profile_vector_it_still_returns_candidates(self):
        """Người học chưa có lịch sử thì không có gì để so nội dung — nguồn này
        vẫn phải hoạt động, chỉ là lùi về cách chấm cũ."""
        accumulator = _Accumulator(NOW)

        _collect_learner_interest(
            accumulator, make_items(), make_twin(), COMPONENTS,
            per_source_limit=3, profile_vector=None,
        )

        self.assertEqual(len(accumulator.items), 3)

    def test_respects_the_per_source_limit(self):
        accumulator = _Accumulator(NOW)

        _collect_learner_interest(
            accumulator, make_items(), make_twin(), COMPONENTS,
            per_source_limit=2, profile_vector=PROFILE_VECTOR,
        )

        self.assertEqual(len(accumulator.items), 2)


if __name__ == "__main__":
    unittest.main()
