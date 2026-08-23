import io
import hashlib
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import BackgroundTasks, HTTPException, UploadFile
from mongomock_motor import AsyncMongoMockClient

from app.routers import documents as documents_router
from app.schemas.auth import UserResponse


def _actor(role: str, user_id: str | None = None) -> UserResponse:
    return UserResponse(
        id=user_id or str(ObjectId()),
        email=f"{role}-{ObjectId()}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


def _upload(content: bytes, filename: str) -> UploadFile:
    return UploadFile(file=io.BytesIO(content), filename=filename)


class StudentReviewDocumentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_student_review_documents"]
        self.student = _actor("student")
        self.patches = [
            patch("app.routers.documents.get_database", return_value=self.db),
            patch("app.services.system_settings_service.get_database", return_value=self.db),
            patch(
                "app.routers.documents.upload_file_to_cloudinary",
                return_value={
                    "secure_url": "https://res.cloudinary.com/test/uploaded",
                    "public_id": "documents/uploaded",
                    "resource_type": "raw",
                },
            ),
            patch(
                "app.routers.documents.extract_and_store_document_content",
                new_callable=AsyncMock,
                return_value={"text_length": 12},
            ),
            patch("app.routers.documents.enforce_ai_quota", new_callable=AsyncMock),
            patch("app.routers.documents.record_activity", new_callable=AsyncMock),
            patch("app.routers.documents.require_feature_enabled_flag", new_callable=AsyncMock),
        ]
        for active_patch in self.patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)

    async def _seed_document(
        self,
        *,
        owner_id: str,
        media_kind: str = "document",
        status: str = "processed",
    ) -> ObjectId:
        now = datetime.now(timezone.utc)
        document_id = ObjectId()
        await self.db["documents"].insert_one(
            {
                "_id": document_id,
                "user_id": owner_id,
                "original_filename": "lesson.mp4" if media_kind == "video" else "lesson.pdf",
                "file_type": "mp4" if media_kind == "video" else "pdf",
                "file_size": 12,
                "cloudinary_url": "https://res.cloudinary.com/test/uploaded",
                "cloudinary_public_id": "documents/uploaded",
                "cloudinary_resource_type": "video" if media_kind == "video" else "raw",
                "media_kind": media_kind,
                "status": status,
                "error_message": None,
                "checksum": "checksum",
                "reuse_count": 0,
                "version": 1,
                "created_by": owner_id,
                "updated_by": owner_id,
                "deleted_at": None,
                "created_at": now,
                "updated_at": now,
            }
        )
        return document_id

    async def test_student_can_upload_pdf(self):
        response = await documents_router.upload_document(
            file=_upload(b"%PDF-1.4 student review", "lesson.pdf"),
            current_user=self.student,
            request=None,
        )

        self.assertEqual(response.user_id, self.student.id)
        self.assertEqual(response.file_type, "pdf")
        self.assertEqual(response.media_kind, "document")

    async def test_legacy_user_can_upload_pdf(self):
        user = _actor("user")

        response = await documents_router.upload_document(
            file=_upload(b"%PDF-1.4 legacy user", "lesson.pdf"),
            current_user=user,
            request=None,
        )

        self.assertEqual(response.user_id, user.id)

    async def test_student_and_user_cannot_upload_mp4(self):
        for role in ("student", "user"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as raised:
                await documents_router.upload_document(
                    file=_upload(b"video", "lesson.mp4"),
                    current_user=_actor(role),
                    request=None,
                )
            self.assertEqual(raised.exception.status_code, 400)

    async def test_student_cannot_extract_another_owners_document(self):
        document_id = await self._seed_document(owner_id=_actor("lecturer").id)

        with self.assertRaises(HTTPException) as raised:
            await documents_router.extract_document_content(
                str(document_id),
                force=False,
                current_user=self.student,
                request=None,
            )

        self.assertEqual(raised.exception.status_code, 404)

    async def test_non_owner_index_and_delete_return_404(self):
        document_id = await self._seed_document(owner_id=_actor("lecturer").id)

        for operation in (
            lambda: documents_router.index_document_api(
                str(document_id), force=False, current_user=self.student, request=None
            ),
            lambda: documents_router.delete_document(
                str(document_id), payload=None, request=None, current_user=self.student
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await operation()
            self.assertEqual(raised.exception.status_code, 404)

    async def test_student_formats_are_only_pdf_docx_and_pptx(self):
        for extension in ("pdf", "docx", "pptx"):
            with self.subTest(extension=extension):
                response = await documents_router.upload_document(
                    file=_upload(f"{extension}-content".encode(), f"lesson.{extension}"),
                    current_user=self.student,
                    request=None,
                )
                self.assertEqual(response.file_type, extension)

        for extension in ("txt", "mp4", "mov"):
            with self.subTest(extension=extension), self.assertRaises(HTTPException) as raised:
                await documents_router.upload_document(
                    file=_upload(b"not allowed", f"lesson.{extension}"),
                    current_user=self.student,
                    request=None,
                )
            self.assertEqual(raised.exception.status_code, 400)

    async def test_student_size_limit_is_20_mb(self):
        exact_limit = 20 * 1024 * 1024
        response = await documents_router.upload_document(
            file=_upload(b"x" * exact_limit, "at-limit.pdf"),
            current_user=self.student,
            request=None,
        )
        self.assertEqual(response.file_size, exact_limit)

        with self.assertRaises(HTTPException) as raised:
            await documents_router.upload_document(
                file=_upload(b"x" * (exact_limit + 1), "over-limit.pdf"),
                current_user=self.student,
                request=None,
            )
        self.assertEqual(raised.exception.status_code, 400)

    async def test_lecturer_and_admin_allowed_formats_remain_unchanged(self):
        for role in ("lecturer", "admin"):
            actor = _actor(role)
            for extension in sorted(documents_router.ALLOWED_EXTENSIONS):
                with self.subTest(role=role, extension=extension):
                    response = await documents_router.upload_document(
                        file=_upload(
                            f"{role}-{extension}".encode(),
                            f"lesson.{extension}",
                        ),
                        current_user=actor,
                        request=None,
                    )
                    self.assertEqual(response.file_type, extension)

    async def test_student_can_extract_index_check_status_and_delete_owned_document(self):
        document_id = await self._seed_document(owner_id=self.student.id)
        other_user = _actor("student")
        await self.db["document_contents"].insert_one(
            {
                "document_id": str(document_id),
                "user_id": other_user.id,
                "extracted_text": "foreign content must remain isolated",
                "text_length": 36,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        )
        await self.db["document_contents"].insert_one(
            {
                "document_id": str(document_id),
                "user_id": self.student.id,
                "extracted_text": "A complete sentence for student review indexing.",
                "text_length": 48,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        )
        question_set_id = ObjectId()
        attempt_id = ObjectId()
        await self.db["question_sets"].insert_one(
            {
                "_id": question_set_id,
                "document_id": str(document_id),
                "user_id": self.student.id,
                "purpose": "student_review",
            }
        )
        await self.db["question_attempts"].insert_one(
            {
                "_id": attempt_id,
                "question_set_id": str(question_set_id),
                "document_id": str(document_id),
                "user_id": self.student.id,
                "status": "completed",
            }
        )

        extracted = await documents_router.extract_document_content(
            str(document_id), force=False, current_user=self.student, request=None
        )
        self.assertEqual(extracted.status, "processed")
        self.assertEqual(extracted.text_length, 48)

        with patch("app.routers.documents.add_document_chunks", new_callable=AsyncMock):
            indexed = await documents_router.index_document_api(
                str(document_id), force=False, current_user=self.student, request=None
            )
        self.assertEqual(indexed["status"], "indexed")
        owner_content = await self.db["document_contents"].find_one(
            {"document_id": str(document_id), "user_id": self.student.id}
        )
        foreign_content = await self.db["document_contents"].find_one(
            {"document_id": str(document_id), "user_id": other_user.id}
        )
        self.assertIn("verification_reindexed_at", owner_content)
        self.assertNotIn("verification_reindexed_at", foreign_content)

        await self.db["document_chunks"].insert_many(
            [
                {"document_id": str(document_id), "user_id": self.student.id, "chunk_index": index}
                for index in range(2)
            ]
            + [
                {"document_id": str(document_id), "user_id": other_user.id, "chunk_index": index}
                for index in range(3)
            ]
        )
        indexed_again = await documents_router.index_document_api(
            str(document_id), force=False, current_user=self.student, request=None
        )
        self.assertEqual(indexed_again["chunk_count"], 2)

        status_response = await documents_router.get_document(
            str(document_id), current_user=self.student
        )
        self.assertEqual(status_response.status, "indexed")

        with patch("app.routers.documents.enqueue_cloudinary_cleanup", new_callable=AsyncMock):
            deleted = await documents_router.delete_document(
                str(document_id), payload=None, request=None, current_user=self.student
            )
        self.assertEqual(deleted["status"], "deleted")
        self.assertEqual(
            await self.db["question_sets"].count_documents({"document_id": str(document_id)}),
            1,
        )
        retained_attempt = await self.db["question_attempts"].find_one({"_id": attempt_id})
        self.assertEqual(retained_attempt["question_set_id"], str(question_set_id))
        self.assertEqual(
            await self.db["document_contents"].count_documents(
                {"document_id": str(document_id), "user_id": self.student.id}
            ),
            0,
        )
        self.assertEqual(
            await self.db["document_contents"].count_documents(
                {"document_id": str(document_id), "user_id": other_user.id}
            ),
            1,
        )
        self.assertEqual(
            await self.db["document_chunks"].count_documents(
                {"document_id": str(document_id), "user_id": self.student.id}
            ),
            0,
        )
        self.assertEqual(
            await self.db["document_chunks"].count_documents(
                {"document_id": str(document_id), "user_id": other_user.id}
            ),
            3,
        )

    async def test_content_read_ignores_foreign_derived_row_with_same_document_id(self):
        document_id = await self._seed_document(owner_id=self.student.id)
        await self.db.document_contents.insert_many([
            {
                "document_id": str(document_id),
                "user_id": "foreign-user",
                "extracted_text": "PRIVATE FOREIGN CONTENT",
                "text_length": 23,
            },
            {
                "document_id": str(document_id),
                "user_id": self.student.id,
                "extracted_text": "owned content",
                "text_length": 13,
            },
        ])

        response = await documents_router.get_document_content(
            str(document_id), full_text=True, current_user=self.student
        )

        self.assertEqual(response.extracted_text, "owned content")
        self.assertNotIn("PRIVATE", response.extracted_text)

    async def test_chunk_read_ignores_foreign_rows_with_same_document_id(self):
        document_id = await self._seed_document(owner_id=self.student.id)
        await self.db.document_chunks.insert_many([
            {
                "document_id": str(document_id),
                "user_id": "foreign-user",
                "chunk_index": 0,
                "content": "PRIVATE FOREIGN CHUNK",
            },
            {
                "document_id": str(document_id),
                "user_id": self.student.id,
                "chunk_index": 0,
                "content": "owned chunk",
            },
        ])

        response = await documents_router.get_document_chunks(
            str(document_id), current_user=self.student
        )

        self.assertEqual([item.content for item in response], ["owned chunk"])

    async def test_upload_dedup_uses_only_owner_content_metadata(self):
        content = b"same uploaded bytes"
        document_id = await self._seed_document(owner_id=self.student.id)
        await self.db.documents.update_one(
            {"_id": document_id},
            {"$set": {"checksum": hashlib.sha256(content).hexdigest()}},
        )
        await self.db.document_contents.insert_many([
            {
                "document_id": str(document_id),
                "user_id": "foreign-user",
                "extracted_text": "PRIVATE FOREIGN CONTENT",
                "text_length": 999,
            },
            {
                "document_id": str(document_id),
                "user_id": self.student.id,
                "extracted_text": "owned content",
                "text_length": 13,
            },
        ])

        response = await documents_router.upload_document(
            file=_upload(content, "lesson.pdf"), current_user=self.student, request=None
        )

        self.assertTrue(response.reused)
        self.assertEqual(response.text_length, 13)

    async def test_transcript_read_ignores_foreign_row_with_same_document_id(self):
        lecturer = _actor("lecturer")
        document_id = await self._seed_document(
            owner_id=lecturer.id, media_kind="video", status="transcribed"
        )
        await self.db.document_contents.insert_many([
            {
                "document_id": str(document_id),
                "user_id": "foreign-user",
                "extracted_text": "PRIVATE FOREIGN TRANSCRIPT",
                "text_length": 26,
            },
            {
                "document_id": str(document_id),
                "user_id": lecturer.id,
                "extracted_text": "owned transcript",
                "text_length": 16,
            },
        ])

        response = await documents_router.get_video_transcript(
            str(document_id), current_user=lecturer
        )

        self.assertEqual(response.extracted_text, "owned transcript")

    async def test_document_mutation_lock_is_owner_scoped(self):
        document_id = await self._seed_document(owner_id=self.student.id)
        other_user = _actor("student")

        foreign_token = await documents_router.acquire_document_mutation_lock(
            self.db,
            str(document_id),
            other_user.id,
            expected_status="processed",
            operation="manual_index",
            locked_status="indexing",
        )
        self.assertIsNone(foreign_token)

        owner_token = await documents_router.acquire_document_mutation_lock(
            self.db,
            str(document_id),
            self.student.id,
            expected_status="processed",
            operation="manual_index",
            locked_status="indexing",
        )
        self.assertIsNotNone(owner_token)

        foreign_finalize = await documents_router.finalize_document_mutation(
            self.db,
            str(document_id),
            other_user.id,
            owner_token,
            final_status="indexed",
            required_status="indexing",
        )
        self.assertFalse(foreign_finalize)
        locked = await self.db["documents"].find_one({"_id": document_id})
        self.assertEqual(locked["status"], "indexing")

        owner_finalize = await documents_router.finalize_document_mutation(
            self.db,
            str(document_id),
            self.student.id,
            owner_token,
            final_status="indexed",
            required_status="indexing",
        )
        self.assertTrue(owner_finalize)

    async def test_student_and_user_cannot_transcribe_video(self):
        for role in ("student", "user"):
            actor = _actor(role)
            document_id = await self._seed_document(
                owner_id=actor.id,
                media_kind="video",
                status="uploaded",
            )
            with self.subTest(role=role), self.assertRaises(HTTPException) as raised:
                await documents_router.transcribe_video_api(
                    str(document_id),
                    background_tasks=BackgroundTasks(),
                    current_user=actor,
                )
            self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
