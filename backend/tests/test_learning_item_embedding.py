import unittest
from datetime import datetime, timezone

import numpy as np

from app.personalization.algorithms.kmeans_clustering import FEATURE_SCHEMAS, build_feature_matrix
from app.personalization.schemas.data_models import LearningItem

NOW = datetime(2026, 8, 1, tzinfo=timezone.utc)


def make_item(**overrides) -> LearningItem:
    payload = dict(
        id="qs1:0",
        item_type="question",
        document_id="doc1",
        knowledge_component_ids=["kc1"],
        q_matrix_weights={"kc1": 1.0},
        created_at=NOW,
        updated_at=NOW,
        model_version="v1",
    )
    payload.update(overrides)
    return LearningItem(**payload)


class LearningItemEmbeddingFieldTests(unittest.TestCase):
    def test_learning_item_accepts_a_semantic_embedding(self):
        """Trước đây schema `extra='forbid'` khiến trường này không lưu được,
        nên vector embedding không bao giờ tới được bước phân cụm."""
        item = make_item(semantic_embedding=[0.1, 0.2, 0.3])

        self.assertEqual(item.semantic_embedding, [0.1, 0.2, 0.3])

    def test_semantic_embedding_defaults_to_empty(self):
        self.assertEqual(make_item().semantic_embedding, [])

    def test_embedding_survives_serialisation(self):
        data = make_item(semantic_embedding=[0.5, 0.5]).model_dump(by_alias=True)

        self.assertEqual(data["semantic_embedding"], [0.5, 0.5])


class EmbeddingActuallyDiscriminatesTests(unittest.TestCase):
    """Kiểm chứng hệ quả: có embedding thật thì khối 0.7 trọng số mới phân biệt được."""

    NUMERIC = {
        "difficulty": 0.5,
        "bloom_level_encoded": 0.33,
        "estimated_duration_seconds": 60,
        "topic": "t",
    }

    def test_constant_embedding_gives_no_separation(self):
        samples = [{"semantic_embedding": [0.0, 0.0, 0.0, 0.0], **self.NUMERIC} for _ in range(4)]

        matrix, _, _ = build_feature_matrix(samples, FEATURE_SCHEMAS["content"])

        # 4 điểm trùng nhau hoàn toàn -> khoảng cách đôi một bằng 0.
        spread = float(np.max(np.linalg.norm(matrix - matrix[0], axis=1)))
        self.assertAlmostEqual(spread, 0.0)

    def test_real_embeddings_create_separation(self):
        samples = [
            {"semantic_embedding": [1.0, 0.0, 0.0], **self.NUMERIC},
            {"semantic_embedding": [0.9, 0.1, 0.0], **self.NUMERIC},
            {"semantic_embedding": [0.0, 1.0, 0.0], **self.NUMERIC},
            {"semantic_embedding": [0.0, 0.0, 1.0], **self.NUMERIC},
        ]

        matrix, _, _ = build_feature_matrix(samples, FEATURE_SCHEMAS["content"])

        spread = float(np.max(np.linalg.norm(matrix - matrix[0], axis=1)))
        self.assertGreater(spread, 0.5)


if __name__ == "__main__":
    unittest.main()
