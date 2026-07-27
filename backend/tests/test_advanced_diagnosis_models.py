import unittest
from datetime import datetime, timedelta, timezone

from mongomock_motor import AsyncMongoMockClient

from app.core.config import Settings
from app.personalization.algorithms.akt_sequences import (
    build_akt_sequences,
    split_interactions_without_future_leakage,
)
from app.personalization.algorithms.neural_cognitive_diagnosis import (
    NeuralCDParameters,
    neuralcd_predict_probability,
    validate_monotonicity,
)
from app.personalization.constants.collections import (
    KNOWLEDGE_COMPONENTS,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.advanced_diagnosis_service import (
    audit_advanced_model_readiness,
    build_advanced_diagnosis_experiment_report,
)


def build_settings(**overrides):
    defaults = {
        "_env_file": None,
        "MONGODB_URI": "mongodb://localhost:27017/test_advanced_models",
        "PERSONALIZATION_ENABLED": True,
        "NEURALCD_ENABLED": False,
        "AKT_ENABLED": False,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def now():
    return datetime.now(timezone.utc)


class AdvancedDiagnosisModelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["advanced_models"]
        self.repo = PersonalizationMongoRepository(self.db)

    async def test_empty_database_blocks_production_neural_models(self):
        audit = await audit_advanced_model_readiness(repository=self.repo, app_settings=build_settings())

        self.assertFalse(audit.production_ready)
        self.assertIn("not_enough_users", audit.blocking_reasons)
        self.assertIn("not_enough_interactions", audit.blocking_reasons)

    async def test_ready_audit_requires_q_matrix_and_sequences(self):
        settings = build_settings(
            ADVANCED_MODEL_MIN_USERS=2,
            ADVANCED_MODEL_MIN_ITEMS=3,
            ADVANCED_MODEL_MIN_INTERACTIONS=6,
            ADVANCED_MODEL_MIN_INTERACTIONS_PER_USER=2.0,
            ADVANCED_MODEL_MIN_KNOWLEDGE_COMPONENTS=3,
            ADVANCED_MODEL_MIN_Q_MATRIX_COVERAGE=1.0,
            ADVANCED_MODEL_MAX_SPARSITY=0.8,
            ADVANCED_MODEL_MIN_SEQUENCE_LENGTH=2,
        )
        timestamp = now()
        await self.db[KNOWLEDGE_COMPONENTS].insert_many([
            {"_id": "kc-1", "created_by": "teacher"},
            {"_id": "kc-2", "created_by": "teacher"},
            {"_id": "kc-3", "created_by": "teacher"},
        ])
        await self.db[LEARNING_ITEMS].insert_many([
            {"_id": "item-1", "q_matrix_weights": {"kc-1": 1.0}},
            {"_id": "item-2", "q_matrix_weights": {"kc-2": 1.0}},
            {"_id": "item-3", "q_matrix_weights": {"kc-3": 1.0}},
        ])
        events = []
        for user_id in ["u1", "u2", "u3"]:
            for index, item_id in enumerate(["item-1", "item-2"]):
                events.append({
                    "user_id": user_id,
                    "item_id": item_id,
                    "event_type": "question_answered",
                    "is_correct": index % 2 == 0,
                    "occurred_at": timestamp + timedelta(seconds=index),
                })
        await self.db[LEARNING_EVENTS].insert_many(events)

        audit = await audit_advanced_model_readiness(repository=self.repo, app_settings=settings)

        self.assertTrue(audit.production_ready)
        self.assertEqual(audit.q_matrix_coverage, 1.0)
        self.assertGreaterEqual(audit.median_sequence_length, 2)

    async def test_experiment_report_keeps_bkt_irt_as_production_when_not_ready(self):
        report = await build_advanced_diagnosis_experiment_report(repository=self.repo, app_settings=build_settings())

        self.assertEqual(report.production_model, "bkt_irt")
        self.assertEqual(report.neuralcd.mode, "research_only")
        self.assertEqual(report.akt.mode, "research_only")
        self.assertEqual(report.neuralcd.status, "skipped")
        self.assertEqual(report.akt.status, "skipped")

    async def test_neuralcd_forward_is_monotonic_for_higher_proficiency(self):
        low = NeuralCDParameters(
            user_proficiency={"u": [0.2, 0.2]},
            item_difficulty={"i": [0.5, 0.5]},
            item_discrimination={"i": 1.2},
            q_matrix={"i": [1.0, 1.0]},
            model_version="research-v1",
        )
        high = NeuralCDParameters(
            user_proficiency={"u": [0.8, 0.8]},
            item_difficulty=low.item_difficulty,
            item_discrimination=low.item_discrimination,
            q_matrix=low.q_matrix,
            model_version="research-v1",
        )

        self.assertLess(neuralcd_predict_probability("u", "i", low), neuralcd_predict_probability("u", "i", high))
        self.assertEqual(validate_monotonicity(high)["status"], "ok")

    async def test_akt_sequence_padding_and_time_split(self):
        timestamp = now()
        interactions = [
            {"user_id": "u1", "item_id": "q1", "knowledge_component_ids": ["kc-1"], "is_correct": True, "occurred_at": timestamp},
            {"user_id": "u1", "item_id": "q2", "knowledge_component_ids": ["kc-2"], "is_correct": False, "occurred_at": timestamp + timedelta(seconds=1)},
            {"user_id": "u1", "item_id": "q3", "knowledge_component_ids": ["kc-3"], "is_correct": True, "occurred_at": timestamp + timedelta(seconds=2)},
        ]

        batch = build_akt_sequences(interactions, max_sequence_length=5)
        split = split_interactions_without_future_leakage(interactions, train_ratio=0.34, validation_ratio=0.33)

        self.assertEqual(batch.user_ids, ["u1"])
        self.assertEqual(batch.question_ids[0][:2], ["<pad>", "<pad>"])
        self.assertEqual(batch.padding_mask[0][:2], [True, True])
        self.assertEqual([row["item_id"] for row in split["train"]], ["q1"])
        self.assertEqual([row["item_id"] for row in split["validation"]], [])
        self.assertEqual([row["item_id"] for row in split["test"]], ["q2", "q3"])


if __name__ == "__main__":
    unittest.main()
