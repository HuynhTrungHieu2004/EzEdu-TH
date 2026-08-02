from __future__ import annotations

import math
import re
import secrets
import string
from datetime import datetime, time, timedelta, timezone
from typing import Any, Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.rbac import (
    Permission,
    ROLE_NAMES,
    SUPER_ADMIN_ROLE,
    require_permission,
    sanitize_permissions,
)
from app.core.security import get_password_hash
from app.database.mongodb import get_database
from app.schemas.admin_users import (
    AdminPasswordResetRequest,
    AdminPasswordResetResponse,
    AdminUserCreateRequest,
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserMutationResponse,
    AdminUserQuotaUpdateRequest,
    AdminUserReasonRequest,
    AdminUserRoleUpdateRequest,
    AdminUserStatisticsResponse,
    AdminUserSummary,
    AdminUserUpdateRequest,
    SortOrder,
    TokenUsage,
    UserSortBy,
)
from app.schemas.auth import UserResponse
from app.services import analytics_service
from app.services.admin_audit_service import record_admin_audit, require_reason
from app.services.activity_log_service import record_activity

router = APIRouter()

SENSITIVE_FIELDS = {
    "hashed_password": 0,
    "password": 0,
    "refresh_token": 0,
    "refresh_tokens": 0,
    "api_key": 0,
    "api_keys": 0,
    "secret": 0,
    "secrets": 0,
    "access_token": 0,
    "tokens": 0,
}

SORT_FIELDS: dict[str, str] = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "last_login_at": "last_login_at",
    "email": "email",
    "full_name": "full_name",
    "role": "role",
    "status": "status",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail="user_id không hợp lệ.")
    return ObjectId(value)


def _normalize_status(doc: dict[str, Any]) -> Literal["active", "locked", "deleted"]:
    if doc.get("deleted_at") is not None:
        return "deleted"
    value = str(doc.get("status") or "").strip()
    if value in {"active", "locked", "deleted"}:
        return value  # type: ignore[return-value]
    return "active" if doc.get("is_active", True) is not False else "locked"


def _is_active(doc: dict[str, Any]) -> bool:
    return _normalize_status(doc) == "active" and doc.get("is_active", True) is not False


def _summary(doc: dict[str, Any]) -> AdminUserSummary:
    return AdminUserSummary(
        id=str(doc["_id"]),
        full_name=str(doc.get("full_name", "")),
        email=str(doc.get("email", "")),
        role=str(doc.get("role", "user")),
        status=_normalize_status(doc),
        is_active=_is_active(doc),
        email_verified=bool(doc.get("email_verified", False)),
        created_at=doc.get("created_at") or _now(),
        updated_at=doc.get("updated_at"),
        last_login_at=doc.get("last_login_at"),
        deleted_at=doc.get("deleted_at"),
        current_quota=doc.get("ai_quota") or doc.get("current_quota"),
    )


async def _load_user_or_404(user_id: str) -> dict[str, Any]:
    db = get_database()
    doc = await db["users"].find_one({"_id": _parse_object_id(user_id)}, SENSITIVE_FIELDS)
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    return doc


def _ensure_can_touch_user(
    *,
    actor: UserResponse,
    target: dict[str, Any],
    requested_role: Optional[str] = None,
) -> None:
    target_role = str(target.get("role", "user"))
    if target_role == SUPER_ADMIN_ROLE and actor.role != SUPER_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không thể thao tác với tài khoản super_admin.",
        )
    if requested_role == SUPER_ADMIN_ROLE and actor.role != SUPER_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ super_admin mới được cấp quyền super_admin.",
        )


def _audit_event(
    *,
    event_type: str,
    actor: UserResponse,
    target_user_id: str,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return {
        "event_type": event_type,
        "actor_user_id": actor.id,
        "target_user_id": target_user_id,
        "metadata": metadata or {},
        "created_at": _now(),
    }


def _audit_user_snapshot(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc.get("_id")),
        "full_name": doc.get("full_name"),
        "email": doc.get("email"),
        "role": doc.get("role", "user"),
        "status": _normalize_status(doc),
        "is_active": _is_active(doc),
        "email_verified": bool(doc.get("email_verified", False)),
        "permissions_override": sanitize_permissions(doc.get("permissions_override")),
        "current_quota": doc.get("ai_quota") or doc.get("current_quota"),
        "deleted_at": doc.get("deleted_at"),
        "force_logout_at": doc.get("force_logout_at"),
        "password_reset_required": bool(doc.get("password_reset_required", False)),
    }


async def _record_user_audit(
    *,
    db: Any,
    actor: UserResponse,
    action: str,
    target_user_id: str,
    before: Optional[dict[str, Any]],
    after: Optional[dict[str, Any]],
    reason: Optional[str] = None,
    request: Optional[Request] = None,
    changed: Optional[list[str]] = None,
) -> dict[str, Any]:
    return await record_admin_audit(
        admin=actor,
        action=action,
        target_type="user",
        target_id=target_user_id,
        reason=reason,
        before=_audit_user_snapshot(before) if before else None,
        after=_audit_user_snapshot(after) if after else None,
        changed=changed,
        request=request,
        database=db,
    )


def _password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(14))


def _date_start(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _date_end(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    if value.time() == time.min:
        value = value.replace(hour=23, minute=59, second=59, microsecond=999999)
    return value.astimezone(timezone.utc)


def _range_filter(field: str, start: Optional[datetime], end: Optional[datetime]) -> dict[str, Any]:
    if not start and not end:
        return {}
    clause: dict[str, Any] = {}
    if start:
        clause["$gte"] = _date_start(start)
    if end:
        clause["$lte"] = _date_end(end)
    return {field: clause}


async def _email_exists(email: str, *, exclude_id: Optional[ObjectId] = None) -> bool:
    db = get_database()
    query: dict[str, Any] = {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
    if exclude_id:
        query["_id"] = {"$ne": exclude_id}
    return await db["users"].count_documents(query) > 0


async def _detail(doc: dict[str, Any]) -> AdminUserDetail:
    db = get_database()
    user_id = str(doc["_id"])
    base = _summary(doc).model_dump()

    document_count = await db["documents"].count_documents({"user_id": user_id, "deleted_at": None})
    question_count = await db["question_sets"].count_documents({"user_id": user_id})
    conversation_count = await db["conversations"].count_documents({"user_id": user_id, "deleted_at": None})
    ai_request_count = await db[analytics_service.COLLECTION].count_documents({
        "user_id": user_id,
        "is_final": True,
        "event_kind": "logical_operation",
    })
    token_docs = await db[analytics_service.COLLECTION].aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": None,
            "input_tokens": {"$sum": {"$ifNull": ["$input_tokens", 0]}},
            "output_tokens": {"$sum": {"$ifNull": ["$output_tokens", 0]}},
            "total_tokens": {"$sum": {"$ifNull": ["$total_tokens", 0]}},
        }},
    ]).to_list(1)
    token_doc = token_docs[0] if token_docs else {}

    return AdminUserDetail(
        **base,
        document_count=document_count,
        question_count=question_count,
        conversation_count=conversation_count,
        ai_request_count=ai_request_count,
        token_usage=TokenUsage(
            input_tokens=int(token_doc.get("input_tokens", 0)),
            output_tokens=int(token_doc.get("output_tokens", 0)),
            total_tokens=int(token_doc.get("total_tokens", 0)),
        ),
    )


@router.get("", response_model=AdminUserListResponse)
async def list_admin_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=120),
    role: Optional[str] = Query(None, max_length=40),
    status_filter: Optional[Literal["active", "locked", "deleted", "all"]] = Query(None, alias="status"),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    last_login_from: Optional[datetime] = Query(None),
    last_login_to: Optional[datetime] = Query(None),
    sort_by: UserSortBy = Query("created_at"),
    sort_order: SortOrder = Query("desc"),
    current_user: UserResponse = Depends(require_permission(Permission.USERS_VIEW)),
):
    db = get_database()
    query: dict[str, Any] = {}
    if status_filter and status_filter != "all":
        if status_filter == "deleted":
            query["deleted_at"] = {"$ne": None}
        else:
            query["deleted_at"] = None
            query["status"] = status_filter
    elif status_filter != "all":
        query["deleted_at"] = None

    if role:
        if role not in ROLE_NAMES:
            raise HTTPException(status_code=400, detail="role không hợp lệ.")
        query["role"] = role
    if search:
        pattern = re.escape(search.strip())
        query["$or"] = [
            {"email": {"$regex": pattern, "$options": "i"}},
            {"full_name": {"$regex": pattern, "$options": "i"}},
        ]
    query.update(_range_filter("created_at", created_from, created_to))
    query.update(_range_filter("last_login_at", last_login_from, last_login_to))

    total = await db["users"].count_documents(query)
    skip = (page - 1) * page_size
    sort_dir = 1 if sort_order == "asc" else -1
    docs = await (
        db["users"]
        .find(query, SENSITIVE_FIELDS)
        .sort(SORT_FIELDS[sort_by], sort_dir)
        .skip(skip)
        .limit(page_size)
        .to_list(page_size)
    )
    return AdminUserListResponse(
        items=[_summary(doc) for doc in docs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
        generated_at=_now(),
    )


@router.get("/statistics", response_model=AdminUserStatisticsResponse)
async def admin_user_statistics(
    current_user: UserResponse = Depends(require_permission(Permission.USERS_VIEW)),
):
    db = get_database()
    now = _now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    last_7_days = now - timedelta(days=7)
    last_30_days = now - timedelta(days=30)
    last_24_hours = now - timedelta(hours=24)

    return AdminUserStatisticsResponse(
        total_users=await db["users"].count_documents({}),
        active_users=await db["users"].count_documents({
            "deleted_at": None,
            "is_active": {"$ne": False},
            "$or": [{"status": "active"}, {"status": {"$exists": False}}],
        }),
        locked_users=await db["users"].count_documents({"deleted_at": None, "$or": [{"status": "locked"}, {"is_active": False}]}),
        deleted_users=await db["users"].count_documents({"deleted_at": {"$ne": None}}),
        users_created_today=await db["users"].count_documents({"created_at": {"$gte": today_start}}),
        users_created_last_7_days=await db["users"].count_documents({"created_at": {"$gte": last_7_days}}),
        users_created_last_30_days=await db["users"].count_documents({"created_at": {"$gte": last_30_days}}),
        active_last_24_hours=await db["users"].count_documents({"last_login_at": {"$gte": last_24_hours}}),
        active_last_7_days=await db["users"].count_documents({"last_login_at": {"$gte": last_7_days}}),
        generated_at=now,
    )


@router.get("/{user_id}", response_model=AdminUserDetail)
async def get_admin_user(
    user_id: str,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_VIEW)),
):
    return await _detail(await _load_user_or_404(user_id))


@router.post("", response_model=AdminUserMutationResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_user(
    payload: AdminUserCreateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_CREATE)),
):
    if payload.role == SUPER_ADMIN_ROLE and current_user.role != SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Chỉ super_admin mới được tạo super_admin.")
    email = str(payload.email).lower()
    if await _email_exists(email):
        raise HTTPException(status_code=400, detail="Email đã tồn tại.")
    if not payload.password and not payload.temporary_password:
        raise HTTPException(
            status_code=400,
            detail="Cần cung cấp password hoặc temporary_password khi tạo người dùng.",
        )

    now = _now()
    raw_password = payload.password or payload.temporary_password
    doc = {
        "email": email,
        "full_name": payload.full_name,
        "hashed_password": get_password_hash(raw_password),
        "role": payload.role,
        "status": "active",
        "is_active": True,
        "email_verified": payload.email_verified,
        "permissions_override": [],
        "ai_quota": payload.current_quota,
        "password_reset_required": payload.password is None,
        "deleted_at": None,
        "created_at": now,
        "updated_at": now,
    }
    db = get_database()
    result = await db["users"].insert_one(doc)
    created = await _load_user_or_404(str(result.inserted_id))
    audit_doc = await _record_user_audit(
        db=db,
        actor=current_user,
        action="user_created",
        target_user_id=str(result.inserted_id),
        before=None,
        after=created,
        request=request,
    )
    audit = _audit_event(
        event_type="admin_user_created",
        actor=current_user,
        target_user_id=str(result.inserted_id),
        metadata={"role": payload.role, "email": email, "audit_log_id": str(audit_doc["_id"])},
    )
    return AdminUserMutationResponse(user=await _detail(created), audit_event=audit)


@router.patch("/{user_id}", response_model=AdminUserMutationResponse)
async def update_admin_user(
    user_id: str,
    payload: AdminUserUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_UPDATE)),
):
    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await _load_user_or_404(user_id)
    _ensure_can_touch_user(actor=current_user, target=existing)
    update: dict[str, Any] = {}
    if payload.full_name is not None:
        update["full_name"] = payload.full_name
    if payload.email is not None:
        email = str(payload.email).lower()
        if await _email_exists(email, exclude_id=oid):
            raise HTTPException(status_code=400, detail="Email đã tồn tại.")
        update["email"] = email
    if payload.status is not None:
        raise HTTPException(
            status_code=400,
            detail="Dùng endpoint lock/unlock/delete/restore để thay đổi trạng thái tài khoản.",
        )
    if payload.is_active is not None:
        raise HTTPException(
            status_code=400,
            detail="Dùng endpoint lock/unlock để thay đổi trạng thái hoạt động.",
        )
    if payload.email_verified is not None:
        update["email_verified"] = payload.email_verified
    if payload.permissions_override is not None:
        update["permissions_override"] = sanitize_permissions(payload.permissions_override)
    if not update:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")
    update["updated_at"] = _now()
    result = await db["users"].find_one_and_update({"_id": oid}, {"$set": update}, return_document=True, projection=SENSITIVE_FIELDS)
    changed = sorted(key for key in update.keys() if key != "updated_at")
    audit_doc = await _record_user_audit(
        db=db,
        actor=current_user,
        action="user_updated",
        target_user_id=user_id,
        before=existing,
        after=result,
        changed=changed,
        request=request,
    )
    audit = _audit_event(
        event_type="admin_user_updated",
        actor=current_user,
        target_user_id=user_id,
        metadata={"changed_fields": changed, "audit_log_id": str(audit_doc["_id"])},
    )
    return AdminUserMutationResponse(user=await _detail(result), audit_event=audit)


async def _set_status(
    user_id: str,
    next_status: Literal["active", "locked", "deleted"],
    actor: UserResponse,
    *,
    audit_action: str,
    event_type: str,
    reason: Optional[str] = None,
    request: Request = None,
) -> AdminUserMutationResponse:
    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await _load_user_or_404(user_id)
    _ensure_can_touch_user(actor=actor, target=existing)
    now = _now()
    update: dict[str, Any] = {
        "status": next_status,
        "is_active": next_status == "active",
        "updated_at": now,
    }
    if next_status == "deleted":
        update["deleted_at"] = now
    elif next_status == "active":
        update["deleted_at"] = None
    result = await db["users"].find_one_and_update({"_id": oid}, {"$set": update}, return_document=True, projection=SENSITIVE_FIELDS)
    audit_doc = await _record_user_audit(
        db=db,
        actor=actor,
        action=audit_action,
        target_user_id=user_id,
        before=existing,
        after=result,
        reason=reason,
        changed=["status", "is_active", "deleted_at"] if next_status in {"active", "deleted"} else ["status", "is_active"],
        request=request,
    )
    audit = _audit_event(
        event_type=event_type,
        actor=actor,
        target_user_id=user_id,
        metadata={"old_status": _normalize_status(existing), "new_status": next_status, "audit_log_id": str(audit_doc["_id"])},
    )
    return AdminUserMutationResponse(user=await _detail(result), audit_event=audit)


@router.post("/{user_id}/lock", response_model=AdminUserMutationResponse)
async def lock_admin_user(
    user_id: str,
    payload: AdminUserReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_LOCK)),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể khóa chính tài khoản đang sử dụng.")
    reason = require_reason(payload.reason, "khóa tài khoản")
    return await _set_status(
        user_id,
        "locked",
        current_user,
        audit_action="user_locked",
        event_type="admin_user_locked",
        reason=reason,
        request=request,
    )


@router.post("/{user_id}/unlock", response_model=AdminUserMutationResponse)
async def unlock_admin_user(
    user_id: str,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_LOCK)),
):
    return await _set_status(
        user_id,
        "active",
        current_user,
        audit_action="user_unlocked",
        event_type="admin_user_unlocked",
        request=request,
    )


@router.post("/{user_id}/restore", response_model=AdminUserMutationResponse)
async def restore_admin_user(
    user_id: str,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_RESTORE)),
):
    return await _set_status(
        user_id,
        "active",
        current_user,
        audit_action="user_restored",
        event_type="admin_user_restored",
        request=request,
    )


@router.delete("/{user_id}", response_model=AdminUserMutationResponse)
async def delete_admin_user(
    user_id: str,
    payload: AdminUserReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_DELETE)),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể xóa chính tài khoản đang sử dụng.")
    reason = require_reason(payload.reason, "xóa mềm tài khoản")
    return await _set_status(
        user_id,
        "deleted",
        current_user,
        audit_action="user_soft_deleted",
        event_type="admin_user_soft_deleted",
        reason=reason,
        request=request,
    )


@router.patch("/{user_id}/role", response_model=AdminUserMutationResponse)
async def change_admin_user_role(
    user_id: str,
    payload: AdminUserRoleUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_CHANGE_ROLE)),
):
    reason = require_reason(payload.reason, "đổi vai trò")
    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await _load_user_or_404(user_id)
    _ensure_can_touch_user(actor=current_user, target=existing, requested_role=payload.role)
    result = await db["users"].find_one_and_update(
        {"_id": oid},
        {"$set": {"role": payload.role, "updated_at": _now()}},
        return_document=True,
        projection=SENSITIVE_FIELDS,
    )
    audit_doc = await _record_user_audit(
        db=db,
        actor=current_user,
        action="user_role_changed",
        target_user_id=user_id,
        before=existing,
        after=result,
        reason=reason,
        changed=["role"],
        request=request,
    )
    audit = _audit_event(
        event_type="admin_user_role_changed",
        actor=current_user,
        target_user_id=user_id,
        metadata={"old_role": existing.get("role", "user"), "new_role": payload.role, "audit_log_id": str(audit_doc["_id"])},
    )
    return AdminUserMutationResponse(user=await _detail(result), audit_event=audit)


@router.patch("/{user_id}/quota", response_model=AdminUserMutationResponse)
async def update_admin_user_quota(
    user_id: str,
    payload: AdminUserQuotaUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_MANAGE_QUOTA)),
):
    reason = require_reason(payload.reason, "thay quota")
    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await _load_user_or_404(user_id)
    _ensure_can_touch_user(actor=current_user, target=existing)
    result = await db["users"].find_one_and_update(
        {"_id": oid},
        {"$set": {"ai_quota": payload.current_quota, "updated_at": _now()}},
        return_document=True,
        projection=SENSITIVE_FIELDS,
    )
    audit_doc = await _record_user_audit(
        db=db,
        actor=current_user,
        action="user_quota_changed",
        target_user_id=user_id,
        before=existing,
        after=result,
        reason=reason,
        changed=["current_quota"],
        request=request,
    )
    audit = _audit_event(
        event_type="admin_user_quota_updated",
        actor=current_user,
        target_user_id=user_id,
        metadata={"quota_keys": sorted(payload.current_quota.keys()), "audit_log_id": str(audit_doc["_id"])},
    )
    return AdminUserMutationResponse(user=await _detail(result), audit_event=audit)


@router.post("/{user_id}/force-logout", response_model=AdminUserMutationResponse)
async def force_logout_admin_user(
    user_id: str,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_UPDATE)),
):
    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await _load_user_or_404(user_id)
    _ensure_can_touch_user(actor=current_user, target=existing)
    now = _now()
    result = await db["users"].find_one_and_update(
        {"_id": oid},
        {"$set": {"force_logout_at": now, "updated_at": now}},
        return_document=True,
        projection=SENSITIVE_FIELDS,
    )
    audit = _audit_event(
        event_type="admin_user_force_logout",
        actor=current_user,
        target_user_id=user_id,
        metadata={"force_logout_at": now.isoformat()},
    )
    audit_doc = await _record_user_audit(
        db=db,
        actor=current_user,
        action="user_force_logout",
        target_user_id=user_id,
        before=existing,
        after=result,
        changed=["force_logout_at"],
        request=request,
    )
    audit["metadata"]["audit_log_id"] = str(audit_doc["_id"])
    return AdminUserMutationResponse(user=await _detail(result), audit_event=audit)


@router.post("/{user_id}/password-reset", response_model=AdminPasswordResetResponse)
async def reset_admin_user_password(
    user_id: str,
    payload: AdminPasswordResetRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_RESET_PASSWORD)),
):
    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await _load_user_or_404(user_id)
    _ensure_can_touch_user(actor=current_user, target=existing)
    temp_password = payload.temporary_password or _password()
    now = _now()
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {
            "hashed_password": get_password_hash(temp_password),
            "password_reset_required": payload.require_password_change,
            "force_logout_at": now,
            "updated_at": now,
        }},
    )
    audit = _audit_event(
        event_type="admin_user_password_reset",
        actor=current_user,
        target_user_id=user_id,
        metadata={"password_reset_required": payload.require_password_change},
    )
    updated = await _load_user_or_404(user_id)
    audit_doc = await _record_user_audit(
        db=db,
        actor=current_user,
        action="password_reset_requested",
        target_user_id=user_id,
        before=existing,
        after=updated,
        changed=["password_reset_required", "force_logout_at"],
        request=request,
    )
    audit["metadata"]["audit_log_id"] = str(audit_doc["_id"])
    await record_activity(
        action="password_changed",
        category="security",
        status="success",
        user_id=user_id,
        resource_type="user",
        resource_id=user_id,
        metadata={"reset_by_admin": True, "actor_user_id": current_user.id},
        database=db,
    )
    return AdminPasswordResetResponse(
        user_id=user_id,
        temporary_password=temp_password,
        password_reset_required=payload.require_password_change,
        updated_at=now,
        audit_event=audit,
    )
