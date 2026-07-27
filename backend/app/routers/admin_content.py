from __future__ import annotations

import math
import re
from datetime import datetime, time, timezone
from types import SimpleNamespace
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.rbac import Permission, require_permission
from app.database.mongodb import get_database
from app.routers.documents import extract_document_content, index_document_api
from app.services.question_generation_service import regenerate_single_question
from app.schemas.admin_content import (
    AdminDocumentDetail,
    AdminDocumentListResponse,
    AdminDocumentSummary,
    AdminExamListResponse,
    AdminExamSummary,
    AdminOwnerSnapshot,
    AdminQuestionDetail,
    AdminQuestionListResponse,
    AdminQuestionModerationRequest,
    AdminQuestionSummary,
    AdminQuestionUpdateRequest,
    AdminReasonRequest,
    ContentStatus,
    SortOrder,
)
from app.schemas.auth import UserResponse
from app.services.admin_audit_service import record_admin_audit, require_reason

router = APIRouter()

DOCUMENT_SORT_FIELDS = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "file_size": "file_size",
    "status": "status",
    "file_type": "file_type",
    "original_filename": "original_filename",
}

EXAM_SORT_FIELDS = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "question_count": "question_count",
    "document_name": "document_name",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_oid(value: str, name: str = "id") -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail=f"{name} không hợp lệ.")
    return ObjectId(value)


def _date_range(field: str, start: Optional[datetime], end: Optional[datetime]) -> dict[str, Any]:
    if not start and not end:
        return {}
    clause: dict[str, Any] = {}
    if start:
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        clause["$gte"] = start.astimezone(timezone.utc)
    if end:
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if end.time() == time.min:
            end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
        clause["$lte"] = end.astimezone(timezone.utc)
    return {field: clause}


async def _owner(db, user_id: Optional[str]) -> AdminOwnerSnapshot:
    if not user_id:
        return AdminOwnerSnapshot()
    doc = None
    if ObjectId.is_valid(user_id):
        doc = await db["users"].find_one({"_id": ObjectId(user_id)}, {"email": 1, "full_name": 1, "role": 1})
    return AdminOwnerSnapshot(
        id=user_id,
        email=(doc or {}).get("email"),
        full_name=(doc or {}).get("full_name"),
        role=(doc or {}).get("role"),
    )


async def _document_counts(db, document_id: str, user_id: Optional[str]) -> tuple[int, int, Optional[str]]:
    chunk_query = {"document_id": document_id}
    question_query = {"document_id": document_id}
    if user_id:
        chunk_query["user_id"] = user_id
        question_query["user_id"] = user_id
    chunk_count = await db["document_chunks"].count_documents(chunk_query)
    question_sets = await db["question_sets"].find(
        {**question_query, "deleted_at": None},
        {"questions": 1, "question_count": 1},
    ).to_list(None)
    question_count = sum(int(item.get("question_count") or len(item.get("questions") or [])) for item in question_sets)
    session = await db["verification_sessions"].find_one(
        {"document_id": document_id},
        sort=[("created_at", -1)],
    )
    verification_status = session.get("status") if session else None
    return chunk_count, question_count, verification_status


async def _document_summary(db, doc: dict[str, Any]) -> AdminDocumentSummary:
    doc_id = str(doc["_id"])
    user_id = doc.get("user_id")
    chunk_count, question_count, verification_status = await _document_counts(db, doc_id, user_id)
    return AdminDocumentSummary(
        id=doc_id,
        original_filename=doc.get("original_filename", ""),
        owner=await _owner(db, user_id),
        file_type=doc.get("file_type", ""),
        file_size=int(doc.get("file_size") or 0),
        uploaded_at=doc.get("created_at") or _now(),
        processing_status=doc.get("status", "uploaded"),
        page_count=doc.get("page_count") or doc.get("pages"),
        chunk_count=chunk_count,
        question_count=question_count,
        knowledge_verification_status=verification_status,
        latest_error=doc.get("error_message"),
        is_quarantined=bool(doc.get("quarantined_at")),
        deleted_at=doc.get("deleted_at"),
        updated_at=doc.get("updated_at"),
    )


async def _load_document_or_404(document_id: str) -> dict[str, Any]:
    db = get_database()
    doc = await db["documents"].find_one({"_id": _parse_oid(document_id, "document_id")})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu.")
    return doc


def _document_audit_snapshot(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc.get("_id")),
        "user_id": doc.get("user_id"),
        "original_filename": doc.get("original_filename"),
        "file_type": doc.get("file_type"),
        "file_size": doc.get("file_size"),
        "status": doc.get("status"),
        "deleted_at": doc.get("deleted_at"),
        "quarantined_at": doc.get("quarantined_at"),
        "error_message": doc.get("error_message"),
    }


@router.get("/documents", response_model=AdminDocumentListResponse)
async def list_admin_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=120),
    user_id: Optional[str] = Query(None, max_length=80),
    file_type: Optional[str] = Query(None, max_length=40),
    processing_status: Optional[str] = Query(None, max_length=60),
    status_filter: ContentStatus = Query("active", alias="status"),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    has_error: Optional[bool] = Query(None),
    knowledge_verification_status: Optional[str] = Query(None, max_length=60),
    sort_by: str = Query("created_at"),
    sort_order: SortOrder = Query("desc"),
    current_user: UserResponse = Depends(require_permission(Permission.DOCUMENTS_VIEW)),
):
    db = get_database()
    query: dict[str, Any] = {}
    if status_filter == "active":
        query["deleted_at"] = None
        query["quarantined_at"] = None
    elif status_filter == "deleted":
        query["deleted_at"] = {"$ne": None}
    elif status_filter == "quarantined":
        query["deleted_at"] = None
        query["quarantined_at"] = {"$ne": None}
    if user_id:
        query["user_id"] = user_id
    if file_type:
        query["file_type"] = file_type
    if processing_status:
        query["status"] = processing_status
    if has_error is True:
        query["error_message"] = {"$nin": [None, ""]}
    elif has_error is False:
        query["$or"] = [{"error_message": None}, {"error_message": ""}, {"error_message": {"$exists": False}}]
    if search:
        query["original_filename"] = {"$regex": re.escape(search.strip()), "$options": "i"}
    query.update(_date_range("created_at", created_from, created_to))

    if knowledge_verification_status:
        doc_ids = await db["verification_sessions"].distinct(
            "document_id",
            {"status": knowledge_verification_status},
        )
        query["_id"] = {"$in": [ObjectId(item) for item in doc_ids if ObjectId.is_valid(str(item))]}

    total = await db["documents"].count_documents(query)
    sort_field = DOCUMENT_SORT_FIELDS.get(sort_by, "created_at")
    docs = await (
        db["documents"]
        .find(query)
        .sort(sort_field, 1 if sort_order == "asc" else -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    return AdminDocumentListResponse(
        items=[await _document_summary(db, doc) for doc in docs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
        generated_at=_now(),
    )


@router.get("/documents/{document_id}", response_model=AdminDocumentDetail)
async def get_admin_document(
    document_id: str,
    current_user: UserResponse = Depends(require_permission(Permission.DOCUMENTS_VIEW)),
):
    db = get_database()
    doc = await _load_document_or_404(document_id)
    summary = await _document_summary(db, doc)
    processing_history = await db["user_activity_logs"].find(
        {"resource_type": "document", "resource_id": document_id},
        {"metadata": 1, "action": 1, "status": 1, "timestamp": 1, "error_code": 1},
    ).sort("timestamp", -1).limit(20).to_list(20)
    return AdminDocumentDetail(
        **summary.model_dump(),
        media_kind=doc.get("media_kind", "document"),
        cloudinary_resource_type=doc.get("cloudinary_resource_type"),
        processing_history=[{**item, "_id": str(item["_id"])} for item in processing_history],
    )


async def _document_mutation(
    document_id: str,
    actor: UserResponse,
    action: str,
    update: dict[str, Any],
    reason: Optional[str],
    request: Optional[Request],
) -> AdminDocumentDetail:
    db = get_database()
    before = await _load_document_or_404(document_id)
    now = _now()
    update = {**update, "updated_at": now}
    result = await db["documents"].find_one_and_update(
        {"_id": before["_id"]},
        {"$set": update},
        return_document=True,
    )
    await record_admin_audit(
        admin=actor,
        action=action,
        target_type="document",
        target_id=document_id,
        reason=reason,
        before=_document_audit_snapshot(before),
        after=_document_audit_snapshot(result),
        changed=sorted(update.keys()),
        request=request,
        database=db,
    )
    summary = await _document_summary(db, result)
    return AdminDocumentDetail(**summary.model_dump(), media_kind=result.get("media_kind", "document"))


@router.post("/documents/{document_id}/reprocess", response_model=AdminDocumentDetail)
async def reprocess_admin_document(
    document_id: str,
    payload: AdminReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.DOCUMENTS_REPROCESS)),
):
    """Actually re-runs the document pipeline (re-extract for non-video documents,
    then re-chunk/re-index) instead of only flipping a status flag. The pipeline
    runs as the document's own owner (extract/index enforce per-owner ownership
    and mutation locks internally) — the admin only needs permission to trigger
    it, not to own the document. Video re-transcription is out of scope here
    (would need Groq Whisper + background-task orchestration); videos are
    re-chunked/re-indexed from their existing transcript instead."""
    reason = require_reason(payload.reason, "xử lý lại tài liệu")
    db = get_database()
    document_before = await _load_document_or_404(document_id)
    owner_id = document_before.get("user_id")
    owner = await db["users"].find_one({"_id": ObjectId(owner_id)}) if ObjectId.is_valid(owner_id) else None
    if not owner:
        raise HTTPException(status_code=409, detail="Không tìm thấy chủ sở hữu tài liệu để xử lý lại.")
    owner_actor = SimpleNamespace(id=owner_id, role=owner.get("role", "user"))

    pipeline_error: Optional[str] = None
    try:
        if document_before.get("media_kind") != "video":
            await extract_document_content(document_id, force=True, current_user=owner_actor, request=None)
        await index_document_api(document_id, force=True, current_user=owner_actor, request=None)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Xử lý lại tài liệu thất bại."
        pipeline_error = detail

    document_after = await db["documents"].find_one({"_id": document_before["_id"]}) or document_before
    await record_admin_audit(
        admin=current_user,
        action="document_reprocessed",
        target_type="document",
        target_id=document_id,
        reason=reason,
        before=_document_audit_snapshot(document_before),
        after=_document_audit_snapshot(document_after),
        changed=["status", "updated_at", "error_message"],
        request=request,
        database=db,
    )
    if pipeline_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Xử lý lại tài liệu thất bại: {pipeline_error}")

    summary = await _document_summary(db, document_after)
    return AdminDocumentDetail(**summary.model_dump(), media_kind=document_after.get("media_kind", "document"))


@router.post("/documents/{document_id}/quarantine", response_model=AdminDocumentDetail)
async def quarantine_admin_document(
    document_id: str,
    payload: AdminReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.DOCUMENTS_UPDATE)),
):
    reason = require_reason(payload.reason, "cách ly tài liệu")
    return await _document_mutation(
        document_id,
        current_user,
        "document_quarantined",
        {"quarantined_at": _now(), "quarantine_reason": reason},
        reason,
        request,
    )


@router.post("/documents/{document_id}/unquarantine", response_model=AdminDocumentDetail)
async def unquarantine_admin_document(
    document_id: str,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.DOCUMENTS_UPDATE)),
):
    return await _document_mutation(
        document_id,
        current_user,
        "document_unquarantined",
        {"quarantined_at": None, "quarantine_reason": None},
        None,
        request,
    )


@router.delete("/documents/{document_id}", response_model=AdminDocumentDetail)
async def delete_admin_document(
    document_id: str,
    payload: AdminReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.DOCUMENTS_DELETE)),
):
    reason = require_reason(payload.reason, "xóa tài liệu")
    return await _document_mutation(
        document_id,
        current_user,
        "document_deleted",
        {"deleted_at": _now(), "status": "deleted"},
        reason,
        request,
    )


@router.post("/documents/{document_id}/restore", response_model=AdminDocumentDetail)
async def restore_admin_document(
    document_id: str,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.DOCUMENTS_UPDATE)),
):
    return await _document_mutation(
        document_id,
        current_user,
        "document_restored",
        {"deleted_at": None, "status": "uploaded"},
        None,
        request,
    )


def _question_id(question_set_id: str, index: int) -> str:
    return f"{question_set_id}:{index}"


def _parse_question_id(question_id: str) -> tuple[str, int]:
    if ":" not in question_id:
        raise HTTPException(status_code=404, detail="question_id không hợp lệ.")
    question_set_id, raw_index = question_id.rsplit(":", 1)
    if not ObjectId.is_valid(question_set_id):
        raise HTTPException(status_code=404, detail="question_id không hợp lệ.")
    try:
        index = int(raw_index)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="question_id không hợp lệ.") from exc
    return question_set_id, index


async def _question_detail_from_set(db, qs: dict[str, Any], index: int, include_deleted: bool = False) -> AdminQuestionDetail:
    questions = list(qs.get("questions") or [])
    if index < 0 or index >= len(questions):
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi.")
    question = dict(questions[index])
    if question.get("deleted_at") is not None and not include_deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi.")
    tags = list(question.get("tags") or [])
    source_document_id = qs.get("document_id")
    evidence = await db["document_chunks"].find(
        {"document_id": source_document_id, "user_id": qs.get("user_id")},
        {"text_preview": 1, "chunk_index": 1, "metadata": 1},
    ).sort("chunk_index", 1).limit(5).to_list(5)
    preview = str(question.get("question") or "")
    return AdminQuestionDetail(
        id=_question_id(str(qs["_id"]), index),
        question_set_id=str(qs["_id"]),
        question_index=index,
        question_preview=preview[:180],
        question=preview,
        options=question.get("options"),
        correct_answer=str(question.get("correct_answer", "")),
        explanation=str(question.get("explanation", "")),
        question_type=question.get("question_type") or qs.get("question_type"),
        difficulty=question.get("difficulty") or qs.get("difficulty"),
        subject=tags[0] if tags else None,
        topic=", ".join(tags[1:3]) if len(tags) > 1 else None,
        source_document_id=source_document_id,
        source_document_name=qs.get("document_name"),
        owner=await _owner(db, qs.get("user_id")),
        citation_status=question.get("citation_status") or ("has_evidence" if evidence else "unknown"),
        hallucination_risk=question.get("hallucination_risk"),
        moderation_status=question.get("status", "draft"),
        created_at=qs.get("created_at") or _now(),
        updated_at=question.get("updated_at") or qs.get("updated_at"),
        deleted_at=question.get("deleted_at"),
        tags=tags,
        bloom_level=question.get("bloom_level"),
        evidence=[{**item, "_id": str(item["_id"])} for item in evidence],
    )


@router.get("/questions", response_model=AdminQuestionListResponse)
async def list_admin_questions(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=120),
    user_id: Optional[str] = Query(None, max_length=80),
    document_id: Optional[str] = Query(None, max_length=80),
    question_type: Optional[str] = Query(None, max_length=40),
    difficulty: Optional[str] = Query(None, max_length=40),
    moderation_status: Optional[str] = Query(None, max_length=40),
    status_filter: ContentStatus = Query("active", alias="status"),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    sort_order: SortOrder = Query("desc"),
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_VIEW)),
):
    db = get_database()
    query: dict[str, Any] = {}
    if user_id:
        query["user_id"] = user_id
    if document_id:
        query["document_id"] = document_id
    query.update(_date_range("created_at", created_from, created_to))
    sets = await db["question_sets"].find(query).sort("created_at", 1 if sort_order == "asc" else -1).to_list(None)
    rows: list[AdminQuestionSummary] = []
    for qs in sets:
        for index, question in enumerate(list(qs.get("questions") or [])):
            deleted = question.get("deleted_at") is not None
            if status_filter == "active" and deleted:
                continue
            if status_filter == "deleted" and not deleted:
                continue
            if question_type and (question.get("question_type") or qs.get("question_type")) != question_type:
                continue
            if difficulty and (question.get("difficulty") or qs.get("difficulty")) != difficulty:
                continue
            if moderation_status and question.get("status", "draft") != moderation_status:
                continue
            text = str(question.get("question") or "")
            if search and search.strip().lower() not in text.lower():
                continue
            detail = await _question_detail_from_set(db, qs, index, include_deleted=True)
            rows.append(AdminQuestionSummary(**detail.model_dump(exclude={"question", "options", "correct_answer", "explanation", "tags", "bloom_level", "evidence"})))
    total = len(rows)
    page_rows = rows[(page - 1) * page_size:page * page_size]
    return AdminQuestionListResponse(
        items=page_rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
        generated_at=_now(),
    )


async def _load_question_set_for_admin(question_id: str) -> tuple[dict[str, Any], int]:
    question_set_id, index = _parse_question_id(question_id)
    db = get_database()
    qs = await db["question_sets"].find_one({"_id": ObjectId(question_set_id)})
    if not qs:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi.")
    if index < 0 or index >= len(qs.get("questions") or []):
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi.")
    return qs, index


@router.get("/questions/{question_id}", response_model=AdminQuestionDetail)
async def get_admin_question(
    question_id: str,
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_VIEW)),
):
    db = get_database()
    qs, index = await _load_question_set_for_admin(question_id)
    return await _question_detail_from_set(db, qs, index, include_deleted=True)


async def _save_question_mutation(
    *,
    question_id: str,
    actor: UserResponse,
    action: str,
    reason: Optional[str],
    changes: dict[str, Any],
    request: Optional[Request],
) -> AdminQuestionDetail:
    db = get_database()
    qs, index = await _load_question_set_for_admin(question_id)
    questions = list(qs.get("questions") or [])
    before = dict(questions[index])
    after = {**before, **changes, "updated_at": _now()}
    questions[index] = after
    await db["question_sets"].update_one(
        {"_id": qs["_id"]},
        {"$set": {"questions": questions, "updated_at": after["updated_at"]}},
    )
    await record_admin_audit(
        admin=actor,
        action=action,
        target_type="question",
        target_id=question_id,
        reason=reason,
        before=before,
        after=after,
        changed=sorted(changes.keys()),
        request=request,
        database=db,
    )
    qs["questions"] = questions
    qs["updated_at"] = after["updated_at"]
    return await _question_detail_from_set(db, qs, index, include_deleted=True)


@router.patch("/questions/{question_id}", response_model=AdminQuestionDetail)
async def update_admin_question(
    question_id: str,
    payload: AdminQuestionUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_UPDATE)),
):
    changes = payload.model_dump(exclude_unset=True, exclude={"reason"})
    if not changes:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")
    return await _save_question_mutation(
        question_id=question_id,
        actor=current_user,
        action="question_updated",
        reason=payload.reason,
        changes=changes,
        request=request,
    )


@router.post("/questions/{question_id}/moderate", response_model=AdminQuestionDetail)
async def moderate_admin_question(
    question_id: str,
    payload: AdminQuestionModerationRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_UPDATE)),
):
    return await _save_question_mutation(
        question_id=question_id,
        actor=current_user,
        action="question_updated",
        reason=payload.reason,
        changes={"status": payload.status, "reviewed_by": current_user.id, "reviewed_at": _now()},
        request=request,
    )


@router.delete("/questions/{question_id}", response_model=AdminQuestionDetail)
async def delete_admin_question(
    question_id: str,
    payload: AdminReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_DELETE)),
):
    reason = require_reason(payload.reason, "xóa câu hỏi")
    return await _save_question_mutation(
        question_id=question_id,
        actor=current_user,
        action="question_deleted",
        reason=reason,
        changes={"deleted_at": _now(), "status": "deleted"},
        request=request,
    )


@router.post("/questions/{question_id}/restore", response_model=AdminQuestionDetail)
async def restore_admin_question(
    question_id: str,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_UPDATE)),
):
    return await _save_question_mutation(
        question_id=question_id,
        actor=current_user,
        action="question_restored",
        reason=None,
        changes={"deleted_at": None, "status": "draft"},
        request=request,
    )


@router.post("/questions/{question_id}/regenerate", response_model=AdminQuestionDetail)
async def regenerate_admin_question(
    question_id: str,
    payload: AdminReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_REGENERATE)),
):
    """Regenerate one question from its source document using a single AI
    provider (see regenerate_single_question docstring for why this is
    intentionally simpler than the bulk dual-provider pipeline)."""
    reason = require_reason(payload.reason, "sinh lại câu hỏi")
    db = get_database()
    qs, index = await _load_question_set_for_admin(question_id)
    existing = qs["questions"][index]
    other_texts = [q.get("question", "") for i, q in enumerate(qs.get("questions") or []) if i != index]
    try:
        new_question = await regenerate_single_question(
            document_id=qs["document_id"],
            difficulty=existing.get("difficulty", "medium"),
            question_type=existing.get("question_type", "multiple_choice"),
            bloom_level=existing.get("bloom_level"),
            avoid_question_texts=other_texts,
            database=db,
        )
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return await _save_question_mutation(
        question_id=question_id,
        actor=current_user,
        action="question_updated",
        reason=reason,
        changes={
            "question": new_question.get("question", existing.get("question", "")),
            "options": new_question.get("options"),
            "correct_answer": new_question.get("correct_answer", existing.get("correct_answer", "")),
            "explanation": new_question.get("explanation", existing.get("explanation", "")),
            "difficulty": existing.get("difficulty", "medium"),
            "question_type": existing.get("question_type", "multiple_choice"),
            "bloom_level": new_question.get("bloom_level", existing.get("bloom_level")),
            "hallucination_risk": new_question.get("hallucination_risk", "unknown"),
            "status": "draft",
            "reviewed_by": None,
            "reviewed_at": None,
            "published_at": None,
        },
        request=request,
    )


@router.get("/exams", response_model=AdminExamListResponse)
async def list_admin_exams(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=120),
    user_id: Optional[str] = Query(None, max_length=80),
    status_filter: ContentStatus = Query("active", alias="status"),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: SortOrder = Query("desc"),
    current_user: UserResponse = Depends(require_permission(Permission.QUESTIONS_VIEW)),
):
    db = get_database()
    query: dict[str, Any] = {}
    if status_filter == "active":
        query["deleted_at"] = None
    elif status_filter == "deleted":
        query["deleted_at"] = {"$ne": None}
    if user_id:
        query["user_id"] = user_id
    if search:
        query["document_name"] = {"$regex": re.escape(search.strip()), "$options": "i"}
    query.update(_date_range("created_at", created_from, created_to))
    total = await db["question_sets"].count_documents(query)
    sort_field = EXAM_SORT_FIELDS.get(sort_by, "created_at")
    docs = await (
        db["question_sets"]
        .find(query)
        .sort(sort_field, 1 if sort_order == "asc" else -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    items = [
        AdminExamSummary(
            id=str(item["_id"]),
            name=item.get("title") or item.get("document_name") or f"Đề thi {str(item['_id'])[-6:]}",
            owner=await _owner(db, item.get("user_id")),
            question_count=int(item.get("question_count") or len(item.get("questions") or [])),
            created_at=item.get("created_at") or _now(),
            last_exported_at=item.get("last_exported_at"),
            status="deleted" if item.get("deleted_at") else "active",
            source_document_id=item.get("document_id"),
            source_document_name=item.get("document_name"),
            deleted_at=item.get("deleted_at"),
        )
        for item in docs
    ]
    return AdminExamListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
        generated_at=_now(),
    )
