from __future__ import annotations

import copy
import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.config import settings as env_settings
from app.core.rbac import ROLE_NAMES
from app.database.mongodb import get_database


SETTINGS_COLLECTION = "system_settings"
FEATURE_FLAGS_COLLECTION = "feature_flags"


@dataclass(frozen=True)
class SettingDefinition:
    key: str
    default: Any
    value_type: str
    category: str
    description: str
    is_public: bool = False
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    choices: Optional[tuple[Any, ...]] = None
    item_choices: Optional[tuple[Any, ...]] = None


@dataclass(frozen=True)
class FeatureFlagDefinition:
    key: str
    default_enabled: bool
    description: str
    rollout_percentage: int = 100
    allowed_roles: tuple[str, ...] = ()


SYSTEM_SETTING_DEFINITIONS: dict[str, SettingDefinition] = {
    "max_file_size_mb": SettingDefinition("max_file_size_mb", 20, "int", "upload", "Dung lượng tối đa cho file tài liệu tải lên.", minimum=1, maximum=500),
    "allowed_file_types": SettingDefinition("allowed_file_types", ["pdf", "docx", "pptx", "mp4", "mov", "webm", "mkv"], "list", "upload", "Định dạng file được phép tải lên.", item_choices=("pdf", "docx", "pptx", "mp4", "mov", "webm", "mkv")),
    "max_documents_per_user": SettingDefinition("max_documents_per_user", 200, "int", "upload", "Số học liệu tối đa mỗi user được giữ trong hệ thống.", minimum=1, maximum=100000),
    "enable_video_upload": SettingDefinition("enable_video_upload", True, "bool", "upload", "Cho phép tải video làm học liệu.", is_public=True),
    "max_questions_per_request": SettingDefinition("max_questions_per_request", 50, "int", "question_generation", "Số câu hỏi tối đa mỗi lần sinh.", minimum=1, maximum=200),
    "default_question_count": SettingDefinition("default_question_count", 10, "int", "question_generation", "Số câu hỏi mặc định ở giao diện.", is_public=True, minimum=1, maximum=50),
    "allowed_question_types": SettingDefinition("allowed_question_types", ["multiple_choice", "true_false", "short_answer"], "list", "question_generation", "Loại câu hỏi được phép sinh.", is_public=True, item_choices=("multiple_choice", "true_false", "short_answer")),
    "default_provider": SettingDefinition("default_provider", "groq", "string", "ai", "Nhà cung cấp AI mặc định.", choices=("groq", "gemini", "mixed")),
    "default_model": SettingDefinition("default_model", getattr(env_settings, "GROQ_MODEL", "llama-3.3-70b-versatile"), "string", "ai", "Model AI mặc định."),
    "fallback_provider": SettingDefinition("fallback_provider", "gemini", "string", "ai", "Nhà cung cấp AI fallback.", choices=("groq", "gemini", "mixed")),
    "timeout_seconds": SettingDefinition("timeout_seconds", int(getattr(env_settings, "AI_TIMEOUT_SECONDS", 25)), "int", "ai", "Timeout cho một số luồng gọi AI.", minimum=1, maximum=300),
    "retry_count": SettingDefinition("retry_count", int(getattr(env_settings, "MAX_RETRIES", 2)), "int", "ai", "Số lần retry cho một số luồng AI.", minimum=0, maximum=10),
    "rag_distance_threshold": SettingDefinition("rag_distance_threshold", float(getattr(env_settings, "RAG_DISTANCE_THRESHOLD", 0.75)), "float", "ai", "Ngưỡng distance dùng khi lọc kết quả RAG.", minimum=0, maximum=2),
    "gemini_daily_request_ceiling": SettingDefinition("gemini_daily_request_ceiling", 0, "int", "ai", "Ngưỡng số request/ngày dự kiến cho Gemini để cảnh báo sắp hết quota (0 = tắt cảnh báo).", minimum=0, maximum=10000000),
    "groq_daily_request_ceiling": SettingDefinition("groq_daily_request_ceiling", 0, "int", "ai", "Ngưỡng số request/ngày dự kiến cho Groq để cảnh báo sắp hết quota (0 = tắt cảnh báo).", minimum=0, maximum=10000000),
    "registration_enabled": SettingDefinition("registration_enabled", True, "bool", "user", "Cho phép người dùng tự đăng ký.", is_public=True),
    "email_verification_required": SettingDefinition("email_verification_required", False, "bool", "user", "Yêu cầu xác minh email trước khi dùng hệ thống.", is_public=True),
    "default_role": SettingDefinition("default_role", "", "string", "user", "Ép buộc role khi tự đăng ký (để trống = theo lựa chọn của người dùng; dùng khi cần khoá đăng ký giảng viên).", choices=("", "student", "lecturer")),
    "default_daily_quota": SettingDefinition("default_daily_quota", 50, "int", "user", "Quota request AI mỗi ngày mặc định cho user thường.", minimum=0, maximum=100000),
    "default_monthly_quota": SettingDefinition("default_monthly_quota", 1000, "int", "user", "Quota request AI mỗi tháng mặc định cho user thường.", minimum=0, maximum=3000000),
    "activity_log_retention_days": SettingDefinition("activity_log_retention_days", 180, "int", "logs", "Số ngày giữ user activity logs. Chưa tự xóa nếu chưa có job.", minimum=0, maximum=3650),
    "audit_log_retention_days": SettingDefinition("audit_log_retention_days", 365, "int", "logs", "Số ngày giữ admin audit logs. Chưa tự xóa nếu chưa có job.", minimum=0, maximum=3650),
    "system_log_retention_days": SettingDefinition("system_log_retention_days", 90, "int", "logs", "Số ngày giữ system logs. Chưa tự xóa nếu chưa có job.", minimum=0, maximum=3650),
}

FEATURE_FLAG_DEFINITIONS: dict[str, FeatureFlagDefinition] = {
    "enable_video_upload": FeatureFlagDefinition("enable_video_upload", True, "Bật/tắt tải video."),
    "enable_web_search": FeatureFlagDefinition("enable_web_search", True, "Bật/tắt web search trong advanced chat."),
    "enable_knowledge_verification": FeatureFlagDefinition("enable_knowledge_verification", True, "Bật/tắt kiểm tra kiến thức/hallucination."),
    "enable_personalization": FeatureFlagDefinition("enable_personalization", bool(getattr(env_settings, "PERSONALIZATION_ENABLED", False)), "Bật/tắt API cá nhân hóa."),
    "enable_question_export": FeatureFlagDefinition("enable_question_export", True, "Bật/tắt xuất đề PDF/DOCX."),
    "enable_advanced_chat": FeatureFlagDefinition("enable_advanced_chat", True, "Bật/tắt hỏi đáp AI nâng cao."),
    "enable_user_registration": FeatureFlagDefinition("enable_user_registration", True, "Bật/tắt tự đăng ký tài khoản."),
    "enable_maintenance_mode": FeatureFlagDefinition("enable_maintenance_mode", False, "Chế độ bảo trì: admin vẫn truy cập, user thường bị chặn."),
}

SENSITIVE_KEY_PATTERN = re.compile(r"(api[_-]?key|password|secret|jwt|token|mongo|database|cloudinary)", re.IGNORECASE)

_settings_cache: Optional[dict[str, dict[str, Any]]] = None
_feature_flags_cache: Optional[dict[str, dict[str, Any]]] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def invalidate_runtime_config_cache() -> None:
    global _settings_cache, _feature_flags_cache
    _settings_cache = None
    _feature_flags_cache = None


def _default_setting_doc(definition: SettingDefinition) -> dict[str, Any]:
    return {
        "key": definition.key,
        "value": copy.deepcopy(definition.default),
        "value_type": definition.value_type,
        "category": definition.category,
        "description": definition.description,
        "is_public": definition.is_public,
        "updated_by": None,
        "updated_at": None,
    }


def _default_flag_doc(definition: FeatureFlagDefinition) -> dict[str, Any]:
    return {
        "key": definition.key,
        "enabled": definition.default_enabled,
        "description": definition.description,
        "rollout_percentage": definition.rollout_percentage,
        "allowed_roles": list(definition.allowed_roles),
        "updated_by": None,
        "updated_at": None,
    }


def _coerce_value(definition: SettingDefinition, value: Any) -> Any:
    if SENSITIVE_KEY_PATTERN.search(definition.key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không được quản lý secret qua System Settings.")
    try:
        if definition.value_type == "bool":
            if isinstance(value, bool):
                coerced = value
            elif isinstance(value, str) and value.lower() in {"true", "false"}:
                coerced = value.lower() == "true"
            else:
                raise ValueError
        elif definition.value_type == "int":
            if isinstance(value, bool):
                raise ValueError
            coerced = int(value)
        elif definition.value_type == "float":
            if isinstance(value, bool):
                raise ValueError
            coerced = float(value)
        elif definition.value_type == "list":
            if not isinstance(value, list):
                raise ValueError
            coerced = [str(item).strip().lower() for item in value if str(item).strip()]
        else:
            coerced = str(value).strip()
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Giá trị {definition.key} không đúng kiểu {definition.value_type}.")

    if isinstance(coerced, (int, float)):
        if definition.minimum is not None and coerced < definition.minimum:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{definition.key} phải >= {definition.minimum}.")
        if definition.maximum is not None and coerced > definition.maximum:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{definition.key} phải <= {definition.maximum}.")
    if definition.choices and coerced not in definition.choices:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{definition.key} không thuộc danh sách cho phép.")
    if definition.item_choices and isinstance(coerced, list):
        invalid = [item for item in coerced if item not in definition.item_choices]
        if invalid:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{definition.key} chứa giá trị không hợp lệ: {', '.join(invalid)}.")
    if isinstance(coerced, str) and len(coerced) > 300:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{definition.key} quá dài.")
    if isinstance(coerced, list) and len(coerced) > 50:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{definition.key} có quá nhiều phần tử.")
    return coerced


async def ensure_runtime_config_seeded(database: Any = None) -> None:
    db = database or get_database()
    for key, definition in SYSTEM_SETTING_DEFINITIONS.items():
        if await db[SETTINGS_COLLECTION].find_one({"key": key}, {"_id": 1}):
            continue
        await db[SETTINGS_COLLECTION].insert_one(_default_setting_doc(definition))
    for key, definition in FEATURE_FLAG_DEFINITIONS.items():
        if await db[FEATURE_FLAGS_COLLECTION].find_one({"key": key}, {"_id": 1}):
            continue
        await db[FEATURE_FLAGS_COLLECTION].insert_one(_default_flag_doc(definition))


async def get_all_settings(database: Any = None, *, force_refresh: bool = False) -> dict[str, dict[str, Any]]:
    global _settings_cache
    if _settings_cache is not None and not force_refresh:
        return copy.deepcopy(_settings_cache)
    db = database or get_database()
    try:
        await ensure_runtime_config_seeded(db)
        docs = await db[SETTINGS_COLLECTION].find({"key": {"$in": list(SYSTEM_SETTING_DEFINITIONS)}}).to_list(None)
    except Exception:
        docs = []
    by_key = {doc["key"]: doc for doc in docs if doc.get("key") in SYSTEM_SETTING_DEFINITIONS}
    merged = {}
    for key, definition in SYSTEM_SETTING_DEFINITIONS.items():
        doc = {**_default_setting_doc(definition), **(by_key.get(key) or {})}
        doc["value"] = _coerce_value(definition, doc.get("value", definition.default))
        merged[key] = doc
    _settings_cache = copy.deepcopy(merged)
    return copy.deepcopy(merged)


async def get_setting_value(key: str, default: Any = None, database: Any = None) -> Any:
    definition = SYSTEM_SETTING_DEFINITIONS.get(key)
    if not definition:
        return default
    settings_map = await get_all_settings(database)
    return copy.deepcopy(settings_map.get(key, {}).get("value", definition.default))


async def update_setting(key: str, value: Any, *, admin_user_id: str, database: Any = None) -> tuple[dict[str, Any], dict[str, Any]]:
    definition = SYSTEM_SETTING_DEFINITIONS.get(key)
    if not definition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setting không tồn tại.")
    coerced = _coerce_value(definition, value)
    db = database or get_database()
    await ensure_runtime_config_seeded(db)
    before = await db[SETTINGS_COLLECTION].find_one({"key": key}) or _default_setting_doc(definition)
    after = {
        **_default_setting_doc(definition),
        **before,
        "value": coerced,
        "updated_by": admin_user_id,
        "updated_at": _now(),
    }
    await db[SETTINGS_COLLECTION].update_one({"key": key}, {"$set": after}, upsert=True)
    invalidate_runtime_config_cache()
    return before, after


async def get_all_feature_flags(database: Any = None, *, force_refresh: bool = False) -> dict[str, dict[str, Any]]:
    global _feature_flags_cache
    if _feature_flags_cache is not None and not force_refresh:
        return copy.deepcopy(_feature_flags_cache)
    db = database or get_database()
    try:
        await ensure_runtime_config_seeded(db)
        docs = await db[FEATURE_FLAGS_COLLECTION].find({"key": {"$in": list(FEATURE_FLAG_DEFINITIONS)}}).to_list(None)
    except Exception:
        docs = []
    by_key = {doc["key"]: doc for doc in docs if doc.get("key") in FEATURE_FLAG_DEFINITIONS}
    merged = {}
    for key, definition in FEATURE_FLAG_DEFINITIONS.items():
        doc = {**_default_flag_doc(definition), **(by_key.get(key) or {})}
        doc["enabled"] = bool(doc.get("enabled"))
        doc["rollout_percentage"] = max(0, min(100, int(doc.get("rollout_percentage", 100))))
        doc["allowed_roles"] = [str(role) for role in (doc.get("allowed_roles") or []) if str(role) in ROLE_NAMES]
        merged[key] = doc
    _feature_flags_cache = copy.deepcopy(merged)
    return copy.deepcopy(merged)


async def update_feature_flag(
    key: str,
    *,
    admin_user_id: str,
    enabled: Optional[bool] = None,
    description: Optional[str] = None,
    rollout_percentage: Optional[int] = None,
    allowed_roles: Optional[list[str]] = None,
    database: Any = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    definition = FEATURE_FLAG_DEFINITIONS.get(key)
    if not definition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature flag không tồn tại.")
    db = database or get_database()
    await ensure_runtime_config_seeded(db)
    before = await db[FEATURE_FLAGS_COLLECTION].find_one({"key": key}) or _default_flag_doc(definition)
    after = {**_default_flag_doc(definition), **before}
    if enabled is not None:
        after["enabled"] = bool(enabled)
    if description is not None:
        after["description"] = str(description).strip()[:500] or definition.description
    if rollout_percentage is not None:
        after["rollout_percentage"] = max(0, min(100, int(rollout_percentage)))
    if allowed_roles is not None:
        after["allowed_roles"] = [role for role in allowed_roles if role in ROLE_NAMES]
    after["updated_by"] = admin_user_id
    after["updated_at"] = _now()
    await db[FEATURE_FLAGS_COLLECTION].update_one({"key": key}, {"$set": after}, upsert=True)
    invalidate_runtime_config_cache()
    return before, after


async def is_feature_enabled(key: str, *, user_role: Optional[str] = None, user_id: Optional[str] = None, database: Any = None) -> bool:
    definition = FEATURE_FLAG_DEFINITIONS.get(key)
    if not definition:
        return False
    flags = await get_all_feature_flags(database)
    flag = flags.get(key) or _default_flag_doc(definition)
    if not flag.get("enabled"):
        return False
    allowed_roles = flag.get("allowed_roles") or []
    if allowed_roles and user_role not in allowed_roles:
        return False
    rollout = int(flag.get("rollout_percentage", 100))
    if rollout >= 100:
        return True
    if rollout <= 0:
        return False
    bucket_source = user_id or user_role or "anonymous"
    bucket = int(hashlib.sha256(bucket_source.encode()).hexdigest()[:8], 16) % 100
    return bucket < rollout


async def require_feature_enabled_flag(key: str, *, user_role: Optional[str] = None, user_id: Optional[str] = None) -> None:
    if not await is_feature_enabled(key, user_role=user_role, user_id=user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tính năng hiện đang bị tắt bởi quản trị viên.")


def require_feature_enabled(key: str):
    async def dependency():
        await require_feature_enabled_flag(key)

    return dependency


async def public_runtime_config(database: Any = None) -> dict[str, Any]:
    settings_map = await get_all_settings(database)
    flags_map = await get_all_feature_flags(database)
    return {
        "settings": {key: doc["value"] for key, doc in settings_map.items() if doc.get("is_public")},
        "feature_flags": {key: bool(doc.get("enabled")) for key, doc in flags_map.items()},
        "generated_at": _now(),
    }
