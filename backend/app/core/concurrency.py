"""Optimistic concurrency (compare-and-set) dùng chung qua field `version`.

Mọi entity mới có field `version: int` (mặc định 1, tăng dần mỗi lần ghi).
Khi client sửa, phải gửi kèm `version` đang có; ghi chỉ thành công nếu
`version` trong DB vẫn khớp — tăng `version` lên 1 trong cùng một thao tác
`find_one_and_update` (atomic, không có khoảng hở race giữa đọc và ghi).

Đây là cơ chế Compare-And-Set thủ công, cùng tinh thần với
`document_mutation_service.py` hiện có (dùng token thay vì version số) —
dùng version số ở đây vì phù hợp hơn với các entity có nhiều lần sửa tuần
tự (Question, ExamAttempt) thay vì các thao tác loại trừ lẫn nhau
(extract/index) mà document_mutation_service.py đang phục vụ.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from fastapi import HTTPException, status


class VersionConflict(Exception):
    """Ghi thất bại vì `version` client gửi lên không khớp bản ghi hiện tại."""


async def compare_and_set(
    collection,
    *,
    filter_query: Mapping[str, Any],
    expected_version: int,
    update: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Cập nhật một document chỉ khi `version` hiện tại == `expected_version`.

    `update` là phần `$set`/`$unset`/... do caller cung cấp — hàm này TỰ động
    thêm `$set: {"version": expected_version + 1}` và `$currentDate`-kiểu
    `updated_at` do caller tự set trong `update["$set"]` nếu cần (không giả
    định caller luôn set updated_at, để tránh phụ thuộc ẩn).

    Trả về document SAU khi cập nhật. Raise `VersionConflict` nếu không tìm
    thấy document khớp cả filter lẫn version — nghĩa là đã bị sửa bởi request
    khác kể từ lần client đọc gần nhất (client phải tải lại và thử lại).
    """
    merged_filter = {**filter_query, "version": expected_version}
    merged_set = dict(update.get("$set", {}))
    merged_set["version"] = expected_version + 1
    full_update = {**update, "$set": merged_set}

    result = await collection.find_one_and_update(
        merged_filter,
        full_update,
        return_document=True,
    )
    if result is None:
        raise VersionConflict(
            "Dữ liệu đã bị thay đổi bởi một thao tác khác — vui lòng tải lại và thử lại."
        )
    return result


def version_conflict_http_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Dữ liệu đã bị thay đổi bởi một thao tác khác — vui lòng tải lại và thử lại.",
    )


def require_version(payload_version: Optional[int]) -> int:
    if payload_version is None or payload_version < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu hoặc sai field 'version' bắt buộc cho thao tác cập nhật đồng thời an toàn.",
        )
    return payload_version
