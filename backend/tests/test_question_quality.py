import unittest

from app.services.question_quality_service import (
    analyze_question_set_quality,
    compute_item_statistics,
)


def attempt(pattern: list[bool]) -> dict:
    """Một lượt làm bài: pattern[i] = học sinh trả lời đúng câu i hay không."""
    return {
        "answers": [
            {"question_index": idx, "is_correct": ok} for idx, ok in enumerate(pattern)
        ]
    }


# 6 học sinh, 5 câu. A,B,C khá; D,E,F yếu.
#   Câu 0: câu tốt   — học sinh khá làm đúng, yếu làm sai.
#   Câu 1: SAI ĐÁP ÁN — ngược hoàn toàn: khá làm sai, yếu làm "đúng".
#   Câu 2: quá dễ    — ai cũng đúng.
ATTEMPTS = [
    attempt([True, False, True, True, True]),    # A = 4
    attempt([True, False, True, True, True]),    # B = 4
    attempt([True, False, True, False, True]),   # C = 3
    attempt([False, True, True, False, False]),  # D = 2
    attempt([False, True, True, False, False]),  # E = 2
    attempt([False, True, True, True, False]),   # F = 3
]
QUESTION_COUNT = 5


class ComputeItemStatisticsTests(unittest.TestCase):
    def test_difficulty_is_share_of_correct_answers(self):
        stats = compute_item_statistics(ATTEMPTS, QUESTION_COUNT)

        self.assertEqual(stats[0]["attempt_count"], 6)
        self.assertAlmostEqual(stats[0]["p_value"], 3 / 6)
        self.assertAlmostEqual(stats[2]["p_value"], 1.0)

    def test_good_item_has_positive_discrimination(self):
        stats = compute_item_statistics(ATTEMPTS, QUESTION_COUNT)

        self.assertGreater(stats[0]["discrimination"], 0)

    def test_reversed_answer_key_has_negative_discrimination(self):
        stats = compute_item_statistics(ATTEMPTS, QUESTION_COUNT)

        self.assertLess(stats[1]["discrimination"], 0)

    def test_item_answered_by_everyone_identically_has_zero_discrimination(self):
        stats = compute_item_statistics(ATTEMPTS, QUESTION_COUNT)

        self.assertEqual(stats[2]["discrimination"], 0.0)

    def test_missing_answers_are_not_counted_as_attempts(self):
        partial = [{"answers": [{"question_index": 0, "is_correct": True}]}]

        stats = compute_item_statistics(partial, 3)

        self.assertEqual(stats[0]["attempt_count"], 1)
        self.assertEqual(stats[1]["attempt_count"], 0)
        self.assertIsNone(stats[1]["p_value"])


class AnalyzeQuestionSetQualityTests(unittest.TestCase):
    def test_reports_insufficient_data_below_minimum_attempts(self):
        result = analyze_question_set_quality(ATTEMPTS[:2], QUESTION_COUNT)

        self.assertEqual(result["status"], "insufficient_attempts")
        self.assertEqual(result["attempt_count"], 2)
        self.assertEqual(result["flagged"], [])

    def test_flags_item_with_negative_discrimination(self):
        result = analyze_question_set_quality(ATTEMPTS, QUESTION_COUNT)

        self.assertEqual(result["status"], "ok")
        flagged_indexes = [item["question_index"] for item in result["flagged"]]
        self.assertIn(1, flagged_indexes)
        reasons = next(i["reasons"] for i in result["flagged"] if i["question_index"] == 1)
        self.assertIn("negative_discrimination", reasons)

    def test_does_not_flag_the_healthy_item(self):
        result = analyze_question_set_quality(ATTEMPTS, QUESTION_COUNT)

        flagged_indexes = [item["question_index"] for item in result["flagged"]]
        self.assertNotIn(0, flagged_indexes)

    def test_every_item_gets_a_cluster_and_distance(self):
        result = analyze_question_set_quality(ATTEMPTS, QUESTION_COUNT)

        self.assertEqual(len(result["items"]), QUESTION_COUNT)
        for item in result["items"]:
            self.assertIsInstance(item["cluster_id"], int)
            self.assertGreaterEqual(item["distance_to_centroid"], 0.0)

    def test_reports_k_selection_metrics(self):
        result = analyze_question_set_quality(ATTEMPTS, QUESTION_COUNT)

        metrics = result["clustering"]
        self.assertGreaterEqual(metrics["selected_k"], 2)
        self.assertIn("silhouette_score", metrics)
        self.assertIn("candidate_metrics", metrics)

    def test_too_few_questions_skips_clustering_but_keeps_statistics(self):
        two_q = [attempt([True, False]), attempt([True, True]), attempt([False, False]),
                 attempt([True, False]), attempt([False, True]), attempt([True, True])]

        result = analyze_question_set_quality(two_q, 2)

        self.assertEqual(result["status"], "insufficient_questions")
        self.assertEqual(len(result["items"]), 2)
        self.assertIsNone(result["clustering"])

    def test_a_single_broken_item_does_not_disable_clustering(self):
        """Câu hỏng nằm lẻ một mình là chuyện bình thường — và nó chính là thứ
        cần tìm. Nếu đòi mọi cụm phải có từ hai câu trở lên thì đúng ca đáng
        quan tâm nhất lại làm cả bước phân cụm bị loại, và giáo viên mất hẳn
        lớp cảnh báo thứ hai."""
        # Lấy nguyên từ một bộ đề thật (12 lượt làm, 8 câu). Câu 4 sai đáp án
        # nên rơi hẳn ra góc (p thấp, phân biệt âm) và là cụm một phần tử ở mọi
        # k — dữ liệu tự nghĩ ra không tái hiện được tình huống này.
        lech = [
            attempt(pattern) for pattern in [
                [1, 1, 1, 0, 1, 1, 1, 1], [1, 1, 1, 0, 1, 1, 1, 0],
                [1, 1, 1, 0, 1, 1, 1, 0], [0, 1, 1, 0, 1, 1, 1, 1],
                [1, 1, 1, 0, 1, 0, 1, 1], [1, 1, 0, 0, 1, 1, 0, 1],
                [1, 1, 1, 0, 1, 1, 0, 0], [0, 1, 0, 1, 1, 0, 1, 0],
                [1, 0, 0, 1, 1, 1, 0, 0], [0, 1, 0, 1, 0, 0, 0, 1],
                [1, 0, 1, 1, 1, 0, 0, 0], [0, 1, 0, 1, 0, 0, 1, 1],
            ]
        ]

        result = analyze_question_set_quality(lech, 8)

        self.assertEqual(result["status"], "ok")
        self.assertIsNotNone(result["clustering"])
        broken = result["items"][3]
        self.assertLess(broken["discrimination"], 0)
        self.assertIsNotNone(broken["cluster_id"])
        # Câu lẻ một mình phải bị lớp K-Means gắn cờ. Đo theo khoảng cách tới
        # tâm cụm không bắt được nó — cụm chỉ có nó nên khoảng cách bằng 0.
        self.assertIn("cluster_outlier", broken["reasons"])

    def test_clustering_failure_still_returns_statistics(self):
        # Mọi câu có thống kê giống hệt nhau -> không tách được cụm hợp lệ.
        identical = [attempt([True, True, True, True]) for _ in range(6)]

        result = analyze_question_set_quality(identical, 4)

        self.assertEqual(len(result["items"]), 4)
        self.assertIn(result["status"], {"ok", "clustering_unavailable"})


if __name__ == "__main__":
    unittest.main()
