import unittest
from datetime import datetime, timedelta, timezone

from mongomock_motor import AsyncMongoMockClient

from app.personalization.constants.collections import (
    KNOWLEDGE_COMPONENTS,
    KNOWLEDGE_GRAPH_EDGES,
    LEARNER_KNOWLEDGE_STATES,
    LEARNER_PROFILES,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.candidate_generator_service import generate_candidates_for_user


def now():
    return datetime.now(timezone.utc)


class CandidateGeneratorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["candidate_generator"]
        self.repo = PersonalizationMongoRepository(self.db)
        self.user_id = "student-1"
        self.other_user_id = "student-2"
        self.document_id = "doc-1"
        self.other_document_id = "doc-2"
        await self.db["documents"].insert_one({
            "_id": self.document_id,
            "user_id": self.user_id,
            "status": "indexed",
            "created_at": now(),
        })
        await self.db["documents"].insert_one({
            "_id": self.other_document_id,
            "user_id": self.other_user_id,
            "status": "indexed",
            "created_at": now(),
        })

    async def _insert_profile(self, **overrides):
        profile = {
            "user_id": self.user_id,
            "learning_goals": ["biology"],
            "preferred_subjects": ["biology"],
            "preferred_content_types": ["question"],
            "preferred_explanation_style": "normal",
            "global_ability": 0.0,
            "current_level": "intermediate",
            "profile_confidence": 0.7,
            "total_learning_events": 10,
            "cold_start_status": "ready",
            "updated_at": now(),
            "model_version": "learner-v1",
        }
        profile.update(overrides)
        await self.db[LEARNER_PROFILES].insert_one(profile)

    async def _insert_component(self, kc_id: str, **overrides):
        component = {
            "_id": kc_id,
            "name": kc_id,
            "normalized_name": kc_id,
            "subject": "biology",
            "topic": "biology",
            "created_by": self.user_id,
            "status": "active",
            "confidence": 0.9,
            "updated_at": now(),
        }
        component.update(overrides)
        await self.db[KNOWLEDGE_COMPONENTS].insert_one(component)

    async def _insert_state(self, kc_id: str, **overrides):
        state = {
            "user_id": self.user_id,
            "knowledge_component_id": kc_id,
            "mastery_probability": 0.3,
            "uncertainty": 0.2,
            "attempt_count": 5,
            "correct_count": 1,
            "recent_accuracy": 0.2,
            "average_response_time_ms": 1500.0,
            "hint_rate": 0.2,
            "last_practiced_at": now(),
            "last_updated_at": now(),
            "bkt_state": {},
            "irt_state": {},
            "model_version": "learner-v1",
        }
        state.update(overrides)
        await self.db[LEARNER_KNOWLEDGE_STATES].insert_one(state)

    async def _insert_item(self, item_id: str, kc_ids: list[str], **overrides):
        item = {
            "_id": item_id,
            "item_type": "question",
            "document_id": self.document_id,
            "knowledge_component_ids": kc_ids,
            "primary_knowledge_component_id": kc_ids[0] if kc_ids else None,
            "q_matrix_weights": {kc_id: 1 / len(kc_ids) for kc_id in kc_ids} if kc_ids else {},
            "difficulty": 0.45,
            "quality_score": 0.8,
            "verification_status": "verified",
            "content_cluster_id": "cluster-1",
            "created_at": now(),
            "updated_at": now(),
            "model_version": "knowledge-v1",
        }
        item.update(overrides)
        await self.db[LEARNING_ITEMS].insert_one(item)

    async def _insert_event(self, item_id: str, **overrides):
        event = {
            "user_id": self.user_id,
            "session_id": "session-1",
            "item_id": item_id,
            "document_id": self.document_id,
            "event_type": "question_answered",
            "knowledge_component_ids": ["kc-1"],
            "is_correct": True,
            "score": 1.0,
            "response_time_ms": 1000,
            "hint_count": 0,
            "answer_change_count": 0,
            "attempt_number": 1,
            "skipped": False,
            "completed": False,
            "occurred_at": now(),
            "metadata": {},
            "schema_version": "v1",
        }
        event.update(overrides)
        await self.db[LEARNING_EVENTS].insert_one(event)

    async def test_no_weak_knowledge_uses_non_weak_sources(self):
        await self._insert_profile()
        await self._insert_component("kc-mastered")
        await self._insert_state(
            "kc-mastered",
            mastery_probability=0.9,
            uncertainty=0.1,
            attempt_count=6,
            correct_count=6,
            recent_accuracy=1.0,
        )
        await self._insert_item("item-mastered", ["kc-mastered"])

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)

        self.assertGreaterEqual(len(result.candidates), 1)
        self.assertNotIn("weak_knowledge", result.source_counts)

    async def test_new_user_gets_safe_exploration_fallback(self):
        await self._insert_component("kc-new")
        await self._insert_item("item-safe", ["kc-new"], difficulty=0.45, quality_score=0.9)

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)

        self.assertEqual(result.candidates[0].item_id, "item-safe")
        self.assertIn("exploration", result.source_counts)
        self.assertIn("exploration", result.fallback_sources)

    async def test_not_enough_candidates_reports_fallback_sources(self):
        await self._insert_component("kc-one")
        await self._insert_item("item-one", ["kc-one"], difficulty=0.45, quality_score=0.9)

        result = await generate_candidates_for_user(self.user_id, repository=self.repo, total_limit=5)

        self.assertEqual(len(result.candidates), 1)
        self.assertIn("appropriate_difficulty", result.fallback_sources)
        self.assertIn("exploration", result.fallback_sources)

    async def test_duplicate_item_keeps_multiple_source_types(self):
        await self._insert_profile()
        await self._insert_component("kc-weak")
        await self._insert_state("kc-weak", mastery_probability=0.2, attempt_count=5)
        await self._insert_item("item-duplicate", ["kc-weak"], difficulty=0.45, quality_score=0.85)

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)
        candidate = next(item for item in result.candidates if item.item_id == "item-duplicate")

        self.assertIn("weak_knowledge", candidate.source_types)
        self.assertIn("appropriate_difficulty", candidate.source_types)
        self.assertEqual(len({item.item_id for item in result.candidates}), len(result.candidates))

    async def test_prerequisite_gap_generates_prerequisite_candidate(self):
        await self._insert_profile()
        await self._insert_component("kc-target")
        await self._insert_component("kc-prereq")
        await self._insert_state(
            "kc-target",
            mastery_probability=0.82,
            uncertainty=0.12,
            attempt_count=6,
            correct_count=5,
        )
        await self._insert_state("kc-prereq", mastery_probability=0.25, uncertainty=0.12, attempt_count=5)
        await self._insert_item("item-prereq", ["kc-prereq"], difficulty=0.35, quality_score=0.9)
        await self.db[KNOWLEDGE_GRAPH_EDGES].insert_one({
            "source_knowledge_component_id": "kc-prereq",
            "target_knowledge_component_id": "kc-target",
            "relation_type": "prerequisite",
            "created_by": self.user_id,
            "status": "verified",
            "updated_at": now(),
        })

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)

        candidate = next(item for item in result.candidates if item.item_id == "item-prereq")
        self.assertIn("prerequisite_gap", candidate.source_types)

    async def test_unauthorized_item_is_not_returned(self):
        await self._insert_component("kc-foreign")
        await self._insert_item(
            "item-foreign",
            ["kc-foreign"],
            document_id=self.other_document_id,
            difficulty=0.45,
            quality_score=0.9,
        )

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)

        self.assertEqual(result.candidates, [])

    async def test_failed_verification_is_filtered(self):
        await self._insert_component("kc-failed")
        await self._insert_item(
            "item-failed",
            ["kc-failed"],
            difficulty=0.45,
            quality_score=0.9,
            verification_status="rejected",
        )

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)

        self.assertEqual(result.candidates, [])

    async def test_exploration_respects_difficulty_and_quality_safety(self):
        await self._insert_component("kc-explore")
        await self._insert_item("item-too-hard", ["kc-explore"], difficulty=0.95, quality_score=0.95)
        await self._insert_item("item-safe", ["kc-explore"], difficulty=0.45, quality_score=0.9)
        await self._insert_item("item-low-quality", ["kc-explore"], difficulty=0.45, quality_score=0.1)

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)
        ids = {candidate.item_id for candidate in result.candidates}

        self.assertIn("item-safe", ids)
        self.assertNotIn("item-too-hard", ids)
        self.assertNotIn("item-low-quality", ids)

    async def test_recent_item_is_filtered_unless_forgetting_review(self):
        await self._insert_profile()
        await self._insert_component("kc-recent")
        await self._insert_item("item-recent", ["kc-recent"], difficulty=0.45, quality_score=0.9)
        await self._insert_event("item-recent", knowledge_component_ids=["kc-recent"], occurred_at=now())

        result = await generate_candidates_for_user(self.user_id, repository=self.repo)

        self.assertNotIn("item-recent", {candidate.item_id for candidate in result.candidates})


if __name__ == "__main__":
    unittest.main()
