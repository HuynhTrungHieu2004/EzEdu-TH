import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.schemas.assignments import AssignmentCreate, AssignmentUpdate, SubmissionCreate, TeacherGrade
from app.schemas.courses import CourseCreate, EnrollmentCreate
from app.services.assignment_service import (
    AIGradingError,
    create_assignment,
    ensure_assignment_indexes,
    get_submission,
    request_ai_grade,
    submit_assignment,
    teacher_grade_submission,
    transition_submission_status,
    update_assignment,
)
from app.services.course_service import create_course, enroll_student, ensure_course_indexes
from app.schemas.auth import UserResponse
from app.routers.assignments import (
    create_assignment_route,
    get_submission_route,
    submit_assignment_route,
    teacher_grade_route,
    update_assignment_route,
)


def actor(role: str, user_id: str) -> UserResponse:
    return UserResponse(
        id=user_id,
        email=f"{role}-{ObjectId()}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class AssignmentServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_assignments"]
        await ensure_course_indexes(self.db)
        await ensure_assignment_indexes(self.db)
        self.teacher_id = str(ObjectId())
        self.student_id = str(ObjectId())
        await self.db["users"].insert_many([
            {"_id": ObjectId(self.teacher_id), "role": "lecturer", "full_name": "Giáo viên"},
            {"_id": ObjectId(self.student_id), "role": "student", "full_name": "Học sinh"},
        ])
        self.course = await create_course(
            self.db,
            CourseCreate(
                code="ASSIGN-COURSE",
                title="Khóa bài tập",
                subject="Toán",
                teacher_ids=[self.teacher_id],
                status="published",
            ),
            actor_id=self.teacher_id,
        )
        await enroll_student(self.db, self.course.id, EnrollmentCreate(student_id=self.student_id))

    def payload(self, **overrides):
        values = {
            "course_id": self.course.id,
            "title": "Bài tự luận",
            "due_at": datetime.now(timezone.utc) + timedelta(days=1),
            "max_score": 10,
        }
        values.update(overrides)
        return AssignmentCreate(**values)

    def test_state_machine_accepts_only_documented_transitions(self):
        valid = [
            ("submitted", "ai_grading"),
            ("ai_grading", "ai_suggested"),
            ("ai_suggested", "teacher_graded"),
            ("grading_failed", "ai_grading"),
            ("submitted", "teacher_graded"),
        ]
        for current, target in valid:
            transition_submission_status(current, target)
        with self.assertRaises(ValueError):
            transition_submission_status("teacher_graded", "ai_grading")

    async def test_draft_and_overdue_assignments_reject_submission(self):
        draft = await create_assignment(self.db, self.payload(), actor_id=self.teacher_id)
        with self.assertRaises(HTTPException) as ctx:
            await submit_assignment(self.db, draft.id, SubmissionCreate(content="Bài làm"), student_id=self.student_id)
        self.assertEqual(ctx.exception.status_code, 409)

        overdue = await create_assignment(
            self.db,
            self.payload(title="Quá hạn", due_at=datetime.now(timezone.utc) - timedelta(minutes=1), status="published"),
            actor_id=self.teacher_id,
        )
        with self.assertRaises(HTTPException) as ctx:
            await submit_assignment(self.db, overdue.id, SubmissionCreate(content="Bài làm"), student_id=self.student_id)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_resubmission_updates_document_and_increments_revision(self):
        assignment = await create_assignment(self.db, self.payload(status="published"), actor_id=self.teacher_id)
        first = await submit_assignment(self.db, assignment.id, SubmissionCreate(content="Lần một"), student_id=self.student_id)
        second = await submit_assignment(self.db, assignment.id, SubmissionCreate(content="Lần hai"), student_id=self.student_id)
        self.assertEqual(first.id, second.id)
        self.assertEqual(second.revision_count, 2)
        self.assertEqual(second.content, "Lần hai")

    async def test_teacher_score_cannot_exceed_assignment_maximum(self):
        assignment = await create_assignment(self.db, self.payload(status="published"), actor_id=self.teacher_id)
        submission = await submit_assignment(self.db, assignment.id, SubmissionCreate(content="Bài làm"), student_id=self.student_id)
        with self.assertRaises(HTTPException) as ctx:
            await teacher_grade_submission(
                self.db,
                submission.id,
                TeacherGrade(score=11, feedback="Quá trần"),
                teacher_id=self.teacher_id,
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_ai_grade_is_only_a_suggestion_until_teacher_confirms(self):
        assignment = await create_assignment(self.db, self.payload(status="published"), actor_id=self.teacher_id)
        submission = await submit_assignment(self.db, assignment.id, SubmissionCreate(content="Bài làm"), student_id=self.student_id)
        suggested = await request_ai_grade(
            self.db,
            submission.id,
            generator=lambda _prompt: '{"score": 8.5, "feedback": "Tốt", "rubric": []}',
        )
        self.assertEqual(suggested.status, "ai_suggested")
        self.assertEqual(suggested.ai_grade.score, 8.5)
        self.assertIsNone(suggested.final_score)

    async def test_ai_failure_keeps_final_score_empty_and_can_retry(self):
        assignment = await create_assignment(self.db, self.payload(status="published"), actor_id=self.teacher_id)
        submission = await submit_assignment(self.db, assignment.id, SubmissionCreate(content="Bài làm"), student_id=self.student_id)
        with self.assertRaises(AIGradingError):
            await request_ai_grade(self.db, submission.id, generator=lambda _prompt: "not-json")
        failed = await get_submission(self.db, submission.id)
        self.assertEqual(failed.status, "grading_failed")
        self.assertIsNone(failed.final_score)

        retried = await request_ai_grade(
            self.db,
            submission.id,
            generator=lambda _prompt: {"score": 7, "feedback": "Đã thử lại", "rubric": []},
        )
        self.assertEqual(retried.status, "ai_suggested")

    async def test_ai_provider_exception_is_recorded_without_zero_score(self):
        assignment = await create_assignment(self.db, self.payload(status="published"), actor_id=self.teacher_id)
        submission = await submit_assignment(self.db, assignment.id, SubmissionCreate(content="Bài làm"), student_id=self.student_id)

        def fail(_prompt):
            raise TimeoutError("provider timeout")

        with self.assertRaises(AIGradingError):
            await request_ai_grade(self.db, submission.id, generator=fail)
        failed = await get_submission(self.db, submission.id)
        self.assertIsNone(failed.final_score)
        self.assertNotEqual(failed.final_score, 0)

    def test_schema_rejects_non_positive_max_score(self):
        with self.assertRaises(ValidationError):
            self.payload(max_score=0)


class AssignmentRouterTests(AssignmentServiceTests):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.admin = actor("admin", str(ObjectId()))
        self.teacher = actor("lecturer", self.teacher_id)
        self.other_teacher = actor("lecturer", str(ObjectId()))
        self.student = actor("student", self.student_id)
        self.other_student = actor("student", str(ObjectId()))
        await self.db["users"].insert_many([
            {"_id": ObjectId(self.admin.id), "role": "admin", "full_name": "Admin"},
            {"_id": ObjectId(self.other_teacher.id), "role": "lecturer", "full_name": "GV khác"},
            {"_id": ObjectId(self.other_student.id), "role": "student", "full_name": "HS khác"},
        ])
        self.db_patch = patch("app.routers.assignments.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def test_assigned_teacher_creates_and_updates_but_others_cannot(self):
        created = await create_assignment_route(self.payload(), current_user=self.teacher)
        self.assertEqual(created.created_by, self.teacher.id)
        updated = await update_assignment_route(
            created.id,
            AssignmentUpdate(title="Tên mới"),
            current_user=self.teacher,
        )
        self.assertEqual(updated.title, "Tên mới")
        with self.assertRaises(HTTPException) as ctx:
            await update_assignment_route(
                created.id,
                AssignmentUpdate(title="Không hợp lệ"),
                current_user=self.other_teacher,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_student_submits_own_work_and_other_student_cannot_read_it(self):
        assignment = await create_assignment(self.db, self.payload(status="published"), actor_id=self.teacher.id)
        submitted = await submit_assignment_route(
            assignment.id,
            SubmissionCreate(content="Bài của em"),
            current_user=self.student,
        )
        self.assertEqual(submitted.student_id, self.student.id)
        visible = await get_submission_route(submitted.id, current_user=self.student)
        self.assertEqual(visible.id, submitted.id)
        with self.assertRaises(HTTPException) as ctx:
            await get_submission_route(submitted.id, current_user=self.other_student)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_only_assigned_teacher_or_admin_can_confirm_grade(self):
        assignment = await create_assignment(self.db, self.payload(status="published"), actor_id=self.teacher.id)
        submission = await submit_assignment(self.db, assignment.id, SubmissionCreate(content="Bài làm"), student_id=self.student.id)
        with self.assertRaises(HTTPException) as ctx:
            await teacher_grade_route(
                submission.id,
                TeacherGrade(score=8, feedback="Không được phép"),
                current_user=self.other_teacher,
            )
        self.assertEqual(ctx.exception.status_code, 403)
        graded = await teacher_grade_route(
            submission.id,
            TeacherGrade(score=8, feedback="Tốt"),
            current_user=self.teacher,
        )
        self.assertEqual(graded.final_score, 8)


if __name__ == "__main__":
    unittest.main()
