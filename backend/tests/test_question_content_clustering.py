import unittest
from unittest.mock import patch

from app.services.question_content_cluster_service import assign_content_clusters

# Ba cụm ngữ nghĩa rõ rệt, mỗi cụm 2 câu.
FAKE_VECTORS = {
    "parabol bề lõm": [1.0, 0.0, 0.0],
    "parabol hướng lên": [0.98, 0.02, 0.0],
    "toạ độ đỉnh": [0.0, 1.0, 0.0],
    "tìm đỉnh parabol": [0.02, 0.98, 0.0],
    "trục đối xứng": [0.0, 0.0, 1.0],
    "đường thẳng đối xứng": [0.0, 0.02, 0.98],
}


def fake_build_embeddings(texts):
    return "test", [FAKE_VECTORS[t] for t in texts]


def candidates(*texts):
    return [{"id": f"q{i}", "content": text} for i, text in enumerate(texts)]


class AssignContentClustersTests(unittest.TestCase):
    def test_groups_semantically_similar_questions_together(self):
        items = candidates(*FAKE_VECTORS)

        with patch(
            "app.services.question_content_cluster_service.build_embeddings",
            side_effect=fake_build_embeddings,
        ):
            stats = assign_content_clusters(items)

        self.assertTrue(stats["applied"])
        by_text = {item["content"]: item["content_cluster"] for item in items}
        self.assertEqual(by_text["parabol bề lõm"], by_text["parabol hướng lên"])
        self.assertEqual(by_text["toạ độ đỉnh"], by_text["tìm đỉnh parabol"])
        self.assertNotEqual(by_text["parabol bề lõm"], by_text["toạ độ đỉnh"])

    def test_every_candidate_receives_a_cluster(self):
        items = candidates(*FAKE_VECTORS)

        with patch(
            "app.services.question_content_cluster_service.build_embeddings",
            side_effect=fake_build_embeddings,
        ):
            assign_content_clusters(items)

        self.assertTrue(all(isinstance(item["content_cluster"], int) for item in items))

    def test_too_few_candidates_skips_clustering(self):
        items = candidates("parabol bề lõm", "toạ độ đỉnh")

        stats = assign_content_clusters(items)

        self.assertFalse(stats["applied"])
        self.assertEqual(stats["reason"], "not_enough_candidates")
        self.assertTrue(all("content_cluster" not in item for item in items))

    def test_embedding_failure_leaves_candidates_untouched(self):
        items = candidates(*FAKE_VECTORS)

        with patch(
            "app.services.question_content_cluster_service.build_embeddings",
            side_effect=RuntimeError("embedding down"),
        ):
            stats = assign_content_clusters(items)

        self.assertFalse(stats["applied"])
        self.assertEqual(stats["reason"], "error")
        self.assertTrue(all("content_cluster" not in item for item in items))

    def test_blank_content_skips_clustering(self):
        items = candidates("parabol bề lõm", "", "toạ độ đỉnh", "trục đối xứng")

        stats = assign_content_clusters(items)

        self.assertFalse(stats["applied"])
        self.assertEqual(stats["reason"], "blank_content")


if __name__ == "__main__":
    unittest.main()
