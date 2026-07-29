"""Index cho các collection của phân hệ ngân hàng câu hỏi & ma trận đề.

Theo đúng mẫu `app/personalization/repositories/indexes.py` — dataclass
`IndexSpec` + hàm `ensure_exam_bank_indexes` gọi 1 lần lúc khởi động.
"""

import logging
from dataclasses import dataclass
from typing import List, Tuple

from pymongo import ASCENDING, DESCENDING

from app.exam_bank.constants.collections import (
    CURRICULUM_TAXONOMY,
    EXAMS,
    EXAM_ATTEMPTS,
    EXAM_BLUEPRINTS,
    QUESTIONS,
)

logger = logging.getLogger("app.exam_bank.repositories.indexes")


@dataclass(frozen=True)
class IndexSpec:
    collection: str
    keys: List[Tuple[str, int]]
    name: str
    unique: bool = False


EXAM_BANK_INDEXES: tuple = (
    IndexSpec(CURRICULUM_TAXONOMY, [("node_type", ASCENDING), ("parent_id", ASCENDING)], "taxonomy_type_parent"),
    IndexSpec(QUESTIONS, [("owner_id", ASCENDING), ("status", ASCENDING)], "question_owner_status"),
    IndexSpec(
        QUESTIONS,
        [("subject_id", ASCENDING), ("grade", ASCENDING), ("topic_id", ASCENDING)],
        "question_subject_grade_topic",
    ),
    IndexSpec(QUESTIONS, [("bloom_level", ASCENDING), ("difficulty", ASCENDING)], "question_bloom_difficulty"),
    IndexSpec(QUESTIONS, [("deleted_at", ASCENDING)], "question_deleted_at"),
    IndexSpec(EXAM_BLUEPRINTS, [("owner_id", ASCENDING), ("status", ASCENDING)], "blueprint_owner_status"),
    IndexSpec(EXAMS, [("blueprint_id", ASCENDING)], "exam_blueprint_id"),
    IndexSpec(EXAMS, [("equivalent_group_id", ASCENDING)], "exam_equivalent_group"),
    IndexSpec(EXAMS, [("owner_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)], "exam_owner_status_updated"),
    IndexSpec(EXAM_ATTEMPTS, [("exam_id", ASCENDING), ("student_id", ASCENDING)], "attempt_exam_student", unique=True),
    IndexSpec(EXAM_ATTEMPTS, [("status", ASCENDING), ("due_at", ASCENDING)], "attempt_status_due_at"),
)


async def ensure_exam_bank_indexes(db) -> None:
    for spec in EXAM_BANK_INDEXES:
        try:
            await db[spec.collection].create_index(spec.keys, name=spec.name, unique=spec.unique)
        except Exception as e:  # noqa: BLE001 - không chặn startup vì 1 index lỗi
            logger.error("exam_bank.index_creation_failed", extra={"index": spec.name, "error": str(e)})
