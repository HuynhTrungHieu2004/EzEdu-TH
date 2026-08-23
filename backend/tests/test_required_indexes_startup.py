import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient


class RequiredIndexesStartupTests(unittest.IsolatedAsyncioTestCase):
    async def _start_with(self, failing_index: str | None = None) -> None:
        from app.main import lifespan

        db = AsyncMongoMockClient().required_indexes_startup
        background = AsyncMock()
        reviews = AsyncMock()
        if failing_index == "background":
            background.side_effect = RuntimeError("background unique index failed")
        if failing_index == "reviews":
            reviews.side_effect = RuntimeError("review unique index failed")

        with patch("app.main.connect_to_mongo", new=AsyncMock()), patch(
            "app.main.close_mongo_connection", new=AsyncMock()
        ), patch("app.database.mongodb.get_database", return_value=db), patch(
            "app.services.background_job_service.ensure_background_job_indexes", background
        ), patch(
            "app.services.student_review_service.ensure_student_review_indexes", reviews
        ), patch(
            "app.services.rag_service.rebuild_chroma_if_empty",
            new=AsyncMock(return_value={"restored": 0}),
        ), patch(
            "app.services.verification_service.recover_interrupted_verification_sessions",
            new=AsyncMock(return_value=0),
        ):
            async with lifespan(FastAPI()):
                pass

    async def test_background_job_unique_index_failure_aborts_startup(self):
        with self.assertRaisesRegex(RuntimeError, "background unique index failed"):
            await self._start_with("background")

    async def test_student_review_unique_index_failure_aborts_startup(self):
        with self.assertRaisesRegex(RuntimeError, "review unique index failed"):
            await self._start_with("reviews")

    async def test_required_indexes_allow_normal_startup(self):
        await self._start_with()
