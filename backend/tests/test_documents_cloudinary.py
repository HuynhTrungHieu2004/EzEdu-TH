import hashlib
import io
import json
import time
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import UploadFile
from mongomock_motor import AsyncMongoMockClient

from app.routers import documents as documents_router
from app.schemas.auth import UserResponse
from app.services.cloudinary_service import (
    CLEANUP_ASSET_JOB_TYPE,
    InvalidWebhookSignature,
    handle_cloudinary_webhook,
)


def _actor(role: str = "lecturer") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


def _upload_file(content: bytes, filename: str = "note.pdf") -> UploadFile:
    return UploadFile(file=io.BytesIO(content), filename=filename)


class DocumentUploadDedupTests(unittest.IsolatedAsyncioTestCase):
    """Dedup theo checksum — cùng người dùng tải lại đúng file phải tái sử
    dụng bản ghi cũ, không tạo document/asset Cloudinary mới (giai đoạn 5)."""

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_documents_cloudinary"]
        self.patches = [
            patch("app.routers.documents.get_database", return_value=self.db),
            patch("app.services.system_settings_service.get_database", return_value=self.db),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.user = _actor("lecturer")

    async def test_duplicate_content_reuses_existing_document(self):
        content = b"noi dung hoc lieu giong het nhau"
        checksum = hashlib.sha256(content).hexdigest()
        now = datetime.now(timezone.utc)
        existing_id = ObjectId()
        await self.db["documents"].insert_one(
            {
                "_id": existing_id,
                "user_id": self.user.id,
                "original_filename": "note.pdf",
                "file_type": "pdf",
                "file_size": len(content),
                "cloudinary_url": "https://res.cloudinary.com/demo/raw/upload/v1/documents/note",
                "cloudinary_public_id": "documents/note_abc123",
                "cloudinary_resource_type": "raw",
                "media_kind": "document",
                "status": "completed",
                "error_message": None,
                "checksum": checksum,
                "reuse_count": 0,
                "version": 1,
                "created_by": self.user.id,
                "updated_by": self.user.id,
                "deleted_at": None,
                "created_at": now,
                "updated_at": now,
            }
        )

        response = await documents_router.upload_document(
            file=_upload_file(content), current_user=self.user, request=None
        )

        self.assertTrue(response.reused)
        self.assertEqual(response.document_id, str(existing_id))
        self.assertEqual(response.reuse_count, 1)

        count = await self.db["documents"].count_documents({})
        self.assertEqual(count, 1)
        reloaded = await self.db["documents"].find_one({"_id": existing_id})
        self.assertEqual(reloaded["reuse_count"], 1)

    async def test_different_user_same_content_does_not_reuse(self):
        content = b"noi dung rieng"
        checksum = hashlib.sha256(content).hexdigest()
        now = datetime.now(timezone.utc)
        await self.db["documents"].insert_one(
            {
                "_id": ObjectId(),
                "user_id": "someone-else",
                "original_filename": "note.pdf",
                "file_type": "pdf",
                "file_size": len(content),
                "cloudinary_url": "u",
                "cloudinary_public_id": "p",
                "cloudinary_resource_type": "raw",
                "media_kind": "document",
                "status": "completed",
                "error_message": None,
                "checksum": checksum,
                "reuse_count": 0,
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
            }
        )

        with patch("app.routers.documents.upload_file_to_cloudinary") as mock_upload, patch(
            "app.routers.documents.extract_and_store_document_content", new_callable=AsyncMock
        ) as mock_extract, patch("app.routers.documents.enforce_ai_quota", new_callable=AsyncMock):
            mock_upload.return_value = {
                "secure_url": "https://res.cloudinary.com/demo/raw/upload/v1/documents/new",
                "public_id": "documents/new_xyz",
                "resource_type": "raw",
            }
            mock_extract.return_value = {"text_length": 42}

            response = await documents_router.upload_document(
                file=_upload_file(content), current_user=self.user, request=None
            )

        self.assertFalse(response.reused)
        count = await self.db["documents"].count_documents({})
        self.assertEqual(count, 2)
        mock_upload.assert_called_once()


class CloudinaryDeleteRetryTests(unittest.IsolatedAsyncioTestCase):
    """Xoá asset Cloudinary qua hàng đợi job (retry có backoff) thay vì xoá
    đồng bộ rồi im lặng bỏ qua lỗi."""

    async def asyncSetUp(self):
        from app.services.background_job_service import ensure_background_job_indexes

        self.client = AsyncMongoMockClient()
        self.db = self.client["test_cloudinary_cleanup_job"]
        await ensure_background_job_indexes(self.db)

    async def test_enqueue_cloudinary_cleanup_queues_job(self):
        from app.services.cloudinary_service import enqueue_cloudinary_cleanup

        await enqueue_cloudinary_cleanup(self.db, public_id="documents/abc123")
        jobs = [j async for j in self.db["background_jobs"].find({"job_type": CLEANUP_ASSET_JOB_TYPE})]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["payload"]["public_id"], "documents/abc123")

    async def test_enqueue_cloudinary_cleanup_is_idempotent_per_public_id(self):
        from app.services.cloudinary_service import enqueue_cloudinary_cleanup

        await enqueue_cloudinary_cleanup(self.db, public_id="documents/dup")
        await enqueue_cloudinary_cleanup(self.db, public_id="documents/dup")
        jobs = [j async for j in self.db["background_jobs"].find({"job_type": CLEANUP_ASSET_JOB_TYPE})]
        self.assertEqual(len(jobs), 1)

    async def test_cleanup_job_handler_calls_delete(self):
        from app.services.cloudinary_service import cleanup_cloudinary_asset_job

        with patch("app.services.cloudinary_service.delete_file_from_cloudinary") as mock_delete:
            mock_delete.return_value = {"result": "ok"}
            result = await cleanup_cloudinary_asset_job({"public_id": "documents/xyz"})
        mock_delete.assert_called_once_with("documents/xyz")
        self.assertEqual(result["deleted"], "documents/xyz")


def _configure_test_cloudinary_sdk() -> None:
    import cloudinary

    cloudinary.config(cloud_name="test", api_key="test", api_secret="test-secret", secure=True)


class CloudinaryWebhookTests(unittest.IsolatedAsyncioTestCase):
    """Chữ ký thật của SDK Cloudinary được xác thực thật (không mock hàm
    verify) — chỉ mock `is_cloudinary_configured`/`configure_cloudinary` để
    SDK dùng secret cố định `test-secret` thay vì đọc `.env` thật."""

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_cloudinary_webhook"]
        patch("app.services.cloudinary_service.is_cloudinary_configured", return_value=True).start()
        patch("app.services.cloudinary_service.configure_cloudinary", side_effect=_configure_test_cloudinary_sdk).start()
        self.addCleanup(patch.stopall)

    def _sign(self, body: bytes, timestamp: int, api_secret: str = "test-secret") -> str:
        return hashlib.sha1((body.decode("utf-8") + str(timestamp) + api_secret).encode("utf-8")).hexdigest()

    async def test_rejects_invalid_signature(self):
        body = json.dumps({"notification_type": "upload", "public_id": "documents/a"}).encode("utf-8")
        with self.assertRaises(InvalidWebhookSignature):
            await handle_cloudinary_webhook(
                self.db, body=body, timestamp=str(int(time.time())), signature="deadbeef"
            )

    async def test_accepts_valid_signature_and_updates_document(self):
        await self.db["documents"].insert_one(
            {"cloudinary_public_id": "documents/a", "status": "completed", "updated_at": datetime.now(timezone.utc)}
        )
        payload = {"notification_type": "eager", "public_id": "documents/a"}
        body = json.dumps(payload).encode("utf-8")
        timestamp = str(int(time.time()))
        signature = self._sign(body, int(timestamp))

        result = await handle_cloudinary_webhook(self.db, body=body, timestamp=timestamp, signature=signature)

        self.assertEqual(result["handled"], "eager")
        doc = await self.db["documents"].find_one({"cloudinary_public_id": "documents/a"})
        self.assertEqual(doc["cloudinary_notification_status"], "eager")

    async def test_same_notification_twice_is_idempotent(self):
        await self.db["documents"].insert_one({"cloudinary_public_id": "documents/b"})
        payload = {"notification_type": "upload", "public_id": "documents/b"}
        body = json.dumps(payload).encode("utf-8")
        timestamp = str(int(time.time()))
        signature = self._sign(body, int(timestamp))

        r1 = await handle_cloudinary_webhook(self.db, body=body, timestamp=timestamp, signature=signature)
        r2 = await handle_cloudinary_webhook(self.db, body=body, timestamp=timestamp, signature=signature)

        self.assertEqual(r1, r2)
        records = [j async for j in self.db["idempotency_records"].find({"scope": "cloudinary_webhook"})]
        self.assertEqual(len(records), 1)


class DocumentSoftDeleteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_document_soft_delete"]
        self.patches = [
            patch("app.routers.documents.get_database", return_value=self.db),
            patch("app.services.system_settings_service.get_database", return_value=self.db),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.user = _actor("lecturer")

    async def _seed_document_with_question_set(self):
        now = datetime.now(timezone.utc)
        doc_id = ObjectId()
        await self.db["documents"].insert_one({
            "_id": doc_id,
            "user_id": self.user.id,
            "original_filename": "note.pdf",
            "file_type": "pdf",
            "file_size": 10,
            "cloudinary_url": "https://res.cloudinary.com/demo/raw/upload/v1/documents/note",
            "cloudinary_public_id": "documents/note_abc",
            "cloudinary_resource_type": "raw",
            "media_kind": "document",
            "status": "completed",
            "error_message": None,
            "checksum": "abc",
            "reuse_count": 0,
            "version": 1,
            "created_by": self.user.id,
            "updated_by": self.user.id,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        })
        await self.db["question_sets"].insert_one({
            "document_id": str(doc_id),
            "document_name": "note.pdf",
            "user_id": self.user.id,
            "created_at": now,
        })
        return doc_id

    async def test_delete_document_soft_deletes_and_keeps_question_sets(self):
        doc_id = await self._seed_document_with_question_set()
        with patch("app.routers.documents.enqueue_cloudinary_cleanup", new=AsyncMock()):
            await documents_router.delete_document(str(doc_id), None, None, self.user)

        deleted_doc = await self.db["documents"].find_one({"_id": doc_id})
        self.assertIsNotNone(deleted_doc, "document phải vẫn còn trong DB (xóa mềm)")
        self.assertIsNotNone(deleted_doc["deleted_at"])

        remaining_qs = await self.db["question_sets"].count_documents({"document_id": str(doc_id)})
        self.assertEqual(remaining_qs, 1, "question_sets phải KHÔNG bị xóa cascade")

    async def test_deleted_document_no_longer_listed(self):
        doc_id = await self._seed_document_with_question_set()
        with patch("app.routers.documents.enqueue_cloudinary_cleanup", new=AsyncMock()):
            await documents_router.delete_document(str(doc_id), None, None, self.user)

        listed = await documents_router.list_documents(current_user=self.user)
        self.assertEqual(listed, [])


class DocumentSoftDeleteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_document_soft_delete"]
        self.patches = [
            patch("app.routers.documents.get_database", return_value=self.db),
            patch("app.services.system_settings_service.get_database", return_value=self.db),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.user = _actor("lecturer")

    async def _seed_document_with_question_set(self):
        now = datetime.now(timezone.utc)
        doc_id = ObjectId()
        await self.db["documents"].insert_one({
            "_id": doc_id,
            "user_id": self.user.id,
            "original_filename": "note.pdf",
            "file_type": "pdf",
            "file_size": 10,
            "cloudinary_url": "https://res.cloudinary.com/demo/raw/upload/v1/documents/note",
            "cloudinary_public_id": "documents/note_abc",
            "cloudinary_resource_type": "raw",
            "media_kind": "document",
            "status": "completed",
            "error_message": None,
            "checksum": "abc",
            "reuse_count": 0,
            "version": 1,
            "created_by": self.user.id,
            "updated_by": self.user.id,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        })
        await self.db["question_sets"].insert_one({
            "document_id": str(doc_id),
            "document_name": "note.pdf",
            "user_id": self.user.id,
            "created_at": now,
        })
        return doc_id

    async def test_delete_document_soft_deletes_and_keeps_question_sets(self):
        doc_id = await self._seed_document_with_question_set()
        with patch("app.routers.documents.enqueue_cloudinary_cleanup", new=AsyncMock()):
            await documents_router.delete_document(str(doc_id), None, None, self.user)

        deleted_doc = await self.db["documents"].find_one({"_id": doc_id})
        self.assertIsNotNone(deleted_doc, "document phải vẫn còn trong DB (xóa mềm)")
        self.assertIsNotNone(deleted_doc["deleted_at"])

        remaining_qs = await self.db["question_sets"].count_documents({"document_id": str(doc_id)})
        self.assertEqual(remaining_qs, 1, "question_sets phải KHÔNG bị xóa cascade")

    async def test_deleted_document_no_longer_listed(self):
        doc_id = await self._seed_document_with_question_set()
        with patch("app.routers.documents.enqueue_cloudinary_cleanup", new=AsyncMock()):
            await documents_router.delete_document(str(doc_id), None, None, self.user)

        listed = await documents_router.list_documents(current_user=self.user)
        self.assertEqual(listed, [])



if __name__ == "__main__":
    unittest.main()
