from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.routers.documents import ensure_lecturer_or_admin
from app.schemas.auth import UserResponse
from app.schemas.classes import (
    ClassCreateRequest,
    ClassDetail,
    ClassListResponse,
    ClassMemberListResponse,
    ClassMemberView,
    ClassStudentAddRequest,
    ClassStudentSummary,
    ClassSummary,
    ClassUpdateRequest,
    StudentSearchResponse,
    StudentSearchResult,
)
from app.services.activity_log_service import record_activity

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_admin(current_user: UserResponse) -> bool:
    return getattr(current_user, "role", "user") in {"admin", "super_admin"}


def _escape_regex(text: str) -> str:
    return re.escape(text)


def _class_summary(cls: dict) -> ClassSummary:
    return ClassSummary(
        id=str(cls["_id"]),
        name=cls["name"],
        description=cls.get("description"),
        owner_id=cls["owner_id"],
        student_count=len(cls.get("student_ids") or []),
        created_at=cls["created_at"],
        updated_at=cls.get("updated_at"),
    )


async def _get_owned_class_or_404(class_id: str, current_user: UserResponse, db) -> dict:
    if not ObjectId.is_valid(class_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lớp học.")
    cls = await db["classes"].find_one({"_id": ObjectId(class_id), "deleted_at": None})
    if not cls:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lớp học.")
    if cls["owner_id"] != current_user.id and not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lớp học.")
    return cls


@router.post("", response_model=ClassSummary, status_code=status.HTTP_201_CREATED)
async def create_class(
    payload: ClassCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    """Lecturer creates a class/student-group used later to target exam publishing."""
    ensure_lecturer_or_admin(current_user)
    db = get_database()
    now = _now()
    doc = {
        "name": payload.name.strip(),
        "description": (payload.description or "").strip() or None,
        "owner_id": current_user.id,
        "student_ids": [],
        "created_at": now,
        "updated_at": None,
        "deleted_at": None,
    }
    result = await db["classes"].insert_one(doc)
    doc["_id"] = result.inserted_id
    await record_activity(
        action="class_created",
        category="exam",
        status="success",
        user_id=current_user.id,
        resource_type="class",
        resource_id=str(result.inserted_id),
        request=request,
        metadata={"name": doc["name"]},
        database=db,
    )
    return _class_summary(doc)


@router.get("", response_model=ClassListResponse)
async def list_my_classes(current_user: UserResponse = Depends(get_current_user)):
    """Lecturer/admin: list classes I own."""
    ensure_lecturer_or_admin(current_user)
    db = get_database()
    cursor = db["classes"].find(
        {"owner_id": current_user.id, "deleted_at": None}
    ).sort("created_at", -1)
    items = [_class_summary(cls) async for cls in cursor]
    return ClassListResponse(items=items)


@router.get("/mine", response_model=ClassMemberListResponse)
async def list_classes_i_belong_to(current_user: UserResponse = Depends(get_current_user)):
    """Student: list classes I'm a member of (no full roster exposed)."""
    db = get_database()
    cursor = db["classes"].find(
        {"student_ids": current_user.id, "deleted_at": None}
    ).sort("created_at", -1)
    items = [
        ClassMemberView(
            id=str(cls["_id"]),
            name=cls["name"],
            student_count=len(cls.get("student_ids") or []),
        )
        async for cls in cursor
    ]
    return ClassMemberListResponse(items=items)


@router.get("/search-students", response_model=StudentSearchResponse)
async def search_students(
    q: str = Query(..., min_length=1, max_length=120),
    current_user: UserResponse = Depends(get_current_user),
):
    """Lecturer/admin: find student accounts by name/email to add to a class."""
    ensure_lecturer_or_admin(current_user)
    db = get_database()
    pattern = _escape_regex(q.strip())
    cursor = db["users"].find(
        {
            "role": "student",
            "deleted_at": None,
            "$or": [
                {"email": {"$regex": pattern, "$options": "i"}},
                {"full_name": {"$regex": pattern, "$options": "i"}},
            ],
        },
        {"_id": 1, "full_name": 1, "email": 1},
    ).limit(20)
    items = [
        StudentSearchResult(id=str(doc["_id"]), full_name=doc.get("full_name", ""), email=doc.get("email", ""))
        async for doc in cursor
    ]
    return StudentSearchResponse(items=items)


@router.get("/{class_id}", response_model=ClassDetail)
async def get_class_detail(class_id: str, current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    cls = await _get_owned_class_or_404(class_id, current_user, db)
    student_object_ids = [ObjectId(sid) for sid in cls.get("student_ids") or [] if ObjectId.is_valid(sid)]
    students: list[ClassStudentSummary] = []
    if student_object_ids:
        cursor = db["users"].find(
            {"_id": {"$in": student_object_ids}},
            {"_id": 1, "full_name": 1, "email": 1},
        )
        students = [
            ClassStudentSummary(id=str(doc["_id"]), full_name=doc.get("full_name", ""), email=doc.get("email", ""))
            async for doc in cursor
        ]
    return ClassDetail(
        id=str(cls["_id"]),
        name=cls["name"],
        description=cls.get("description"),
        owner_id=cls["owner_id"],
        students=students,
        created_at=cls["created_at"],
        updated_at=cls.get("updated_at"),
    )


@router.patch("/{class_id}", response_model=ClassSummary)
async def update_class(
    class_id: str,
    payload: ClassUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    db = get_database()
    cls = await _get_owned_class_or_404(class_id, current_user, db)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có thay đổi hợp lệ.")
    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()
    if "description" in changes:
        changes["description"] = (changes["description"] or "").strip() or None
    now = _now()
    changes["updated_at"] = now
    await db["classes"].update_one({"_id": cls["_id"]}, {"$set": changes})
    cls.update(changes)
    await record_activity(
        action="class_updated",
        category="exam",
        status="success",
        user_id=current_user.id,
        resource_type="class",
        resource_id=class_id,
        request=request,
        metadata={"changed_fields": sorted(changes.keys())},
        database=db,
    )
    return _class_summary(cls)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: str,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    db = get_database()
    cls = await _get_owned_class_or_404(class_id, current_user, db)
    await db["classes"].update_one({"_id": cls["_id"]}, {"$set": {"deleted_at": _now()}})
    await record_activity(
        action="class_deleted",
        category="exam",
        status="success",
        user_id=current_user.id,
        resource_type="class",
        resource_id=class_id,
        request=request,
        database=db,
    )


@router.post("/{class_id}/students", response_model=ClassDetail)
async def add_students_to_class(
    class_id: str,
    payload: ClassStudentAddRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    db = get_database()
    cls = await _get_owned_class_or_404(class_id, current_user, db)
    candidate_ids = [sid for sid in payload.student_ids if ObjectId.is_valid(sid)]
    valid_students = await db["users"].find(
        {"_id": {"$in": [ObjectId(sid) for sid in candidate_ids]}, "role": "student", "deleted_at": None},
        {"_id": 1},
    ).to_list(None)
    valid_ids = {str(doc["_id"]) for doc in valid_students}
    if not valid_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không tìm thấy học sinh hợp lệ để thêm vào lớp.")
    existing = set(cls.get("student_ids") or [])
    merged = sorted(existing | valid_ids)
    now = _now()
    await db["classes"].update_one({"_id": cls["_id"]}, {"$set": {"student_ids": merged, "updated_at": now}})
    await record_activity(
        action="class_student_added",
        category="exam",
        status="success",
        user_id=current_user.id,
        resource_type="class",
        resource_id=class_id,
        request=request,
        metadata={"added_count": len(valid_ids - existing)},
        database=db,
    )
    cls["student_ids"] = merged
    return await get_class_detail(class_id, current_user)


@router.delete("/{class_id}/students/{student_id}", response_model=ClassDetail)
async def remove_student_from_class(
    class_id: str,
    student_id: str,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    db = get_database()
    cls = await _get_owned_class_or_404(class_id, current_user, db)
    remaining = [sid for sid in cls.get("student_ids") or [] if sid != student_id]
    now = _now()
    await db["classes"].update_one({"_id": cls["_id"]}, {"$set": {"student_ids": remaining, "updated_at": now}})
    await record_activity(
        action="class_student_removed",
        category="exam",
        status="success",
        user_id=current_user.id,
        resource_type="class",
        resource_id=class_id,
        request=request,
        metadata={"student_id": student_id},
        database=db,
    )
    return await get_class_detail(class_id, current_user)
