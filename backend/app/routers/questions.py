import re
import hashlib
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.database.mongodb import get_database
from app.schemas.auth import UserResponse
from app.schemas.question import (
    HistoryListResponse,
    QuestionAttemptResponse,
    QuestionAttemptSubmitRequest,
    QuestionGenerateRequest,
    QuestionItemUpdateRequest,
    QuestionSetResponse,
    QuestionSetSummary,
    QuestionWorkflowRequest,
)
from app.routers.auth import get_current_user
from app.services.question_generation_service import generate_questions
from app.services.export_service import (
    build_export_filename,
    export_question_set_to_docx,
    export_question_set_to_pdf,
)
from app.utils.cursor import serialize_cursor, deserialize_cursor

router = APIRouter()

# ── Valid enum values (reuse production enums from generation) ──
VALID_QUESTION_TYPES = {"multiple_choice", "true_false", "short_answer"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_WORKFLOW_STATUSES = {"draft", "review_pending", "approved", "published"}

# ── Cursor kind ──
CURSOR_KIND = "question_history"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _not_deleted_filter() -> dict:
    """MongoDB filter clause: document is NOT soft-deleted."""
    return {"deleted_at": {"$in": [None]}}


async def _get_owned_active_qs_or_404(
    question_set_id: str, current_user: UserResponse
) -> dict:
    """
    Fetch a question set by ID.
    Returns 404 uniformly if: invalid ID, not found, wrong owner, or soft-deleted.
    """
    if not ObjectId.is_valid(question_set_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bộ câu hỏi.",
        )

    db = get_database()
    question_set = await db["question_sets"].find_one(
        {"_id": ObjectId(question_set_id)}
    )

    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bộ câu hỏi.",
        )

    # Uniform 404 for wrong owner OR soft-deleted (no info leak)
    if question_set["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bộ câu hỏi.",
        )

    if question_set.get("deleted_at") is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy bộ câu hỏi.",
        )

    return question_set


def _can_manage_questions(current_user: UserResponse) -> bool:
    return getattr(current_user, "role", "user") in {"user", "lecturer", "admin"}


def _can_review_questions(current_user: UserResponse) -> bool:
    return getattr(current_user, "role", "user") in {"user", "lecturer", "admin"}


def _normalize_question_item(question: dict) -> dict:
    normalized = dict(question)
    normalized.setdefault("tags", [])
    normalized.setdefault("status", "draft")
    normalized.setdefault("reviewed_by", None)
    normalized.setdefault("reviewed_at", None)
    normalized.setdefault("published_at", None)
    return normalized


def _normalize_question_items(qs: dict) -> list[dict]:
    return [_normalize_question_item(item) for item in qs.get("questions", [])]


def _workflow_counts(questions: list[dict]) -> dict:
    counts = {status_name: 0 for status_name in sorted(VALID_WORKFLOW_STATUSES)}
    for question in questions:
        status_name = question.get("status", "draft")
        if status_name not in counts:
            status_name = "draft"
        counts[status_name] += 1
    return counts


def _with_workflow_metadata(question_set: dict) -> dict:
    questions = _normalize_question_items(question_set)
    counts = _workflow_counts(questions)
    question_set["questions"] = questions
    question_set["workflow_counts"] = counts
    question_set["published_question_count"] = counts.get("published", 0)
    return question_set


def _answer_key(answer: str) -> str:
    return re.sub(r"\s+", " ", (answer or "").strip().lower())


def _is_answer_correct(question: dict, submitted_answer: str) -> bool:
    correct_answer = str(question.get("correct_answer", ""))
    question_type = question.get("question_type")
    if question_type == "true_false":
        truthy = {"true", "a", "đúng", "dung", "yes", "1"}
        falsy = {"false", "b", "sai", "no", "0"}
        expected = _answer_key(correct_answer)
        actual = _answer_key(submitted_answer)
        if expected in truthy:
            return actual in truthy
        if expected in falsy:
            return actual in falsy
    return _answer_key(submitted_answer) == _answer_key(correct_answer)


async def _get_visible_qs_or_404(
    question_set_id: str, current_user: UserResponse
) -> dict:
    if not ObjectId.is_valid(question_set_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ câu hỏi.")

    db = get_database()
    question_set = await db["question_sets"].find_one({"_id": ObjectId(question_set_id), "deleted_at": None})
    if not question_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ câu hỏi.")

    current_role = getattr(current_user, "role", "user")
    if question_set.get("user_id") == current_user.id or current_role == "admin":
        return question_set

    published_questions = [
        item for item in _normalize_question_items(question_set)
        if item.get("status") == "published"
    ]
    if not published_questions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ câu hỏi đã xuất bản.")

    visible = dict(question_set)
    visible["questions"] = published_questions
    visible["question_count"] = len(published_questions)
    return visible


def _qs_to_response(qs: dict) -> QuestionSetResponse:
    """Map a raw MongoDB document to the full QuestionSetResponse model."""
    questions = _normalize_question_items(qs)
    counts = qs.get("workflow_counts") or _workflow_counts(questions)
    return QuestionSetResponse(
        id=str(qs["_id"]),
        document_id=qs["document_id"],
        user_id=qs["user_id"],
        document_name=qs.get("document_name", "Tài liệu không tên"),
        question_count=qs["question_count"],
        difficulty=qs["difficulty"],
        question_type=qs["question_type"],
        questions=questions,
        validation_stats=qs.get("validation_stats"),
        keywords=qs.get("keywords"),
        bloom_distribution=qs.get("bloom_distribution"),
        workflow_counts=counts,
        published_question_count=counts.get("published", 0),
        created_at=qs["created_at"],
        updated_at=qs.get("updated_at", qs["created_at"]),
    )


def _qs_to_summary(qs: dict) -> QuestionSetSummary:
    """Map a raw MongoDB document to a lightweight QuestionSetSummary."""
    counts = qs.get("workflow_counts")
    if counts is None:
        counts = _workflow_counts(_normalize_question_items(qs))
    return QuestionSetSummary(
        id=str(qs["_id"]),
        document_id=qs["document_id"],
        document_name=qs.get("document_name", "Tài liệu không tên"),
        question_count=qs.get("question_count", 0),
        difficulty=qs.get("difficulty", "medium"),
        question_type=qs.get("question_type", "multiple_choice"),
        bloom_distribution=qs.get("bloom_distribution"),
        workflow_counts=counts,
        published_question_count=counts.get("published", 0),
        created_at=qs["created_at"],
    )


def _escape_regex(text: str) -> str:
    """Escape regex metacharacters to prevent ReDoS."""
    return re.escape(text)


def _query_hash(filters: dict) -> str:
    """Deterministic hash of filter parameters for cursor binding."""
    raw = "|".join(f"{k}={v}" for k, v in sorted(filters.items()) if v is not None)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ─── 1. Generate Questions ───────────────────────────────────────────────────

@router.post(
    "/generate",
    response_model=QuestionSetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_questions_api(
    payload: QuestionGenerateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Generate assessment questions using the configured AI providers based
    on context chunks of a document owned by the user.
    """
    if not _can_manage_questions(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ giảng viên mới được sinh và quản lý đề thi.")

    db = get_database()

    # 1. Enforce ownership check of original document
    if not ObjectId.is_valid(payload.document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
        )

    doc = await db["documents"].find_one({"_id": ObjectId(payload.document_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
        )

    if doc["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this document.",
        )

    # Question generation consumes document_chunks. Block the request while a
    # verification apply/re-index is in progress (or has failed), otherwise it
    # could generate from stale vectors/chunks.
    if doc.get("status") != "indexed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu phải được lập chỉ mục thành công trước khi sinh câu hỏi.",
        )

    # 2. Call generation service
    try:
        question_set = await generate_questions(
            document_id=payload.document_id,
            user_id=current_user.id,
            question_count=payload.question_count,
            difficulty=payload.difficulty,
            question_type=payload.question_type,
            bloom_level=payload.bloom_level,
        )
    except FileNotFoundError as fnf_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(fnf_err)
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err)
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during question generation: {str(e)}",
        )

    return _qs_to_response(question_set)


# ─── 2. My History (all question sets, paginated) ────────────────────────────
# IMPORTANT: This static route MUST be declared BEFORE the dynamic /{id} route
# so FastAPI does not mistake "my-history" for a question_set_id.

@router.get("/my-history", response_model=HistoryListResponse)
async def list_my_history(
    current_user: UserResponse = Depends(get_current_user),
    search: Optional[str] = Query(None, max_length=200),
    question_type: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    document_id: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
):
    """
    List all question sets of the current user with pagination and filters.
    Sorted by created_at DESC, _id DESC for stable cursor pagination.
    Excludes soft-deleted question sets.
    """
    # Validate enum filters
    if question_type is not None and question_type not in VALID_QUESTION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"question_type phải là một trong: {', '.join(sorted(VALID_QUESTION_TYPES))}",
        )
    if difficulty is not None and difficulty not in VALID_DIFFICULTIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"difficulty phải là một trong: {', '.join(sorted(VALID_DIFFICULTIES))}",
        )
    if document_id is not None and not ObjectId.is_valid(document_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="document_id không hợp lệ.",
        )

    # Build base filter
    mongo_filter: dict = {
        "user_id": current_user.id,
        "deleted_at": None,
    }

    if question_type:
        mongo_filter["question_type"] = question_type
    if difficulty:
        mongo_filter["difficulty"] = difficulty
    if document_id:
        mongo_filter["document_id"] = document_id

    # Search by document_name (escaped regex, case-insensitive)
    search_trimmed = search.strip() if search else None
    if search_trimmed:
        escaped = _escape_regex(search_trimmed[:200])
        mongo_filter["document_name"] = {"$regex": escaped, "$options": "i"}

    # Build filter identity for cursor binding
    filter_identity = {
        "search": search_trimmed or "",
        "question_type": question_type or "",
        "difficulty": difficulty or "",
        "document_id": document_id or "",
    }
    user_hash = hashlib.sha256(current_user.id.encode()).hexdigest()[:16]
    q_hash = _query_hash(filter_identity)

    # Decode cursor if provided
    if cursor:
        cursor_payload = deserialize_cursor(cursor, CURSOR_KIND)
        # Verify cursor belongs to same user + same filters
        if cursor_payload.get("user_hash") != user_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã phân trang không thuộc về người dùng hiện tại.",
            )
        if cursor_payload.get("query_hash") != q_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bộ lọc đã thay đổi. Vui lòng tải lại từ đầu.",
            )
        sort_values = cursor_payload.get("sort_values", [])
        if len(sort_values) != 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã phân trang không hợp lệ.",
            )
        last_created_at_str, last_id_str = sort_values
        # Add cursor condition: items strictly before this point
        mongo_filter["$or"] = [
            {"created_at": {"$lt": datetime.fromisoformat(last_created_at_str)}},
            {
                "created_at": datetime.fromisoformat(last_created_at_str),
                "_id": {"$lt": ObjectId(last_id_str)},
            },
        ]

    db = get_database()

    # Fetch limit+1 to determine has_more
    fetch_limit = limit + 1
    projection = {
        "questions": 0,  # Exclude heavy questions array
        "keywords": 0,
        "validation_stats": 0,
    }

    raw_cursor = (
        db["question_sets"]
        .find(mongo_filter, projection)
        .sort([("created_at", -1), ("_id", -1)])
        .limit(fetch_limit)
    )

    results = []
    async for doc in raw_cursor:
        results.append(doc)

    has_more = len(results) > limit
    page_items = results[:limit]

    # Build next cursor
    next_cursor_str = None
    if has_more and page_items:
        last_item = page_items[-1]
        next_cursor_str = serialize_cursor(
            {
                "v": 1,
                "kind": CURSOR_KIND,
                "user_hash": user_hash,
                "query_hash": q_hash,
                "sort_values": [
                    last_item["created_at"].isoformat(),
                    str(last_item["_id"]),
                ],
            }
        )

    return HistoryListResponse(
        items=[_qs_to_summary(item) for item in page_items],
        next_cursor=next_cursor_str,
        has_more=has_more,
    )


# ─── 3. Per-document question sets ───────────────────────────────────────────

@router.get("/document/{document_id}", response_model=List[QuestionSetResponse])
async def get_questions_by_document(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    List all question sets generated from a specific document.
    """
    if not ObjectId.is_valid(document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
        )

    db = get_database()
    doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
        )

    if doc["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this document's questions.",
        )

    question_sets = []
    db_cursor = (
        db["question_sets"]
        .find(
            {
                "document_id": document_id,
                "user_id": current_user.id,
                "deleted_at": None,
            }
        )
        .sort("created_at", -1)
    )
    async for qs in db_cursor:
        question_sets.append(_qs_to_response(qs))
    return question_sets


# ─── 4. Published question sets for learners ─────────────────────────────────

@router.get("/published", response_model=HistoryListResponse)
async def list_published_question_sets(
    current_user: UserResponse = Depends(get_current_user),
    search: Optional[str] = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=50),
):
    """
    List question sets that contain at least one published question.
    """
    db = get_database()
    mongo_filter: dict = {
        "deleted_at": None,
        "published_question_count": {"$gt": 0},
    }
    search_trimmed = search.strip() if search else None
    if search_trimmed:
        mongo_filter["document_name"] = {"$regex": _escape_regex(search_trimmed[:200]), "$options": "i"}

    cursor_db = (
        db["question_sets"]
        .find(mongo_filter, {"questions": 0, "keywords": 0, "validation_stats": 0})
        .sort([("updated_at", -1), ("_id", -1)])
        .limit(limit + 1)
    )
    results = [item async for item in cursor_db]
    page_items = results[:limit]
    return HistoryListResponse(
        items=[_qs_to_summary(item) for item in page_items],
        next_cursor=None,
        has_more=len(results) > limit,
    )


# ─── 5. Edit, tag, review, approve, publish ──────────────────────────────────

@router.patch("/{question_set_id}/items/{question_index}", response_model=QuestionSetResponse)
async def update_question_item(
    question_set_id: str,
    question_index: int,
    payload: QuestionItemUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Edit one generated question and its tags.
    """
    if not _can_manage_questions(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ giảng viên mới được sửa câu hỏi.")

    qs = await _get_owned_active_qs_or_404(question_set_id, current_user)
    questions = _normalize_question_items(qs)
    if question_index < 0 or question_index >= len(questions):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy câu hỏi.")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có thay đổi hợp lệ.")

    question = questions[question_index]
    for key, value in changes.items():
        if value is not None:
            question[key] = value

    if question.get("status") in {"approved", "published"}:
        question["status"] = "draft"
        question["reviewed_by"] = None
        question["reviewed_at"] = None
        question["published_at"] = None

    now = datetime.now(timezone.utc)
    qs["updated_at"] = now
    _with_workflow_metadata(qs)

    db = get_database()
    await db["question_sets"].update_one(
        {"_id": ObjectId(question_set_id), "user_id": current_user.id, "deleted_at": None},
        {"$set": {
            "questions": qs["questions"],
            "workflow_counts": qs["workflow_counts"],
            "published_question_count": qs["published_question_count"],
            "updated_at": now,
        }},
    )
    return _qs_to_response(qs)


@router.post("/{question_set_id}/items/{question_index}/workflow", response_model=QuestionSetResponse)
async def update_question_workflow(
    question_set_id: str,
    question_index: int,
    payload: QuestionWorkflowRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Move one question through draft -> review_pending -> approved -> published.
    """
    if not _can_review_questions(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ giảng viên mới được duyệt câu hỏi.")

    qs = await _get_owned_active_qs_or_404(question_set_id, current_user)
    questions = _normalize_question_items(qs)
    if question_index < 0 or question_index >= len(questions):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy câu hỏi.")

    question = questions[question_index]
    target = payload.status
    current = question.get("status", "draft")
    allowed = {
        "draft": {"review_pending"},
        "review_pending": {"draft", "approved"},
        "approved": {"draft", "published"},
        "published": {"draft", "approved"},
    }
    if target != current and target not in allowed.get(current, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể chuyển trạng thái từ {current} sang {target}.",
        )

    now = datetime.now(timezone.utc)
    question["status"] = target
    if target == "approved":
        question["reviewed_by"] = current_user.id
        question["reviewed_at"] = now
        question["published_at"] = None
    elif target == "published":
        if current != "approved":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Câu hỏi phải được duyệt trước khi xuất bản.")
        question["published_at"] = now
    elif target == "draft":
        question["reviewed_by"] = None
        question["reviewed_at"] = None
        question["published_at"] = None

    qs["updated_at"] = now
    _with_workflow_metadata(qs)

    db = get_database()
    await db["question_sets"].update_one(
        {"_id": ObjectId(question_set_id), "user_id": current_user.id, "deleted_at": None},
        {"$set": {
            "questions": qs["questions"],
            "workflow_counts": qs["workflow_counts"],
            "published_question_count": qs["published_question_count"],
            "updated_at": now,
        }},
    )
    return _qs_to_response(qs)


@router.post("/{question_set_id}/publish", response_model=QuestionSetResponse)
async def publish_entire_question_set(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """Review and publish every question in a set for student access."""
    if not _can_review_questions(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền ban hành đề thi.")

    qs = await _get_owned_active_qs_or_404(question_set_id, current_user)
    questions = _normalize_question_items(qs)
    if not questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bộ đề chưa có câu hỏi để ban hành.")

    now = datetime.now(timezone.utc)
    for question in questions:
        question["status"] = "published"
        question["reviewed_by"] = current_user.id
        question["reviewed_at"] = now
        question["published_at"] = now

    qs["questions"] = questions
    qs["updated_at"] = now
    _with_workflow_metadata(qs)
    db = get_database()
    await db["question_sets"].update_one(
        {"_id": ObjectId(question_set_id), "user_id": current_user.id, "deleted_at": None},
        {"$set": {
            "questions": qs["questions"],
            "workflow_counts": qs["workflow_counts"],
            "published_question_count": qs["published_question_count"],
            "updated_at": now,
        }},
    )
    return _qs_to_response(qs)


# ─── 6. Learner attempts ─────────────────────────────────────────────────────

@router.post("/{question_set_id}/attempts", response_model=QuestionAttemptResponse, status_code=status.HTTP_201_CREATED)
async def submit_question_attempt(
    question_set_id: str,
    payload: QuestionAttemptSubmitRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Save a learner attempt and score it against published/owned questions.
    """
    if getattr(current_user, "role", "user") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ sinh viên mới được bắt đầu và nộp bài thi.")

    qs = await _get_visible_qs_or_404(question_set_id, current_user)
    questions = _normalize_question_items(qs)
    if qs.get("user_id") != current_user.id and getattr(current_user, "role", "user") != "admin":
        questions = [item for item in questions if item.get("status") == "published"]

    if not questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bộ câu hỏi chưa có câu nào được xuất bản.")

    submitted = {item.question_index: item.answer for item in payload.answers}
    answer_results = []
    score = 0
    for idx, question in enumerate(questions):
        answer = submitted.get(idx, "")
        is_correct = _is_answer_correct(question, answer)
        if is_correct:
            score += 1
        answer_results.append({
            "question_index": idx,
            "answer": answer,
            "correct_answer": str(question.get("correct_answer", "")),
            "is_correct": is_correct,
        })

    now = datetime.now(timezone.utc)
    max_score = len(questions)
    attempt_doc = {
        "question_set_id": question_set_id,
        "document_id": qs["document_id"],
        "user_id": current_user.id,
        "owner_user_id": qs.get("user_id"),
        "score": score,
        "max_score": max_score,
        "percent": round((score / max_score) * 100, 2),
        "answers": answer_results,
        "created_at": now,
    }

    db = get_database()
    result = await db["question_attempts"].insert_one(attempt_doc)
    attempt_doc["_id"] = result.inserted_id
    return QuestionAttemptResponse(
        id=str(result.inserted_id),
        question_set_id=question_set_id,
        document_id=qs["document_id"],
        user_id=current_user.id,
        score=score,
        max_score=max_score,
        percent=attempt_doc["percent"],
        answers=answer_results,
        created_at=now,
    )


@router.get("/{question_set_id}/attempts/my", response_model=List[QuestionAttemptResponse])
async def list_my_question_attempts(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Return the current user's saved attempts for a question set.
    """
    await _get_visible_qs_or_404(question_set_id, current_user)
    db = get_database()
    attempts = []
    cursor_db = (
        db["question_attempts"]
        .find({"question_set_id": question_set_id, "user_id": current_user.id})
        .sort("created_at", -1)
        .limit(20)
    )
    async for item in cursor_db:
        attempts.append(QuestionAttemptResponse(
            id=str(item["_id"]),
            question_set_id=item["question_set_id"],
            document_id=item["document_id"],
            user_id=item["user_id"],
            score=item["score"],
            max_score=item["max_score"],
            percent=item["percent"],
            answers=item.get("answers", []),
            created_at=item["created_at"],
        ))
    return attempts


@router.get("/attempts/my-history")
async def list_my_attempt_history(
    current_user: UserResponse = Depends(get_current_user),
):
    """Return the signed-in student's recent exam and practice history."""
    if getattr(current_user, "role", "user") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ sinh viên mới có lịch sử học tập.")

    db = get_database()
    rows = []
    cursor_db = (
        db["question_attempts"]
        .find({"user_id": current_user.id})
        .sort("created_at", -1)
        .limit(100)
    )
    async for item in cursor_db:
        question_set = None
        try:
            question_set = await db["question_sets"].find_one({"_id": ObjectId(item["question_set_id"])})
        except Exception:
            pass
        rows.append({
            "id": str(item["_id"]),
            "question_set_id": item["question_set_id"],
            "document_id": item["document_id"],
            "document_name": (question_set or {}).get("document_name", "Bộ câu hỏi"),
            "score": item["score"],
            "max_score": item["max_score"],
            "percent": item["percent"],
            "created_at": item["created_at"],
        })
    return rows


# ─── 7. Question set detail ──────────────────────────────────────────────────

@router.get("/{question_set_id}", response_model=QuestionSetResponse)
async def get_question_set(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Retrieve details of a single question set.
    """
    qs = await _get_visible_qs_or_404(question_set_id, current_user)
    return _qs_to_response(qs)


# ─── 8. Delete question set (soft delete) ────────────────────────────────────

@router.delete("/{question_set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question_set(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Soft-delete a question set. Sets deleted_at timestamp.
    Returns 404 uniformly if not found, wrong owner, or already deleted.
    Does NOT delete the source document or RAG chunks.
    """
    if not _can_manage_questions(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ giảng viên mới được xóa bộ đề.")

    # This will raise 404 if not found / wrong owner / already deleted
    await _get_owned_active_qs_or_404(question_set_id, current_user)

    db = get_database()
    await db["question_sets"].update_one(
        {"_id": ObjectId(question_set_id)},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    # Return 204 No Content (no body)
    return None


# ─── 9. Export DOCX ──────────────────────────────────────────────────────────

@router.get("/{question_set_id}/export/docx")
async def export_docx_api(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Export question set to Microsoft Word (.docx) file download.
    """
    qs = await _get_owned_active_qs_or_404(question_set_id, current_user)

    try:
        file_stream = export_question_set_to_docx(qs)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xuất bộ câu hỏi sang DOCX lúc này.",
        ) from exc

    filename = build_export_filename(qs, "docx")
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── 10. Export PDF ──────────────────────────────────────────────────────────

@router.get("/{question_set_id}/export/pdf")
async def export_pdf_api(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Export question set to PDF (.pdf) file download.
    """
    qs = await _get_owned_active_qs_or_404(question_set_id, current_user)

    try:
        file_stream = export_question_set_to_pdf(qs)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xuất bộ câu hỏi sang PDF lúc này.",
        ) from exc

    filename = build_export_filename(qs, "pdf")
    return StreamingResponse(
        file_stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
