from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, time, timezone
from typing import Any, Iterable, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.core.rbac import Permission, require_permission
from app.database.mongodb import get_database
from app.schemas.admin_notifications_reports import ReportFormat, ReportType, ReportTypeItem, ReportTypesResponse
from app.schemas.auth import UserResponse
from app.services.admin_audit_service import record_admin_audit
from app.services.export_service import _register_pdf_font

router = APIRouter()

MAX_EXPORT_LIMIT = 5000
SENSITIVE_KEYS = {
    "password",
    "hashed_password",
    "password_hash",
    "access_token",
    "refresh_token",
    "token",
    "api_key",
    "secret",
    "authorization",
}

REPORT_DEFINITIONS: dict[ReportType, dict[str, Any]] = {
    "users": {
        "label": "Danh sách người dùng",
        "description": "Thông tin tài khoản, role, trạng thái và quota hiện tại.",
        "collection": "users",
        "date_field": "created_at",
        "columns": ["id", "email", "full_name", "role", "status", "is_active", "created_at", "last_login_at", "deleted_at", "ai_quota"],
    },
    "activity_logs": {
        "label": "Hoạt động người dùng",
        "description": "User Activity Logs theo category/action/status.",
        "collection": "user_activity_logs",
        "date_field": "timestamp",
        "columns": ["id", "user_id", "action", "category", "resource_type", "resource_id", "status", "timestamp", "error_code", "duration_ms"],
    },
    "admin_audit_logs": {
        "label": "Nhật ký quản trị",
        "description": "Audit log thao tác quản trị và kết quả.",
        "collection": "admin_audit_logs",
        "date_field": "timestamp",
        "columns": ["id", "admin_user_id", "admin_email_snapshot", "action", "target_type", "target_id", "timestamp", "reason", "result", "changed_fields"],
    },
    "documents": {
        "label": "Tài liệu",
        "description": "Metadata tài liệu, trạng thái xử lý, dung lượng và lỗi an toàn.",
        "collection": "documents",
        "date_field": "created_at",
        "columns": ["id", "user_id", "original_filename", "file_type", "file_size", "status", "page_count", "created_at", "updated_at", "deleted_at", "error_message"],
    },
    "questions": {
        "label": "Câu hỏi",
        "description": "Question set và số lượng câu hỏi, không xuất toàn bộ nội dung riêng tư.",
        "collection": "question_sets",
        "date_field": "created_at",
        "columns": ["id", "user_id", "document_id", "document_name", "question_count", "question_type", "difficulty", "status", "created_at", "updated_at", "deleted_at"],
    },
    "ai_usage": {
        "label": "AI usage",
        "description": "Lượt gọi AI, token, chi phí ước tính, model và provider.",
        "collection": "ai_usage_events",
        "date_field": "created_at",
        "columns": ["id", "user_id", "feature", "operation_type", "provider", "model", "model_name", "input_tokens", "output_tokens", "total_tokens", "estimated_cost", "currency", "latency_ms", "status", "error_code", "created_at"],
    },
    "quota": {
        "label": "Quota",
        "description": "Quota override hiện tại theo user.",
        "collection": "users",
        "date_field": "updated_at",
        "columns": ["id", "email", "full_name", "role", "ai_quota", "current_quota", "updated_at"],
    },
    "system_errors": {
        "label": "Lỗi hệ thống",
        "description": "System Error Monitoring chuẩn hóa, không có stack trace hoặc secret.",
        "collection": "system_error_logs",
        "date_field": "timestamp",
        "columns": ["id", "error_id", "timestamp", "service", "endpoint", "method", "status_code", "error_code", "message_safe", "request_id", "user_id", "duration_ms", "severity"],
    },
    "ai_quality": {
        "label": "Chất lượng AI",
        "description": "Các tín hiệu chất lượng, lỗi và độ trễ từ AI usage events.",
        "collection": "ai_usage_events",
        "date_field": "created_at",
        "columns": ["id", "user_id", "feature", "provider", "model", "status", "error_code", "latency_ms", "total_tokens", "created_at"],
    },
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _maybe_datetime(value: Any) -> Optional[datetime]:
    return value if isinstance(value, datetime) else None


def _maybe_str(value: Any) -> Optional[str]:
    return value if isinstance(value, str) and value.strip() else None


def _date_range(field: str, start: Optional[datetime], end: Optional[datetime]) -> dict[str, Any]:
    if not start and not end:
        return {}
    clause: dict[str, Any] = {}
    if start:
        clause["$gte"] = start.astimezone(timezone.utc) if start.tzinfo else start.replace(tzinfo=timezone.utc)
    if end:
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if end.time() == time.min:
            end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
        clause["$lte"] = end.astimezone(timezone.utc)
    return {field: clause}


def _search_query(report_type: ReportType, search: Optional[str]) -> dict[str, Any]:
    if not search:
        return {}
    pattern = re.escape(search.strip())
    if report_type == "users":
        return {"$or": [{"email": {"$regex": pattern, "$options": "i"}}, {"full_name": {"$regex": pattern, "$options": "i"}}]}
    if report_type == "documents":
        return {"original_filename": {"$regex": pattern, "$options": "i"}}
    if report_type == "admin_audit_logs":
        return {"$or": [{"admin_email_snapshot": {"$regex": pattern, "$options": "i"}}, {"action": {"$regex": pattern, "$options": "i"}}, {"target_id": {"$regex": pattern, "$options": "i"}}]}
    if report_type == "system_errors":
        return {"$or": [{"endpoint": {"$regex": pattern, "$options": "i"}}, {"error_code": {"$regex": pattern, "$options": "i"}}, {"request_id": {"$regex": pattern, "$options": "i"}}]}
    return {}


def _build_query(
    *,
    report_type: ReportType,
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    search: Optional[str],
    role: Optional[str],
    status_filter: Optional[str],
    user_id: Optional[str],
    provider: Optional[str],
    model: Optional[str],
    feature: Optional[str],
    severity: Optional[str],
    category: Optional[str],
    action: Optional[str],
    target_type: Optional[str],
) -> dict[str, Any]:
    definition = REPORT_DEFINITIONS[report_type]
    query: dict[str, Any] = {}
    query.update(_date_range(definition["date_field"], date_from, date_to))
    query.update(_search_query(report_type, search))
    if role and report_type in {"users", "quota"}:
        query["role"] = role
    if status_filter:
        query["status"] = status_filter
    if user_id:
        if report_type == "admin_audit_logs":
            query["admin_user_id"] = user_id
        else:
            query["user_id"] = user_id
    if provider and report_type in {"ai_usage", "ai_quality"}:
        query["provider"] = provider
    if model and report_type in {"ai_usage", "ai_quality"}:
        query["$or"] = [{"model": model}, {"model_name": model}]
    if feature and report_type in {"ai_usage", "ai_quality"}:
        query["$and"] = [{"$or": [{"feature": feature}, {"operation_type": feature}]}]
    if severity and report_type == "system_errors":
        query["severity"] = severity
    if category and report_type == "activity_logs":
        query["category"] = category
    if action and report_type in {"activity_logs", "admin_audit_logs"}:
        query["action"] = action
    if target_type and report_type == "admin_audit_logs":
        query["target_type"] = target_type
    if report_type == "ai_quality":
        query.setdefault("is_final", True)
        query.setdefault("event_kind", "logical_operation")
    return query


def _safe_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "binary"):
        return str(value)
    if isinstance(value, dict):
        safe = {key: _safe_value(val) for key, val in value.items() if key.lower() not in SENSITIVE_KEYS}
        return json.dumps(safe, ensure_ascii=False)
    if isinstance(value, list):
        return json.dumps([_safe_value(item) for item in value], ensure_ascii=False)
    return value


def _row(doc: dict[str, Any], columns: Iterable[str]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for column in columns:
        if column.lower() in SENSITIVE_KEYS:
            continue
        result[column] = str(doc.get("_id")) if column == "id" else _safe_value(doc.get(column))
    return result


def _csv_bytes(rows: list[dict[str, Any]], columns: list[str]) -> bytes:
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return stream.getvalue().encode("utf-8-sig")


def _pdf_bytes(rows: list[dict[str, Any]], columns: list[str], *, title: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    font_name = _register_pdf_font()
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=title,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=styles["Heading1"], fontName=font_name, fontSize=15)
    meta_style = ParagraphStyle("ReportMeta", parent=styles["Normal"], fontName=font_name, fontSize=9, textColor=colors.grey)

    max_cell_len = 60
    table_data = [columns] + [
        [str(row.get(col, ""))[:max_cell_len] for col in columns]
        for row in rows
    ]
    table = Table(table_data, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
    ]))

    elements = [
        Paragraph(title, title_style),
        Paragraph(f"Tổng số dòng: {len(rows)} — Đây là dữ liệu xuất báo cáo nội bộ, không phải chứng từ chính thức.", meta_style),
        Spacer(1, 8),
        table,
    ]
    doc.build(elements)
    output.seek(0)
    return output.getvalue()


def _xlsx_bytes(rows: list[dict[str, Any]], columns: list[str]) -> bytes:
    import xlsxwriter

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    worksheet = workbook.add_worksheet("Report")
    header_format = workbook.add_format({"bold": True, "bg_color": "#E5E7EB"})
    for index, column in enumerate(columns):
        worksheet.write(0, index, column, header_format)
        worksheet.set_column(index, index, min(max(len(column) + 4, 14), 42))
    for row_index, row in enumerate(rows, start=1):
        for col_index, column in enumerate(columns):
            worksheet.write(row_index, col_index, row.get(column))
    workbook.close()
    output.seek(0)
    return output.getvalue()


@router.get("/reports/types", response_model=ReportTypesResponse)
async def report_types(
    current_user: UserResponse = Depends(require_permission(Permission.REPORTS_EXPORT)),
):
    return ReportTypesResponse(
        items=[
            ReportTypeItem(key=key, label=value["label"], description=value["description"], formats=["csv", "xlsx", "pdf"])
            for key, value in REPORT_DEFINITIONS.items()
        ],
        max_limit=MAX_EXPORT_LIMIT,
        generated_at=_now(),
    )


@router.get("/reports/export")
async def export_report(
    report_type: ReportType = Query(...),
    format: ReportFormat = Query("csv"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    limit: int = Query(1000, ge=1, le=MAX_EXPORT_LIMIT),
    search: Optional[str] = Query(None, max_length=120),
    role: Optional[str] = Query(None, max_length=40),
    status_filter: Optional[str] = Query(None, alias="status", max_length=60),
    user_id: Optional[str] = Query(None, max_length=80),
    provider: Optional[str] = Query(None, max_length=60),
    model: Optional[str] = Query(None, max_length=120),
    feature: Optional[str] = Query(None, max_length=80),
    severity: Optional[str] = Query(None, max_length=40),
    category: Optional[str] = Query(None, max_length=80),
    action: Optional[str] = Query(None, max_length=100),
    target_type: Optional[str] = Query(None, max_length=80),
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.REPORTS_EXPORT)),
):
    db = get_database()
    definition = REPORT_DEFINITIONS[report_type]
    query = _build_query(
        report_type=report_type,
        date_from=_maybe_datetime(date_from),
        date_to=_maybe_datetime(date_to),
        search=_maybe_str(search),
        role=_maybe_str(role),
        status_filter=_maybe_str(status_filter),
        user_id=_maybe_str(user_id),
        provider=_maybe_str(provider),
        model=_maybe_str(model),
        feature=_maybe_str(feature),
        severity=_maybe_str(severity),
        category=_maybe_str(category),
        action=_maybe_str(action),
        target_type=_maybe_str(target_type),
    )
    docs = await (
        db[definition["collection"]]
        .find(query, {key: 0 for key in SENSITIVE_KEYS})
        .sort(definition["date_field"], -1)
        .limit(limit)
        .to_list(limit)
    )
    columns = list(definition["columns"])
    rows = [_row(doc, columns) for doc in docs]
    if format == "xlsx":
        payload = _xlsx_bytes(rows, columns)
    elif format == "pdf":
        payload = _pdf_bytes(rows, columns, title=f"Báo cáo {definition['label']}")
    else:
        payload = _csv_bytes(rows, columns)
    today = _now().strftime("%Y%m%d")
    filename = f"ezedu-{report_type}-{today}.{format}"
    await record_admin_audit(
        admin=current_user,
        action="report_exported",
        target_type="report",
        target_id=report_type,
        reason=f"Xuất báo cáo {definition['label']}",
        after={"report_type": report_type, "format": format, "row_count": len(rows), "limit": limit},
        request=request,
        database=db,
    )
    if format == "xlsx":
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif format == "pdf":
        media_type = "application/pdf"
    else:
        media_type = "text/csv; charset=utf-8"
    return StreamingResponse(
        io.BytesIO(payload),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
