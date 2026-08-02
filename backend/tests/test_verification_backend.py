import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import BackgroundTasks, HTTPException
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.routers import documents as documents_router
from app.routers import questions as questions_router
from app.routers import verification as verification_router
from app.schemas.question import QuestionGenerateRequest
from app.schemas.verification import IssueResolution
from app.services import verification_service


def completed_session(
    document_id: str,
    user_id: str,
    created_at: datetime,
    *,
    content: str = "X X",
) -> dict:
    return {
        "_id": ObjectId(),
        "document_id": document_id,
        "user_id": user_id,
        "status": "completed",
        "total_chunks": 1,
        "total_chunks_processed": 1,
        "total_issues_found": 1,
        "issues_accepted": 0,
        "issues_rejected": 0,
        "issues_pending": 1,
        "error_message": None,
        "content_revision_hash": verification_service.compute_content_revision_hash(
            content
        ),
        "created_at": created_at,
        "updated_at": created_at,
        "completed_at": created_at,
    }


def issue_doc(
    session_id: str,
    document_id: str,
    user_id: str,
    *,
    original: str = "X",
    replacement: str = "Y",
    resolution: str = "pending",
    chunk_index: int = 0,
) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "session_id": session_id,
        "document_id": document_id,
        "user_id": user_id,
        "chunk_index": chunk_index,
        "issue_type": "ocr_error",
        "severity": "medium",
        "original_text": original,
        "suggested_fix": replacement,
        "reason": "Lỗi kiểm thử",
        "confidence": 0.9,
        "source_reference": None,
        "external_verified": False,
        "ai_provider": "both",
        "resolution": resolution,
        "user_edited_text": None,
        "resolved_at": None,
        "applied_at": None,
        "created_at": now,
    }


class VerificationBackendTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["verification_test"]
        self.user_id = str(ObjectId())
        self.document_id = str(ObjectId())
        self.db_patches = [
            patch.object(verification_service, "get_database", return_value=self.db),
            patch.object(verification_router, "get_database", return_value=self.db),
            patch.object(documents_router, "get_database", return_value=self.db),
            patch.object(questions_router, "get_database", return_value=self.db),
        ]
        for db_patch in self.db_patches:
            db_patch.start()
            self.addCleanup(db_patch.stop)

    async def _insert_document(self, text: str = "X X", status: str = "indexed"):
        now = datetime.now(timezone.utc)
        await self.db["documents"].insert_one(
            {
                "_id": ObjectId(self.document_id),
                "user_id": self.user_id,
                "status": status,
                "original_filename": "test.pdf",
                "file_type": "pdf",
                "file_size": 10,
                "cloudinary_url": "local://unused-test-file.pdf",
                "cloudinary_public_id": "",
                "cloudinary_resource_type": "raw",
                "media_kind": "document",
                "error_message": None,
                "created_at": now,
                "updated_at": now,
            }
        )
        await self.db["document_contents"].insert_one(
            {
                "document_id": self.document_id,
                "user_id": self.user_id,
                "extracted_text": text,
                "text_length": len(text),
                "created_at": now,
                "updated_at": now,
            }
        )

    async def _insert_completed_issue(
        self,
        *,
        content: str = "X X",
        resolution: str = "accepted",
    ) -> tuple[dict, dict]:
        session = completed_session(
            self.document_id,
            self.user_id,
            datetime.now(timezone.utc),
            content=content,
        )
        issue = issue_doc(
            str(session["_id"]),
            self.document_id,
            self.user_id,
            resolution=resolution,
        )
        await self.db["verification_sessions"].insert_one(session)
        await self.db["verification_issues"].insert_one(issue)
        return session, issue

    async def _mark_document_as_video(self) -> None:
        await self.db["documents"].update_one(
            {"_id": ObjectId(self.document_id), "user_id": self.user_id},
            {
                "$set": {
                    "original_filename": "test.mp4",
                    "file_type": "mp4",
                    "media_kind": "video",
                    "cloudinary_url": "local://unused-test-video.mp4",
                }
            },
        )

    async def _claim_test_transcription_lock(self) -> tuple[dict, str]:
        await self._mark_document_as_video()
        document = await self.db["documents"].find_one(
            {"_id": ObjectId(self.document_id), "user_id": self.user_id}
        )
        token = await documents_router.acquire_document_mutation_lock(
            self.db,
            self.document_id,
            self.user_id,
            expected_status=document["status"],
            operation="transcription",
            locked_status="transcribing",
            expected_updated_at=document["updated_at"],
        )
        self.assertIsNotNone(token)
        return document, token

    async def test_no_provider_marks_background_session_failed(self):
        await self._insert_document("Nội dung hợp lệ.", status="processed")
        session = await verification_service.create_verification_session(
            self.document_id,
            self.user_id,
            1,
        )

        with (
            patch.object(verification_service, "is_gemini_available", return_value=False),
            patch.object(verification_service, "is_groq_available", return_value=False),
            self.assertLogs(verification_service.logger, level="ERROR"),
        ):
            await verification_service.run_verification_task(
                self.document_id,
                self.user_id,
                str(session["_id"]),
            )

        stored = await self.db["verification_sessions"].find_one({"_id": session["_id"]})
        self.assertEqual(stored["status"], "failed")
        self.assertIn("Dịch vụ AI", stored["error_message"])
        self.assertNotIn("active_key", stored)

    async def test_active_session_lock_and_startup_recovery(self):
        first = await verification_service.create_verification_session(
            self.document_id,
            self.user_id,
            1,
        )
        with self.assertRaises(verification_service.VerificationInProgressError):
            await verification_service.create_verification_session(
                self.document_id,
                self.user_id,
                1,
            )

        recovered = await verification_service.recover_interrupted_verification_sessions()
        self.assertEqual(recovered, 1)
        stored = await self.db["verification_sessions"].find_one({"_id": first["_id"]})
        self.assertEqual(stored["status"], "failed")
        self.assertNotIn("active_key", stored)

        replacement = await verification_service.create_verification_session(
            self.document_id,
            self.user_id,
            1,
        )
        self.assertNotEqual(replacement["_id"], first["_id"])

    async def test_latest_session_scopes_issue_list_and_resolve(self):
        await self._insert_document()
        now = datetime.now(timezone.utc)
        old_session = completed_session(
            self.document_id,
            self.user_id,
            now - timedelta(minutes=1),
        )
        latest_session = completed_session(self.document_id, self.user_id, now)
        await self.db["verification_sessions"].insert_many([old_session, latest_session])

        old_issue = issue_doc(
            str(old_session["_id"]),
            self.document_id,
            self.user_id,
        )
        latest_issue = issue_doc(
            str(latest_session["_id"]),
            self.document_id,
            self.user_id,
        )
        await self.db["verification_issues"].insert_many([old_issue, latest_issue])

        response = await verification_router.get_verification_issues(
            self.document_id,
            session_id=None,
            current_user=SimpleNamespace(id=self.user_id),
        )
        self.assertEqual([item.id for item in response], [str(latest_issue["_id"])])

        historical_response = await verification_router.get_verification_issues(
            self.document_id,
            session_id=str(old_session["_id"]),
            current_user=SimpleNamespace(id=self.user_id),
        )
        self.assertEqual(
            [item.id for item in historical_response],
            [str(old_issue["_id"])],
        )

        with self.assertRaises(verification_service.VerificationStateError):
            await verification_service.resolve_issues(
                self.document_id,
                self.user_id,
                [{"issue_id": str(old_issue["_id"]), "action": "accepted"}],
                expected_session_id=str(old_session["_id"]),
            )

        resolved = await verification_service.resolve_issues(
            self.document_id,
            self.user_id,
            [
                {"issue_id": str(old_issue["_id"]), "action": "accepted"},
                {"issue_id": str(latest_issue["_id"]), "action": "accepted"},
            ],
            expected_session_id=str(latest_session["_id"]),
        )
        self.assertEqual(resolved, 1)
        old_stored = await self.db["verification_issues"].find_one({"_id": old_issue["_id"]})
        latest_stored = await self.db["verification_issues"].find_one({"_id": latest_issue["_id"]})
        self.assertEqual(old_stored["resolution"], "pending")
        self.assertEqual(latest_stored["resolution"], "accepted")

    async def test_apply_is_idempotent_and_does_not_replace_second_occurrence(self):
        await self._insert_document("X X")
        session = completed_session(
            self.document_id,
            self.user_id,
            datetime.now(timezone.utc),
        )
        await self.db["verification_sessions"].insert_one(session)
        issue = issue_doc(
            str(session["_id"]),
            self.document_id,
            self.user_id,
            resolution="accepted",
        )
        await self.db["verification_issues"].insert_one(issue)

        async def assert_document_is_locked(*_args, **_kwargs):
            document = await self.db["documents"].find_one(
                {"_id": ObjectId(self.document_id)}
            )
            self.assertEqual(document["status"], "indexing")
            self.assertIn("document_mutation_token", document)

        reindex = AsyncMock(side_effect=assert_document_is_locked)
        with patch.object(verification_service, "add_document_chunks", reindex):
            first = await verification_service.apply_accepted_fixes(
                self.document_id,
                self.user_id,
            )
            second = await verification_service.apply_accepted_fixes(
                self.document_id,
                self.user_id,
            )

        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id}
        )
        stored_issue = await self.db["verification_issues"].find_one({"_id": issue["_id"]})
        self.assertEqual(content["extracted_text"], "Y X")
        self.assertEqual(first, {"applied_count": 1, "reindexed": True})
        self.assertEqual(second, {"applied_count": 0, "reindexed": False})
        self.assertIsNotNone(stored_issue["applied_at"])
        self.assertEqual(reindex.await_count, 1)
        document = await self.db["documents"].find_one(
            {"_id": ObjectId(self.document_id)}
        )
        self.assertEqual(document["status"], "indexed")
        self.assertNotIn("document_mutation_token", document)

    async def test_reindex_failure_marks_index_failed_and_retry_does_not_reapply(self):
        await self._insert_document("X X")
        session = completed_session(
            self.document_id,
            self.user_id,
            datetime.now(timezone.utc),
        )
        await self.db["verification_sessions"].insert_one(session)
        issue = issue_doc(
            str(session["_id"]),
            self.document_id,
            self.user_id,
            resolution="accepted",
        )
        await self.db["verification_issues"].insert_one(issue)

        with (
            patch.object(
                verification_service,
                "add_document_chunks",
                AsyncMock(side_effect=RuntimeError("index unavailable")),
            ),
            self.assertLogs(verification_service.logger, level="ERROR"),
        ):
            failed = await verification_service.apply_accepted_fixes(
                self.document_id,
                self.user_id,
            )

        document = await self.db["documents"].find_one({"_id": ObjectId(self.document_id)})
        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id}
        )
        self.assertEqual(failed["applied_count"], 1)
        self.assertFalse(failed["reindexed"])
        self.assertEqual(document["status"], "index_failed")
        self.assertNotIn("document_mutation_token", document)
        self.assertTrue(content["verification_reindex_pending"])
        self.assertEqual(content["extracted_text"], "Y X")

        with patch.object(
            verification_service,
            "add_document_chunks",
            AsyncMock(),
        ):
            retried = await verification_service.apply_accepted_fixes(
                self.document_id,
                self.user_id,
            )

        document = await self.db["documents"].find_one({"_id": ObjectId(self.document_id)})
        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id}
        )
        self.assertEqual(retried, {"applied_count": 0, "reindexed": True})
        self.assertEqual(document["status"], "indexed")
        self.assertFalse(content["verification_reindex_pending"])
        self.assertEqual(content["extracted_text"], "Y X")

    async def test_apply_rejects_drifted_original_text(self):
        await self._insert_document("Nội dung đã thay đổi")
        session = completed_session(
            self.document_id,
            self.user_id,
            datetime.now(timezone.utc),
            content="Nội dung đã thay đổi",
        )
        await self.db["verification_sessions"].insert_one(session)
        issue = issue_doc(
            str(session["_id"]),
            self.document_id,
            self.user_id,
            original="Đoạn cũ",
            replacement="Đoạn mới",
            resolution="accepted",
        )
        await self.db["verification_issues"].insert_one(issue)

        with (
            self.assertRaises(verification_service.VerificationStateError),
            self.assertLogs(verification_service.logger, level="WARNING"),
        ):
            await verification_service.apply_accepted_fixes(
                self.document_id,
                self.user_id,
            )

        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id}
        )
        self.assertEqual(content["extracted_text"], "Nội dung đã thay đổi")

    async def test_content_revision_blocks_resolve_and_apply_after_force_change(self):
        await self._insert_document("X X")
        _session, issue = await self._insert_completed_issue(
            content="X X",
            resolution="accepted",
        )
        changed_at = datetime.now(timezone.utc) + timedelta(seconds=1)
        await self.db["document_contents"].update_one(
            {"document_id": self.document_id, "user_id": self.user_id},
            {
                "$set": {
                    "extracted_text": "X X đã được trích xuất lại",
                    "updated_at": changed_at,
                }
            },
        )

        with self.assertRaises(verification_service.VerificationStateError):
            await verification_service.resolve_issues(
                self.document_id,
                self.user_id,
                [{"issue_id": str(issue["_id"]), "action": "rejected"}],
            )
        with self.assertRaises(verification_service.VerificationStateError):
            await verification_service.apply_accepted_fixes(
                self.document_id,
                self.user_id,
            )

        stored_issue = await self.db["verification_issues"].find_one(
            {"_id": issue["_id"]}
        )
        self.assertEqual(stored_issue["resolution"], "accepted")
        document = await self.db["documents"].find_one(
            {"_id": ObjectId(self.document_id)}
        )
        self.assertEqual(document["status"], "indexed")
        self.assertNotIn("document_mutation_token", document)

    async def test_manual_index_stale_snapshot_cannot_overwrite_apply(self):
        await self._insert_document("X X")
        await self._insert_completed_issue(content="X X", resolution="accepted")
        manual_read = asyncio.Event()
        continue_manual = asyncio.Event()
        apply_indexing = asyncio.Event()
        release_apply = asyncio.Event()
        original_get_owned = documents_router.get_owned_document

        async def stale_manual_read(*args, **kwargs):
            stale_document = await original_get_owned(*args, **kwargs)
            manual_read.set()
            await continue_manual.wait()
            return stale_document

        async def pause_apply_index(*_args, **_kwargs):
            apply_indexing.set()
            await release_apply.wait()

        manual_index = AsyncMock()
        with (
            patch.object(
                documents_router,
                "get_owned_document",
                side_effect=stale_manual_read,
            ),
            patch.object(
                verification_service,
                "add_document_chunks",
                AsyncMock(side_effect=pause_apply_index),
            ),
            patch.object(
                documents_router,
                "add_document_chunks",
                manual_index,
            ),
        ):
            manual_task = asyncio.create_task(
                documents_router.index_document_api(
                    self.document_id,
                    force=True,
                    current_user=SimpleNamespace(id=self.user_id),
                )
            )
            await asyncio.wait_for(manual_read.wait(), 5)
            apply_task = asyncio.create_task(
                verification_service.apply_accepted_fixes(
                    self.document_id,
                    self.user_id,
                )
            )
            await asyncio.wait_for(apply_indexing.wait(), 5)
            continue_manual.set()
            try:
                with self.assertRaises(HTTPException) as raised:
                    await asyncio.wait_for(manual_task, 5)
                self.assertEqual(raised.exception.status_code, 409)
            finally:
                release_apply.set()
            applied = await asyncio.wait_for(apply_task, 5)

        self.assertEqual(applied, {"applied_count": 1, "reindexed": True})
        manual_index.assert_not_awaited()
        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id}
        )
        self.assertEqual(content["extracted_text"], "Y X")
        document = await self.db["documents"].find_one(
            {"_id": ObjectId(self.document_id)}
        )
        self.assertEqual(document["status"], "indexed")

    async def test_force_extract_stale_snapshot_cannot_replace_apply_content(self):
        await self._insert_document("X X")
        await self._insert_completed_issue(content="X X", resolution="accepted")
        extract_read = asyncio.Event()
        continue_extract = asyncio.Event()
        apply_indexing = asyncio.Event()
        release_apply = asyncio.Event()
        original_get_owned = documents_router.get_owned_document

        async def stale_extract_read(*args, **kwargs):
            stale_document = await original_get_owned(*args, **kwargs)
            extract_read.set()
            await continue_extract.wait()
            return stale_document

        async def pause_apply_index(*_args, **_kwargs):
            apply_indexing.set()
            await release_apply.wait()

        download = AsyncMock()
        with (
            patch.object(
                documents_router,
                "get_owned_document",
                side_effect=stale_extract_read,
            ),
            patch.object(
                verification_service,
                "add_document_chunks",
                AsyncMock(side_effect=pause_apply_index),
            ),
            patch.object(
                documents_router,
                "download_document_to_tempfile",
                download,
            ),
        ):
            extract_task = asyncio.create_task(
                documents_router.extract_document_content(
                    self.document_id,
                    force=True,
                    current_user=SimpleNamespace(id=self.user_id),
                )
            )
            await asyncio.wait_for(extract_read.wait(), 5)
            apply_task = asyncio.create_task(
                verification_service.apply_accepted_fixes(
                    self.document_id,
                    self.user_id,
                )
            )
            await asyncio.wait_for(apply_indexing.wait(), 5)
            continue_extract.set()
            try:
                with self.assertRaises(HTTPException) as raised:
                    await asyncio.wait_for(extract_task, 5)
                self.assertEqual(raised.exception.status_code, 409)
            finally:
                release_apply.set()
            applied = await asyncio.wait_for(apply_task, 5)

        self.assertTrue(applied["reindexed"])
        download.assert_not_awaited()
        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id}
        )
        self.assertEqual(content["extracted_text"], "Y X")

    async def test_resolve_stale_snapshot_cannot_change_issue_during_apply(self):
        await self._insert_document("X X")
        _session, issue = await self._insert_completed_issue(
            content="X X",
            resolution="accepted",
        )
        resolve_ready = asyncio.Event()
        continue_resolve = asyncio.Event()
        apply_indexing = asyncio.Event()
        release_apply = asyncio.Event()
        original_acquire = verification_service.acquire_document_mutation_lock

        async def controlled_acquire(*args, **kwargs):
            if kwargs.get("operation") == "verification_resolve":
                resolve_ready.set()
                await continue_resolve.wait()
            return await original_acquire(*args, **kwargs)

        async def pause_apply_index(*_args, **_kwargs):
            apply_indexing.set()
            await release_apply.wait()

        with (
            patch.object(
                verification_service,
                "acquire_document_mutation_lock",
                side_effect=controlled_acquire,
            ),
            patch.object(
                verification_service,
                "add_document_chunks",
                AsyncMock(side_effect=pause_apply_index),
            ),
        ):
            resolve_task = asyncio.create_task(
                verification_service.resolve_issues(
                    self.document_id,
                    self.user_id,
                    [{"issue_id": str(issue["_id"]), "action": "rejected"}],
                )
            )
            await asyncio.wait_for(resolve_ready.wait(), 5)
            apply_task = asyncio.create_task(
                verification_service.apply_accepted_fixes(
                    self.document_id,
                    self.user_id,
                )
            )
            await asyncio.wait_for(apply_indexing.wait(), 5)
            continue_resolve.set()
            try:
                with self.assertRaises(verification_service.VerificationStateError):
                    await asyncio.wait_for(resolve_task, 5)
            finally:
                release_apply.set()
            applied = await asyncio.wait_for(apply_task, 5)

        self.assertTrue(applied["reindexed"])
        stored_issue = await self.db["verification_issues"].find_one(
            {"_id": issue["_id"]}
        )
        self.assertEqual(stored_issue["resolution"], "accepted")
        self.assertIsNotNone(stored_issue["applied_at"])
        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id}
        )
        self.assertEqual(content["extracted_text"], "Y X")

    async def test_delete_stale_snapshot_cannot_remove_document_during_apply(self):
        await self._insert_document("X X")
        await self._insert_completed_issue(content="X X", resolution="accepted")
        delete_read = asyncio.Event()
        continue_delete = asyncio.Event()
        apply_indexing = asyncio.Event()
        release_apply = asyncio.Event()
        original_get_owned = documents_router.get_owned_document

        async def stale_delete_read(*args, **kwargs):
            stale_document = await original_get_owned(*args, **kwargs)
            delete_read.set()
            await continue_delete.wait()
            return stale_document

        async def pause_after_writing_chunks(document_id, user_id, chunks):
            await self.db["document_chunks"].delete_many(
                {"document_id": document_id, "user_id": user_id}
            )
            await self.db["document_chunks"].insert_one(
                {
                    "document_id": document_id,
                    "user_id": user_id,
                    "chunk_index": 0,
                    "content": chunks[0],
                }
            )
            apply_indexing.set()
            await release_apply.wait()

        with (
            patch.object(
                documents_router,
                "get_owned_document",
                side_effect=stale_delete_read,
            ),
            patch.object(
                verification_service,
                "add_document_chunks",
                AsyncMock(side_effect=pause_after_writing_chunks),
            ),
        ):
            delete_task = asyncio.create_task(
                documents_router.delete_document(
                    self.document_id,
                    current_user=SimpleNamespace(id=self.user_id),
                )
            )
            await asyncio.wait_for(delete_read.wait(), 5)
            apply_task = asyncio.create_task(
                verification_service.apply_accepted_fixes(
                    self.document_id,
                    self.user_id,
                )
            )
            await asyncio.wait_for(apply_indexing.wait(), 5)
            continue_delete.set()
            try:
                with self.assertRaises(HTTPException) as raised:
                    await asyncio.wait_for(delete_task, 5)
                self.assertEqual(raised.exception.status_code, 409)
            finally:
                release_apply.set()
            applied = await asyncio.wait_for(apply_task, 5)

        self.assertTrue(applied["reindexed"])
        self.assertIsNotNone(
            await self.db["documents"].find_one(
                {"_id": ObjectId(self.document_id)}
            )
        )
        self.assertEqual(
            await self.db["document_chunks"].count_documents(
                {"document_id": self.document_id, "user_id": self.user_id}
            ),
            1,
        )

    async def test_concurrent_transcribe_requests_schedule_only_one_owner(self):
        await self._insert_document("", status="uploaded")
        await self._mark_document_as_video()
        both_read = asyncio.Event()
        release_reads = asyncio.Event()
        read_count = 0
        original_get_owned = documents_router.get_owned_document

        async def stale_read_barrier(*args, **kwargs):
            nonlocal read_count
            stale_document = await original_get_owned(*args, **kwargs)
            read_count += 1
            if read_count == 2:
                both_read.set()
            await release_reads.wait()
            return stale_document

        first_background = BackgroundTasks()
        second_background = BackgroundTasks()
        with (
            patch.object(
                documents_router,
                "get_owned_document",
                side_effect=stale_read_barrier,
            ),
            patch.object(
                documents_router.settings,
                "GROQ_API_KEY",
                "configured-for-test",
            ),
        ):
            first = asyncio.create_task(
                documents_router.transcribe_video_api(
                    self.document_id,
                    background_tasks=first_background,
                    current_user=SimpleNamespace(id=self.user_id),
                )
            )
            second = asyncio.create_task(
                documents_router.transcribe_video_api(
                    self.document_id,
                    background_tasks=second_background,
                    current_user=SimpleNamespace(id=self.user_id),
                )
            )
            await asyncio.wait_for(both_read.wait(), 5)
            release_reads.set()
            results = await asyncio.wait_for(
                asyncio.gather(first, second),
                5,
            )

        self.assertEqual([item["status"] for item in results], ["transcribing"] * 2)
        self.assertEqual(
            len(first_background.tasks) + len(second_background.tasks),
            1,
        )
        document = await self.db["documents"].find_one(
            {"_id": ObjectId(self.document_id)}
        )
        self.assertEqual(document["status"], "transcribing")
        self.assertEqual(document["document_mutation_operation"], "transcription")
        self.assertIn("document_mutation_token", document)

    async def test_stale_transcription_task_cannot_overwrite_manual_index(self):
        current_text = "Nội dung transcript hiện hành."
        await self._insert_document(current_text, status="processed")
        stale_document, token = await self._claim_test_transcription_lock()
        download_started = asyncio.Event()
        release_download = asyncio.Event()

        async def pause_download(*_args, **_kwargs):
            download_started.set()
            await release_download.wait()

        with (
            patch.object(
                documents_router,
                "download_document_to_tempfile",
                AsyncMock(side_effect=pause_download),
            ),
            patch.object(
                documents_router,
                "transcribe_video",
                return_value="Transcript cũ không được ghi.",
            ),
            patch.object(
                documents_router,
                "add_document_chunks",
                AsyncMock(),
            ),
        ):
            stale_task = asyncio.create_task(
                documents_router.run_video_transcription_task(
                    stale_document,
                    self.user_id,
                    token,
                )
            )
            await asyncio.wait_for(download_started.wait(), 5)
            released = await documents_router.finalize_document_mutation(
                self.db,
                self.document_id,
                self.user_id,
                token,
                final_status="processed",
                error_message=None,
                required_status="transcribing",
            )
            self.assertTrue(released)
            try:
                indexed = await documents_router.index_document_api(
                    self.document_id,
                    force=True,
                    current_user=SimpleNamespace(id=self.user_id),
                )
            finally:
                release_download.set()
            await asyncio.wait_for(stale_task, 5)

        self.assertEqual(indexed["status"], "indexed")
        content = await self.db["document_contents"].find_one(
            {"document_id": self.document_id, "user_id": self.user_id}
        )
        self.assertEqual(content["extracted_text"], current_text)
        document = await self.db["documents"].find_one(
            {"_id": ObjectId(self.document_id)}
        )
        self.assertEqual(document["status"], "indexed")
        self.assertNotIn("document_mutation_token", document)

    async def test_stale_transcription_task_cannot_recreate_deleted_content(self):
        await self._insert_document("Transcript hiện hành.", status="processed")
        stale_document, token = await self._claim_test_transcription_lock()
        download_started = asyncio.Event()
        release_download = asyncio.Event()

        async def pause_download(*_args, **_kwargs):
            download_started.set()
            await release_download.wait()

        with (
            patch.object(
                documents_router,
                "download_document_to_tempfile",
                AsyncMock(side_effect=pause_download),
            ),
            patch.object(
                documents_router,
                "transcribe_video",
                return_value="Transcript cũ không được tái tạo.",
            ),
            patch(
                "app.services.rag_service.init_chroma_client",
                return_value=object(),
            ),
            patch("app.services.rag_service._delete_document_vectors"),
        ):
            stale_task = asyncio.create_task(
                documents_router.run_video_transcription_task(
                    stale_document,
                    self.user_id,
                    token,
                )
            )
            await asyncio.wait_for(download_started.wait(), 5)
            released = await documents_router.finalize_document_mutation(
                self.db,
                self.document_id,
                self.user_id,
                token,
                final_status="processed",
                error_message=None,
                required_status="transcribing",
            )
            self.assertTrue(released)
            try:
                deleted = await documents_router.delete_document(
                    self.document_id,
                    current_user=SimpleNamespace(id=self.user_id),
                )
            finally:
                release_download.set()
            await asyncio.wait_for(stale_task, 5)

        self.assertEqual(deleted["status"], "deleted")
        # Document is soft-deleted (row persists with deleted_at set)
        deleted_doc = await self.db["documents"].find_one(
            {"_id": ObjectId(self.document_id)}
        )
        self.assertIsNotNone(deleted_doc)
        self.assertIsNotNone(deleted_doc["deleted_at"])
        # document_contents is hard-deleted
        self.assertIsNone(
            await self.db["document_contents"].find_one(
                {"document_id": self.document_id, "user_id": self.user_id}
            )
        )

    async def test_delete_document_cleans_verification_records(self):
        await self._insert_document()
        session = completed_session(
            self.document_id,
            self.user_id,
            datetime.now(timezone.utc),
        )
        issue = issue_doc(
            str(session["_id"]),
            self.document_id,
            self.user_id,
        )
        await self.db["verification_sessions"].insert_one(session)
        await self.db["verification_issues"].insert_one(issue)

        with (
            patch(
                "app.services.rag_service.init_chroma_client",
                return_value=object(),
            ),
            patch("app.services.rag_service._delete_document_vectors"),
        ):
            response = await documents_router.delete_document(
                self.document_id,
                current_user=SimpleNamespace(id=self.user_id),
            )

        self.assertEqual(response["status"], "deleted")
        self.assertEqual(
            await self.db["verification_sessions"].count_documents(
                {"document_id": self.document_id}
            ),
            0,
        )
        self.assertEqual(
            await self.db["verification_issues"].count_documents(
                {"document_id": self.document_id}
            ),
            0,
        )
        # Document is soft-deleted (row persists with deleted_at set)
        deleted_doc = await self.db["documents"].find_one({"_id": ObjectId(self.document_id)})
        self.assertIsNotNone(deleted_doc)
        self.assertIsNotNone(deleted_doc["deleted_at"])

    async def test_question_generation_is_blocked_during_reindex(self):
        await self._insert_document(status="indexing")
        with self.assertRaises(HTTPException) as raised:
            await questions_router.generate_questions_api(
                QuestionGenerateRequest(document_id=self.document_id),
                current_user=SimpleNamespace(id=self.user_id),
            )
        self.assertEqual(raised.exception.status_code, 409)

        with self.assertRaises(HTTPException) as search_raised:
            await documents_router.search_document_chunks(
                self.document_id,
                documents_router.SearchRequest(query="nội dung"),
                current_user=SimpleNamespace(id=self.user_id),
            )
        self.assertEqual(search_raised.exception.status_code, 409)

    def test_edited_resolution_requires_non_blank_text(self):
        with self.assertRaises(ValidationError):
            IssueResolution(
                issue_id=str(ObjectId()),
                action="edited",
                edited_text="  ",
            )

    def test_occurrence_mapping_uses_chunk_hint(self):
        text = "X " + ("a" * 1800) + " X"
        target_chunk_index = next(
            index
            for index, chunk in reversed(
                list(enumerate(verification_service.split_text_into_chunks(text)))
            )
            if "X" in chunk
        )
        issue = {
            "_id": ObjectId(),
            "chunk_index": target_chunk_index,
            "original_text": "X",
            "suggested_fix": "Y",
            "resolution": "accepted",
        }
        replacements = verification_service._plan_issue_replacements(text, [issue])
        self.assertEqual(len(replacements), 1)
        self.assertGreater(replacements[0][0], len(text) // 2)

    def test_llm_issue_validation_keeps_global_index_and_drops_fake_source(self):
        issue = {
            "chunk_index": 5,
            "issue_type": "factual_error",
            "severity": "high",
            "original_text": "Nước sôi ở 90°C",
            "suggested_fix": "Nước sôi ở 100°C",
            "reason": "Sai nhiệt độ sôi ở áp suất tiêu chuẩn.",
            "confidence": 0.9,
            "source_reference": "https://invented.example/source",
        }
        normalized = verification_service._normalize_primary_issues(
            [issue],
            ["Nước sôi ở 90°C tại áp suất tiêu chuẩn."],
            5,
            "gemini",
        )
        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]["chunk_index"], 5)
        self.assertIsNone(normalized[0]["source_reference"])
        self.assertFalse(normalized[0]["external_verified"])
        adjacent_duplicate = {**normalized[0], "chunk_index": 6}
        distant_occurrence = {**normalized[0], "chunk_index": 9}
        self.assertEqual(
            len(
                verification_service._deduplicate_issues(
                    [normalized[0], adjacent_duplicate]
                )
            ),
            1,
        )
        self.assertEqual(
            len(
                verification_service._deduplicate_issues(
                    [normalized[0], distant_occurrence]
                )
            ),
            2,
        )

        issue["original_text"] = "Câu không hề có trong đoạn"
        self.assertEqual(
            verification_service._normalize_primary_issues(
                [issue],
                ["Nước sôi ở 90°C tại áp suất tiêu chuẩn."],
                5,
                "gemini",
            ),
            [],
        )

        issue["original_text"] = "Nước sôi ở 90°C"
        issue["chunk_index"] = 99
        self.assertEqual(
            verification_service._normalize_primary_issues(
                [issue],
                ["Nước sôi ở 90°C tại áp suất tiêu chuẩn."],
                5,
                "gemini",
            ),
            [],
        )

        with self.assertRaises(ValueError):
            verification_service._parse_issues_response("not-json")
        with self.assertRaises(ValueError):
            verification_service._parse_issues_response('{"issues": null}')

    async def test_malformed_provider_issues_fall_back_to_other_provider(self):
        valid_primary = json.dumps(
            {
                "issues": [
                    {
                        "chunk_index": 0,
                        "issue_type": "ocr_error",
                        "severity": "medium",
                        "original_text": "X",
                        "suggested_fix": "Y",
                        "reason": "Ký tự nhận dạng sai.",
                        "confidence": 0.9,
                        "source_reference": None,
                    }
                ]
            }
        )
        valid_cross_check = json.dumps(
            {
                "verifications": [
                    {
                        "index": 0,
                        "verdict": "confirmed",
                        "confidence": 0.95,
                        "reason": "Đúng.",
                    }
                ]
            }
        )

        for malformed in ('{"issues": [{}]}', '{"issues": [null]}'):
            with self.subTest(malformed=malformed):
                with (
                    patch.object(
                        verification_service,
                        "is_gemini_available",
                        return_value=True,
                    ),
                    patch.object(
                        verification_service,
                        "is_groq_available",
                        return_value=True,
                    ),
                    patch.object(
                        verification_service,
                        "gemini_generate_json",
                        side_effect=[malformed, valid_cross_check],
                    ) as gemini,
                    patch.object(
                        verification_service,
                        "generate_json",
                        return_value=valid_primary,
                    ) as groq,
                ):
                    issues = await verification_service.verify_batch(
                        ["X trong nội dung."],
                        start_index=0,
                        batch_index=0,
                    )

                self.assertEqual(len(issues), 1)
                self.assertEqual(issues[0]["suggested_fix"], "Y")
                self.assertEqual(issues[0]["ai_provider"], "both")
                self.assertEqual(gemini.call_count, 2)
                groq.assert_called_once()

    async def test_legitimate_empty_provider_result_is_successful(self):
        with (
            patch.object(
                verification_service,
                "is_gemini_available",
                return_value=True,
            ),
            patch.object(
                verification_service,
                "is_groq_available",
                return_value=False,
            ),
            patch.object(
                verification_service,
                "gemini_generate_json",
                return_value='{"issues": []}',
            ),
        ):
            issues = await verification_service.verify_batch(
                ["Nội dung hợp lệ."],
                start_index=0,
                batch_index=0,
            )
        self.assertEqual(issues, [])


if __name__ == "__main__":
    unittest.main()
