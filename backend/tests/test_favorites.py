import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers.favorites import create_favorite_route, delete_favorite_route, list_favorites_route
from app.schemas.auth import UserResponse
from app.schemas.favorites import FavoriteCreate
from app.services.favorite_service import ensure_favorite_indexes


def actor(user_id: str) -> UserResponse:
    return UserResponse(
        id=user_id,
        email=f"{user_id}@example.com",
        full_name="Quản trị viên",
        role="admin",
        created_at=datetime.now(timezone.utc),
    )


class FavoriteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_favorites"]
        await ensure_favorite_indexes(self.db)
        self.user = actor(str(ObjectId()))
        self.other = actor(str(ObjectId()))
        self.document_id = str((await self.db["documents"].insert_one({"title": "Tài liệu", "deleted_at": None})).inserted_id)
        self.db_patch = patch("app.routers.favorites.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def test_create_is_idempotent_and_lists_resolved_title(self):
        payload = FavoriteCreate(resource_type="document", resource_id=self.document_id)
        first = await create_favorite_route(payload, current_user=self.user)
        second = await create_favorite_route(payload, current_user=self.user)
        items = await list_favorites_route(current_user=self.user)

        self.assertEqual(first.id, second.id)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].title, "Tài liệu")

    async def test_missing_resource_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await create_favorite_route(
                FavoriteCreate(resource_type="exam", resource_id=str(ObjectId())),
                current_user=self.user,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_only_owner_can_delete(self):
        favorite = await create_favorite_route(
            FavoriteCreate(resource_type="document", resource_id=self.document_id),
            current_user=self.user,
        )
        with self.assertRaises(HTTPException) as ctx:
            await delete_favorite_route(favorite.id, current_user=self.other)
        self.assertEqual(ctx.exception.status_code, 404)

        await delete_favorite_route(favorite.id, current_user=self.user)
        self.assertEqual(await list_favorites_route(current_user=self.user), [])


if __name__ == "__main__":
    unittest.main()
