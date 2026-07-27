import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from mongomock_motor import AsyncMongoMockClient
from pymongo.errors import DuplicateKeyError
from pydantic import ValidationError

from app.personalization.constants.collections import (
    LEARNER_KNOWLEDGE_STATES,
    LEARNING_EVENTS,
)
from app.personalization.repositories.indexes import create_personalization_indexes
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import (
    ClusterModel,
    KnowledgeComponent,
    LearnerKnowledgeState,
    LearnerProfile,
    LearningEvent,
    LearningItem,
    RecommendationLog,
)


def now():
    return datetime.now(timezone.utc)


class PersonalizationDataModelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_personalization"]
        self.repo = PersonalizationMongoRepository(self.db)

    async def test_schema_validation_accepts_minimal_documents(self):
        timestamp = now()
        kc = KnowledgeComponent(
            name="Photosynthesis",
            normalized_name="photosynthesis",
            created_by="lecturer-1",
            created_at=timestamp,
            updated_at=timestamp,
            model_version="knowledge-v1",
        )
        item = LearningItem(
            item_type="question",
            document_id="doc-1",
            knowledge_component_ids=["kc-1"],
            primary_knowledge_component_id="kc-1",
            q_matrix_weights={"kc-1": 1.0},
            created_at=timestamp,
            updated_at=timestamp,
            model_version="items-v1",
        )
        event = LearningEvent(
            user_id="user-1",
            item_id="item-1",
            event_type="question_answered",
            is_correct=True,
            occurred_at=timestamp,
            schema_version="v1",
        )
        profile = LearnerProfile(
            user_id="user-1",
            updated_at=timestamp,
            model_version="learner-v1",
        )
        state = LearnerKnowledgeState(
            user_id="user-1",
            knowledge_component_id="kc-1",
            attempt_count=1,
            correct_count=1,
            last_updated_at=timestamp,
            model_version="learner-v1",
        )
        log = RecommendationLog(
            user_id="user-1",
            item_id="item-1",
            final_score=0.75,
            rank_position=1,
            generated_at=timestamp,
            learner_model_version="learner-v1",
            ranking_model_version="ranker-v1",
            bandit_policy_version="v0",
        )
        cluster = ClusterModel(
            cluster_type="content",
            version="content-kmeans-v1",
            feature_schema_version="v1",
            number_of_clusters=2,
            training_sample_count=25,
        )

        self.assertEqual(kc.status, "draft")
        self.assertEqual(item.primary_knowledge_component_id, "kc-1")
        self.assertTrue(event.is_correct)
        self.assertEqual(profile.cold_start_status, "new")
        self.assertEqual(state.correct_count, 1)
        self.assertEqual(log.rank_position, 1)
        self.assertEqual(cluster.cluster_type, "content")

    async def test_learning_event_rejects_missing_user_or_item(self):
        timestamp = now()
        with self.assertRaises(ValidationError):
            LearningEvent(
                user_id="",
                item_id="item-1",
                event_type="item_viewed",
                occurred_at=timestamp,
                schema_version="v1",
            )

        with self.assertRaises(ValidationError):
            LearningEvent(
                user_id="user-1",
                item_id="",
                event_type="item_viewed",
                occurred_at=timestamp,
                schema_version="v1",
            )

    async def test_create_event_and_repository_ownership(self):
        timestamp = now()
        event = LearningEvent(
            user_id="user-1",
            item_id="item-1",
            event_type="question_started",
            occurred_at=timestamp,
            schema_version="v1",
        )

        created = await self.repo.create_learning_event(event)
        self.assertEqual(created["user_id"], "user-1")
        self.assertIn("id", created)

        same_user = await self.repo.get_learning_event_for_user("user-1", created["id"])
        other_user = await self.repo.get_learning_event_for_user("user-2", created["id"])
        self.assertIsNotNone(same_user)
        self.assertIsNone(other_user)

    async def test_repository_requires_user_id_for_learner_reads(self):
        with self.assertRaises(ValueError):
            await self.repo.get_learner_profile("")

        with self.assertRaises(ValueError):
            await self.repo.get_knowledge_state("", "kc-1")

    async def test_profile_repository_does_not_return_other_users_data(self):
        timestamp = now()
        await self.repo.upsert_learner_profile(
            LearnerProfile(user_id="user-1", updated_at=timestamp, model_version="learner-v1")
        )
        await self.repo.upsert_learner_profile(
            LearnerProfile(user_id="user-2", updated_at=timestamp, model_version="learner-v1")
        )

        profile = await self.repo.get_learner_profile("user-1")
        self.assertEqual(profile["user_id"], "user-1")
        self.assertNotEqual(profile["user_id"], "user-2")

    async def test_index_creation_and_unique_learner_knowledge_state(self):
        await create_personalization_indexes(self.db)
        index_names = set(await self.db[LEARNER_KNOWLEDGE_STATES].index_information())

        self.assertIn("lks_user_kc_unique", index_names)

        timestamp = now()
        duplicate = {
            "user_id": "user-1",
            "knowledge_component_id": "kc-1",
            "attempt_count": 1,
            "correct_count": 1,
            "last_updated_at": timestamp,
            "model_version": "learner-v1",
        }
        await self.db[LEARNER_KNOWLEDGE_STATES].insert_one(dict(duplicate))
        with self.assertRaises(DuplicateKeyError):
            await self.db[LEARNER_KNOWLEDGE_STATES].insert_one(dict(duplicate))

    async def test_learning_event_indexes_include_user_item_and_time(self):
        await create_personalization_indexes(self.db)
        index_names = set(await self.db[LEARNING_EVENTS].index_information())

        self.assertIn("le_user_occurred_at", index_names)
        self.assertIn("le_user_item_time", index_names)
        self.assertIn("le_user_session_time", index_names)
        self.assertIn("le_knowledge_component_ids", index_names)

    async def test_index_migration_can_run_repeatedly(self):
        first = await create_personalization_indexes(self.db)
        second = await create_personalization_indexes(self.db)

        self.assertEqual(first, second)
        self.assertIn("lks_user_kc_unique", second)

    async def test_migration_script_run_is_idempotent_with_mock_database(self):
        from scripts.migrate_personalization_indexes import run_migration

        with patch("scripts.migrate_personalization_indexes.connect_to_mongo", new=AsyncMock()), \
            patch("scripts.migrate_personalization_indexes.close_mongo_connection", new=AsyncMock()), \
            patch("scripts.migrate_personalization_indexes.get_database", return_value=self.db):
            first = await run_migration(dry_run=False, force_production=True)
            second = await run_migration(dry_run=False, force_production=True)

        self.assertEqual(first, second)
        self.assertIn("lp_user_unique", first)

    async def test_migration_dry_run_does_not_connect_to_database(self):
        from scripts.migrate_personalization_indexes import run_migration

        connect_mock = AsyncMock()
        close_mock = AsyncMock()
        with patch("scripts.migrate_personalization_indexes.connect_to_mongo", new=connect_mock), \
            patch("scripts.migrate_personalization_indexes.close_mongo_connection", new=close_mock):
            index_names = await run_migration(dry_run=True, force_production=True)

        self.assertIn("lks_user_kc_unique", index_names)
        connect_mock.assert_not_called()
        close_mock.assert_not_called()
