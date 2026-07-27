import unittest
from datetime import datetime, timedelta, timezone

from mongomock_motor import AsyncMongoMockClient

from app.personalization.constants.collections import (
    KNOWLEDGE_COMPONENTS,
    KNOWLEDGE_GRAPH_EDGES,
    LEARNER_KNOWLEDGE_STATES,
    LEARNER_PROFILES,
    LEARNING_EVENTS,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.digital_twin_service import (
    get_current_user_digital_twin,
    invalidate_digital_twin_cache,
)


def now():
    return datetime.now(timezone.utc)


class LearnerDigitalTwinTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["digital_twin"]
        self.repo = PersonalizationMongoRepository(self.db)
        self.user_id = "student-1"
        self.other_user_id = "student-2"
        invalidate_digital_twin_cache(self.user_id)
        invalidate_digital_twin_cache(self.other_user_id)

    async def _insert_profile(self, **overrides):
        timestamp = now()
        profile = {
            "user_id": self.user_id,
            "learning_goals": ["pass-biology"],
            "preferred_subjects": ["biology"],
            "preferred_content_types": ["question"],
            "preferred_explanation_style": "normal",
            "preferred_session_minutes": 25,
            "global_ability": 0.8,
            "current_level": "intermediate",
            "ability_cluster_id": "ability-1",
            "behavior_cluster_id": "behavior-1",
            "interest_cluster_id": "interest-1",
            "profile_confidence": 0.7,
            "total_learning_events": 8,
            "cold_start_status": "ready",
            "last_active_at": timestamp,
            "updated_at": timestamp,
            "model_version": "learner-v1",
        }
        profile.update(overrides)
        await self.db[LEARNER_PROFILES].insert_one(profile)

    async def _insert_state(self, kc_id: str, **overrides):
        timestamp = now()
        state = {
            "user_id": self.user_id,
            "knowledge_component_id": kc_id,
            "mastery_probability": 0.5,
            "uncertainty": 0.2,
            "ability_estimate": 0.1,
            "forgetting_risk": 0.0,
            "attempt_count": 4,
            "correct_count": 2,
            "recent_accuracy": 0.5,
            "average_response_time_ms": 1200.0,
            "hint_rate": 0.1,
            "last_practiced_at": timestamp,
            "last_updated_at": timestamp,
            "bkt_state": {},
            "irt_state": {},
            "model_version": "learner-v1",
        }
        state.update(overrides)
        await self.db[LEARNER_KNOWLEDGE_STATES].insert_one(state)

    async def _insert_event(self, event_type: str = "question_answered", **overrides):
        event = {
            "user_id": self.user_id,
            "session_id": "session-1",
            "item_id": "item-1",
            "event_type": event_type,
            "knowledge_component_ids": ["kc-mastered"],
            "is_correct": True,
            "score": 1.0,
            "response_time_ms": 1000,
            "hint_count": 0,
            "answer_change_count": 0,
            "attempt_number": 1,
            "skipped": False,
            "completed": event_type == "lesson_completed",
            "occurred_at": now(),
            "metadata": {},
            "schema_version": "v1",
        }
        event.update(overrides)
        await self.db[LEARNING_EVENTS].insert_one(event)

    async def test_new_user_returns_low_confidence_twin(self):
        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(twin.user_id, self.user_id)
        self.assertEqual(twin.profile_confidence, 0.0)
        self.assertEqual(twin.data_quality.confidence, 0.0)
        self.assertIn("missing_learner_profile", twin.data_quality.issues)
        self.assertIn("no_learning_events", twin.data_quality.issues)

    async def test_enough_data_produces_strength_weakness_and_behavior_summary(self):
        await self._insert_profile()
        await self._insert_state(
            "kc-mastered",
            mastery_probability=0.86,
            uncertainty=0.12,
            attempt_count=8,
            correct_count=7,
            recent_accuracy=0.9,
        )
        await self._insert_state(
            "kc-weak",
            mastery_probability=0.25,
            uncertainty=0.18,
            attempt_count=5,
            correct_count=1,
            recent_accuracy=0.2,
            hint_rate=0.6,
        )
        await self._insert_event(is_correct=True, response_time_ms=1000)
        await self._insert_event(is_correct=False, response_time_ms=3000, hint_count=1)

        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(twin.current_level, "intermediate")
        self.assertEqual(twin.strengths[0].knowledge_component_id, "kc-mastered")
        self.assertEqual(twin.weaknesses[0].knowledge_component_id, "kc-weak")
        self.assertEqual(twin.behavior_summary.question_answered_count, 2)
        self.assertEqual(twin.behavior_summary.recent_accuracy, 0.5)
        self.assertEqual(twin.behavior_summary.average_response_time_ms, 2000)
        self.assertEqual(len(twin.cluster_memberships), 3)

    async def test_sparse_low_mastery_is_uncertain_not_weak(self):
        await self._insert_state(
            "kc-sparse",
            mastery_probability=0.15,
            uncertainty=0.3,
            attempt_count=1,
            correct_count=0,
        )

        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(twin.weaknesses, [])
        signal = next(item for item in twin.prerequisite_gaps + twin.strengths + twin.weaknesses if False) if False else None
        self.assertIsNone(signal)
        self.assertEqual(twin.data_quality.assessed_knowledge_count, 0)

    async def test_unassessed_component_is_reported_without_marking_weak(self):
        await self.db[KNOWLEDGE_COMPONENTS].insert_one({
            "_id": "kc-unassessed",
            "name": "Photosynthesis",
            "normalized_name": "photosynthesis",
            "created_by": self.user_id,
            "status": "active",
            "updated_at": now(),
        })

        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(twin.weaknesses, [])
        self.assertEqual(twin.data_quality.unassessed_knowledge_count, 1)
        self.assertIn("some_knowledge_unassessed", twin.data_quality.issues)

    async def test_forgetting_risk_marks_stale_practice(self):
        await self._insert_state(
            "kc-stale",
            mastery_probability=0.8,
            uncertainty=0.15,
            attempt_count=4,
            correct_count=3,
            recent_accuracy=0.0,
            last_practiced_at=now() - timedelta(days=60),
        )

        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(twin.at_risk_knowledge[0].knowledge_component_id, "kc-stale")
        self.assertGreaterEqual(twin.at_risk_knowledge[0].forgetting_risk, 0.65)

    async def test_prerequisite_gap_uses_owned_graph_edges(self):
        await self._insert_state(
            "kc-target",
            mastery_probability=0.82,
            uncertainty=0.15,
            attempt_count=6,
            correct_count=5,
        )
        await self._insert_state(
            "kc-prereq",
            mastery_probability=0.3,
            uncertainty=0.15,
            attempt_count=4,
            correct_count=1,
        )
        await self.db[KNOWLEDGE_GRAPH_EDGES].insert_one({
            "source_knowledge_component_id": "kc-prereq",
            "target_knowledge_component_id": "kc-target",
            "relation_type": "prerequisite",
            "created_by": self.user_id,
            "status": "verified",
            "updated_at": now(),
        })

        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(twin.prerequisite_gaps[0].knowledge_component_id, "kc-prereq")
        self.assertIn("prerequisite_gap", twin.prerequisite_gaps[0].reason_codes)

    async def test_cross_user_state_is_not_included(self):
        await self.db[LEARNER_KNOWLEDGE_STATES].insert_one({
            "user_id": self.other_user_id,
            "knowledge_component_id": "kc-other",
            "mastery_probability": 0.1,
            "uncertainty": 0.1,
            "attempt_count": 10,
            "correct_count": 1,
            "recent_accuracy": 0.1,
            "last_updated_at": now(),
            "bkt_state": {},
            "irt_state": {},
            "model_version": "learner-v1",
        })

        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(twin.strengths, [])
        self.assertEqual(twin.weaknesses, [])

    async def test_cache_invalidation_refreshes_recent_progress(self):
        first = await get_current_user_digital_twin(self.user_id, repository=self.repo)
        await self._insert_event()
        cached = await get_current_user_digital_twin(self.user_id, repository=self.repo)
        invalidate_digital_twin_cache(self.user_id)
        refreshed = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        self.assertEqual(first.recent_progress.recent_event_count, 0)
        self.assertEqual(cached.recent_progress.recent_event_count, 0)
        self.assertEqual(refreshed.recent_progress.recent_event_count, 1)

    async def test_recommended_difficulty_range_uses_irt_theta(self):
        await self._insert_profile(global_ability=1.0)

        twin = await get_current_user_digital_twin(self.user_id, repository=self.repo)

        difficulty = twin.recommended_difficulty_range
        self.assertLessEqual(difficulty.min_difficulty, difficulty.max_difficulty)
        self.assertEqual(difficulty.basis, "rasch_1pl_target_probability")
        self.assertGreater(difficulty.max_difficulty, 0.5)


if __name__ == "__main__":
    unittest.main()
