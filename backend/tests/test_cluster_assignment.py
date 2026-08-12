import unittest
from datetime import datetime, timezone

from mongomock_motor import AsyncMongoMockClient

from app.personalization.constants.collections import (
    LEARNER_PROFILES,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
)
from app.personalization.jobs.kmeans_training_job import (
    collect_cluster_samples,
    collect_labelled_cluster_samples,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.cluster_assignment_service import (
    CLUSTER_TARGET_FIELD,
    assign_clusters,
)

NOW = datetime(2026, 8, 1, tzinfo=timezone.utc)


def make_repo():
    repo = PersonalizationMongoRepository.__new__(PersonalizationMongoRepository)
    repo.db = AsyncMongoMockClient()["test"]
    return repo


async def seed_learners(repo, count: int = 10):
    for i in range(count):
        await repo.db[LEARNER_PROFILES].insert_one({
            "user_id": f"u{i}",
            "global_ability": 0.1 * i,
            "onboarding_completed": True,
            "updated_at": NOW,
            "model_version": "v1",
        })
        for kc in range(2):
            await repo.db["learner_knowledge_states"].insert_one({
                "user_id": f"u{i}",
                "knowledge_component_id": f"kc{kc}",
                "mastery_probability": 0.1 * i,
                "recent_accuracy": 0.1 * i,
                "attempt_count": 3,
                "correct_count": i,
                "last_updated_at": NOW,
                "model_version": "v1",
            })


class LabelledSampleTests(unittest.IsolatedAsyncioTestCase):
    async def test_labelled_samples_keep_the_owner_id(self):
        repo = make_repo()
        await seed_learners(repo)

        labelled = await collect_labelled_cluster_samples("learner_ability", repository=repo)

        self.assertEqual(len(labelled), 10)
        self.assertEqual({owner for owner, _ in labelled}, {f"u{i}" for i in range(10)})

    async def test_features_match_the_training_path_exactly(self):
        """Huấn luyện và gán nhãn phải thấy CÙNG một vector đặc trưng — lệch
        nhau thì cụm gán ra sẽ sai một cách âm thầm."""
        repo = make_repo()
        await seed_learners(repo)

        plain = await collect_cluster_samples("learner_ability", repository=repo)
        labelled = await collect_labelled_cluster_samples("learner_ability", repository=repo)

        self.assertEqual(plain, [sample for _, sample in labelled])

    async def test_owner_id_never_leaks_into_the_feature_vector(self):
        """Ràng buộc quyền riêng tư sẵn có: vector đặc trưng không được chứa định danh."""
        repo = make_repo()
        await seed_learners(repo)

        labelled = await collect_labelled_cluster_samples("learner_ability", repository=repo)

        for _, sample in labelled:
            self.assertNotIn("user_id", sample)
            self.assertNotIn("id", sample)

    async def test_content_samples_are_labelled_by_learning_item_id(self):
        repo = make_repo()
        for i in range(4):
            await repo.db[LEARNING_ITEMS].insert_one({
                "_id": f"item{i}", "item_type": "document_chunk",
                "difficulty": 0.2 * i, "bloom_level": "understand",
                "estimated_duration_seconds": 60, "topic": "t",
            })

        labelled = await collect_labelled_cluster_samples("content", repository=repo)

        self.assertEqual({owner for owner, _ in labelled}, {f"item{i}" for i in range(4)})


class AssignClustersTests(unittest.IsolatedAsyncioTestCase):
    async def test_target_field_is_defined_for_every_cluster_type(self):
        self.assertEqual(
            set(CLUSTER_TARGET_FIELD),
            {"content", "question", "learner_ability", "learner_behavior", "learner_interest"},
        )

    async def test_reports_when_no_active_model_exists(self):
        repo = make_repo()
        await seed_learners(repo)

        result = await assign_clusters("learner_ability", repository=repo)

        self.assertEqual(result["status"], "no_active_model")
        self.assertEqual(result["assigned"], 0)

    async def test_writes_cluster_id_onto_learner_profiles(self):
        repo = make_repo()
        await seed_learners(repo)
        from app.personalization.jobs.kmeans_training_job import train_cluster_type

        fit = await train_cluster_type("learner_ability", repository=repo)
        self.assertEqual(fit.status, "trained", fit)

        result = await assign_clusters("learner_ability", repository=repo)

        self.assertEqual(result["status"], "ok")
        self.assertGreater(result["assigned"], 0)
        profiles = [p async for p in repo.db[LEARNER_PROFILES].find({})]
        assigned = [p for p in profiles if p.get("ability_cluster_id") is not None]
        self.assertEqual(len(assigned), result["assigned"])

    async def test_outliers_are_not_forced_into_a_cluster(self):
        """`predict_cluster` trả cluster_id=None cho mẫu quá xa mọi tâm cụm —
        phải tôn trọng, không được ép gán bừa."""
        repo = make_repo()
        await seed_learners(repo)
        from app.personalization.jobs.kmeans_training_job import train_cluster_type

        await train_cluster_type("learner_ability", repository=repo)
        # Thêm một học sinh lệch hẳn khỏi dải năng lực của nhóm đã huấn luyện.
        await repo.db[LEARNER_PROFILES].insert_one({
            "user_id": "outlier", "global_ability": 999.0,
            "onboarding_completed": True, "updated_at": NOW, "model_version": "v1",
        })
        await repo.db["learner_knowledge_states"].insert_one({
            "user_id": "outlier", "knowledge_component_id": "kc0",
            "mastery_probability": 999.0, "recent_accuracy": 999.0,
            "attempt_count": 1, "correct_count": 1,
            "last_updated_at": NOW, "model_version": "v1",
        })

        result = await assign_clusters("learner_ability", repository=repo)

        outlier = await repo.db[LEARNER_PROFILES].find_one({"user_id": "outlier"})
        self.assertIsNone(outlier.get("ability_cluster_id"))
        self.assertGreaterEqual(result["outliers"], 1)


if __name__ == "__main__":
    unittest.main()
