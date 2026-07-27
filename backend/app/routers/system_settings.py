from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from app.core.rbac import Permission, require_permission
from app.database.mongodb import get_database
from app.schemas.auth import UserResponse
from app.schemas.system_settings import (
    FeatureFlagItem,
    FeatureFlagsResponse,
    FeatureFlagUpdateRequest,
    PublicRuntimeConfigResponse,
    SystemSettingItem,
    SystemSettingsResponse,
    SystemSettingUpdateRequest,
)
from app.services.admin_audit_service import record_admin_audit, require_reason
from app.services.system_settings_service import (
    get_all_feature_flags,
    get_all_settings,
    public_runtime_config,
    update_feature_flag,
    update_setting,
)

router = APIRouter()
public_router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _setting_item(doc: dict) -> SystemSettingItem:
    return SystemSettingItem(
        key=doc["key"],
        value=doc.get("value"),
        value_type=doc.get("value_type", "string"),
        category=doc.get("category", "ai"),
        description=doc.get("description", ""),
        is_public=bool(doc.get("is_public")),
        updated_by=doc.get("updated_by"),
        updated_at=doc.get("updated_at"),
    )


def _flag_item(doc: dict) -> FeatureFlagItem:
    return FeatureFlagItem(
        key=doc["key"],
        enabled=bool(doc.get("enabled")),
        description=doc.get("description", ""),
        rollout_percentage=int(doc.get("rollout_percentage", 100)),
        allowed_roles=list(doc.get("allowed_roles") or []),
        updated_by=doc.get("updated_by"),
        updated_at=doc.get("updated_at"),
    )


@public_router.get("/runtime-config", response_model=PublicRuntimeConfigResponse)
async def get_public_runtime_config():
    return PublicRuntimeConfigResponse(**await public_runtime_config())


@router.get("/settings", response_model=SystemSettingsResponse)
async def list_system_settings(
    current_user: UserResponse = Depends(require_permission(Permission.SYSTEM_SETTINGS_VIEW)),
):
    docs = await get_all_settings()
    return SystemSettingsResponse(
        items=[_setting_item(docs[key]) for key in sorted(docs)],
        generated_at=_now(),
    )


@router.patch("/settings/{key}", response_model=SystemSettingItem)
async def patch_system_setting(
    key: str,
    payload: SystemSettingUpdateRequest,
    request: Request,
    current_user: UserResponse = Depends(require_permission(Permission.SYSTEM_SETTINGS_UPDATE)),
):
    reason = require_reason(payload.reason, "thay cấu hình hệ thống")
    db = get_database()
    before, after = await update_setting(key, payload.value, admin_user_id=current_user.id, database=db)
    await record_admin_audit(
        admin=current_user,
        action="system_setting_updated",
        target_type="system_setting",
        target_id=key,
        reason=reason,
        before=before,
        after=after,
        changed=["value", "updated_by", "updated_at"],
        request=request,
        database=db,
    )
    return _setting_item(after)


@router.get("/feature-flags", response_model=FeatureFlagsResponse)
async def list_feature_flags(
    current_user: UserResponse = Depends(require_permission(Permission.SYSTEM_SETTINGS_VIEW)),
):
    docs = await get_all_feature_flags()
    return FeatureFlagsResponse(
        items=[_flag_item(docs[key]) for key in sorted(docs)],
        generated_at=_now(),
    )


@router.patch("/feature-flags/{key}", response_model=FeatureFlagItem)
async def patch_feature_flag(
    key: str,
    payload: FeatureFlagUpdateRequest,
    request: Request,
    current_user: UserResponse = Depends(require_permission(Permission.FEATURE_FLAGS_UPDATE)),
):
    reason = require_reason(payload.reason, "thay feature flag")
    db = get_database()
    before, after = await update_feature_flag(
        key,
        admin_user_id=current_user.id,
        enabled=payload.enabled,
        description=payload.description,
        rollout_percentage=payload.rollout_percentage,
        allowed_roles=payload.allowed_roles,
        database=db,
    )
    await record_admin_audit(
        admin=current_user,
        action="feature_flag_updated",
        target_type="feature_flag",
        target_id=key,
        reason=reason,
        before=before,
        after=after,
        changed=["enabled", "description", "rollout_percentage", "allowed_roles", "updated_by", "updated_at"],
        request=request,
        database=db,
    )
    return _flag_item(after)
