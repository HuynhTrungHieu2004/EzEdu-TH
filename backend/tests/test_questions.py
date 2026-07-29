import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.schemas.auth import UserResponse


def actor(role: str = "lecturer") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class QuestionItemMutationTests(unittest.IsolatedAsyncioTestCase):
    """
    Kiểm thử hồi quy cho một lỗi Critical phát hiện qua kiểm thử thủ công:
    `update_question_item` và `update_question_workflow` từng thao tác trên
    bản sao chuẩn hoá (`_normalize_question_items`) tách rời khỏi
    `qs["questions"]`, nên API trả 200 thành công nhưng thay đổi không bao giờ
    được lưu vào cơ sở dữ liệu — cả sửa nội dung câu hỏi lẫn duyệt/xuất bản
    từng câu đều là no-op im lặng. Router này trước đó không có test nào.
    """

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_questions"]
        self.patcher = patch("app.routers.questions.get_database", return_value=self.db)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

        self.owner = actor("lecturer")
        self.question_set_id = ObjectId()
        now = datetime.now(timezone.utc)
        await self.db["question_sets"].insert_one({
            "_id": self.question_set_id,
            "document_id": str(ObjectId()),
            "user_id": self.owner.id,
            "document_name": "Tài liệu QA",
            "question_count": 1,
            "difficulty": "easy",
            "question_type": "multiple_choice",
            "questions": [
                {
                    "question": "Câu hỏi gốc?",
                    "options": {"A": "Một", "B": "Hai"},
                    "correct_answer": "A",
                    "explanation": "Giải thích gốc.",
                    "difficulty": "easy",
                    "question_type": "multiple_choice",
                    "bloom_level": "remember",
                    "tags": [],
                    "status": "draft",
                    "reviewed_by": None,
                    "reviewed_at": None,
                    "published_at": None,
                }
            ],
            "workflow_counts": {"draft": 1, "review_pending": 0, "approved": 0, "published": 0},
            "published_question_count": 0,
            "audience_type": "all",
            "target_class_ids": [],
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        })

    async def test_update_question_item_persists_edited_content(self):
        from app.routers.questions import QuestionItemUpdateRequest, update_question_item

        response = await update_question_item(
            str(self.question_set_id),
            0,
            QuestionItemUpdateRequest(question="Câu hỏi đã sửa."),
            current_user=self.owner,
        )
        # API trả về đúng nội dung đã sửa...
        self.assertEqual(response.questions[0].question, "Câu hỏi đã sửa.")

        # ...và quan trọng hơn: phải thực sự nằm trong cơ sở dữ liệu, không chỉ
        # trong response của chính lượt gọi này.
        stored = await self.db["question_sets"].find_one({"_id": self.question_set_id})
        self.assertEqual(stored["questions"][0]["question"], "Câu hỏi đã sửa.")

    async def test_update_question_workflow_persists_status_transition(self):
        from app.routers.questions import QuestionWorkflowRequest, update_question_workflow

        response = await update_question_workflow(
            str(self.question_set_id),
            0,
            QuestionWorkflowRequest(status="review_pending"),
            current_user=self.owner,
        )
        self.assertEqual(response.questions[0].status, "review_pending")

        stored = await self.db["question_sets"].find_one({"_id": self.question_set_id})
        self.assertEqual(stored["questions"][0]["status"], "review_pending")
        # workflow_counts phải được tính lại theo trạng thái mới, không phải
        # bộ đếm cũ từ trước khi thay đổi.
        self.assertEqual(stored["workflow_counts"]["review_pending"], 1)
        self.assertEqual(stored["workflow_counts"]["draft"], 0)

    async def test_workflow_transitions_through_full_lifecycle_persist(self):
        from app.routers.questions import QuestionWorkflowRequest, update_question_workflow

        for target in ("review_pending", "approved", "published"):
            await update_question_workflow(
                str(self.question_set_id),
                0,
                QuestionWorkflowRequest(status=target),
                current_user=self.owner,
            )

        stored = await self.db["question_sets"].find_one({"_id": self.question_set_id})
        self.assertEqual(stored["questions"][0]["status"], "published")
        self.assertIsNotNone(stored["questions"][0]["published_at"])
        self.assertEqual(stored["workflow_counts"]["published"], 1)


if __name__ == "__main__":
    unittest.main()
