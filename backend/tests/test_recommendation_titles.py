"""Gợi ý phải gọi tên nội dung bằng chính nội dung đó.

`learning_items` không lưu chữ nào — chỉ có `question_set_id` + `question_index`
cho câu hỏi, và `source_chunk_ids` cho đoạn học liệu. Vì vậy tiêu đề rơi về
nhánh dự phòng và người học nhìn thấy `Question 6a7d034eb051ab083683d476:4`.
Một dãy id không cho biết nên bấm vào cái nào.

Chữ vẫn nằm sẵn trong `question_sets` và `document_chunks`; chỉ cần tra ra lúc
dựng phản hồi.
"""

import unittest

from mongomock_motor import AsyncMongoMockClient

from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.recommendation_api_service import resolve_item_titles

SET_ID = "6a7d034eb051ab083683d474"


class ResolveItemTitlesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["titles"]
        self.repo = PersonalizationMongoRepository(self.db)
        await self.db["question_sets"].insert_one({
            "_id": SET_ID,
            "questions": [
                {"question": "Đồ thị hàm số bậc hai là hình gì?"},
                {"question": "Biệt thức delta được tính bằng công thức nào?"},
            ],
        })
        await self.db["document_chunks"].insert_one({
            "_id": "chunk-1",
            "content": "Hàm số bậc hai có dạng y = ax² + bx + c với a khác 0.",
        })

    async def test_question_item_is_named_by_its_question_text(self):
        item = {"_id": f"{SET_ID}:1", "item_type": "question",
                "question_set_id": SET_ID, "question_index": 1}

        titles = await resolve_item_titles(self.repo, [item])

        self.assertEqual(titles[f"{SET_ID}:1"],
                         "Biệt thức delta được tính bằng công thức nào?")

    async def test_chunk_item_is_named_by_its_text(self):
        item = {"_id": "chunk-item", "item_type": "document_chunk",
                "source_chunk_ids": ["chunk-1"]}

        titles = await resolve_item_titles(self.repo, [item])

        self.assertTrue(titles["chunk-item"].startswith("Hàm số bậc hai"))

    async def test_missing_source_leaves_no_title_rather_than_a_wrong_one(self):
        """Không bịa: bộ đề đã xoá thì trả về không có gì, để nhánh dự phòng
        cũ xử lý, chứ không gán nhầm chữ của câu khác."""
        item = {"_id": "mo-coi", "item_type": "question",
                "question_set_id": "khong-ton-tai", "question_index": 0}

        titles = await resolve_item_titles(self.repo, [item])

        self.assertNotIn("mo-coi", titles)

    async def test_index_out_of_range_is_ignored(self):
        item = {"_id": f"{SET_ID}:99", "item_type": "question",
                "question_set_id": SET_ID, "question_index": 99}

        titles = await resolve_item_titles(self.repo, [item])

        self.assertNotIn(f"{SET_ID}:99", titles)

    async def test_many_items_from_one_set_cost_a_single_lookup(self):
        """Tra từng item một thì mỗi màn hình gợi ý là chục lượt truy vấn."""
        items = [
            {"_id": f"{SET_ID}:{index}", "item_type": "question",
             "question_set_id": SET_ID, "question_index": index}
            for index in range(2)
        ]

        titles = await resolve_item_titles(self.repo, items)

        self.assertEqual(len(titles), 2)
        self.assertEqual(titles[f"{SET_ID}:0"], "Đồ thị hàm số bậc hai là hình gì?")

    async def test_empty_input_is_handled(self):
        self.assertEqual(await resolve_item_titles(self.repo, []), {})


if __name__ == "__main__":
    unittest.main()
