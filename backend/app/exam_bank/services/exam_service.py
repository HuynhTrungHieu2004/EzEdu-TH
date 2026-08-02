import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.core.concurrency import VersionConflict, compare_and_set, version_conflict_http_error
from app.exam_bank.constants.collections import EXAMS, EXAM_BLUEPRINTS, QUESTIONS
from app.exam_bank.schemas.exam import (
    ExamPreviewQuestionItem,
    ExamPreviewResponse,
    ExamResponse,
    is_valid_exam_transition,
)
from app.exam_bank.services.blueprint_service import fetch_candidate_questions, load_owned_blueprint
from app.exam_bank.services.blueprint_solver_service import solve_blueprint, solve_blueprint_with_forced
from app.exam_bank.services.shuffle_service import apply_shuffle_to_question, generate_equivalent_codes


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(doc: dict) -> ExamResponse:
    return ExamResponse(
        id=str(doc["_id"]),
        blueprint_id=doc["blueprint_id"],
        blueprint_version=doc["blueprint_version"],
        code=doc["code"],
        equivalent_group_id=doc["equivalent_group_id"],
        question_ids=doc["question_ids"],
        question_order_seed=doc.get("question_order_seed"),
        total_points=doc["total_points"],
        duration_minutes=doc["duration_minutes"],
        status=doc["status"],
        published_at=doc.get("published_at"),
        audience_type=doc.get("audience_type", "all"),
        target_class_ids=doc.get("target_class_ids", []),
        allow_retake=doc.get("allow_retake", False),
        version=doc["version"],
        owner_id=doc["owner_id"],
        created_by=doc["created_by"],
        updated_by=doc["updated_by"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        deleted_at=doc.get("deleted_at"),
    )


class BlueprintInfeasibleError(Exception):
    def __init__(self, missing: List[Dict[str, Any]], message: str):
        self.missing = missing
        self.message = message
        super().__init__(message)


async def _questions_by_id(db, question_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    object_ids = [ObjectId(qid) for qid in question_ids]
    cursor = db[QUESTIONS].find({"_id": {"$in": object_ids}})
    result = {}
    async for doc in cursor:
        result[str(doc["_id"])] = doc
    return result


async def generate_exams(
    db, *, blueprint_id: str, code_count: int, seed: Optional[int], actor_id: str, is_admin: bool
) -> tuple[str, List[ExamResponse]]:
    """Giải CP-SAT MỘT LẦN để chọn tập câu hỏi, rồi sinh `code_count` mã đề
    tương đương (đảo thứ tự + đáp án) từ CÙNG tập câu đã chọn. Trả về
    (solver_status, danh sách Exam đã tạo — trạng thái 'draft').
    """
    blueprint = await load_owned_blueprint(db, blueprint_id, actor_id=actor_id, is_admin=is_admin)
    if blueprint["status"] not in ("validated",):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ma trận đề phải ở trạng thái 'validated' (đã chạy /validate thành công) trước khi sinh đề.",
        )

    candidates = await fetch_candidate_questions(
        db, blueprint, exclude_recently_used_days=blueprint["constraints"].get("exclude_recently_used_days")
    )
    result = solve_blueprint(
        candidates=candidates,
        total_points=blueprint["total_points"],
        max_time_seconds=blueprint["constraints"].get("max_time_seconds"),
        constraints=blueprint["constraints"],
    )

    if result.status not in ("OPTIMAL", "FEASIBLE"):
        message = "Ma trận không còn khả thi với ngân hàng câu hỏi hiện tại — không tạo đề sai ma trận."
        raise BlueprintInfeasibleError(missing=[m.__dict__ for m in result.missing], message=message)

    questions_by_id = await _questions_by_id(db, result.selected_question_ids)
    codes = generate_equivalent_codes(
        question_ids=result.selected_question_ids,
        questions_by_id=questions_by_id,
        code_count=code_count,
        seed=seed,
    )

    equivalent_group_id = uuid.uuid4().hex
    now = _now()
    created_exams: List[ExamResponse] = []

    for index, shuffled in enumerate(codes, start=1):
        doc = {
            "blueprint_id": blueprint_id,
            "blueprint_version": blueprint["version"],
            "code": f"{100 + index}",
            "equivalent_group_id": equivalent_group_id,
            "question_ids": shuffled.question_order,
            "question_order_seed": seed,
            "option_shuffle": shuffled.option_shuffle,
            "total_points": blueprint["total_points"],
            "duration_minutes": blueprint["duration_minutes"],
            "status": "draft",
            "published_at": None,
            "audience_type": "all",
            "target_class_ids": [],
            "allow_retake": False,
            "version": 1,
            "owner_id": actor_id,
            "created_by": actor_id,
            "updated_by": actor_id,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        insert_result = await db[EXAMS].insert_one(doc)
        doc["_id"] = insert_result.inserted_id
        created_exams.append(_to_response(doc))

    # Cập nhật usage_count/last_used_at cho các câu đã dùng — dùng cho ràng
    # buộc "hạn chế câu đã dùng gần đây" ở lần sinh đề sau.
    await db[QUESTIONS].update_many(
        {"_id": {"$in": [ObjectId(qid) for qid in result.selected_question_ids]}},
        {"$inc": {"usage_count": 1}, "$set": {"last_used_at": now}},
    )

    return result.status, created_exams


async def regenerate_section(
    db,
    exam_id: str,
    *,
    version: int,
    group_type: str,
    group_key: str,
    actor_id: str,
    is_admin: bool,
) -> ExamResponse:
    """Sinh lại CHỈ các câu thuộc một nhóm ràng buộc (ví dụ 1 chủ đề không
    đạt), giữ nguyên mọi câu khác đã có trong đề — không sinh lại toàn bộ.

    Thực hiện bằng cách ép các câu KHÔNG thuộc nhóm mục tiêu phải được chọn
    lại (bắt buộc `selected==1` trong CP-SAT), rồi giải lại toàn bộ ràng buộc
    của ma trận — solver tự do chọn lại chỉ phần thuộc nhóm mục tiêu.
    """
    exam = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    blueprint = await load_owned_blueprint(db, exam["blueprint_id"], actor_id=actor_id, is_admin=is_admin)

    candidates = await fetch_candidate_questions(
        db, blueprint, exclude_recently_used_days=blueprint["constraints"].get("exclude_recently_used_days")
    )
    candidates_by_id = {c["id"]: c for c in candidates}

    field_by_group = {
        "topic": "topic_id",
        "bloom_level": "bloom_level",
        "difficulty": "difficulty",
        "question_type": "question_type",
    }
    field_name = field_by_group[group_type]

    # Câu hiện có trong đề mà KHÔNG thuộc nhóm mục tiêu → ép chọn lại y nguyên.
    forced_question_ids = [
        qid
        for qid in exam["question_ids"]
        if qid in candidates_by_id and candidates_by_id[qid].get(field_name) != group_key
    ]

    result = solve_blueprint_with_forced(
        candidates=candidates,
        total_points=blueprint["total_points"],
        max_time_seconds=blueprint["constraints"].get("max_time_seconds"),
        constraints=blueprint["constraints"],
        forced_question_ids=forced_question_ids,
    )

    if result.status not in ("OPTIMAL", "FEASIBLE"):
        raise BlueprintInfeasibleError(
            missing=[m.__dict__ for m in result.missing],
            message="Không thể sinh lại nhóm này — ngân hàng không đủ câu thay thế thoả ràng buộc.",
        )

    questions_by_id = await _questions_by_id(db, result.selected_question_ids)
    # Giữ nguyên thứ tự các câu không đổi, chỉ thay thế/chèn câu mới của nhóm mục tiêu vào cuối.
    new_ids_in_group = [qid for qid in result.selected_question_ids if qid not in forced_question_ids]
    new_order = forced_question_ids + new_ids_in_group

    option_shuffle = dict(exam.get("option_shuffle", {}))
    # Câu mới trong nhóm được sinh lại chưa có shuffle riêng — giữ thứ tự đáp án gốc (an toàn, không sai lệch nội dung).
    for qid in new_ids_in_group:
        option_shuffle.pop(qid, None)

    try:
        updated = await compare_and_set(
            db[EXAMS],
            filter_query={"_id": ObjectId(exam_id)},
            expected_version=version,
            update={
                "$set": {
                    "question_ids": new_order,
                    "option_shuffle": option_shuffle,
                    "updated_by": actor_id,
                    "updated_at": _now(),
                }
            },
        )
    except VersionConflict:
        raise version_conflict_http_error()

    return _to_response(updated)


async def _load_owned_exam(db, exam_id: str, *, actor_id: str, is_admin: bool) -> dict:
    doc = await db[EXAMS].find_one({"_id": ObjectId(exam_id), "deleted_at": None})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề thi.")
    if not is_admin and doc["owner_id"] != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với đề thi này.")
    return doc


async def get_exam(db, exam_id: str, *, actor_id: str, is_admin: bool) -> ExamResponse:
    doc = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    return _to_response(doc)


async def list_exams(db, *, owner_id: str, blueprint_id: Optional[str] = None, skip: int = 0, limit: int = 50):
    query: Dict[str, Any] = {"owner_id": owner_id, "deleted_at": None}
    if blueprint_id:
        query["blueprint_id"] = blueprint_id
    total = await db[EXAMS].count_documents(query)
    cursor = db[EXAMS].find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = [_to_response(doc) async for doc in cursor]
    return items, total


async def preview_exam(db, exam_id: str, *, actor_id: str, is_admin: bool, hide_answers: bool) -> ExamPreviewResponse:
    exam_doc = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    questions_by_id = await _questions_by_id(db, exam_doc["question_ids"])
    option_shuffle = exam_doc.get("option_shuffle", {})

    items: List[ExamPreviewQuestionItem] = []
    for order, qid in enumerate(exam_doc["question_ids"], start=1):
        question = questions_by_id.get(qid)
        if question is None:
            continue
        shuffled = apply_shuffle_to_question(question, option_shuffle.get(qid))
        items.append(
            ExamPreviewQuestionItem(
                question_id=qid,
                order=order,
                content=question["content"],
                options=shuffled["options"],
                correct_answer=None if hide_answers else shuffled["correct_answer"],
                explanation=None if hide_answers else question["explanation"],
                points=question["points"],
                bloom_level=question["bloom_level"],
                difficulty=question["difficulty"],
                question_type=question["question_type"],
                source_document_id=question.get("source_document_id"),
                citation=question.get("citation"),
            )
        )

    return ExamPreviewResponse(exam=_to_response(exam_doc), questions=items, hide_answers=hide_answers)


async def get_exam_questions_for_student(db, exam_id: str) -> ExamPreviewResponse:
    """Câu hỏi của đề thi cho học sinh làm bài — LUÔN ẩn đáp án/giải thích
    (khác `preview_exam` dành cho giáo viên, nơi có thể chọn hiện đáp án).
    Chỉ đề đã publish mới xem được."""
    exam_doc = await db[EXAMS].find_one({"_id": ObjectId(exam_id), "deleted_at": None})
    if exam_doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề thi.")
    if exam_doc["status"] != "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đề thi chưa được publish.")

    questions_by_id = await _questions_by_id(db, exam_doc["question_ids"])
    option_shuffle = exam_doc.get("option_shuffle", {})

    items: List[ExamPreviewQuestionItem] = []
    for order, qid in enumerate(exam_doc["question_ids"], start=1):
        question = questions_by_id.get(qid)
        if question is None:
            continue
        shuffled = apply_shuffle_to_question(question, option_shuffle.get(qid))
        items.append(
            ExamPreviewQuestionItem(
                question_id=qid,
                order=order,
                content=question["content"],
                options=shuffled["options"],
                correct_answer=None,
                explanation=None,
                points=question["points"],
                bloom_level=question["bloom_level"],
                difficulty=question["difficulty"],
                question_type=question["question_type"],
                source_document_id=question.get("source_document_id"),
                citation=question.get("citation"),
            )
        )

    return ExamPreviewResponse(exam=_to_response(exam_doc), questions=items, hide_answers=True)


async def publish_exam(
    db, exam_id: str, *, version: int, audience_type: str, target_class_ids: List[str], actor_id: str, is_admin: bool
) -> ExamResponse:
    existing = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    if existing["status"] not in ("ready", "draft"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đề thi phải ở trạng thái 'draft' hoặc 'ready' để publish.")

    # draft -> ready -> published: cho phép publish thẳng từ draft (tự động
    # coi như đã qua bước "ready") để đơn giản hoá luồng giáo viên — đề đã
    # sinh từ ma trận validated coi như đã "sẵn sàng" về mặt cấu trúc.
    try:
        updated = await compare_and_set(
            db[EXAMS],
            filter_query={"_id": ObjectId(exam_id)},
            expected_version=version,
            update={
                "$set": {
                    "status": "published",
                    "published_at": _now(),
                    "audience_type": audience_type,
                    "target_class_ids": target_class_ids,
                    "updated_by": actor_id,
                    "updated_at": _now(),
                }
            },
        )
    except VersionConflict:
        raise version_conflict_http_error()

    return _to_response(updated)


async def clone_exam(db, exam_id: str, *, actor_id: str, is_admin: bool) -> ExamResponse:
    existing = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    now = _now()
    clone_doc = {
        **{k: v for k, v in existing.items() if k != "_id"},
        "code": f"{existing['code']}-copy",
        "status": "draft",
        "published_at": None,
        "version": 1,
        "created_by": actor_id,
        "updated_by": actor_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[EXAMS].insert_one(clone_doc)
    clone_doc["_id"] = result.inserted_id
    return _to_response(clone_doc)


async def archive_exam(db, exam_id: str, *, version: int, actor_id: str, is_admin: bool) -> ExamResponse:
    existing = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    if not is_valid_exam_transition(existing["status"], "archived") and existing["status"] != "closed":
        # closed->archived đã hợp lệ qua is_valid_exam_transition; cho phép
        # thêm draft/ready -> archived trực tiếp (huỷ đề chưa publish).
        if existing["status"] not in ("draft", "ready"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể lưu trữ đề thi ở trạng thái hiện tại.")

    try:
        updated = await compare_and_set(
            db[EXAMS],
            filter_query={"_id": ObjectId(exam_id)},
            expected_version=version,
            update={"$set": {"status": "archived", "updated_by": actor_id, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()

    return _to_response(updated)


async def set_allow_retake(
    db, exam_id: str, *, version: int, allow_retake: bool, actor_id: str, is_admin: bool
) -> ExamResponse:
    existing = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    try:
        updated = await compare_and_set(
            db[EXAMS],
            filter_query={"_id": existing["_id"]},
            expected_version=version,
            update={"$set": {"allow_retake": allow_retake, "updated_by": actor_id, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)


async def delete_exam(db, exam_id: str, *, version: int, actor_id: str, is_admin: bool) -> ExamResponse:
    existing = await _load_owned_exam(db, exam_id, actor_id=actor_id, is_admin=is_admin)
    try:
        updated = await compare_and_set(
            db[EXAMS],
            filter_query={"_id": existing["_id"]},
            expected_version=version,
            update={"$set": {"deleted_at": _now(), "updated_by": actor_id, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)
