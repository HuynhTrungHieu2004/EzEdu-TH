import unittest

import numpy as np
from mongomock_motor import AsyncMongoMockClient

from app.personalization.algorithms.kmeans_clustering import (
    FORBIDDEN_FEATURE_KEYS,
    FEATURE_SCHEMAS,
    KMeansTrainingError,
    build_feature_matrix,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.clustering_service import (
    fit_cluster_model,
    predict_cluster,
    rollback_cluster_model,
)


def content_samples():
    rows = []
    for idx in range(5):
        rows.append({
            "semantic_embedding": [1.0, 0.0, 0.0, 0.0],
            "difficulty": 0.15 + idx * 0.01,
            "bloom_level_encoded": 0.0,
            "estimated_duration_seconds": 30 + idx * 1000,
            "topic": "intro",
        })
    for idx in range(5):
        rows.append({
            "semantic_embedding": [0.0, 1.0, 0.0, 0.0],
            "difficulty": 0.8 + idx * 0.01,
            "bloom_level_encoded": 1.0,
            "estimated_duration_seconds": 60000 + idx * 1000,
            "topic": "advanced",
        })
    return rows


class KMeansClusteringTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["kmeans"]
        self.repo = PersonalizationMongoRepository(self.db)

    def test_all_five_cluster_types_have_separate_feature_schemas(self):
        self.assertEqual(set(FEATURE_SCHEMAS), {
            "content",
            "question",
            "learner_ability",
            "learner_behavior",
            "learner_interest",
        })
        for schema in FEATURE_SCHEMAS.values():
            schema_fields = set(schema.numeric_fields) | set(schema.categorical_fields)
            if schema.embedding_field:
                schema_fields.add(schema.embedding_field)
            self.assertFalse(schema_fields.intersection(FORBIDDEN_FEATURE_KEYS))

    def test_unscaled_numeric_features_are_standardized(self):
        matrix, _, params = build_feature_matrix(content_samples(), FEATURE_SCHEMAS["content"])
        numeric_width = len(params["means"])
        numeric_part = matrix[:, -numeric_width:]
        self.assertTrue(np.all(np.abs(np.mean(numeric_part, axis=0)) < 1e-7))

    async def test_too_few_samples_does_not_fit_model(self):
        result = await fit_cluster_model("content", content_samples()[:3], repository=self.repo)
        self.assertEqual(result.status, "skipped")
        self.assertEqual(result.reason, "not_enough_samples")

    async def test_degenerate_empty_cluster_candidate_is_skipped(self):
        duplicate_samples = [dict(content_samples()[0]) for _ in range(10)]
        result = await fit_cluster_model("content", duplicate_samples, repository=self.repo)
        self.assertEqual(result.status, "skipped")

    def test_missing_feature_is_imputed(self):
        samples = content_samples()
        samples[0].pop("estimated_duration_seconds")
        matrix, _, _ = build_feature_matrix(samples, FEATURE_SCHEMAS["content"])
        self.assertFalse(np.isnan(matrix).any())

    async def test_reproducibility_and_model_version(self):
        first = await fit_cluster_model("content", content_samples(), version="content-test-v1", repository=self.repo)
        first_model = await self.repo.get_cluster_model_by_version("content", "content-test-v1")

        other_client = AsyncMongoMockClient()
        other_repo = PersonalizationMongoRepository(other_client["kmeans_other"])
        second = await fit_cluster_model("content", content_samples(), version="content-test-v1", repository=other_repo)
        second_model = await other_repo.get_cluster_model_by_version("content", "content-test-v1")

        self.assertEqual(first.status, "trained")
        self.assertEqual(second.status, "trained")
        self.assertEqual(first.version, "content-test-v1")
        self.assertTrue(np.allclose(first_model["centroids"], second_model["centroids"]))

    async def test_active_model_and_rollback(self):
        await fit_cluster_model("content", content_samples(), version="content-v1", repository=self.repo)
        await fit_cluster_model("content", list(reversed(content_samples())), version="content-v2", repository=self.repo)
        active = await self.repo.get_active_cluster_model("content")
        self.assertEqual(active["version"], "content-v2")

        rolled_back = await rollback_cluster_model("content", "content-v1", repository=self.repo)
        self.assertEqual(rolled_back["version"], "content-v1")
        active_after = await self.repo.get_active_cluster_model("content")
        self.assertEqual(active_after["version"], "content-v1")

    async def test_cold_start_prediction_without_active_model_is_provisional(self):
        prediction = await predict_cluster("learner_ability", {
            "global_theta": 0.0,
            "average_mastery": 0.2,
            "recent_accuracy": 0.0,
            "solved_difficulty": 0.0,
            "prerequisite_gaps": 3,
        }, repository=self.repo)
        self.assertTrue(prediction.provisional)
        self.assertIsNone(prediction.cluster_id)

    async def test_outlier_is_not_forced_into_hard_cluster(self):
        await fit_cluster_model("content", content_samples(), version="content-outlier-v1", repository=self.repo)
        prediction = await predict_cluster("content", {
            "semantic_embedding": [0.0, 0.0, 1.0, 0.0],
            "difficulty": 99.0,
            "bloom_level_encoded": 99.0,
            "estimated_duration_seconds": 9999999,
            "topic": "outlier",
        }, repository=self.repo)
        self.assertTrue(prediction.outlier)
        self.assertIsNone(prediction.cluster_id)

    async def test_identifier_leakage_is_rejected(self):
        samples = content_samples()
        samples[0]["user_id"] = "leaky-user"
        result = await fit_cluster_model("content", samples, repository=self.repo)
        self.assertEqual(result.status, "skipped")
        self.assertIn("Identifier-like keys", result.reason)

    async def test_build_feature_matrix_rejects_identifier_directly(self):
        with self.assertRaises(KMeansTrainingError):
            build_feature_matrix([{"user_id": "u1"}], FEATURE_SCHEMAS["learner_ability"])

    async def test_ai_interpretation_failure_does_not_break_clustering(self):
        def broken_ai(_prompt: str):
            raise RuntimeError("AI unavailable")

        result = await fit_cluster_model(
            "content",
            content_samples(),
            version="content-ai-fail-v1",
            ai_json_generator=broken_ai,
            repository=self.repo,
        )
        model = await self.repo.get_cluster_model_by_version("content", "content-ai-fail-v1")

        self.assertEqual(result.status, "trained")
        self.assertEqual(model["interpretation"]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
