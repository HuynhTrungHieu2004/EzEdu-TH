"""Học sinh phải nhìn thấy học liệu đã ban hành cho mình.

Miền cá nhân hoá định nghĩa "truy cập được" là **tài liệu do chính mình tải
lên**. Học sinh không tải tài liệu nào, nên bộ sinh ứng viên luôn nhận về danh
sách rỗng và không học sinh nào từng nhận được một gợi ý — dù toàn bộ chuỗi
phía sau (BKT, IRT, K-Means, CBF) chạy đúng.

Hệ thống đã có sẵn luật hiển thị cho học sinh ở trang "Bài thi của bạn": bộ đề
có câu đã ban hành, và ban hành cho tất cả hoặc cho lớp mà em đó thuộc về. Các
test dưới đây khoá miền cá nhân hoá vào **đúng luật đó**, thay vì dựng luật
thứ hai chạy song song rồi lệch nhau về sau.
"""

import unittest
from datetime import datetime, timezone

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.personalization.repositories.mongo import PersonalizationMongoRepository

NOW = datetime(2026, 8, 13, tzinfo=timezone.utc)

TEACHER_ID = "teacher-1"
STUDENT_ID = "student-1"
OUTSIDER_ID = "student-2"


def question(status: str) -> dict:
    return {"question": "Câu hỏi mẫu", "correct_answer": "A", "status": status,
            "deleted_at": None}


class LearningItemVisibilityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["visibility"]
        self.repo = PersonalizationMongoRepository(self.db)

        self.class_id = ObjectId()
        await self.db["classes"].insert_one({
            "_id": self.class_id, "name": "10A1", "owner_id": TEACHER_ID,
            "student_ids": [STUDENT_ID], "deleted_at": None, "created_at": NOW,
        })

        self.document_id = str(ObjectId())
        await self.db["documents"].insert_one({
            "_id": ObjectId(self.document_id), "user_id": TEACHER_ID,
            "status": "indexed", "deleted_at": None, "created_at": NOW,
        })

        # Ba bộ đề: ban hành cho tất cả, ban hành riêng cho lớp, và bản nháp.
        self.set_all = str(ObjectId())
        self.set_class = str(ObjectId())
        self.set_draft = str(ObjectId())
        await self.db["question_sets"].insert_many([
            {"_id": ObjectId(self.set_all), "user_id": TEACHER_ID,
             "document_id": self.document_id, "deleted_at": None,
             "audience_type": "all", "published_question_count": 1,
             "questions": [question("published"), question("draft")]},
            {"_id": ObjectId(self.set_class), "user_id": TEACHER_ID,
             "document_id": self.document_id, "deleted_at": None,
             "audience_type": "classes", "target_class_ids": [str(self.class_id)],
             "published_question_count": 1, "questions": [question("published")]},
            {"_id": ObjectId(self.set_draft), "user_id": TEACHER_ID,
             "document_id": self.document_id, "deleted_at": None,
             "audience_type": "all", "published_question_count": 0,
             "questions": [question("draft")]},
        ])

        items = []
        for set_id, indexes in ((self.set_all, [0, 1]), (self.set_class, [0]),
                                (self.set_draft, [0])):
            for index in indexes:
                items.append({
                    "_id": f"{set_id}:{index}", "item_type": "question",
                    "document_id": self.document_id, "question_set_id": set_id,
                    "question_index": index, "knowledge_component_ids": ["kc-1"],
                    "quality_score": 0.9, "updated_at": NOW,
                })
        await self.db["learning_items"].insert_many(items)

    async def _visible_ids(self, user_id: str) -> set[str]:
        items = await self.repo.list_accessible_learning_items_for_user(user_id, limit=100)
        return {str(item.get("id") or item.get("_id")) for item in items}

    async def test_student_sees_items_published_to_everyone(self):
        visible = await self._visible_ids(STUDENT_ID)

        self.assertIn(f"{self.set_all}:0", visible)

    async def test_student_sees_items_published_to_their_class(self):
        visible = await self._visible_ids(STUDENT_ID)

        self.assertIn(f"{self.set_class}:0", visible)

    async def test_student_does_not_see_unpublished_questions(self):
        """Câu còn nháp trong một bộ đề đã ban hành vẫn phải kín — ban hành là
        theo từng câu, không phải theo cả bộ."""
        visible = await self._visible_ids(STUDENT_ID)

        self.assertNotIn(f"{self.set_all}:1", visible)
        self.assertNotIn(f"{self.set_draft}:0", visible)

    async def test_student_outside_the_class_sees_only_the_public_set(self):
        visible = await self._visible_ids(OUTSIDER_ID)

        self.assertIn(f"{self.set_all}:0", visible)
        self.assertNotIn(f"{self.set_class}:0", visible)

    async def test_owner_still_sees_everything_in_their_own_documents(self):
        """Không được thu hẹp quyền của giáo viên khi mở quyền cho học sinh."""
        visible = await self._visible_ids(TEACHER_ID)

        self.assertEqual(len(visible), 4)

    async def test_fetching_one_item_uses_the_same_rule_as_listing_them(self):
        """Danh sách và lấy-từng-item phải cùng luật. Lệch nhau thì gợi ý được
        xếp hạng xong lại rơi mất ở bước dựng phản hồi, và người dùng thấy màn
        hình rỗng dù hệ thống đã chọn ra nội dung cho họ."""
        item = await self.repo.get_accessible_learning_item_for_user(
            STUDENT_ID, f"{self.set_all}:0"
        )
        khong_duoc_xem = await self.repo.get_accessible_learning_item_for_user(
            STUDENT_ID, f"{self.set_draft}:0"
        )

        self.assertIsNotNone(item)
        self.assertIsNone(khong_duoc_xem)

    async def test_components_by_id_follow_the_same_visibility(self):
        await self.db["knowledge_components"].insert_one({
            "_id": "kc-1", "name": "Hàm số bậc hai", "subject": "Toán",
            "created_by": TEACHER_ID, "document_id": self.document_id,
        })

        components = await self.repo.list_knowledge_components_by_ids_for_user(
            STUDENT_ID, ["kc-1"]
        )

        self.assertEqual(len(components), 1)

    async def test_knowledge_components_follow_the_same_visibility(self):
        """Bộ sinh ứng viên cần thành phần tri thức để khớp môn học; nếu chỉ mở
        learning item mà không mở thành phần tri thức thì nguồn theo sở thích
        và theo điểm yếu vẫn rỗng."""
        await self.db["knowledge_components"].insert_one({
            "_id": "kc-1", "name": "Hàm số bậc hai", "subject": "Toán",
            "created_by": TEACHER_ID, "document_id": self.document_id,
        })

        components = await self.repo.list_knowledge_components_for_user(STUDENT_ID, limit=100)

        self.assertEqual(len(components), 1)


if __name__ == "__main__":
    unittest.main()
