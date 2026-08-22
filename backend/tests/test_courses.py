import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.schemas.courses import CourseCreate, EnrollmentCreate, EnrollmentRead, LessonCreate
from app.services.course_service import (
    CourseConflict,
    create_course,
    create_lesson,
    enroll_student,
    ensure_course_indexes,
    get_course,
    list_lessons,
)
from app.schemas.courses import CourseUpdate
from app.schemas.auth import UserResponse
from app.routers.courses import (
    create_course_route,
    enroll_student_route,
    get_course_route,
    router,
    update_course_route,
)


def actor(role: str, user_id: str | None = None) -> UserResponse:
    return UserResponse(
        id=user_id or str(ObjectId()),
        email=f"{role}-{ObjectId()}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class CourseServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_courses"]
        await ensure_course_indexes(self.db)

    async def test_course_code_and_enrollment_are_unique(self):
        await self.db["users"].insert_one({"_id": "student-1", "role": "student", "full_name": "Học sinh"})
        payload = CourseCreate(code="MATH10", title="Toán 10", subject="Toán")
        course = await create_course(self.db, payload, actor_id="admin-1")
        with self.assertRaises(CourseConflict):
            await create_course(self.db, payload, actor_id="admin-1")

        enrollment = EnrollmentCreate(student_id="student-1")
        await enroll_student(self.db, course.id, enrollment)
        with self.assertRaises(CourseConflict):
            await enroll_student(self.db, course.id, enrollment)

    async def test_enrollment_requires_an_existing_student_account(self):
        course = await create_course(
            self.db,
            CourseCreate(code="MATH12", title="Toán 12", subject="Toán"),
            actor_id="admin-1",
        )
        with self.assertRaises(HTTPException) as ctx:
            await enroll_student(self.db, course.id, EnrollmentCreate(student_id="missing"))
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_lessons_default_to_next_sort_order(self):
        course = await create_course(
            self.db,
            CourseCreate(code="MATH11", title="Toán 11", subject="Toán"),
            actor_id="admin-1",
        )
        first = await create_lesson(self.db, course.id, LessonCreate(title="Bài 1"))
        second = await create_lesson(self.db, course.id, LessonCreate(title="Bài 2"))

        self.assertEqual((first.sort_order, second.sort_order), (1, 2))
        self.assertEqual([item.title for item in await list_lessons(self.db, course.id)], ["Bài 1", "Bài 2"])

    async def test_progress_and_score_bounds_are_validated(self):
        common = {
            "id": "enrollment-1",
            "course_id": "course-1",
            "course_code": "MATH10",
            "course_title": "Toán 10",
            "subject": "Toán",
            "student_id": "student-1",
            "enrollment_date": "2026-08-22T00:00:00Z",
        }
        with self.assertRaises(ValidationError):
            EnrollmentRead(**common, progress_pct=101)
        with self.assertRaises(ValidationError):
            EnrollmentRead(**common, gpa_average=10.1)

    async def test_invalid_and_missing_ids_both_return_not_found(self):
        for course_id in ("not-an-object-id", "507f1f77bcf86cd799439011"):
            with self.assertRaises(HTTPException) as ctx:
                await get_course(self.db, course_id)
            self.assertEqual(ctx.exception.status_code, 404)


class CourseRouterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_course_routes"]
        await ensure_course_indexes(self.db)
        self.admin = actor("admin")
        self.teacher = actor("lecturer")
        self.other_teacher = actor("lecturer")
        self.student = actor("student")
        for user in (self.admin, self.teacher, self.other_teacher, self.student):
            await self.db["users"].insert_one({
                "_id": ObjectId(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
            })
        self.db_patch = patch("app.routers.courses.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def _course(self, status: str = "published"):
        return await create_course(
            self.db,
            CourseCreate(
                code=f"COURSE-{ObjectId()}",
                title="Khóa học",
                subject="Toán",
                teacher_ids=[self.teacher.id],
                status=status,
            ),
            actor_id=self.admin.id,
        )

    def test_static_routes_are_declared_before_dynamic_course_route(self):
        paths = [route.path for route in router.routes]
        dynamic = paths.index("/courses/{course_id}")
        self.assertLess(paths.index("/courses/mine"), dynamic)
        self.assertLess(paths.index("/courses/statistics"), dynamic)

    async def test_only_admin_can_create_and_enroll(self):
        payload = CourseCreate(code="ADMIN-1", title="Khóa admin", subject="Toán")
        created = await create_course_route(payload, current_user=self.admin)
        self.assertEqual(created.code, "ADMIN-1")

        with self.assertRaises(HTTPException) as ctx:
            await create_course_route(payload, current_user=self.teacher)
        self.assertEqual(ctx.exception.status_code, 403)

        with self.assertRaises(HTTPException) as ctx:
            await enroll_student_route(
                created.id,
                EnrollmentCreate(student_id=self.student.id),
                current_user=self.teacher,
            )
        self.assertEqual(ctx.exception.status_code, 403)

        enrollment = await enroll_student_route(
            created.id,
            EnrollmentCreate(student_id=self.student.id),
            current_user=self.admin,
        )
        self.assertEqual(enrollment.student_id, self.student.id)

    async def test_assigned_teacher_can_update_but_other_teacher_cannot(self):
        course = await self._course()
        updated = await update_course_route(
            course.id,
            CourseUpdate(title="Tên mới"),
            current_user=self.teacher,
        )
        self.assertEqual(updated.title, "Tên mới")

        with self.assertRaises(HTTPException) as ctx:
            await update_course_route(
                course.id,
                CourseUpdate(title="Không hợp lệ"),
                current_user=self.other_teacher,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_student_reads_enrolled_published_course_but_not_draft(self):
        published = await self._course("published")
        draft = await self._course("draft")
        await enroll_student(self.db, published.id, EnrollmentCreate(student_id=self.student.id))
        await enroll_student(self.db, draft.id, EnrollmentCreate(student_id=self.student.id))

        visible = await get_course_route(published.id, current_user=self.student)
        self.assertEqual(visible.id, published.id)

        with self.assertRaises(HTTPException) as ctx:
            await get_course_route(draft.id, current_user=self.student)
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
