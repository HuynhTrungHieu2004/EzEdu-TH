import unittest
from datetime import datetime, timezone

from mongomock_motor import AsyncMongoMockClient

from app.core.config import settings
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.learner_state_query_service import get_learner_summary


class LearnerStateQueryServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_onboarding_profile_without_model_version_is_supported(self):
        db = AsyncMongoMockClient()["test_learner_state_query"]
        await db["learner_profiles"].insert_one(
            {
                "user_id": "student-1",
                "onboarding_completed": True,
                "updated_at": datetime.now(timezone.utc),
            }
        )

        summary = await get_learner_summary(
            "student-1",
            repository=PersonalizationMongoRepository(db),
        )

        self.assertEqual(summary.profile.model_version, settings.LEARNER_MODEL_VERSION)


if __name__ == "__main__":
    unittest.main()
