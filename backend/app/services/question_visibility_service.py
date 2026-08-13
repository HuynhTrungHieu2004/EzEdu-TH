"""Luật hiển thị bộ đề cho học sinh — một định nghĩa duy nhất.

Luật này trước đây nằm riêng trong `routers/questions.py`, phục vụ trang "Bài
thi của bạn". Miền cá nhân hoá cần đúng luật đó để biết học sinh được tiếp cận
học liệu nào. Chép lại luật sang chỗ thứ hai thì sớm muộn hai bản sẽ lệch nhau,
và lệch theo hướng nguy hiểm: một bên siết, một bên hở.
"""

from __future__ import annotations

from typing import Any, Dict, List


async def student_class_ids(db, user_id: str) -> List[str]:
    """Các lớp mà người dùng đang là học sinh."""
    cursor = db["classes"].find({"student_ids": user_id, "deleted_at": None}, {"_id": 1})
    return [str(doc["_id"]) async for doc in cursor]


async def build_visible_question_set_filter(db, user_id: str) -> Dict[str, Any]:
    """Bộ lọc Mongo cho các bộ đề mà học sinh này được xem.

    Điều kiện: có ít nhất một câu đã ban hành, và được ban hành cho tất cả hoặc
    cho một lớp mà em đó thuộc về. Bộ đề tạo trước khi có tính năng chọn đối
    tượng thì không có `audience_type` — coi như ban hành cho tất cả, để không
    làm mất dữ liệu cũ.
    """
    class_ids = await student_class_ids(db, user_id)
    return {
        "deleted_at": None,
        "published_question_count": {"$gt": 0},
        "$or": [
            {"audience_type": "all"},
            {"audience_type": {"$exists": False}},
            {"audience_type": "classes", "target_class_ids": {"$in": class_ids}},
        ],
    }


async def list_visible_published_question_indexes(db, user_id: str) -> Dict[str, set]:
    """Với mỗi bộ đề học sinh được xem, trả về tập chỉ số câu đã ban hành.

    Lọc ở mức bộ đề là chưa đủ: một bộ đã ban hành vẫn có thể còn câu nháp, và
    câu nháp là bản giáo viên chưa muốn cho ai đọc.
    """
    mongo_filter = await build_visible_question_set_filter(db, user_id)
    visible: Dict[str, set] = {}
    cursor = db["question_sets"].find(mongo_filter, {"_id": 1, "questions": 1})
    async for question_set in cursor:
        published = {
            index
            for index, question in enumerate(question_set.get("questions") or [])
            if question.get("deleted_at") is None and question.get("status") == "published"
        }
        if published:
            visible[str(question_set["_id"])] = published
    return visible
