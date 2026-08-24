import unittest
from unittest.mock import MagicMock

from mongomock_motor import AsyncMongoMockClient


class SubmissionNotificationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["submission_notifications"]

    async def test_upsert_keeps_one_notification_and_updates_content(self):
        from app.services.submission_notification_service import upsert_submission_notification

        await upsert_submission_notification(
            self.db,
            teacher_id="teacher-1",
            attempt_id="attempt-1",
            title="Đã nộp bài",
            content="Đang chấm tự luận",
            action_url="/exams/exam-1/grading",
        )
        await upsert_submission_notification(
            self.db,
            teacher_id="teacher-1",
            attempt_id="attempt-1",
            title="Đã chấm xong",
            content="Điểm đã sẵn sàng",
            action_url="/exams/exam-1/grading",
        )

        docs = await self.db["admin_notifications"].find({}).to_list(None)
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]["title"], "Đã chấm xong")
        self.assertEqual(docs[0]["content"], "Điểm đã sẵn sàng")
        self.assertEqual(docs[0]["target_user_ids"], ["teacher-1"])
        self.assertEqual(docs[0]["dedupe_key"], "submission:attempt-1")
        self.assertEqual(docs[0]["source_type"], "submission")
        self.assertEqual(docs[0]["source_id"], "attempt-1")

    async def test_storage_failure_is_non_fatal(self):
        from app.services.submission_notification_service import upsert_submission_notification

        broken_db = MagicMock()
        broken_db.__getitem__.side_effect = RuntimeError("mongo down")

        result = await upsert_submission_notification(
            broken_db,
            teacher_id="teacher-1",
            attempt_id="attempt-1",
            title="Đã nộp",
            content="Nội dung",
            action_url="/internal",
        )

        self.assertFalse(result)

    async def test_ensures_unique_dedupe_index(self):
        from app.services.submission_notification_service import ensure_submission_notification_indexes

        await ensure_submission_notification_indexes(self.db)

        indexes = await self.db["admin_notifications"].index_information()
        self.assertTrue(indexes["dedupe_key_1"]["unique"])

    async def test_reuses_legacy_dedupe_index_name(self):
        from app.services.submission_notification_service import ensure_submission_notification_indexes

        collection = self.db["admin_notifications"]
        await collection.create_index([("dedupe_key", 1)], unique=True, sparse=True)

        await ensure_submission_notification_indexes(self.db)

        indexes = await collection.index_information()
        self.assertIn("dedupe_key_1", indexes)
        self.assertNotIn("submission_dedupe_key_unique", indexes)


if __name__ == "__main__":
    unittest.main()
