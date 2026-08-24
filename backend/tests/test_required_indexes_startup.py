import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from mongomock_motor import AsyncMongoMockClient


class RequiredIndexesStartupTests(unittest.IsolatedAsyncioTestCase):
    async def _start_with(self, failing_index: str | None = None, *, run_worker: bool | None = False):
        from app.main import lifespan

        db = AsyncMongoMockClient().required_indexes_startup
        background = AsyncMock()
        reviews = AsyncMock()
        worker = AsyncMock()
        if failing_index == "background":
            background.side_effect = RuntimeError("background unique index failed")
        if failing_index == "reviews":
            reviews.side_effect = RuntimeError("review unique index failed")

        worker_env = {} if run_worker is None else {"RUN_WORKER": "1" if run_worker else "0"}
        with patch.dict(os.environ, worker_env, clear=run_worker is None), patch(
            "app.main.connect_to_mongo", new=AsyncMock()
        ), patch(
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
        ), patch(
            "app.worker.run_worker", worker,
        ):
            async with lifespan(FastAPI()):
                pass
        return worker

    async def test_background_job_unique_index_failure_aborts_startup(self):
        with self.assertRaisesRegex(RuntimeError, "background unique index failed"):
            await self._start_with("background")

    async def test_student_review_unique_index_failure_aborts_startup(self):
        with self.assertRaisesRegex(RuntimeError, "review unique index failed"):
            await self._start_with("reviews")

    async def test_required_indexes_allow_normal_startup(self):
        await self._start_with()

    async def test_worker_runs_inside_web_process_when_enabled(self):
        worker = await self._start_with(run_worker=True)
        worker.assert_awaited_once()
        self.assertFalse(worker.await_args.kwargs["manage_connection"])
        self.assertTrue(worker.await_args.kwargs["stop_event"].is_set())

    async def test_worker_runs_inside_web_process_by_default(self):
        worker = await self._start_with(run_worker=None)
        worker.assert_awaited_once()

    async def test_worker_can_be_disabled_explicitly(self):
        worker = await self._start_with(run_worker=False)
        worker.assert_not_awaited()
