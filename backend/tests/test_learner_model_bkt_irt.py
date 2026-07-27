import unittest
from datetime import datetime, timedelta, timezone

from mongomock_motor import AsyncMongoMockClient

from app.personalization.algorithms import IRTParameters, rasch_probability, update_theta
from app.personalization.constants.collections import LEARNING_ITEMS
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import LearningEvent
from app.personalization.services.learner_model_service import process_learning_event


def now():
    return datetime.now(timezone.utc)


class LearnerModelBKTIRTTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["learner_model"]
        self.repo = PersonalizationMongoRepository(self.db)
        self.user_id = "student-1"
        self.item_id = "item-1"
        self.timestamp = now()
        await self.db[LEARNING_ITEMS].insert_one({
            "_id": self.item_id,
            "item_type": "question",
            "document_id": "doc-1",
            "knowledge_component_ids": ["kc-1"],
            "primary_knowledge_component_id": "kc-1",
            "q_matrix_weights": {"kc-1": 1.0},
            "difficulty": 0.5,
            "created_at": self.timestamp,
            "updated_at": self.timestamp,
            "model_version": "knowledge-v1",
        })

    async def _create_event(self, *, correct: bool, item_id: str | None = None, offset_seconds: int = 0, score=None, kcs=None):
        event = LearningEvent(
            user_id=self.user_id,
            session_id="session-1",
            item_id=item_id or self.item_id,
            event_type="question_answered",
            knowledge_component_ids=kcs or [],
            is_correct=correct,
            score=score if score is not None else (1.0 if correct else 0.0),
            response_time_ms=1200,
            occurred_at=self.timestamp + timedelta(seconds=offset_seconds),
            schema_version="v1",
        )
        return await self.repo.create_learning_event(event)

    async def test_consecutive_correct_answers_raise_mastery(self):
        for idx in range(3):
            event = await self._create_event(correct=True, offset_seconds=idx)
            await process_learning_event(event["id"], repository=self.repo)

        state = await self.repo.get_knowledge_state(self.user_id, "kc-1")
        self.assertGreater(state["mastery_probability"], 0.25)
        self.assertLess(state["mastery_probability"], 0.999)

    async def test_wrong_answers_reduce_mastery_but_not_to_zero(self):
        correct = await self._create_event(correct=True, offset_seconds=1)
        await process_learning_event(correct["id"], repository=self.repo)
        before = await self.repo.get_knowledge_state(self.user_id, "kc-1")

        wrong = await self._create_event(correct=False, offset_seconds=2)
        await process_learning_event(wrong["id"], repository=self.repo)
        after = await self.repo.get_knowledge_state(self.user_id, "kc-1")

        self.assertLess(after["mastery_probability"], before["mastery_probability"])
        self.assertGreater(after["mastery_probability"], 0.001)

    async def test_single_correct_does_not_make_mastery_one(self):
        event = await self._create_event(correct=True)
        await process_learning_event(event["id"], repository=self.repo)
        state = await self.repo.get_knowledge_state(self.user_id, "kc-1")
        self.assertLess(state["mastery_probability"], 0.999)

    async def test_duplicate_event_does_not_update_twice(self):
        event = await self._create_event(correct=True)
        first = await process_learning_event(event["id"], repository=self.repo)
        state_after_first = await self.repo.get_knowledge_state(self.user_id, "kc-1")
        second = await process_learning_event(event["id"], repository=self.repo)
        state_after_second = await self.repo.get_knowledge_state(self.user_id, "kc-1")

        self.assertEqual(first["status"], "processed")
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(state_after_first["attempt_count"], state_after_second["attempt_count"])

    async def test_multi_knowledge_component_q_matrix_updates_each_component(self):
        await self.db[LEARNING_ITEMS].update_one(
            {"_id": self.item_id},
            {"$set": {
                "knowledge_component_ids": ["kc-1", "kc-2"],
                "q_matrix_weights": {"kc-1": 0.7, "kc-2": 0.3},
            }},
        )
        event = await self._create_event(correct=True)
        result = await process_learning_event(event["id"], repository=self.repo)

        self.assertEqual(result["updated_state_count"], 2)
        self.assertIsNotNone(await self.repo.get_knowledge_state(self.user_id, "kc-1"))
        self.assertIsNotNone(await self.repo.get_knowledge_state(self.user_id, "kc-2"))

    async def test_irt_probability_and_theta_direction(self):
        probability = rasch_probability(theta=0.0, beta=0.0)
        theta_after_correct = update_theta(0.0, 0.0, 1.0, IRTParameters(learning_rate=0.08))
        theta_after_wrong = update_theta(0.0, 0.0, 0.0, IRTParameters(learning_rate=0.08))

        self.assertGreaterEqual(probability, 0.0)
        self.assertLessEqual(probability, 1.0)
        self.assertGreater(theta_after_correct, 0.0)
        self.assertLess(theta_after_wrong, 0.0)

    async def test_cross_user_state_is_not_returned(self):
        event = await self._create_event(correct=True)
        await process_learning_event(event["id"], repository=self.repo)

        self.assertIsNone(await self.repo.get_knowledge_state("other-user", "kc-1"))

    async def test_missing_q_matrix_has_clear_fallback_status(self):
        event = await self._create_event(correct=True, item_id="missing-item")
        result = await process_learning_event(event["id"], repository=self.repo)

        self.assertEqual(result["status"], "missing_q_matrix")

    async def test_event_knowledge_components_fallback_when_no_learning_item(self):
        event = await self._create_event(correct=True, item_id="adhoc-item", kcs=["kc-fallback"])
        result = await process_learning_event(event["id"], repository=self.repo)

        self.assertEqual(result["q_matrix_source"], "event_knowledge_components")
        self.assertIsNotNone(await self.repo.get_knowledge_state(self.user_id, "kc-fallback"))


if __name__ == "__main__":
    unittest.main()
