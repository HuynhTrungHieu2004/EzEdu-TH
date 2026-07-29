from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.core.concurrency import VersionConflict, compare_and_set, version_conflict_http_error
from app.exam_bank.constants.collections import EXAM_BLUEPRINTS, QUESTIONS
from app.exam_bank.schemas.blueprint import (
    BlueprintValidationResult,
    ExamBlueprintCreate,
    ExamBlueprintResponse,
    ExamBlueprintUpdate,
    is_valid_blueprint_transition,
)
from app.exam_bank.services.blueprint_solver_service import solve_blueprint


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(doc: dict) -> ExamBlueprintResponse:
    return ExamBlueprintResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        subject_id=doc["subject_id"],
        grade=doc["grade"],
        curriculum_version=doc["curriculum_version"],
        total_points=doc["total_points"],
        duration_minutes=doc["duration_minutes"],
        constraints=doc["constraints"],
        status=doc["status"],
        version=doc["version"],
        owner_id=doc["owner_id"],
        created_by=doc["created_by"],
        updated_by=doc["updated_by"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        deleted_at=doc.get("deleted_at"),
    )


async def create_blueprint(db, payload: ExamBlueprintCreate, *, owner_id: str) -> ExamBlueprintResponse:
    now = _now()
    doc = {
        "name": payload.name,
        "subject_id": payload.subject_id,
        "grade": payload.grade,
        "curriculum_version": payload.curriculum_version,
        "total_points": payload.total_points,
        "duration_minutes": payload.duration_minutes,
        "constraints": payload.constraints.model_dump(),
        "status": "draft",
        "version": 1,
        "owner_id": owner_id,
        "created_by": owner_id,
        "updated_by": owner_id,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }
    result = await db[EXAM_BLUEPRINTS].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


async def load_owned_blueprint(db, blueprint_id: str, *, actor_id: str, is_admin: bool) -> dict:
    doc = await db[EXAM_BLUEPRINTS].find_one({"_id": ObjectId(blueprint_id), "deleted_at": None})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ma trận đề.")
    if not is_admin and doc["owner_id"] != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với ma trận đề này.")
    return doc


async def get_blueprint(db, blueprint_id: str, *, actor_id: str, is_admin: bool) -> ExamBlueprintResponse:
    doc = await load_owned_blueprint(db, blueprint_id, actor_id=actor_id, is_admin=is_admin)
    return _to_response(doc)


async def list_blueprints(db, *, owner_id: str, skip: int = 0, limit: int = 50) -> tuple[List[ExamBlueprintResponse], int]:
    query = {"owner_id": owner_id, "deleted_at": None}
    total = await db[EXAM_BLUEPRINTS].count_documents(query)
    cursor = db[EXAM_BLUEPRINTS].find(query).sort("updated_at", -1).skip(skip).limit(limit)
    items = [_to_response(doc) async for doc in cursor]
    return items, total


async def update_blueprint(
    db, blueprint_id: str, payload: ExamBlueprintUpdate, *, actor_id: str, is_admin: bool
) -> ExamBlueprintResponse:
    existing = await load_owned_blueprint(db, blueprint_id, actor_id=actor_id, is_admin=is_admin)
    if existing["status"] != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ có thể sửa ma trận đề khi còn ở trạng thái 'draft'.",
        )

    update_fields: Dict[str, Any] = payload.model_dump(exclude={"version"}, exclude_none=True)
    if "constraints" in update_fields:
        update_fields["constraints"] = payload.constraints.model_dump()
    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có trường nào để cập nhật.")

    update_fields["updated_by"] = actor_id
    update_fields["updated_at"] = _now()

    try:
        updated = await compare_and_set(
            db[EXAM_BLUEPRINTS],
            filter_query={"_id": ObjectId(blueprint_id)},
            expected_version=payload.version,
            update={"$set": update_fields},
        )
    except VersionConflict:
        raise version_conflict_http_error()

    return _to_response(updated)


async def fetch_candidate_questions(
    db, blueprint: dict, *, exclude_recently_used_days: Optional[int]
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {
        "subject_id": blueprint["subject_id"],
        "grade": blueprint["grade"],
        "curriculum_version": blueprint["curriculum_version"],
        "status": {"$in": ["approved", "published"]},
        "deleted_at": None,
    }
    if exclude_recently_used_days:
        cutoff = _now() - timedelta(days=exclude_recently_used_days)
        query["$or"] = [{"last_used_at": None}, {"last_used_at": {"$lt": cutoff}}]

    cursor = db[QUESTIONS].find(query)
    candidates = []
    async for doc in cursor:
        candidates.append(
            {
                "id": str(doc["_id"]),
                "topic_id": doc.get("topic_id"),
                "bloom_level": doc["bloom_level"],
                "difficulty": doc["difficulty"],
                "question_type": doc["question_type"],
                "points": doc["points"],
                "expected_time_seconds": doc["expected_time_seconds"],
            }
        )
    return candidates


async def validate_blueprint(db, blueprint_id: str, *, actor_id: str, is_admin: bool) -> BlueprintValidationResult:
    """Chạy CP-SAT ở chế độ kiểm tra khả thi (không tạo Exam thật). Nếu hợp
    lệ, chuyển blueprint draft→validated.
    """
    blueprint = await load_owned_blueprint(db, blueprint_id, actor_id=actor_id, is_admin=is_admin)

    candidates = await fetch_candidate_questions(
        db, blueprint, exclude_recently_used_days=blueprint["constraints"].get("exclude_recently_used_days")
    )
    result = solve_blueprint(
        candidates=candidates,
        total_points=blueprint["total_points"],
        max_time_seconds=blueprint["constraints"].get("max_time_seconds"),
        constraints=blueprint["constraints"],
    )

    if result.status in ("OPTIMAL", "FEASIBLE") and is_valid_blueprint_transition(blueprint["status"], "validated"):
        await db[EXAM_BLUEPRINTS].update_one(
            {"_id": blueprint["_id"], "version": blueprint["version"]},
            {"$set": {"status": "validated", "updated_at": _now()}, "$inc": {"version": 1}},
        )

    message = {
        "OPTIMAL": "Ma trận khả thi — đã tìm được tổ hợp câu hỏi tối ưu.",
        "FEASIBLE": "Ma trận khả thi — đã tìm được một tổ hợp câu hỏi hợp lệ.",
        "INFEASIBLE": "Ma trận KHÔNG khả thi với ngân hàng câu hỏi hiện tại — xem chi tiết từng nhóm còn thiếu.",
        "UNKNOWN": "Chưa xác định được trong thời gian giới hạn — thử lại hoặc đơn giản hoá ràng buộc.",
    }[result.status]

    return BlueprintValidationResult(
        status=result.status,
        message=message,
        missing=[m.__dict__ for m in result.missing],
        solve_time_seconds=result.solve_time_seconds,
    )


async def clone_blueprint(db, blueprint_id: str, *, actor_id: str, is_admin: bool) -> ExamBlueprintResponse:
    existing = await load_owned_blueprint(db, blueprint_id, actor_id=actor_id, is_admin=is_admin)
    now = _now()
    clone_doc = {
        **{k: v for k, v in existing.items() if k != "_id"},
        "name": f"{existing['name']} (bản sao)",
        "status": "draft",
        "version": 1,
        "created_by": actor_id,
        "updated_by": actor_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[EXAM_BLUEPRINTS].insert_one(clone_doc)
    clone_doc["_id"] = result.inserted_id
    return _to_response(clone_doc)


async def archive_blueprint(db, blueprint_id: str, *, version: int, actor_id: str, is_admin: bool) -> ExamBlueprintResponse:
    existing = await load_owned_blueprint(db, blueprint_id, actor_id=actor_id, is_admin=is_admin)
    if not is_valid_blueprint_transition(existing["status"], "archived"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể lưu trữ ma trận đề đang ở trạng thái '{existing['status']}'.",
        )
    try:
        updated = await compare_and_set(
            db[EXAM_BLUEPRINTS],
            filter_query={"_id": ObjectId(blueprint_id)},
            expected_version=version,
            update={"$set": {"status": "archived", "updated_by": actor_id, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)
