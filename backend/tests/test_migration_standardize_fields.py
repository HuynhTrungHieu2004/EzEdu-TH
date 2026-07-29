import importlib
import unittest

from mongomock_motor import AsyncMongoMockClient

# Tên module bắt đầu bằng chữ số ("0001_...") không phải identifier hợp lệ
# cho câu lệnh `import` thông thường — dùng importlib để nạp đúng theo tên
# file thật, giữ quy ước đánh số thứ tự migration (0001, 0002, ...).
migration = importlib.import_module("scripts.migrations.0001_standardize_document_fields")


class StandardizeDocumentFieldsMigrationTests(unittest.IsolatedAsyncioTestCase):
    """Kiểm thử migration mẫu backend/scripts/migrations/0001_standardize_document_fields.py
    trên dữ liệu giả lập — xác nhận dry-run, idempotent, và rollback đều hoạt động
    đúng như tài liệu yêu cầu trước khi migration này (hoặc migration theo cùng
    khuôn mẫu) chạy trên dữ liệu thật.
    """

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_migration"]
        await self.db["documents"].insert_many(
            [
                {"_id": "doc-1", "user_id": "user-a", "original_filename": "a.pdf"},
                {"_id": "doc-2", "user_id": "user-b", "original_filename": "b.pdf"},
            ]
        )

    async def test_dry_run_does_not_modify_data(self):
        await migration._forward(self.db, dry_run=True)

        doc1 = await self.db["documents"].find_one({"_id": "doc-1"})
        self.assertNotIn("version", doc1)
        self.assertNotIn("checksum", doc1)

    async def test_forward_backfills_all_new_fields(self):
        await migration._forward(self.db, dry_run=False)

        doc1 = await self.db["documents"].find_one({"_id": "doc-1"})
        self.assertEqual(doc1["version"], 1)
        self.assertEqual(doc1["created_by"], "user-a")
        self.assertEqual(doc1["updated_by"], "user-a")
        self.assertIsNone(doc1["deleted_at"])
        self.assertIsNone(doc1["checksum"])

        doc2 = await self.db["documents"].find_one({"_id": "doc-2"})
        self.assertEqual(doc2["created_by"], "user-b")

    async def test_forward_is_idempotent_on_rerun(self):
        await migration._forward(self.db, dry_run=False)
        # Sửa version thủ công để mô phỏng dữ liệu đã "sống" sau migration lần đầu.
        await self.db["documents"].update_one({"_id": "doc-1"}, {"$set": {"version": 5}})

        await migration._forward(self.db, dry_run=False)

        doc1 = await self.db["documents"].find_one({"_id": "doc-1"})
        # Field đã tồn tại thì bỏ qua — KHÔNG ghi đè version=5 về lại 1.
        self.assertEqual(doc1["version"], 5)

    async def test_rollback_removes_added_fields(self):
        await migration._forward(self.db, dry_run=False)
        await migration._rollback(self.db, dry_run=False)

        doc1 = await self.db["documents"].find_one({"_id": "doc-1"})
        for field in migration.NEW_FIELDS:
            self.assertNotIn(field, doc1)
        # Field gốc không bị ảnh hưởng.
        self.assertEqual(doc1["original_filename"], "a.pdf")

    async def test_rollback_dry_run_does_not_modify_data(self):
        await migration._forward(self.db, dry_run=False)
        await migration._rollback(self.db, dry_run=True)

        doc1 = await self.db["documents"].find_one({"_id": "doc-1"})
        self.assertIn("version", doc1)  # vẫn còn nguyên, dry-run không sửa gì


if __name__ == "__main__":
    unittest.main()
