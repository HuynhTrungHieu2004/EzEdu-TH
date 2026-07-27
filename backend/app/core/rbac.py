"""Central RBAC registry and authorization guards."""
from __future__ import annotations

from typing import Any, Callable, Iterable, Literal

from fastapi import Depends, HTTPException, Request, status


class Permission:
    USERS_VIEW = "users.view"
    USERS_CREATE = "users.create"
    USERS_UPDATE = "users.update"
    USERS_LOCK = "users.lock"
    USERS_DELETE = "users.delete"
    USERS_RESTORE = "users.restore"
    USERS_CHANGE_ROLE = "users.change_role"
    USERS_RESET_PASSWORD = "users.reset_password"
    USERS_MANAGE_QUOTA = "users.manage_quota"

    ACTIVITY_LOGS_VIEW = "activity_logs.view"
    ADMIN_AUDIT_LOGS_VIEW = "admin_audit_logs.view"

    DOCUMENTS_VIEW = "documents.view"
    DOCUMENTS_UPDATE = "documents.update"
    DOCUMENTS_DELETE = "documents.delete"
    DOCUMENTS_REPROCESS = "documents.reprocess"

    QUESTIONS_VIEW = "questions.view"
    QUESTIONS_UPDATE = "questions.update"
    QUESTIONS_DELETE = "questions.delete"
    QUESTIONS_REGENERATE = "questions.regenerate"

    ANALYTICS_VIEW = "analytics.view"
    AI_USAGE_VIEW = "ai_usage.view"
    AI_SETTINGS_UPDATE = "ai_settings.update"

    WEBSITE_CONTENT_VIEW = "website_content.view"
    WEBSITE_CONTENT_UPDATE = "website_content.update"
    WEBSITE_CONTENT_PUBLISH = "website_content.publish"

    SYSTEM_SETTINGS_VIEW = "system_settings.view"
    SYSTEM_SETTINGS_UPDATE = "system_settings.update"
    FEATURE_FLAGS_UPDATE = "feature_flags.update"

    SYSTEM_HEALTH_VIEW = "system_health.view"
    NOTIFICATIONS_MANAGE = "notifications.manage"
    REPORTS_EXPORT = "reports.export"


ALL_PERMISSIONS: frozenset[str] = frozenset(
    value for name, value in vars(Permission).items()
    if name.isupper() and isinstance(value, str)
)

RoleName = Literal[
    "super_admin",
    "admin",
    "moderator",
    "support",
    "analyst",
    "user",
    # Backward-compatible application roles.
    "student",
    "lecturer",
]

SUPER_ADMIN_ROLE = "super_admin"
ADMIN_ROLE = "admin"

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    SUPER_ADMIN_ROLE: ALL_PERMISSIONS,
    ADMIN_ROLE: ALL_PERMISSIONS,
    "moderator": frozenset({
        Permission.DOCUMENTS_VIEW,
        Permission.DOCUMENTS_UPDATE,
        Permission.DOCUMENTS_DELETE,
        Permission.DOCUMENTS_REPROCESS,
        Permission.QUESTIONS_VIEW,
        Permission.QUESTIONS_UPDATE,
        Permission.QUESTIONS_DELETE,
        Permission.QUESTIONS_REGENERATE,
        Permission.ACTIVITY_LOGS_VIEW,
    }),
    "support": frozenset({
        Permission.USERS_VIEW,
        Permission.ACTIVITY_LOGS_VIEW,
    }),
    "analyst": frozenset({
        Permission.ANALYTICS_VIEW,
        Permission.AI_USAGE_VIEW,
        Permission.REPORTS_EXPORT,
    }),
    "user": frozenset(),
    "student": frozenset(),
    "lecturer": frozenset(),
}

ROLE_NAMES: frozenset[str] = frozenset(ROLE_PERMISSIONS.keys())


def normalize_role(role: str | None) -> str:
    role_name = (role or "user").strip()
    return role_name if role_name in ROLE_NAMES else "user"


def sanitize_permissions(values: Iterable[Any] | None) -> list[str]:
    if not values:
        return []
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        permission = str(value).strip()
        if permission in ALL_PERMISSIONS and permission not in seen:
            seen.add(permission)
            result.append(permission)
    return result


def role_permissions(role: str | None) -> frozenset[str]:
    return ROLE_PERMISSIONS.get(normalize_role(role), frozenset())


def effective_permissions(user: Any) -> frozenset[str]:
    role = normalize_role(getattr(user, "role", None))
    if role == SUPER_ADMIN_ROLE:
        return ALL_PERMISSIONS
    permissions = set(role_permissions(role))
    permissions.update(sanitize_permissions(getattr(user, "permissions_override", None)))
    return frozenset(permissions)


def has_role(user: Any, roles: Iterable[str]) -> bool:
    role = normalize_role(getattr(user, "role", None))
    allowed = {normalize_role(item) for item in roles}
    return role == SUPER_ADMIN_ROLE or role in allowed


def has_permission(user: Any, permission: str) -> bool:
    return permission in effective_permissions(user)


def require_role(*roles: str) -> Callable:
    allowed_roles = tuple(normalize_role(role) for role in roles)

    async def dependency(current_user=Depends(_get_current_user_dependency()), request: Request = None):
        if not has_role(current_user, allowed_roles):
            if request is not None:
                from app.services.activity_log_service import record_activity

                await record_activity(
                    action="permission_denied",
                    category="security",
                    status="denied",
                    user_id=getattr(current_user, "id", None),
                    resource_type="route",
                    resource_id=str(request.url.path),
                    request=request,
                    metadata={
                        "required_roles": list(allowed_roles),
                        "role": getattr(current_user, "role", None),
                    },
                    error_code="RBAC_ROLE_DENIED",
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Quyền truy cập bị từ chối.",
            )
        return current_user

    return dependency


def require_permission(*permissions: str, require_all: bool = True) -> Callable:
    required_permissions = tuple(permissions)
    unknown = [item for item in required_permissions if item not in ALL_PERMISSIONS]
    if unknown:
        raise ValueError(f"Unknown permission(s): {', '.join(unknown)}")

    async def dependency(current_user=Depends(_get_current_user_dependency()), request: Request = None):
        user_permissions = effective_permissions(current_user)
        if require_all:
            allowed = all(permission in user_permissions for permission in required_permissions)
        else:
            allowed = any(permission in user_permissions for permission in required_permissions)
        if not allowed:
            if request is not None:
                from app.services.activity_log_service import record_activity

                await record_activity(
                    action="permission_denied",
                    category="security",
                    status="denied",
                    user_id=getattr(current_user, "id", None),
                    resource_type="route",
                    resource_id=str(request.url.path),
                    request=request,
                    metadata={
                        "required_permissions": list(required_permissions),
                        "require_all": require_all,
                        "role": getattr(current_user, "role", None),
                    },
                    error_code="RBAC_PERMISSION_DENIED",
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thực hiện thao tác này.",
            )
        return current_user

    return dependency


def _get_current_user_dependency():
    from app.routers.auth import get_current_user

    return get_current_user
