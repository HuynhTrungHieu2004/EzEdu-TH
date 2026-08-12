import unittest
from unittest.mock import patch

from app.services.question_diversity_service import select_diverse_questions


def q(text: str, score: float | None = None) -> dict:
    item = {"question": text}
    if score is not None:
        item["avg_score"] = score
    return item


# Ba cụm ngữ nghĩa rõ rệt, mỗi cụm 2 câu gần trùng nhau.
FAKE_VECTORS = {
    "parabol bề lõm quay lên khi nào": [1.0, 0.0, 0.0],
    "khi nào parabol có bề lõm hướng lên": [0.99, 0.01, 0.0],
    "toạ độ đỉnh của parabol là gì": [0.0, 1.0, 0.0],
    "tìm toạ độ đỉnh parabol": [0.01, 0.99, 0.0],
    "trục đối xứng của parabol": [0.0, 0.0, 1.0],
    "đường thẳng nào là trục đối xứng": [0.0, 0.01, 0.99],
}


def fake_build_embeddings(texts):
    return "test", [FAKE_VECTORS[t] for t in texts]


class SelectDiverseQuestionsTests(unittest.TestCase):
    def test_pool_not_larger_than_target_returns_unchanged(self):
        pool = [q("a", 5.0), q("b", 4.0)]

        selected, stats = select_diverse_questions(pool, 3)

        self.assertEqual(selected, pool)
        self.assertFalse(stats["applied"])
        self.assertEqual(stats["reason"], "pool_not_larger_than_target")

    def test_picks_one_question_per_semantic_cluster(self):
        pool = [
            q("parabol bề lõm quay lên khi nào", 5.0),
            q("khi nào parabol có bề lõm hướng lên", 4.0),
            q("toạ độ đỉnh của parabol là gì", 5.0),
            q("tìm toạ độ đỉnh parabol", 3.0),
            q("trục đối xứng của parabol", 4.0),
            q("đường thẳng nào là trục đối xứng", 2.0),
        ]

        with patch(
            "app.services.question_diversity_service.build_embeddings",
            side_effect=fake_build_embeddings,
        ):
            selected, stats = select_diverse_questions(pool, 3)

        self.assertTrue(stats["applied"])
        self.assertEqual(len(selected), 3)
        # Mỗi cụm đóng góp đúng câu có điểm cao nhất, không lấy câu trùng ý.
        texts = {item["question"] for item in selected}
        self.assertEqual(
            texts,
            {
                "parabol bề lõm quay lên khi nào",
                "toạ độ đỉnh của parabol là gì",
                "trục đối xứng của parabol",
            },
        )
        self.assertEqual(stats["duplicates_dropped"], 3)

    def test_output_keeps_original_quality_order(self):
        pool = [
            q("toạ độ đỉnh của parabol là gì", 5.0),
            q("parabol bề lõm quay lên khi nào", 4.0),
            q("tìm toạ độ đỉnh parabol", 3.0),
            q("trục đối xứng của parabol", 2.0),
        ]

        with patch(
            "app.services.question_diversity_service.build_embeddings",
            side_effect=fake_build_embeddings,
        ):
            selected, _ = select_diverse_questions(pool, 3)

        positions = [pool.index(item) for item in selected]
        self.assertEqual(positions, sorted(positions))

    def test_never_returns_more_than_target(self):
        pool = [q(text, 1.0) for text in FAKE_VECTORS]

        with patch(
            "app.services.question_diversity_service.build_embeddings",
            side_effect=fake_build_embeddings,
        ):
            selected, _ = select_diverse_questions(pool, 2)

        self.assertEqual(len(selected), 2)

    def test_embedding_failure_falls_back_to_top_n(self):
        pool = [q(f"cau {i}", float(10 - i)) for i in range(6)]

        with patch(
            "app.services.question_diversity_service.build_embeddings",
            side_effect=RuntimeError("embedding provider down"),
        ):
            selected, stats = select_diverse_questions(pool, 3)

        self.assertEqual(selected, pool[:3])
        self.assertFalse(stats["applied"])
        self.assertEqual(stats["reason"], "error")

    def test_questions_without_scores_still_selected(self):
        pool = [q(text) for text in FAKE_VECTORS]

        with patch(
            "app.services.question_diversity_service.build_embeddings",
            side_effect=fake_build_embeddings,
        ):
            selected, stats = select_diverse_questions(pool, 3)

        self.assertTrue(stats["applied"])
        self.assertEqual(len(selected), 3)

    def test_blank_question_text_does_not_crash(self):
        pool = [q("", 5.0), q("   ", 4.0), q("a", 3.0), q("b", 2.0)]

        selected, stats = select_diverse_questions(pool, 2)

        self.assertEqual(len(selected), 2)
        self.assertIsInstance(stats["applied"], bool)


if __name__ == "__main__":
    unittest.main()
