import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.schemas.auth import UserResponse
from app.core.config import settings


def _user(role: str) -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class CurriculumDatasetApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_curriculum_dataset_api"]

    def _api(self):
        try:
            from app.curriculum_kb.api.datasets import get_dataset_report
            from app.curriculum_kb.api.deps import require_dataset_admin
        except (ImportError, ModuleNotFoundError) as exc:
            self.fail(f"Dataset report API is missing: {exc}")
        return get_dataset_report, require_dataset_admin

    async def test_dataset_report_is_admin_only(self):
        _, require_dataset_admin = self._api()

        with patch.object(settings, "ENABLE_CURRICULUM_KB", True):
            with self.assertRaises(HTTPException) as context:
                await require_dataset_admin(_user("lecturer"))

            self.assertEqual(403, context.exception.status_code)
            self.assertEqual("admin", (await require_dataset_admin(_user("admin"))).role)

    async def test_report_returns_counts_and_latest_run_without_loading_error(self):
        get_dataset_report, _ = self._api()
        now = datetime.now(timezone.utc)
        await self.db["curriculum_kb_sources"].insert_one({
            "dataset_key": "dataset-a",
            "subject_id": "tieng_anh",
            "grade": 12,
            "source_language": "en",
            "license_id": "CC-BY-SA-4.0",
            "chunk_count": 120,
        })
        await self.db["curriculum_kb_dataset_runs"].insert_one({
            "dataset_key": "dataset-a",
            "manifest_version": 1,
            "mode": "import",
            "status": "completed",
            "started_at": now,
            "finished_at": now,
        })

        with patch("app.curriculum_kb.api.datasets.get_database", return_value=self.db):
            response = await get_dataset_report("dataset-a", current_user=_user("admin"))

        self.assertEqual("dataset-a", response.dataset_key)
        self.assertEqual(1, response.source_count)
        self.assertEqual(120, response.chunk_count)
        self.assertEqual("completed", response.latest_run.status)
        self.assertEqual(120, response.coverage[0].chunk_count)


if __name__ == "__main__":
    unittest.main()
