import unittest

from mongomock_motor import AsyncMongoMockClient

from app.core.security import verify_password
from app.services.demo_seed_service import DEMO_SEED_KEY, rollback_demo_data, seed_demo_data


class DemoSeedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["demo_seed_test"]
        await self.db["users"].insert_one({"email": "existing@example.test", "full_name": "Dữ liệu có sẵn"})

    async def test_seed_is_idempotent_and_creates_real_login_data(self):
        first = await seed_demo_data(self.db, password="DemoPassword123!")
        second = await seed_demo_data(self.db, password="DemoPassword123!")

        self.assertEqual(first["users"], 3)
        self.assertEqual(second, first)
        self.assertEqual(await self.db["users"].count_documents({"demo_seed": DEMO_SEED_KEY}), 3)
        self.assertEqual(await self.db["users"].count_documents({"email": "existing@example.test"}), 1)

        admin = await self.db["users"].find_one({"email": "admin.demo@ezedu.vn"})
        self.assertEqual(admin["role"], "admin")
        self.assertTrue(verify_password("DemoPassword123!", admin["hashed_password"]))
        self.assertGreater(await self.db["courses"].count_documents({"demo_seed": DEMO_SEED_KEY}), 0)
        self.assertGreater(await self.db["exam_attempts"].count_documents({"demo_seed": DEMO_SEED_KEY}), 0)

    async def test_rollback_only_removes_demo_records(self):
        await seed_demo_data(self.db, password="DemoPassword123!")

        removed = await rollback_demo_data(self.db)

        self.assertGreater(removed, 0)
        self.assertEqual(await self.db["users"].count_documents({"demo_seed": DEMO_SEED_KEY}), 0)
        self.assertEqual(await self.db["users"].count_documents({"email": "existing@example.test"}), 1)


if __name__ == "__main__":
    unittest.main()
