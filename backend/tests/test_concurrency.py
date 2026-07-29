import unittest

from mongomock_motor import AsyncMongoMockClient

from app.core.concurrency import VersionConflict, compare_and_set


class ConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    """Kiểm thử optimistic concurrency (compare-and-set qua field `version`)
    dùng chung cho Question/ExamBlueprint/Exam/ExamAttempt ở các giai đoạn sau.
    """

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_concurrency"]
        self.collection = self.db["exam_attempts"]
        self.doc_id = (await self.collection.insert_one({"answers": {}, "version": 1})).inserted_id

    async def test_update_succeeds_when_version_matches(self):
        updated = await compare_and_set(
            self.collection,
            filter_query={"_id": self.doc_id},
            expected_version=1,
            update={"$set": {"answers.q1": "A"}},
        )
        self.assertEqual(updated["version"], 2)
        self.assertEqual(updated["answers"]["q1"], "A")

    async def test_update_fails_when_version_is_stale(self):
        # Client A tải version=1, client B ghi trước (version lên 2).
        await compare_and_set(
            self.collection,
            filter_query={"_id": self.doc_id},
            expected_version=1,
            update={"$set": {"answers.q1": "B (client B)"}},
        )

        # Client A vẫn tưởng version=1 — phải bị từ chối.
        with self.assertRaises(VersionConflict):
            await compare_and_set(
                self.collection,
                filter_query={"_id": self.doc_id},
                expected_version=1,
                update={"$set": {"answers.q1": "A (client A, dữ liệu cũ)"}},
            )

        # Xác nhận dữ liệu của client B không bị ghi đè bởi client A.
        current = await self.collection.find_one({"_id": self.doc_id})
        self.assertEqual(current["answers"]["q1"], "B (client B)")
        self.assertEqual(current["version"], 2)

    async def test_sequential_updates_increment_version_each_time(self):
        result1 = await compare_and_set(
            self.collection, filter_query={"_id": self.doc_id}, expected_version=1, update={"$set": {"answers.q1": "A"}}
        )
        result2 = await compare_and_set(
            self.collection, filter_query={"_id": self.doc_id}, expected_version=2, update={"$set": {"answers.q2": "B"}}
        )
        self.assertEqual(result1["version"], 2)
        self.assertEqual(result2["version"], 3)
        self.assertEqual(result2["answers"], {"q1": "A", "q2": "B"})


if __name__ == "__main__":
    unittest.main()
