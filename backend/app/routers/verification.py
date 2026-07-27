"""
Verification Router — API endpoints cho kiểm tra kiến thức học liệu đầu vào
"""

import logging
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.verification import (
    ApplyRequest,
    ApplyResponse,
    ResolveRequest,
    ResolveResponse,
    VerificationIssueResponse,
    VerificationSessionResponse,
    VerifyTriggerResponse,
)
from app.services.verification_service import (
    VerificationInProgressError,
    VerificationStateError,
    apply_accepted_fixes,
    compute_content_revision_hash,
    create_verification_session,
    get_latest_verification_session,
    resolve_issues,
    run_verification_task,
)
from app.services.llm_service import is_gemini_available, is_groq_available
from app.services.ai_quota_service import enforce_ai_quota
from app.services.text_chunking_service import split_text_into_chunks

logger = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════
# Helper
# ═══════════════════════════════════════════════════════════════════════════

async def _verify_document_ownership(document_id: str, user_id: str):
    """Raise 404 if the document doesn't belong to this user."""
    db = get_database()
    if not ObjectId.is_valid(document_id):
        raise HTTPException(status_code=400, detail="Document ID không hợp lệ.")
    doc = await db["documents"].find_one({"_id": ObjectId(document_id), "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy học liệu hoặc bạn không có quyền.")
    return doc


# ═══════════════════════════════════════════════════════════════════════════
# 1. POST /documents/{document_id}/verify — Trigger verification
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/{document_id}/verify",
    response_model=VerifyTriggerResponse,
    status_code=202,
    summary="Bắt đầu kiểm tra chất lượng nội dung học liệu",
)
async def trigger_verification(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    """
    Khởi tạo quá trình kiểm tra kiến thức đầu vào cho tài liệu.
    Chạy background — frontend cần polling status.
    """
    user_id = current_user.id
    doc = await _verify_document_ownership(document_id, user_id)

    # Document phải đã processed/transcribed/indexed
    if doc.get("status") not in ("processed", "transcribed", "indexed", "index_failed"):
        raise HTTPException(
            status_code=400,
            detail="Học liệu chưa được trích xuất nội dung. Vui lòng trích xuất text trước.",
        )

    db = get_database()

    # Check for existing processing session
    existing = await db["verification_sessions"].find_one({
        "document_id": document_id,
        "user_id": user_id,
        "status": "processing",
    })
    if existing:
        return VerifyTriggerResponse(
            session_id=str(existing["_id"]),
            status="processing",
            message="Quá trình kiểm tra đang chạy. Vui lòng đợi.",
        )

    if not is_gemini_available() and not is_groq_available():
        raise HTTPException(
            status_code=503,
            detail="Chưa cấu hình Gemini hoặc Groq để kiểm tra nội dung.",
        )

    # Validate and count a fresh snapshot instead of trusting possibly stale
    # document_chunks from a previous index.
    content = await db["document_contents"].find_one(
        {"document_id": document_id, "user_id": user_id}
    )
    raw_text = content.get("extracted_text", "") if content else ""
    chunks = split_text_into_chunks(raw_text)
    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Không tìm thấy nội dung đã trích xuất để kiểm tra.",
        )
    await enforce_ai_quota(
        user_id=user_id,
        role=current_user.role,
        feature="document_verification",
        resource_type="document",
        resource_id=document_id,
        request=request,
        database=db,
    )

    # Check for completed session with same hash to prevent duplicate AI verification calls
    current_hash = compute_content_revision_hash(raw_text)
    completed_session = await db["verification_sessions"].find_one({
        "document_id": document_id,
        "user_id": user_id,
        "status": "completed",
        "content_revision_hash": current_hash,
    }, sort=[("created_at", -1)])
    if completed_session:
        return VerifyTriggerResponse(
            session_id=str(completed_session["_id"]),
            status="completed",
            message="Học liệu đã được xác minh thành công trước đó với cùng nội dung.",
        )

    # Create session
    try:
        session = await create_verification_session(
            document_id,
            user_id,
            len(chunks),
            content_revision_hash=current_hash,
        )
    except VerificationInProgressError as exc:
        return VerifyTriggerResponse(
            session_id=exc.session_id,
            status="processing",
            message="Quá trình kiểm tra đang chạy. Vui lòng đợi.",
        )
    session_id = str(session["_id"])

    # Run in background
    background_tasks.add_task(run_verification_task, document_id, user_id, session_id)

    return VerifyTriggerResponse(
        session_id=session_id,
        status="processing",
        message="Đang kiểm tra nội dung tài liệu...",
    )


# ═══════════════════════════════════════════════════════════════════════════
# 2. GET /documents/{document_id}/verify/status — Polling status
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/{document_id}/verify/status",
    response_model=VerificationSessionResponse,
    summary="Kiểm tra tiến trình kiểm tra chất lượng",
)
async def get_verification_status(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """Trả về trạng thái phiên kiểm tra mới nhất."""
    user_id = current_user.id
    await _verify_document_ownership(document_id, user_id)

    session = await get_latest_verification_session(document_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chưa có phiên kiểm tra nào cho học liệu này.")

    db = get_database()
    content = await db["document_contents"].find_one(
        {"document_id": document_id, "user_id": user_id}
    )
    raw_text = content.get("extracted_text", "") if content else ""
    current_hash = compute_content_revision_hash(raw_text)
    is_stale = session.get("content_revision_hash") != current_hash

    return VerificationSessionResponse(
        session_id=str(session["_id"]),
        document_id=session["document_id"],
        status=session["status"],
        total_chunks=session.get("total_chunks", 0),
        total_chunks_processed=session.get("total_chunks_processed", 0),
        total_issues_found=session.get("total_issues_found", 0),
        issues_accepted=session.get("issues_accepted", 0),
        issues_rejected=session.get("issues_rejected", 0),
        issues_pending=session.get("issues_pending", 0),
        successful_chunks=session.get("successful_chunks", 0),
        failed_chunks=session.get("failed_chunks", 0),
        ai_model=session.get("ai_model"),
        summary=session.get("summary"),
        severity_stats=session.get("severity_stats"),
        error_message=session.get("error_message"),
        is_stale=is_stale,
        created_at=session["created_at"],
        updated_at=session["updated_at"],
        completed_at=session.get("completed_at"),
    )


# ═══════════════════════════════════════════════════════════════════════════
# 3. GET /documents/{document_id}/verify/issues — List issues
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/{document_id}/verify/issues",
    response_model=list[VerificationIssueResponse],
    summary="Lấy danh sách vấn đề phát hiện trong tài liệu",
)
async def get_verification_issues(
    document_id: str,
    session_id: Optional[str] = Query(
        None,
        pattern=r"^[0-9a-fA-F]{24}$",
        description="Phiên đang hiển thị; bỏ trống để lấy phiên mới nhất.",
    ),
    current_user: UserResponse = Depends(get_current_user),
):
    """Trả về danh sách tất cả issues đã phát hiện, sắp xếp theo chunk_index."""
    user_id = current_user.id
    await _verify_document_ownership(document_id, user_id)

    db = get_database()
    if session_id:
        session = await db["verification_sessions"].find_one(
            {
                "_id": ObjectId(session_id),
                "document_id": document_id,
                "user_id": user_id,
            }
        )
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Không tìm thấy phiên kiểm tra được yêu cầu.",
            )
    else:
        session = await get_latest_verification_session(document_id, user_id)
    if not session:
        return []

    selected_session_id = str(session["_id"])
    issues = []
    cursor = db["verification_issues"].find(
        {
            "session_id": selected_session_id,
            "document_id": document_id,
            "user_id": user_id,
        },
    ).sort([("chunk_index", 1), ("created_at", 1)])

    async for issue in cursor:
        issues.append(
            VerificationIssueResponse(
                id=str(issue["_id"]),
                session_id=issue["session_id"],
                document_id=issue["document_id"],
                chunk_index=issue["chunk_index"],
                issue_type=issue["issue_type"],
                severity=issue["severity"],
                original_text=issue["original_text"],
                suggested_fix=issue["suggested_fix"],
                reason=issue["reason"],
                confidence=issue["confidence"],
                source_reference=issue.get("source_reference"),
                external_verified=issue.get("external_verified", False),
                ai_provider=issue["ai_provider"],
                resolution=issue.get("resolution", "pending"),
                user_edited_text=issue.get("user_edited_text"),
                resolved_at=issue.get("resolved_at"),
                applied_at=issue.get("applied_at"),
                created_at=issue["created_at"],
            )
        )

    return issues


# ═══════════════════════════════════════════════════════════════════════════
# 4. POST /documents/{document_id}/verify/resolve — Resolve issues
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/{document_id}/verify/resolve",
    response_model=ResolveResponse,
    summary="Duyệt/từ chối/sửa các vấn đề phát hiện",
)
async def resolve_verification_issues(
    document_id: str,
    body: ResolveRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Batch resolve: mỗi issue có thể được accepted, rejected, hoặc edited.
    """
    user_id = current_user.id
    await _verify_document_ownership(document_id, user_id)

    try:
        resolved = await resolve_issues(
            document_id,
            user_id,
            [r.model_dump() for r in body.resolutions],
            expected_session_id=body.session_id,
        )
    except VerificationStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return ResolveResponse(
        resolved_count=resolved,
        message=f"Đã xử lý {resolved} vấn đề.",
    )


# ═══════════════════════════════════════════════════════════════════════════
# 5. POST /documents/{document_id}/verify/apply — Apply accepted fixes
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/{document_id}/verify/apply",
    response_model=ApplyResponse,
    summary="Áp dụng các sửa đã chấp nhận vào nội dung và re-index",
)
async def apply_fixes(
    document_id: str,
    body: Optional[ApplyRequest] = None,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Áp dụng tất cả issues đã accepted/edited vào extracted_text,
    rồi re-chunk và re-index vào ChromaDB.
    """
    user_id = current_user.id
    await _verify_document_ownership(document_id, user_id)

    try:
        result = await apply_accepted_fixes(
            document_id,
            user_id,
            expected_session_id=body.session_id if body else None,
        )
    except VerificationStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if result.get("error_message"):
        message = result["error_message"]
    elif result["applied_count"] == 0 and result["reindexed"]:
        message = "Đã re-index lại nội dung thành công."
    elif result["applied_count"] == 0:
        message = "Không có bản sửa mới cần áp dụng."
    else:
        message = f"Đã áp dụng {result['applied_count']} bản sửa."
        if result["reindexed"]:
            message += " Đã re-index thành công."

    return ApplyResponse(
        applied_count=result["applied_count"],
        reindexed=result["reindexed"],
        message=message,
    )
