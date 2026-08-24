import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.services.attempt_service import list_student_exams
from app.routers import classes as classes_router
from app.schemas.auth import UserResponse
from app.schemas.classes import ClassCreateRequest


def actor(role: str) -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}-{ObjectId()}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class ClassJoinCodeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_class_join_code"]
        self.teacher = actor("lecturer")
        self.student = actor("student")
        patcher = patch("app.routers.classes.get_database", return_value=self.db)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def _create_class(self):
        return await classes_router.create_class(
            ClassCreateRequest(name="Lớp Toán 10"),
            current_user=self.teacher,
            request=None,
        )

    async def test_created_class_has_a_six_character_join_code(self):
        created = await self._create_class()

        self.assertRegex(created.class_code, r"^[A-Z0-9]{6}$")

    async def test_joining_by_code_unlocks_exams_targeted_to_that_class(self):
        created = await self._create_class()
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id,
            "status": "published",
            "deleted_at": None,
            "audience_type": "classes",
            "target_class_ids": [created.id],
            "code": "TOAN-10",
            "question_ids": [],
            "total_points": 10,
            "duration_minutes": 45,
            "published_at": datetime.now(timezone.utc),
        })

        joined = await classes_router.join_class_by_code(
            SimpleNamespace(code=f" {created.class_code.lower()} "),
            current_user=self.student,
            request=None,
        )

        self.assertEqual(joined.id, created.id)
        self.assertEqual([item.id for item in await list_student_exams(self.db, student_id=self.student.id)], [str(exam_id)])

    async def test_only_students_can_join_and_invalid_codes_are_rejected(self):
        created = await self._create_class()
        with self.assertRaises(HTTPException) as wrong_role:
            await classes_router.join_class_by_code(
                SimpleNamespace(code=created.class_code), current_user=self.teacher, request=None
            )
        self.assertEqual(wrong_role.exception.status_code, 403)

        with self.assertRaises(HTTPException) as missing:
            await classes_router.join_class_by_code(
                SimpleNamespace(code="SAI999"), current_user=self.student, request=None
            )
        self.assertEqual(missing.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
