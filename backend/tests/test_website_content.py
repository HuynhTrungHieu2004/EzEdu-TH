import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.rbac import Permission, require_permission
from app.schemas.auth import UserResponse


def actor(role: str = "admin") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class WebsiteContentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_website_content"]
        self.patch_db = patch("app.routers.website_content.get_database", return_value=self.db)
        self.patch_db.start()
        self.addCleanup(self.patch_db.stop)
        self.admin = actor("admin")
        self.super_admin = actor("super_admin")

    async def test_public_content_seeds_defaults_and_does_not_expose_draft(self):
        from app.routers.website_content import CONTENT_COLLECTION, get_public_website_content

        response = await get_public_website_content()
        self.assertEqual(len(response.items), 5)
        self.assertEqual(await self.db[CONTENT_COLLECTION].count_documents({}), 5)
        payload = response.model_dump()
        self.assertIn("published_at", payload["items"][0])
        self.assertNotIn("draft_content", str(payload))
        self.assertNotIn("published_content", str(payload))

    async def test_update_draft_rejects_script_content(self):
        from app.routers.website_content import update_website_draft
        from app.schemas.website_content import WebsiteContentDraftUpdateRequest

        with self.assertRaises(HTTPException):
            await update_website_draft(
                "hero",
                WebsiteContentDraftUpdateRequest(draft_content={"title": "<script>alert(1)</script>"}),
                current_user=self.admin,
            )

    async def test_update_draft_writes_version_and_audit(self):
        from app.routers.website_content import VERSION_COLLECTION, update_website_draft
        from app.schemas.website_content import WebsiteContentDraftUpdateRequest

        updated = await update_website_draft(
            "hero",
            WebsiteContentDraftUpdateRequest(draft_content={
                "title": "Trang chủ mới",
                "highlight": "cho giáo viên",
                "description": "Nội dung an toàn",
                "primary_cta_label": "Bắt đầu",
                "secondary_cta_label": "Xem thêm",
                "upload_enabled": True,
                "chips": ["PDF"],
            }),
            current_user=self.admin,
        )
        self.assertEqual(updated.status, "draft")
        self.assertEqual(updated.version, 2)
        version = await self.db[VERSION_COLLECTION].find_one({"section_key": "hero", "version": 2})
        self.assertEqual(version["source"], "draft")
        audit = await self.db["admin_audit_logs"].find_one({"action": "website_content_updated", "target_id": "hero"})
        self.assertIsNotNone(audit)
        self.assertIn("draft_content", audit["changed_fields"])

    async def test_publish_requires_reason_and_exposes_published_content_publicly(self):
        from app.routers.website_content import get_public_website_content, publish_website_section, update_website_draft
        from app.schemas.website_content import WebsiteContentDraftUpdateRequest, WebsiteContentPublishRequest

        await update_website_draft(
            "site_identity",
            WebsiteContentDraftUpdateRequest(draft_content={
                "site_name": "EzEdu CMS",
                "logo_text": "EzEdu CMS",
                "logo_url": "",
                "favicon_url": "/favicon.svg",
                "slogan": "Nội dung xuất bản",
            }),
            current_user=self.admin,
        )
        with self.assertRaises(HTTPException):
            await publish_website_section(
                "site_identity",
                WebsiteContentPublishRequest(reason=" "),
                current_user=self.admin,
            )
        published = await publish_website_section(
            "site_identity",
            WebsiteContentPublishRequest(reason="release homepage copy"),
            current_user=self.admin,
        )
        self.assertEqual(published.status, "published")
        public = await get_public_website_content()
        identity = next(item for item in public.items if item.section_key == "site_identity")
        self.assertEqual(identity.content["site_name"], "EzEdu CMS")
        audit = await self.db["admin_audit_logs"].find_one({"action": "website_content_published", "target_id": "site_identity"})
        self.assertEqual(audit["reason"], "release homepage copy")

    async def test_rollback_restores_draft_from_version(self):
        from app.routers.website_content import rollback_website_section, update_website_draft
        from app.schemas.website_content import WebsiteContentDraftUpdateRequest, WebsiteContentRollbackRequest

        first = await update_website_draft(
            "footer",
            WebsiteContentDraftUpdateRequest(draft_content={
                "contact_label": "Hỗ trợ",
                "email": "first@example.com",
                "socials": [],
                "policies": [],
                "copyright": "First",
            }),
            current_user=self.admin,
        )
        await update_website_draft(
            "footer",
            WebsiteContentDraftUpdateRequest(draft_content={
                "contact_label": "Hỗ trợ",
                "email": "second@example.com",
                "socials": [],
                "policies": [],
                "copyright": "Second",
            }),
            current_user=self.admin,
        )
        rolled_back = await rollback_website_section(
            "footer",
            WebsiteContentRollbackRequest(version=first.version, reason="restore first footer"),
            current_user=self.admin,
        )
        self.assertEqual(rolled_back.draft_content["email"], "first@example.com")
        self.assertEqual(rolled_back.status, "draft")

    async def test_permissions(self):
        view_guard = require_permission(Permission.WEBSITE_CONTENT_VIEW)
        publish_guard = require_permission(Permission.WEBSITE_CONTENT_PUBLISH)
        self.assertEqual((await view_guard(self.admin)).role, "admin")
        self.assertEqual((await publish_guard(self.super_admin)).role, "super_admin")
        with self.assertRaises(HTTPException):
            await view_guard(actor("support"))


if __name__ == "__main__":
    unittest.main()
