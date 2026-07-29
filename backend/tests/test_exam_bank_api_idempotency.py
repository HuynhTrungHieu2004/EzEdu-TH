import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.api.exams import generate_exams as generate_exams_endpoint
from app.exam_bank.schemas.blueprint import BlueprintConstraints, ExamBlueprintCreate
from app.exam_bank.schemas.exam import ExamGenerateRequest
from app.exam_bank.schemas.question import QuestionBankCreate
from app.exam_bank.services import blueprint_service, question_bank_service
from app.schemas.auth import UserResponse


def _actor(role: str = "lecturer") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


class ExamGenerateIdempotencyTests(unittest.IsolatedAsyncioTestCase):
    """Kiểm thử idempotency-key ở tầng API cho POST /exams/generate — endpoint
    tốn chi phí (chạy CP-SAT + tạo Exam), bắt buộc idempotent theo yêu cầu.
    """

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_exam_bank_api_idempotency"]
        self.patcher = patch("app.exam_bank.api.exams.get_database", return_value=self.db)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

        self.owner = _actor("lecturer")

        for _ in range(5):
            created = await question_bank_service.create_question(
                self.db,
                QuestionBankCreate(
                    subject_id="math",
                    grade=10,
                    curriculum_version="2018",
                    bloom_level="remember",
                    difficulty="easy",
                    question_type="multiple_choice",
                    content="Câu hỏi mẫu",
                    options={"A": "1", "B": "2", "C": "3", "D": "4"},
                    correct_answer="B",
                    explanation="Giải thích",
                    points=1.0,
                ),
                owner_id=self.owner.id,
            )
            created = await question_bank_service.review_question(
                self.db, created.id, target_status="reviewing", version=created.version, actor_id=self.owner.id, is_admin=False
            )
            await question_bank_service.review_question(
                self.db, created.id, target_status="approved", version=created.version, actor_id=self.owner.id, is_admin=False
            )

        self.blueprint = await blueprint_service.create_blueprint(
            self.db,
            ExamBlueprintCreate(
                name="Kiểm tra",
                subject_id="math",
                grade=10,
                curriculum_version="2018",
                total_points=5.0,
                duration_minutes=15,
                constraints=BlueprintConstraints(),
            ),
            owner_id=self.owner.id,
        )
        await blueprint_service.validate_blueprint(self.db, self.blueprint.id, actor_id=self.owner.id, is_admin=False)

    async def test_missing_idempotency_key_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await generate_exams_endpoint(
                ExamGenerateRequest(blueprint_id=self.blueprint.id, code_count=1, seed=1),
                idempotency_key=None,
                current_user=self.owner,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_repeated_call_with_same_key_does_not_generate_twice(self):
        payload = ExamGenerateRequest(blueprint_id=self.blueprint.id, code_count=1, seed=1)

        first = await generate_exams_endpoint(payload, idempotency_key="submit-key-1", current_user=self.owner)
        second = await generate_exams_endpoint(payload, idempotency_key="submit-key-1", current_user=self.owner)

        self.assertEqual(first["exams"][0]["id"], second["exams"][0]["id"])

        # Chỉ có ĐÚNG 1 Exam thật sự được tạo trong DB, dù gọi endpoint 2 lần.
        count = await self.db["exams"].count_documents({"blueprint_id": self.blueprint.id})
        self.assertEqual(count, 1)

    async def test_different_keys_generate_independently(self):
        payload = ExamGenerateRequest(blueprint_id=self.blueprint.id, code_count=1, seed=1)

        first = await generate_exams_endpoint(payload, idempotency_key="key-a", current_user=self.owner)
        second = await generate_exams_endpoint(payload, idempotency_key="key-b", current_user=self.owner)

        self.assertNotEqual(first["exams"][0]["id"], second["exams"][0]["id"])
        count = await self.db["exams"].count_documents({"blueprint_id": self.blueprint.id})
        self.assertEqual(count, 2)


if __name__ == "__main__":
    unittest.main()
