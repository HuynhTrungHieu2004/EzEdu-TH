from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.services.background_job_service import DEFAULT_MAX_ATTEMPTS, enqueue
from app.services.student_review_service import (
    STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE,
    STUDENT_REVIEW_GENERATE_JOB_TYPE,
    get_attempt,
    list_attempts,
    list_reviews_with_attempt_history,
    normalize_corrected_classification,
    start_attempt,
    submit_attempt,
)


router = APIRouter()


class CreateStudentReviewRequest(BaseModel):
    document_id: str
    client_request_id: str = Field(min_length=1, max_length=128)

    @field_validator("client_request_id", mode="before")
    @classmethod
    def trim_client_request_id(cls, value):
        return value.strip() if isinstance(value, str) else value


class StudentReviewClassificationRequest(BaseModel):
    subject_id: str = Field(min_length=1, max_length=64)
    grade: StrictInt = Field(ge=1, le=12)
    curriculum_version: str = Field(min_length=1, max_length=64)
    chapter_id: str = Field(min_length=1, max_length=64)
    topic_ids: list[str]


class StudentReviewGenerationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    question_count: StrictInt = Field(default=10, ge=3, le=50)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    question_type: Literal["multiple_choice"] = "multiple_choice"
    bloom_level: Literal["remember", "understand", "apply", "analyze"] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class SubmitStudentReviewAttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: dict[str, StrictStr]


def _require_student_actor(current_user: UserResponse) -> None:
    role = current_user.get("role") if isinstance(current_user, dict) else current_user.role
    if role not in {"student", "user"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ học sinh được tạo bộ ôn tập.")


def _review_id_or_404(review_id: str) -> ObjectId:
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ ôn tập.")
    return ObjectId(review_id)


def _serialize(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {("id" if key == "_id" else key): _serialize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    return value


async def _owned_review_or_404(db, review_id: str, user_id: str) -> dict:
    review = await db["student_reviews"].find_one({
        "_id": _review_id_or_404(review_id),
        "user_id": user_id,
    })
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ ôn tập.")
    return review


async def _enqueue_classification(db, review: dict, *, idempotency_key: str | None = None) -> None:
    review_id = str(review["_id"])
    await enqueue(
        db,
        job_type=STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE,
        payload={
            "review_id": review_id,
            "document_id": str(review["document_id"]),
            "user_id": str(review["user_id"]),
            "job_max_attempts": DEFAULT_MAX_ATTEMPTS,
        },
        idempotency_key=idempotency_key or f"student-document-classify:{review_id}",
        max_attempts=DEFAULT_MAX_ATTEMPTS,
    )


async def _enqueue_generation(db, review: dict, *, idempotency_key: str | None = None) -> None:
    review_id = str(review["_id"])
    await enqueue(
        db,
        job_type=STUDENT_REVIEW_GENERATE_JOB_TYPE,
        payload={
            "review_id": review_id,
            "document_id": str(review["document_id"]),
            "user_id": str(review["user_id"]),
            "job_max_attempts": DEFAULT_MAX_ATTEMPTS,
        },
        idempotency_key=idempotency_key or f"student-review-generate:{review_id}",
        max_attempts=DEFAULT_MAX_ATTEMPTS,
    )


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_student_review_route(
    payload: CreateStudentReviewRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    db = get_database()
    duplicate_query = {
        "user_id": current_user.id,
        "client_request_id": payload.client_request_id,
    }
    existing = await db["student_reviews"].find_one(duplicate_query)
    if existing is not None:
        if existing.get("state") == "classifying":
            await _enqueue_classification(db, existing)
        return _serialize(existing)
    if not ObjectId.is_valid(payload.document_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    document = await db["documents"].find_one({
        "_id": ObjectId(payload.document_id),
        "user_id": current_user.id,
        "deleted_at": None,
    })
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if document.get("status") != "indexed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu phải được lập chỉ mục trước khi tạo bộ ôn tập.",
        )

    now = datetime.now(timezone.utc)
    review = {
        "document_id": payload.document_id,
        "user_id": current_user.id,
        "client_request_id": payload.client_request_id,
        "title": document.get("original_filename") or document.get("title") or "Tài liệu",
        "state": "classifying",
        "created_at": now,
        "updated_at": now,
    }
    try:
        inserted = await db["student_reviews"].insert_one(review)
        review["_id"] = inserted.inserted_id
    except DuplicateKeyError:
        existing = await db["student_reviews"].find_one(duplicate_query)
        if existing is None:
            raise
        if existing.get("state") == "classifying":
            await _enqueue_classification(db, existing)
        return _serialize(existing)

    await _enqueue_classification(db, review)
    return _serialize(review)


@router.get("")
async def list_student_reviews_route(current_user: UserResponse = Depends(get_current_user)):
    _require_student_actor(current_user)
    reviews = await list_reviews_with_attempt_history(get_database(), current_user.id)
    return {"items": [_serialize(review) for review in reviews]}


@router.get("/taxonomy-options")
async def list_student_review_taxonomy_options_route(
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    cursor = get_database()["curriculum_taxonomy"].find(
        {"node_type": {"$in": ["subject", "chapter", "topic"]}},
        {
            "name": 1,
            "node_type": 1,
            "parent_id": 1,
            "grade": 1,
            "curriculum_version": 1,
        },
    ).sort([("node_type", 1), ("name", 1), ("_id", 1)])
    return {"items": [_serialize(node) async for node in cursor]}


@router.get("/{review_id}")
async def get_student_review_route(
    review_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    return _serialize(await _owned_review_or_404(get_database(), review_id, current_user.id))


@router.patch("/{review_id}/classification")
async def confirm_student_review_classification_route(
    review_id: str,
    payload: StudentReviewClassificationRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    db = get_database()
    review = await _owned_review_or_404(db, review_id, current_user.id)
    if review.get("state") not in {"needs_confirmation", "ready_to_generate"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bộ ôn tập chưa thể sửa phân loại.")
    document_id = str(review.get("document_id") or "")
    if not ObjectId.is_valid(document_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    document_query = {
        "_id": ObjectId(document_id),
        "user_id": current_user.id,
        "deleted_at": None,
    }
    if await db["documents"].find_one(document_query, {"_id": 1}) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    try:
        classification = await normalize_corrected_classification(db, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    review_query = {"_id": review["_id"], "user_id": current_user.id}
    await db["student_reviews"].update_one(
        review_query,
        {
            "$set": {"classification": classification, "state": "ready_to_generate", "updated_at": now},
            "$unset": {"error_message": ""},
        },
    )
    await db["documents"].update_one(
        document_query,
        {"$set": {"classification": classification, "updated_at": now}},
    )
    return _serialize(await db["student_reviews"].find_one(review_query))


@router.post("/{review_id}/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_student_review_route(
    review_id: str,
    payload: StudentReviewGenerationRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    db = get_database()
    review = await _owned_review_or_404(db, review_id, current_user.id)
    if review.get("state") == "generating":
        await _enqueue_generation(db, review)
        return _serialize(review)
    if review.get("state") == "ready":
        return _serialize(review)
    if review.get("state") != "ready_to_generate" or (review.get("classification") or {}).get("status") != "confirmed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phân loại phải được xác nhận trước khi sinh câu hỏi.")

    now = datetime.now(timezone.utc)
    generation_config = payload.model_dump()
    updated = await db["student_reviews"].find_one_and_update(
        {"_id": review["_id"], "user_id": current_user.id, "state": "ready_to_generate"},
        {
            "$set": {
                "title": payload.title,
                "generation_config": generation_config,
                "state": "generating",
                "updated_at": now,
            },
            "$unset": {"error_message": "", "warning": ""},
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        current = await _owned_review_or_404(db, review_id, current_user.id)
        if current.get("state") == "generating":
            await _enqueue_generation(db, current)
            return _serialize(current)
        if current.get("state") == "ready":
            return _serialize(current)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bộ ôn tập chưa thể sinh câu hỏi.")

    await _enqueue_generation(db, updated)
    return _serialize(updated)


@router.post("/{review_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_student_review_route(
    review_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    db = get_database()
    review = await _owned_review_or_404(db, review_id, current_user.id)
    failed_step = review.get("failed_step")
    if review.get("state") != "failed" or failed_step not in {"classification", "generation"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bộ ôn tập không có bước lỗi để thử lại.")
    if failed_step == "generation":
        if not _serialize(review.get("generation_config")) or (review.get("classification") or {}).get("status") != "confirmed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Thiếu cấu hình để thử lại tạo bộ đề.")

    target_state = "classifying" if failed_step == "classification" else "generating"
    counter = f"{failed_step}_failures"
    round_field = f"{failed_step}_retry_round"
    now = datetime.now(timezone.utc)
    updated = await db.student_reviews.find_one_and_update(
        {
            "_id": review["_id"],
            "user_id": current_user.id,
            "state": "failed",
            "failed_step": failed_step,
        },
        {
            "$set": {"state": target_state, "updated_at": now},
            "$unset": {"error_message": "", "failed_step": "", counter: "", "warning": ""},
            "$inc": {round_field: 1},
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bước lỗi đã được thử lại.")

    retry_round = updated[round_field]
    key_prefix = "student-document-classify" if failed_step == "classification" else "student-review-generate"
    enqueue_step = _enqueue_classification if failed_step == "classification" else _enqueue_generation
    retry_key = f"{key_prefix}:{review_id}:retry:{retry_round}"
    try:
        await enqueue_step(db, updated, idempotency_key=retry_key)
    except Exception as enqueue_error:
        ambiguous_job = await db.background_jobs.find_one({"idempotency_key": retry_key})
        if ambiguous_job is not None and ambiguous_job.get("status") in {
            "pending", "failed", "running"
        }:
            return _serialize(updated)
        if ambiguous_job is not None:
            updated = await db.student_reviews.find_one_and_update(
                {
                    "_id": review["_id"],
                    "user_id": current_user.id,
                    "state": target_state,
                    round_field: retry_round,
                },
                {"$inc": {round_field: 1}, "$set": {"updated_at": datetime.now(timezone.utc)}},
                return_document=ReturnDocument.AFTER,
            )
            if updated is not None:
                retry_round = updated[round_field]
                replacement_key = f"{key_prefix}:{review_id}:retry:{retry_round}"
                try:
                    await enqueue_step(db, updated, idempotency_key=replacement_key)
                    return _serialize(updated)
                except Exception as replacement_error:
                    replacement_job = await db.background_jobs.find_one(
                        {"idempotency_key": replacement_key}
                    )
                    if replacement_job is not None and replacement_job.get("status") in {
                        "pending", "failed", "running"
                    }:
                        return _serialize(updated)
                    enqueue_error = replacement_error
        rollback_set = {
            "state": "failed",
            "failed_step": failed_step,
            "error_message": review.get("error_message") or (
                "Không thể phân loại tài liệu. Vui lòng thử lại sau."
                if failed_step == "classification"
                else "Không thể sinh bộ câu hỏi. Vui lòng thử lại sau."
            ),
            "updated_at": datetime.now(timezone.utc),
        }
        if counter in review:
            rollback_set[counter] = review[counter]
        await db.student_reviews.update_one(
            {
                "_id": review["_id"],
                "user_id": current_user.id,
                "state": target_state,
                round_field: retry_round,
            },
            {"$set": rollback_set},
        )
        raise enqueue_error
    return _serialize(updated)


@router.post("/{review_id}/attempts", status_code=status.HTTP_201_CREATED)
async def start_student_review_attempt_route(
    review_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    try:
        attempt = await start_attempt(get_database(), current_user.id, review_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _serialize(attempt)


@router.get("/{review_id}/attempts")
async def list_student_review_attempts_route(
    review_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    try:
        attempts = await list_attempts(get_database(), current_user.id, review_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {"items": [_serialize(attempt) for attempt in attempts]}


@router.get("/attempts/{attempt_id}")
async def get_student_review_attempt_route(
    attempt_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    try:
        return _serialize(await get_attempt(get_database(), current_user.id, attempt_id))
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/attempts/{attempt_id}/submit")
async def submit_student_review_attempt_route(
    attempt_id: str,
    payload: SubmitStudentReviewAttemptRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    _require_student_actor(current_user)
    try:
        result = await submit_attempt(get_database(), current_user.id, attempt_id, payload.answers)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    return _serialize(result)
