import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.schemas.auth import UserResponse
from app.schemas.courses import CourseCreate, EnrollmentCreate
from app.schemas.schedules import ScheduleCreate, ScheduleUpdate
from app.services.course_service import create_course, enroll_student, ensure_course_indexes
from app.services.schedule_service import create_schedule, ensure_schedule_indexes, list_schedules
from app.routers.schedules import create_schedule_route, list_schedules_route, update_schedule_route


def actor(role: str, user_id: str) -> UserResponse:
    return UserResponse(
        id=user_id,
        email=f"{role}-{ObjectId()}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class ScheduleServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_schedules"]
        await ensure_course_indexes(self.db)
        await ensure_schedule_indexes(self.db)
        self.teacher_id = str(ObjectId())
        await self.db["users"].insert_one({"_id": ObjectId(self.teacher_id), "role": "lecturer", "full_name": "GV"})
        self.course = await create_course(
            self.db,
            CourseCreate(code="SCHEDULE", title="Lịch học", subject="Toán", teacher_ids=[self.teacher_id], status="published"),
            actor_id=self.teacher_id,
        )

    def payload(self, start: datetime, end: datetime, title: str = "Buổi học"):
        return ScheduleCreate(
            course_id=self.course.id,
            title=title,
            event_type="online",
            start_at=start,
            end_at=end,
            join_url="https://example.com/join",
        )

    def test_end_must_be_after_start(self):
        now = datetime.now(timezone.utc)
        with self.assertRaises(ValidationError):
            self.payload(now, now)

    async def test_course_must_exist(self):
        now = datetime.now(timezone.utc)
        payload = self.payload(now, now + timedelta(hours=1)).model_copy(update={"course_id": str(ObjectId())})
        with self.assertRaises(HTTPException) as ctx:
            await create_schedule(self.db, payload, actor_id=self.teacher_id)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_range_query_returns_overlaps_and_normalizes_utc(self):
        base = datetime(2026, 8, 22, 8, tzinfo=timezone.utc)
        first = await create_schedule(self.db, self.payload(base, base + timedelta(hours=2), "Một"), actor_id=self.teacher_id)
        await create_schedule(self.db, self.payload(base + timedelta(hours=1), base + timedelta(hours=3), "Hai"), actor_id=self.teacher_id)
        await create_schedule(self.db, self.payload(base + timedelta(days=2), base + timedelta(days=2, hours=1), "Ngoài"), actor_id=self.teacher_id)

        items = await list_schedules(
            self.db,
            from_at=base + timedelta(minutes=30),
            to_at=base + timedelta(hours=2, minutes=30),
        )
        self.assertEqual({item.title for item in items}, {"Một", "Hai"})
        self.assertEqual(first.start_at.utcoffset(), timedelta(0))


class ScheduleRouterTests(ScheduleServiceTests):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.teacher = actor("lecturer", self.teacher_id)
        self.other_teacher = actor("lecturer", str(ObjectId()))
        self.student = actor("student", str(ObjectId()))
        await self.db["users"].insert_many([
            {"_id": ObjectId(self.other_teacher.id), "role": "lecturer", "full_name": "Khác"},
            {"_id": ObjectId(self.student.id), "role": "student", "full_name": "HS"},
        ])
        await enroll_student(self.db, self.course.id, EnrollmentCreate(student_id=self.student.id))
        self.db_patch = patch("app.routers.schedules.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def test_assigned_teacher_can_create_and_update_only_own_course(self):
        start = datetime.now(timezone.utc) + timedelta(days=1)
        created = await create_schedule_route(self.payload(start, start + timedelta(hours=1)), current_user=self.teacher)
        updated = await update_schedule_route(created.id, ScheduleUpdate(title="Đổi tên"), current_user=self.teacher)
        self.assertEqual(updated.title, "Đổi tên")
        with self.assertRaises(HTTPException) as ctx:
            await update_schedule_route(created.id, ScheduleUpdate(title="Sai quyền"), current_user=self.other_teacher)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_student_lists_only_enrolled_course_schedules(self):
        start = datetime.now(timezone.utc) + timedelta(days=1)
        await create_schedule(self.db, self.payload(start, start + timedelta(hours=1)), actor_id=self.teacher.id)
        other = await create_course(
            self.db,
            CourseCreate(code="OTHER-SCHEDULE", title="Khác", subject="Lý", teacher_ids=[self.teacher.id], status="published"),
            actor_id=self.teacher.id,
        )
        await create_schedule(
            self.db,
            ScheduleCreate(course_id=other.id, title="Không được thấy", event_type="class", start_at=start, end_at=start + timedelta(hours=1)),
            actor_id=self.teacher.id,
        )
        items = await list_schedules_route(current_user=self.student)
        self.assertEqual([item.course_id for item in items], [self.course.id])


if __name__ == "__main__":
    unittest.main()
