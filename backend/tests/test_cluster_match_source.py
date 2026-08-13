"""Nguồn `cluster_match` phải đọc đúng nhãn cụm mà K-Means đã gán.

Hệ thống gán hai loại nhãn: `content_cluster_id` cho đoạn nội dung, và
`question_cluster_id` cho câu hỏi. Bộ thu này chỉ đọc `content_cluster_id`, nên
với câu hỏi — loại item chiếm đa số — nó không bao giờ tìm thấy cụm nào và
không sinh ứng viên nào. Kết quả: `cluster_match` luôn bằng 0, và toàn bộ công
sức phân cụm không ảnh hưởng gì tới thứ tự người học nhìn thấy.

`cbf_kmeans_hybrid_service._cluster_of` đã xử lý đúng cả hai nhãn; bộ thu này
phải dùng cùng một định nghĩa thay vì tự đọc một trường.
"""

import unittest
from datetime import datetime, timezone

from app.personalization.services.candidate_generator_service import (
    _Accumulator,
    _collect_cluster_match,
)

NOW = datetime(2026, 8, 13, tzinfo=timezone.utc)


def item(item_id: str, **fields) -> dict:
    base = {"id": item_id, "_id": item_id, "item_type": "question", "quality_score": 0.8}
    base.update(fields)
    return base


class ClusterMatchSourceTests(unittest.TestCase):
    def test_finds_clusters_from_question_labels(self):
        pool = {
            "seen": item("seen", question_cluster_id=1),
            "same-cluster": item("same-cluster", question_cluster_id=1),
            "other-cluster": item("other-cluster", question_cluster_id=2),
        }
        accumulator = _Accumulator(NOW)

        _collect_cluster_match(
            accumulator, pool, [{"item_id": "seen"}], per_source_limit=5
        )

        self.assertIn("same-cluster", accumulator.items)
        self.assertNotIn("other-cluster", accumulator.items)

    def test_still_works_for_content_chunk_labels(self):
        pool = {
            "seen": item("seen", item_type="document_chunk", content_cluster_id=7),
            "same-cluster": item("same-cluster", item_type="document_chunk",
                                 content_cluster_id=7),
        }
        accumulator = _Accumulator(NOW)

        _collect_cluster_match(
            accumulator, pool, [{"item_id": "seen"}], per_source_limit=5
        )

        self.assertIn("same-cluster", accumulator.items)

    def test_items_without_any_cluster_label_are_ignored(self):
        """Item chưa được gán nhãn không được coi là cùng cụm với nhau — nếu
        gom chúng lại thì `None` trở thành một cụm giả."""
        pool = {
            "seen": item("seen"),
            "also-unlabelled": item("also-unlabelled"),
        }
        accumulator = _Accumulator(NOW)

        _collect_cluster_match(
            accumulator, pool, [{"item_id": "seen"}], per_source_limit=5
        )

        self.assertEqual(accumulator.items, {})

    def test_respects_the_per_source_limit(self):
        pool = {
            f"item-{index}": item(f"item-{index}", question_cluster_id=1)
            for index in range(6)
        }
        accumulator = _Accumulator(NOW)

        _collect_cluster_match(
            accumulator, pool, [{"item_id": "item-0"}], per_source_limit=2
        )

        self.assertEqual(len(accumulator.items), 2)


if __name__ == "__main__":
    unittest.main()
