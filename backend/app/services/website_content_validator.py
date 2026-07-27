from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, status

SCRIPT_PATTERNS = re.compile(r"<\s*/?\s*script|javascript:|onerror\s*=|onload\s*=", re.IGNORECASE)
HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
SAFE_PATH = re.compile(r"^(#[A-Za-z0-9_-]+|/[A-Za-z0-9_./?#=&%-]*|https?://[^\s]+)$")
MAX_STRING = 1200
MAX_LIST = 80
MAX_DEPTH = 8


def _fail(message: str) -> None:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def validate_url(value: str, field_name: str = "url") -> None:
    if not value:
        return
    if SCRIPT_PATTERNS.search(value) or not SAFE_PATH.match(value):
        _fail(f"{field_name} không hợp lệ.")


def validate_color(value: str, field_name: str = "color") -> None:
    if value and not HEX_COLOR.match(value):
        _fail(f"{field_name} phải là mã màu hex.")


def validate_content(value: Any, *, depth: int = 0, path: str = "content") -> None:
    if depth > MAX_DEPTH:
        _fail("Nội dung quá sâu.")
    if isinstance(value, str):
        if len(value) > MAX_STRING:
            _fail(f"{path} vượt quá độ dài cho phép.")
        if SCRIPT_PATTERNS.search(value):
            _fail("Không cho phép script hoặc JavaScript trong nội dung.")
        if path.lower().endswith(("href", "url", "image_url", "logo_url", "favicon_url")):
            validate_url(value, path)
        if path.lower().endswith(("color", "background_color", "text_color")):
            validate_color(value, path)
        return
    if isinstance(value, bool) or isinstance(value, int) or isinstance(value, float) or value is None:
        return
    if isinstance(value, list):
        if len(value) > MAX_LIST:
            _fail(f"{path} có quá nhiều mục.")
        for index, item in enumerate(value):
            validate_content(item, depth=depth + 1, path=f"{path}.{index}")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key)
            if SCRIPT_PATTERNS.search(key_text) or key_text.lower() in {"script", "html", "dangerouslysetinnerhtml"}:
                _fail("Không cho phép trường nội dung nguy hiểm.")
            validate_content(item, depth=depth + 1, path=f"{path}.{key_text}")
        return
    _fail("Kiểu dữ liệu nội dung không được hỗ trợ.")
