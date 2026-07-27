from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pymongo import ReturnDocument

from app.core.rbac import Permission, require_permission
from app.database.mongodb import get_database
from app.schemas.auth import UserResponse
from app.schemas.website_content import (
    WebsiteContentAdminResponse,
    WebsiteContentDraftUpdateRequest,
    WebsiteContentItem,
    WebsiteContentPublicItem,
    WebsiteContentPublicResponse,
    WebsiteContentPublishRequest,
    WebsiteContentReorderRequest,
    WebsiteContentRollbackRequest,
    WebsiteContentVersionItem,
    WebsiteContentVersionResponse,
    WebsiteSectionKey,
)
from app.services.admin_audit_service import record_admin_audit, require_reason
from app.services.website_content_defaults import default_content, default_section
from app.services.website_content_validator import validate_content

router = APIRouter()
admin_router = APIRouter()

CONTENT_COLLECTION = "website_content"
VERSION_COLLECTION = "website_content_versions"
SECTION_KEYS = ("site_identity", "header", "hero", "sections", "footer")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _item(doc: dict[str, Any]) -> WebsiteContentItem:
    return WebsiteContentItem(
        id=str(doc["_id"]),
        section_key=doc["section_key"],
        draft_content=doc.get("draft_content") or {},
        published_content=doc.get("published_content") or {},
        status=doc.get("status", "draft"),
        version=int(doc.get("version", 1)),
        updated_by=doc.get("updated_by"),
        updated_at=doc.get("updated_at"),
        published_by=doc.get("published_by"),
        published_at=doc.get("published_at"),
    )


async def _ensure_seeded(db) -> None:
    defaults = default_content()
    now = _now()
    for section_key in SECTION_KEYS:
        existing = await db[CONTENT_COLLECTION].find_one({"section_key": section_key})
        if existing:
            continue
        content = defaults[section_key]
        await db[CONTENT_COLLECTION].insert_one({
            "section_key": section_key,
            "draft_content": content,
            "published_content": content,
            "status": "published",
            "version": 1,
            "updated_by": None,
            "updated_at": now,
            "published_by": None,
            "published_at": now,
        })


async def _load_or_404(db, section_key: str) -> dict[str, Any]:
    if section_key not in SECTION_KEYS:
        raise HTTPException(status_code=404, detail="section_key không hợp lệ.")
    await _ensure_seeded(db)
    doc = await db[CONTENT_COLLECTION].find_one({"section_key": section_key})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy nội dung.")
    return doc


async def _write_version(
    db,
    *,
    section_key: str,
    version: int,
    content: dict[str, Any],
    source: str,
    created_by: Optional[str],
    reason: Optional[str] = None,
) -> dict[str, Any]:
    doc = {
        "section_key": section_key,
        "version": version,
        "content": content,
        "source": source,
        "created_by": created_by,
        "created_at": _now(),
        "reason": reason,
    }
    result = await db[VERSION_COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


@router.get("", response_model=WebsiteContentPublicResponse)
async def get_public_website_content():
    db = get_database()
    await _ensure_seeded(db)
    docs = await db[CONTENT_COLLECTION].find({"section_key": {"$in": list(SECTION_KEYS)}}).to_list(None)
    docs_by_key = {doc["section_key"]: doc for doc in docs}
    return WebsiteContentPublicResponse(
        items=[
            WebsiteContentPublicItem(
                section_key=section_key,
                content=(docs_by_key.get(section_key) or {}).get("published_content") or default_section(section_key),
                version=int((docs_by_key.get(section_key) or {}).get("version", 1)),
                published_at=(docs_by_key.get(section_key) or {}).get("published_at"),
            )
            for section_key in SECTION_KEYS
        ],
        generated_at=_now(),
    )


@admin_router.get("", response_model=WebsiteContentAdminResponse)
async def get_admin_website_content(
    current_user: UserResponse = Depends(require_permission(Permission.WEBSITE_CONTENT_VIEW)),
):
    db = get_database()
    await _ensure_seeded(db)
    docs = await db[CONTENT_COLLECTION].find({"section_key": {"$in": list(SECTION_KEYS)}}).sort("section_key", 1).to_list(None)
    return WebsiteContentAdminResponse(items=[_item(doc) for doc in docs], generated_at=_now())


@admin_router.get("/{section_key}", response_model=WebsiteContentItem)
async def get_admin_website_section(
    section_key: WebsiteSectionKey,
    current_user: UserResponse = Depends(require_permission(Permission.WEBSITE_CONTENT_VIEW)),
):
    return _item(await _load_or_404(get_database(), section_key))


@admin_router.patch("/{section_key}", response_model=WebsiteContentItem)
async def update_website_draft(
    section_key: WebsiteSectionKey,
    payload: WebsiteContentDraftUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.WEBSITE_CONTENT_UPDATE)),
):
    validate_content(payload.draft_content)
    db = get_database()
    before = await _load_or_404(db, section_key)
    next_version = int(before.get("version", 1)) + 1
    after = await db[CONTENT_COLLECTION].find_one_and_update(
        {"section_key": section_key},
        {"$set": {
            "draft_content": payload.draft_content,
            "status": "draft",
            "version": next_version,
            "updated_by": current_user.id,
            "updated_at": _now(),
        }},
        return_document=ReturnDocument.AFTER,
    )
    await _write_version(
        db,
        section_key=section_key,
        version=next_version,
        content=payload.draft_content,
        source="draft",
        created_by=current_user.id,
    )
    await record_admin_audit(
        admin=current_user,
        action="website_content_updated",
        target_type="website_content",
        target_id=section_key,
        before={"draft_content": before.get("draft_content"), "version": before.get("version")},
        after={"draft_content": after.get("draft_content"), "version": after.get("version")},
        changed=["draft_content", "version"],
        request=request,
        database=db,
    )
    return _item(after)


@admin_router.post("/{section_key}/publish", response_model=WebsiteContentItem)
async def publish_website_section(
    section_key: WebsiteSectionKey,
    payload: WebsiteContentPublishRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.WEBSITE_CONTENT_PUBLISH)),
):
    reason = require_reason(payload.reason, "xuất bản nội dung website")
    db = get_database()
    before = await _load_or_404(db, section_key)
    validate_content(before.get("draft_content") or {})
    after = await db[CONTENT_COLLECTION].find_one_and_update(
        {"section_key": section_key},
        {"$set": {
            "published_content": before.get("draft_content") or {},
            "status": "published",
            "published_by": current_user.id,
            "published_at": _now(),
            "updated_at": _now(),
        }},
        return_document=ReturnDocument.AFTER,
    )
    await _write_version(
        db,
        section_key=section_key,
        version=int(after.get("version", 1)),
        content=after.get("published_content") or {},
        source="published",
        created_by=current_user.id,
        reason=reason,
    )
    await record_admin_audit(
        admin=current_user,
        action="website_content_published",
        target_type="website_content",
        target_id=section_key,
        reason=reason,
        before={"published_content": before.get("published_content"), "version": before.get("version")},
        after={"published_content": after.get("published_content"), "version": after.get("version")},
        changed=["published_content", "status"],
        request=request,
        database=db,
    )
    return _item(after)


@admin_router.post("/{section_key}/rollback", response_model=WebsiteContentItem)
async def rollback_website_section(
    section_key: WebsiteSectionKey,
    payload: WebsiteContentRollbackRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.WEBSITE_CONTENT_UPDATE)),
):
    reason = require_reason(payload.reason, "hoàn tác nội dung website")
    db = get_database()
    before = await _load_or_404(db, section_key)
    version_doc = await db[VERSION_COLLECTION].find_one({"section_key": section_key, "version": payload.version})
    if not version_doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên bản cần hoàn tác.")
    content = version_doc.get("content") or {}
    validate_content(content)
    next_version = int(before.get("version", 1)) + 1
    after = await db[CONTENT_COLLECTION].find_one_and_update(
        {"section_key": section_key},
        {"$set": {
            "draft_content": content,
            "status": "draft",
            "version": next_version,
            "updated_by": current_user.id,
            "updated_at": _now(),
        }},
        return_document=ReturnDocument.AFTER,
    )
    await _write_version(
        db,
        section_key=section_key,
        version=next_version,
        content=content,
        source="rollback",
        created_by=current_user.id,
        reason=reason,
    )
    await record_admin_audit(
        admin=current_user,
        action="website_content_updated",
        target_type="website_content",
        target_id=section_key,
        reason=reason,
        before={"draft_content": before.get("draft_content"), "version": before.get("version")},
        after={"draft_content": after.get("draft_content"), "version": after.get("version"), "rolled_back_from": payload.version},
        changed=["draft_content", "version"],
        request=request,
        database=db,
    )
    return _item(after)


@admin_router.post("/sections/reorder", response_model=WebsiteContentItem)
async def reorder_sections(
    payload: WebsiteContentReorderRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.WEBSITE_CONTENT_UPDATE)),
):
    db = get_database()
    before = await _load_or_404(db, "sections")
    content = dict(before.get("draft_content") or {})
    items = list(content.get("items") or [])
    by_key = {str(item.get("key")): dict(item) for item in items if isinstance(item, dict)}
    for entry in payload.items:
        section = by_key.get(entry.section_key) or by_key.get(str(entry.section_key))
        if section:
            section["order"] = entry.order
            section["enabled"] = entry.enabled
    content["items"] = sorted(by_key.values(), key=lambda item: int(item.get("order", 0)))
    validate_content(content)
    return await update_website_draft(
        "sections",
        WebsiteContentDraftUpdateRequest(draft_content=content),
        request=request,
        current_user=current_user,
    )


@admin_router.get("/{section_key}/versions", response_model=WebsiteContentVersionResponse)
async def list_website_versions(
    section_key: WebsiteSectionKey,
    limit: int = Query(50, ge=1, le=100),
    current_user: UserResponse = Depends(require_permission(Permission.WEBSITE_CONTENT_VIEW)),
):
    db = get_database()
    await _load_or_404(db, section_key)
    docs = await db[VERSION_COLLECTION].find({"section_key": section_key}).sort("created_at", -1).limit(limit).to_list(limit)
    total = await db[VERSION_COLLECTION].count_documents({"section_key": section_key})
    return WebsiteContentVersionResponse(
        items=[
            WebsiteContentVersionItem(
                id=str(doc["_id"]),
                section_key=doc["section_key"],
                version=int(doc.get("version", 1)),
                content=doc.get("content") or {},
                source=doc.get("source", "draft"),
                created_by=doc.get("created_by"),
                created_at=doc.get("created_at") or _now(),
                reason=doc.get("reason"),
            )
            for doc in docs
        ],
        total=total,
        generated_at=_now(),
    )
