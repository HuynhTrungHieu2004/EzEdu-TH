from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.core.security import get_password_hash


DEMO_SEED_KEY = "ezedu-demo-v1"

ADMIN_ID = ObjectId("000000000000000000000001")
TEACHER_ID = ObjectId("000000000000000000000002")
STUDENT_ID = ObjectId("000000000000000000000003")
COURSE_ID = ObjectId("000000000000000000000101")
ENROLLMENT_ID = ObjectId("000000000000000000000102")
QUESTION_ID = ObjectId("000000000000000000000103")
EXAM_ID = ObjectId("000000000000000000000104")
ATTEMPT_ID = ObjectId("000000000000000000000105")
PROFILE_ID = ObjectId("000000000000000000000106")

DEMO_COLLECTIONS = (
    "users",
    "learner_profiles",
    "courses",
    "course_enrollments",
    "questions",
    "exams",
    "exam_attempts",
)


async def _upsert(collection, query: dict, document: dict) -> None:
    document = {**document, "demo_seed": DEMO_SEED_KEY}
    object_id = document.pop("_id")
    created_at = document.pop("created_at", None)
    set_on_insert = {"_id": object_id}
    if created_at is not None:
        set_on_insert["created_at"] = created_at
    await collection.update_one(
        query,
        {"$set": document, "$setOnInsert": set_on_insert},
        upsert=True,
    )


async def seed_demo_data(db, *, password: str) -> dict[str, int]:
    if len(password) < 8:
        raise ValueError("Mật khẩu demo phải có ít nhất 8 ký tự.")

    now = datetime.now(timezone.utc)
    hashed_password = get_password_hash(password)
    users = (
        (ADMIN_ID, "admin.demo@ezedu.vn", "Quản trị viên Demo", "admin"),
        (TEACHER_ID, "giaovien.demo@ezedu.vn", "Giảng viên Demo", "lecturer"),
        (STUDENT_ID, "hocsinh.demo@ezedu.vn", "Học sinh Demo", "student"),
    )
    for user_id, email, full_name, role in users:
        await _upsert(db["users"], {"email": email}, {
            "_id": user_id,
            "email": email,
            "full_name": full_name,
            "role": role,
            "hashed_password": hashed_password,
            "status": "active",
            "is_active": True,
            "permissions_override": [],
            "deleted_at": None,
            "updated_at": now,
            "created_at": now,
        })

    await _upsert(db["learner_profiles"], {"user_id": str(STUDENT_ID)}, {
        "_id": PROFILE_ID,
        "user_id": str(STUDENT_ID),
        "grade_level": 10,
        "onboarding_completed": True,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["courses"], {"code": "DEMO-TOAN-10"}, {
        "_id": COURSE_ID,
        "code": "DEMO-TOAN-10",
        "title": "Toán 10 Demo",
        "description": "Khóa học mẫu dùng để trải nghiệm EzEdu.",
        "thumbnail": "",
        "subject": "Toán học",
        "grade": "Lớp 10",
        "teacher_ids": [str(TEACHER_ID)],
        "goals": ["Ôn tập đại số cơ bản"],
        "syllabus_overview": "Mệnh đề, tập hợp và hàm số.",
        "start_date": now.date().isoformat(),
        "end_date": (now + timedelta(days=90)).date().isoformat(),
        "status": "published",
        "deleted_at": None,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["course_enrollments"], {"_id": ENROLLMENT_ID}, {
        "_id": ENROLLMENT_ID,
        "course_id": str(COURSE_ID),
        "student_id": str(STUDENT_ID),
        "enrollment_date": now,
        "status": "learning",
        "progress_pct": 60,
        "gpa_average": 8.5,
        "completed_lessons": 3,
        "last_activity_at": now,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["questions"], {"_id": QUESTION_ID}, {
        "_id": QUESTION_ID,
        "subject_id": "toan-10",
        "grade": 10,
        "curriculum_version": "2018",
        "bloom_level": "understand",
        "difficulty": "easy",
        "question_type": "multiple_choice",
        "content": "Nghiệm của phương trình x + 2 = 5 là bao nhiêu?",
        "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
        "correct_answer": "C",
        "explanation": "Chuyển 2 sang vế phải: x = 5 - 2 = 3.",
        "points": 10.0,
        "expected_time_seconds": 60,
        "tags": ["đại số", "phương trình"],
        "status": "published",
        "quality_status": "verified",
        "version": 1,
        "owner_id": str(TEACHER_ID),
        "created_by": str(TEACHER_ID),
        "updated_by": str(TEACHER_ID),
        "deleted_at": None,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["exams"], {"_id": EXAM_ID}, {
        "_id": EXAM_ID,
        "blueprint_id": "demo-blueprint",
        "blueprint_version": 1,
        "code": "DEMO-EXAM-01",
        "equivalent_group_id": "demo-exam-group",
        "question_ids": [str(QUESTION_ID)],
        "question_order_seed": 1,
        "total_points": 10.0,
        "duration_minutes": 15,
        "status": "published",
        "published_at": now,
        "audience_type": "all",
        "target_class_ids": [],
        "allow_retake": True,
        "version": 1,
        "owner_id": str(TEACHER_ID),
        "created_by": str(TEACHER_ID),
        "updated_by": str(TEACHER_ID),
        "deleted_at": None,
        "updated_at": now,
        "created_at": now,
    })
    await _upsert(db["exam_attempts"], {"_id": ATTEMPT_ID}, {
        "_id": ATTEMPT_ID,
        "exam_id": str(EXAM_ID),
        "exam_code": "DEMO-EXAM-01",
        "student_id": str(STUDENT_ID),
        "attempt_number": 1,
        "status": "graded",
        "answers": {str(QUESTION_ID): "C"},
        "started_at": now - timedelta(minutes=10),
        "due_at": now + timedelta(minutes=5),
        "submitted_at": now - timedelta(minutes=8),
        "auto_submitted": False,
        "total_score": 10.0,
        "max_score": 10.0,
        "results": [{
            "question_id": str(QUESTION_ID),
            "question_type": "multiple_choice",
            "points_possible": 10.0,
            "student_answer": "C",
            "is_correct": True,
            "final_score": 10.0,
        }],
        "version": 1,
        "updated_at": now,
        "created_at": now,
    })

    return {
        name: await db[name].count_documents({"demo_seed": DEMO_SEED_KEY})
        for name in DEMO_COLLECTIONS
    }


async def rollback_demo_data(db) -> int:
    removed = 0
    for name in reversed(DEMO_COLLECTIONS):
        result = await db[name].delete_many({"demo_seed": DEMO_SEED_KEY})
        removed += result.deleted_count
    return removed


async def _main() -> None:
    from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database

    password = os.getenv("DEMO_PASSWORD", "")
    if not password:
        raise SystemExit("Hãy đặt DEMO_PASSWORD trước khi chạy seed.")
    await connect_to_mongo()
    try:
        print(await seed_demo_data(get_database(), password=password))
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(_main())
