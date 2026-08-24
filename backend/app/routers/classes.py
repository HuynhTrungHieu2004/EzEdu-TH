from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pymongo.errors import DuplicateKeyError

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.routers.documents import ensure_lecturer_or_admin
from app.services.class_grouping_service import analyze_class_ability_groups
from app.schemas.auth import UserResponse
from app.schemas.classes import (
    ClassCreateRequest,
    ClassDetail,
    ClassListResponse,
    ClassMemberListResponse,
    ClassMemberView,
    ClassJoinRequest,
    ClassStudentAddRequest,
    ClassStudentSummary,
    ClassSummary,
    ClassUpdateRequest,
    StudentSearchResponse,
    StudentSearchResult,
)
from app.services.activity_log_service import record_activity

router = APIRouter()
_CLASS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_admin(current_user: UserResponse) -> bool:
    return getattr(current_user, "role", "user") in {"admin", "super_admin"}


def _escape_regex(text: str) -> str:
    return re.escape(text)


async def _new_class_code(db) -> str:
    while True:
        code = "".join(secrets.choice(_CLASS_CODE_ALPHABET) for _ in range(6))
        if not await db["classes"].find_one({"class_code": code}, {"_id": 1}):
            return code


async def _ensure_class_code(cls: dict, db) -> str:
    if cls.get("class_code"):
        return cls["class_code"]
    while True:
        code = await _new_class_code(db)
        try:
            result = await db["classes"].update_one(
                {"_id": cls["_id"], "class_code": {"$exists": False}},
                {"$set": {"class_code": code}},
            )
        except DuplicateKeyError:
            continue
        if result.modified_count:
            cls["class_code"] = code
            return code
        stored = await db["classes"].find_one({"_id": cls["_id"]}, {"class_code": 1})
        if stored and stored.get("class_code"):
            cls["class_code"] = stored["class_code"]
            return stored["class_code"]


def _class_summary(cls: dict) -> ClassSummary:
    return ClassSummary(
        id=str(cls["_id"]),
        name=cls["name"],
        description=cls.get("description"),
        owner_id=cls["owner_id"],
        class_code=cls["class_code"],
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
    while True:
        doc = {
            "name": payload.name.strip(),
            "description": (payload.description or "").strip() or None,
            "owner_id": current_user.id,
            "class_code": await _new_class_code(db),
            "student_ids": [],
            "created_at": now,
            "updated_at": None,
            "deleted_at": None,
        }
        try:
            result = await db["classes"].insert_one(doc)
            break
        except DuplicateKeyError:
            continue
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
    items = []
    async for cls in cursor:
        await _ensure_class_code(cls, db)
        items.append(_class_summary(cls))
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


@router.post("/join", response_model=ClassMemberView)
async def join_class_by_code(
    payload: ClassJoinRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    """Student joins a class using the six-character code shared by its teacher."""
    if getattr(current_user, "role", "user") != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ tài khoản học sinh mới có thể nhập mã lớp.")
    code = payload.code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{6}", code):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mã lớp không đúng hoặc lớp không còn hoạt động.")
    db = get_database()
    cls = await db["classes"].find_one({"class_code": code, "deleted_at": None})
    if not cls:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mã lớp không đúng hoặc lớp không còn hoạt động.")
    await db["classes"].update_one({"_id": cls["_id"]}, {"$addToSet": {"student_ids": current_user.id}, "$set": {"updated_at": _now()}})
    cls = await db["classes"].find_one({"_id": cls["_id"]})
    await record_activity(
        action="class_student_added",
        category="exam",
        status="success",
        user_id=current_user.id,
        resource_type="class",
        resource_id=str(cls["_id"]),
        request=request,
        metadata={"joined_by_code": True},
        database=db,
    )
    return ClassMemberView(id=str(cls["_id"]), name=cls["name"], student_count=len(cls.get("student_ids") or []))


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
    await _ensure_class_code(cls, db)
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
        class_code=cls["class_code"],
        students=students,
        created_at=cls["created_at"],
        updated_at=cls.get("updated_at"),
    )


@router.get("/{class_id}/ability-groups")
async def get_class_ability_groups(
    class_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """Phân nhóm năng lực học sinh trong lớp bằng K-Means trên điểm từng bộ đề.

    Chỉ giáo viên chủ nhiệm lớp xem được — đây là kết quả học tập của từng em.
    """
    db = get_database()
    cls = await _get_owned_class_or_404(class_id, current_user, db)
    student_ids = [sid for sid in cls.get("student_ids") or []]

    attempts: list[dict] = []
    if student_ids:
        cursor = db["question_attempts"].find(
            {"user_id": {"$in": student_ids}},
            {"user_id": 1, "question_set_id": 1, "percent": 1},
        )
        attempts = [doc async for doc in cursor]

    result = analyze_class_ability_groups(attempts, student_ids)

    # Ghép tên để giáo viên đọc được, thay vì một dãy id.
    names: dict[str, str] = {}
    object_ids = [ObjectId(sid) for sid in student_ids if ObjectId.is_valid(sid)]
    if object_ids:
        async for doc in db["users"].find({"_id": {"$in": object_ids}}, {"_id": 1, "full_name": 1}):
            names[str(doc["_id"])] = doc.get("full_name", "")
    for student in result.get("students", []):
        student["full_name"] = names.get(student["user_id"], "")

    # Bộ đề cũng vậy — hiện tên tài liệu thay vì id.
    set_ids = result.get("question_set_ids") or []
    set_names: dict[str, str] = {}
    set_object_ids = [ObjectId(s) for s in set_ids if ObjectId.is_valid(s)]
    if set_object_ids:
        async for doc in db["question_sets"].find(
            {"_id": {"$in": set_object_ids}}, {"_id": 1, "document_name": 1}
        ):
            set_names[str(doc["_id"])] = doc.get("document_name", "")
    result["question_set_names"] = set_names

    return result


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
