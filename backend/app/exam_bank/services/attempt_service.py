import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.core.concurrency import VersionConflict, compare_and_set, version_conflict_http_error
from app.services.background_job_service import enqueue
from app.exam_bank.constants.collections import EXAMS, EXAM_ATTEMPTS, QUESTIONS
from app.exam_bank.schemas.attempt import (
    AttemptQuestionResult,
    AttemptResponse,
    AttemptStartResponse,
    ExamResultItem,
    ExamResultStatistics,
)
from app.exam_bank.schemas.exam import StudentExamItem
from app.curriculum_kb.services.context_service import resolve_context
from app.services.language_policy_service import resolve_output_language
from app.services.submission_notification_service import upsert_submission_notification

GRADE_ESSAY_JOB_TYPE = "grade_essay_answer"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """PyMongo/Motor trả `datetime` KHÔNG có tzinfo (BSON lưu UTC nhưng không
    giữ offset) dù lúc ghi là aware. Nếu trả thẳng giá trị naive này ra JSON,
    chuỗi ISO thiếu 'Z'/offset khiến trình duyệt hiểu nhầm là GIỜ ĐỊA PHƯƠNG
    (không phải UTC) khi `new Date(...)` — lệch hàng giờ, đủ để đồng hồ đếm
    ngược tưởng đã hết giờ ngay khi vừa bắt đầu. Luôn gắn lại tzinfo=UTC
    trước khi đưa vào response."""
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone.utc)


def _is_past_due(due_at: datetime) -> bool:
    return _aware(due_at) <= _now()


def _answer_key(answer: str) -> str:
    return re.sub(r"\s+", " ", (answer or "").strip().lower())


def _is_answer_correct(question: Dict[str, Any], submitted_answer: str) -> bool:
    """So khớp chính xác — cùng logic với `_is_answer_correct` ở
    `app/routers/questions.py` (không import trực tiếp: exam_bank tách biệt
    có chủ đích khỏi question_sets, xem ghi chú ở schemas/question.py)."""
    correct_answer = str(question.get("correct_answer", ""))
    if question.get("question_type") == "true_false":
        truthy = {"true", "a", "đúng", "dung", "yes", "1"}
        falsy = {"false", "b", "sai", "no", "0"}
        expected = _answer_key(correct_answer)
        actual = _answer_key(submitted_answer)
        if expected in truthy:
            return actual in truthy
        if expected in falsy:
            return actual in falsy
    return _answer_key(submitted_answer) == _answer_key(correct_answer)


def _object_id_or_404(value: str, detail: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return ObjectId(value)


def _to_response(
    doc: Dict[str, Any],
    *,
    student_name: Optional[str] = None,
    student_email: Optional[str] = None,
) -> AttemptResponse:
    return AttemptResponse(
        id=str(doc["_id"]),
        exam_id=doc["exam_id"],
        exam_code=doc["exam_code"],
        student_id=doc["student_id"],
        student_name=student_name,
        student_email=student_email,
        status=doc["status"],
        answers=doc.get("answers", {}),
        started_at=_aware(doc["started_at"]),
        due_at=_aware(doc["due_at"]),
        server_now=_now(),
        submitted_at=_aware(doc.get("submitted_at")),
        auto_submitted=doc.get("auto_submitted", False),
        total_score=doc.get("total_score", 0.0),
        max_score=doc.get("max_score", 0.0),
        results=[AttemptQuestionResult(**r) for r in doc.get("results", [])],
        version=doc["version"],
        created_at=_aware(doc["created_at"]),
        updated_at=_aware(doc["updated_at"]),
    )


async def _questions_by_id(db, question_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    cursor = db[QUESTIONS].find({"_id": {"$in": [ObjectId(q) for q in question_ids]}})
    return {str(doc["_id"]): doc async for doc in cursor}


async def start_attempt(db, exam_id: str, *, student_id: str) -> AttemptStartResponse:
    exam_oid = _object_id_or_404(exam_id, "Không tìm thấy đề thi.")
    exam = await db[EXAMS].find_one({"_id": exam_oid, "deleted_at": None})
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề thi.")
    if exam["status"] != "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Đề thi chưa được publish.")
    if (
        exam.get("purpose") == "student_review"
        and exam.get("target_student_id") != student_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Đề ôn tập này thuộc về học sinh khác.",
        )

    latest = await db[EXAM_ATTEMPTS].find_one(
        {"exam_id": exam_id, "student_id": student_id}, sort=[("attempt_number", -1)]
    )
    if latest is not None and latest["status"] == "in_progress":
        return AttemptStartResponse(
            id=str(latest["_id"]),
            exam_id=exam_id,
            exam_code=latest["exam_code"],
            started_at=_aware(latest["started_at"]),
            due_at=_aware(latest["due_at"]),
            server_now=_now(),
            status=latest["status"],
        )
    if latest is not None and not exam.get("allow_retake", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Đề thi này không cho phép làm lại.")

    next_attempt_number = (latest.get("attempt_number", 1) + 1) if latest is not None else 1
    now = _now()
    due_at = now + timedelta(minutes=exam["duration_minutes"])
    doc = {
        "exam_id": exam_id,
        "exam_code": exam["code"],
        "student_id": student_id,
        "attempt_number": next_attempt_number,
        "status": "in_progress",
        "answers": {},
        "started_at": now,
        "due_at": due_at,
        "submitted_at": None,
        "auto_submitted": False,
        "total_score": 0.0,
        "max_score": 0.0,
        "results": [],
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }
    try:
        insert_result = await db[EXAM_ATTEMPTS].insert_one(doc)
    except DuplicateKeyError:
        # Race: 2 request "start" đồng thời cùng attempt_number — request thua cuộc đọc lại bản mới nhất.
        existing = await db[EXAM_ATTEMPTS].find_one(
            {"exam_id": exam_id, "student_id": student_id}, sort=[("attempt_number", -1)]
        )
        return AttemptStartResponse(
            id=str(existing["_id"]),
            exam_id=exam_id,
            exam_code=existing["exam_code"],
            started_at=_aware(existing["started_at"]),
            due_at=_aware(existing["due_at"]),
            server_now=_now(),
            status=existing["status"],
        )
    doc["_id"] = insert_result.inserted_id
    return AttemptStartResponse(
        id=str(doc["_id"]),
        exam_id=exam_id,
        exam_code=doc["exam_code"],
        started_at=now,
        due_at=due_at,
        server_now=now,
        status="in_progress",
    )


async def _load_own_attempt(db, attempt_id: str, *, student_id: str) -> Dict[str, Any]:
    attempt_oid = _object_id_or_404(attempt_id, "Không tìm thấy lượt làm bài.")
    doc = await db[EXAM_ATTEMPTS].find_one({"_id": attempt_oid})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lượt làm bài.")
    if doc["student_id"] != student_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với lượt làm bài này.")
    return doc


async def get_attempt(db, attempt_id: str, *, student_id: str) -> AttemptResponse:
    doc = await _load_own_attempt(db, attempt_id, student_id=student_id)
    if doc["status"] == "in_progress" and _is_past_due(doc["due_at"]):
        doc = await _finalize(db, doc, answers=doc.get("answers", {}), auto_submitted=True)
    return _to_response(doc)


async def autosave(db, attempt_id: str, *, version: int, answers: Dict[str, str], student_id: str) -> AttemptResponse:
    doc = await _load_own_attempt(db, attempt_id, student_id=student_id)
    if doc["status"] != "in_progress":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bài đã nộp, không thể lưu thêm.")

    if _is_past_due(doc["due_at"]):
        # Lớp tự nộp thứ 2: hết giờ mà học sinh vẫn còn thao tác -> chốt nộp
        # luôn bằng đúng câu trả lời vừa gửi lên, không chờ request /submit.
        finalized = await _finalize(db, doc, answers=answers, auto_submitted=True)
        return _to_response(finalized)

    try:
        updated = await compare_and_set(
            db[EXAM_ATTEMPTS],
            filter_query={"_id": _object_id_or_404(attempt_id, "Không tìm thấy lượt làm bài.")},
            expected_version=version,
            update={"$set": {"answers": answers, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)


async def submit_attempt(
    db, attempt_id: str, *, version: int, answers: Dict[str, str], student_id: str
) -> AttemptResponse:
    doc = await _load_own_attempt(db, attempt_id, student_id=student_id)
    if doc["status"] != "in_progress":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bài đã nộp rồi.")
    if doc["version"] != version:
        raise version_conflict_http_error()

    finalized = await _finalize(db, doc, answers=answers, auto_submitted=False)
    return _to_response(finalized)


async def _finalize(db, doc: Dict[str, Any], *, answers: Dict[str, str], auto_submitted: bool) -> Dict[str, Any]:
    """Chốt nộp bài: chấm ngay trắc nghiệm/đúng-sai, xếp hàng chấm AI cho tự
    luận. Dùng chung cho cả 3 lớp tự nộp (client/autosave/sweeper nền)."""
    exam = await db[EXAMS].find_one({"_id": ObjectId(doc["exam_id"])})
    questions_by_id = await _questions_by_id(db, exam["question_ids"])

    results: List[Dict[str, Any]] = []
    has_pending_ai = False
    for qid in exam["question_ids"]:
        question = questions_by_id.get(qid)
        if question is None:
            continue
        student_answer = answers.get(qid)
        points = question["points"]
        if question["question_type"] == "short_answer":
            has_pending_ai = True
            results.append(
                AttemptQuestionResult(
                    question_id=qid,
                    question_type="short_answer",
                    points_possible=points,
                    student_answer=student_answer,
                    is_correct=None,
                    final_score=0.0,
                ).model_dump()
            )
        else:
            is_correct = student_answer is not None and _is_answer_correct(question, student_answer)
            results.append(
                AttemptQuestionResult(
                    question_id=qid,
                    question_type=question["question_type"],
                    points_possible=points,
                    student_answer=student_answer,
                    is_correct=is_correct,
                    final_score=points if is_correct else 0.0,
                ).model_dump()
            )

    now = _now()
    total_score = sum(r["final_score"] for r in results)
    max_score = sum(r["points_possible"] for r in results)
    new_status = "submitted" if has_pending_ai else "graded"

    try:
        updated = await compare_and_set(
            db[EXAM_ATTEMPTS],
            filter_query={"_id": doc["_id"]},
            expected_version=doc["version"],
            update={
                "$set": {
                    "answers": answers,
                    "status": new_status,
                    "results": results,
                    "total_score": total_score,
                    "max_score": max_score,
                    "submitted_at": now,
                    "auto_submitted": auto_submitted,
                    "updated_at": now,
                }
            },
        )
    except VersionConflict:
        # Đã bị 1 request khác (autosave/sweeper) chốt nộp trước — đọc lại bản mới nhất.
        return await db[EXAM_ATTEMPTS].find_one({"_id": doc["_id"]})

    if has_pending_ai:
        attempt_id = str(doc["_id"])
        for r in results:
            if r["question_type"] != "short_answer":
                continue
            await enqueue(
                db,
                job_type=GRADE_ESSAY_JOB_TYPE,
                payload={"attempt_id": attempt_id, "question_id": r["question_id"]},
                idempotency_key=f"grade:{attempt_id}:{r['question_id']}",
            )

    await upsert_submission_notification(
        db,
        teacher_id=exam["owner_id"],
        attempt_id=str(doc["_id"]),
        title=f"Học sinh đã nộp đề {exam['code']}",
        content="Đang chấm câu tự luận" if has_pending_ai else "Đã chấm xong",
        action_url=f"/exams/{doc['exam_id']}/grading",
    )

    return updated


async def override_score(
    db,
    attempt_id: str,
    *,
    version: int,
    question_id: str,
    teacher_score: float,
    teacher_feedback: Optional[str],
    actor_id: str,
    is_admin: bool,
) -> AttemptResponse:
    attempt_oid = _object_id_or_404(attempt_id, "Không tìm thấy lượt làm bài.")
    doc = await db[EXAM_ATTEMPTS].find_one({"_id": attempt_oid})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lượt làm bài.")
    exam = await db[EXAMS].find_one({"_id": ObjectId(doc["exam_id"])})
    if exam is None or (not is_admin and exam["owner_id"] != actor_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với đề thi này.")
    if doc["version"] != version:
        raise version_conflict_http_error()

    results = doc.get("results", [])
    found = False
    for r in results:
        if r["question_id"] == question_id:
            if teacher_score > r["points_possible"]:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Điểm giáo viên không được vượt quá điểm tối đa của câu hỏi.",
                )
            r["teacher_score"] = teacher_score
            r["teacher_feedback"] = teacher_feedback
            r["final_score"] = teacher_score
            found = True
            break
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy câu hỏi trong lượt làm bài này.")

    total_score = sum(r["final_score"] for r in results)
    try:
        updated = await compare_and_set(
            db[EXAM_ATTEMPTS],
            filter_query={"_id": attempt_oid},
            expected_version=version,
            update={"$set": {"results": results, "total_score": total_score, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)


async def list_attempts_for_exam(db, exam_id: str, *, actor_id: str, is_admin: bool) -> List[AttemptResponse]:
    exam_oid = _object_id_or_404(exam_id, "Không tìm thấy đề thi.")
    exam = await db[EXAMS].find_one({"_id": exam_oid})
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đề thi.")
    if not is_admin and exam["owner_id"] != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với đề thi này.")

    docs = [doc async for doc in db[EXAM_ATTEMPTS].find({"exam_id": exam_id}).sort("created_at", 1)]
    student_oids = [
        ObjectId(doc["student_id"])
        for doc in docs
        if ObjectId.is_valid(doc.get("student_id", ""))
    ]
    students = {}
    if student_oids:
        students = {
            str(user["_id"]): user
            async for user in db["users"].find(
                {"_id": {"$in": student_oids}},
                {"full_name": 1, "email": 1},
            )
        }
    return [
        _to_response(
            doc,
            student_name=(students.get(doc["student_id"]) or {}).get("full_name"),
            student_email=(students.get(doc["student_id"]) or {}).get("email"),
        )
        for doc in docs
    ]


async def list_exam_results(
    db, *, actor_id: str, is_admin: bool, class_id: str | None = None
) -> List[ExamResultItem]:
    student_filter: list[str] | None = None
    if class_id:
        if not ObjectId.is_valid(class_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lớp học.")
        class_query: dict = {"_id": ObjectId(class_id), "deleted_at": None}
        if not is_admin:
            class_query["owner_id"] = actor_id
        class_doc = await db["classes"].find_one(class_query, {"student_ids": 1})
        if not class_doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lớp học.")
        student_filter = list(class_doc.get("student_ids") or [])

    exam_query = {"deleted_at": None}
    if not is_admin:
        exam_query["owner_id"] = actor_id
    exams = {str(doc["_id"]): doc async for doc in db[EXAMS].find(exam_query, {"code": 1})}
    if not exams:
        return []

    attempt_query: dict = {
        "exam_id": {"$in": list(exams)},
        "status": {"$in": ["submitted", "graded"]},
    }
    if student_filter is not None:
        attempt_query["student_id"] = {"$in": student_filter}
    docs = await db[EXAM_ATTEMPTS].find(attempt_query).sort("submitted_at", -1).to_list(None)
    student_ids = [ObjectId(doc["student_id"]) for doc in docs if ObjectId.is_valid(doc.get("student_id", ""))]
    students = {
        str(doc["_id"]): doc
        async for doc in db["users"].find({"_id": {"$in": student_ids}}, {"full_name": 1, "email": 1})
    }
    return [
        ExamResultItem(
            id=str(doc["_id"]),
            exam_id=doc["exam_id"],
            exam_code=str(exams[doc["exam_id"]].get("code") or doc.get("exam_code") or "Đề thi"),
            student_id=doc["student_id"],
            student_name=(students.get(doc["student_id"]) or {}).get("full_name"),
            student_email=(students.get(doc["student_id"]) or {}).get("email"),
            status=doc["status"],
            score=round(10 * float(doc.get("total_score", 0)) / float(doc.get("max_score", 0)), 2) if doc.get("max_score", 0) else 0,
            total_score=float(doc.get("total_score", 0)),
            max_score=float(doc.get("max_score", 0)),
            submitted_at=_aware(doc.get("submitted_at")),
        )
        for doc in docs
    ]


async def get_exam_result_statistics(
    db, *, actor_id: str, is_admin: bool, class_id: str | None = None
) -> ExamResultStatistics:
    items = await list_exam_results(db, actor_id=actor_id, is_admin=is_admin, class_id=class_id)
    scores = [item.score for item in items]
    distribution = {"0-3": 0, "3-5": 0, "5-6.5": 0, "6.5-8": 0, "8-9": 0, "9-10": 0}
    for score in scores:
        key = "0-3" if score < 3 else "3-5" if score < 5 else "5-6.5" if score < 6.5 else "6.5-8" if score < 8 else "8-9" if score < 9 else "9-10"
        distribution[key] += 1
    total = len(scores)
    return ExamResultStatistics(
        total_attempts=total,
        graded_attempts=sum(item.status == "graded" for item in items),
        average_score=round(sum(scores) / total, 2) if total else 0,
        pass_rate=round(100 * sum(score >= 5 for score in scores) / total, 2) if total else 0,
        excellent_rate=round(100 * sum(score >= 8 for score in scores) / total, 2) if total else 0,
        score_distribution=distribution,
    )


async def list_student_exams(db, *, student_id: str) -> List[StudentExamItem]:
    class_ids = [str(doc["_id"]) async for doc in db["classes"].find({"student_ids": student_id, "deleted_at": None}, {"_id": 1})]
    audience = [{"audience_type": "all"}]
    if class_ids:
        audience.append({"audience_type": "classes", "target_class_ids": {"$in": class_ids}})
    exams = await db[EXAMS].find({
        "status": "published",
        "deleted_at": None,
        "$or": audience,
    }).sort("published_at", -1).to_list(None)
    exam_ids = [str(exam["_id"]) for exam in exams]
    attempts = {}
    async for attempt in db[EXAM_ATTEMPTS].find({"student_id": student_id, "exam_id": {"$in": exam_ids}}).sort("created_at", -1):
        attempts.setdefault(attempt["exam_id"], attempt)
    return [
        StudentExamItem(
            id=str(exam["_id"]),
            code=exam.get("code") or "Đề thi",
            question_count=len(exam.get("question_ids") or []),
            total_points=float(exam.get("total_points", 0)),
            duration_minutes=int(exam.get("duration_minutes", 0)),
            published_at=_aware(exam.get("published_at")),
            attempt_id=str(attempts[str(exam["_id"])]["_id"]) if str(exam["_id"]) in attempts else None,
            attempt_status=attempts.get(str(exam["_id"]), {}).get("status"),
            score=(round(10 * float(attempts[str(exam["_id"])].get("total_score", 0)) / float(attempts[str(exam["_id"])].get("max_score", 0)), 2) if attempts.get(str(exam["_id"]), {}).get("max_score", 0) else None),
        )
        for exam in exams
    ]


async def sweep_expired_attempts(db) -> int:
    """Lớp tự nộp thứ 3: quét các lượt làm bài quá giờ mà học sinh không quay
    lại nữa (đóng tab hẳn) — gọi định kỳ từ `app/worker.py`. Antan toàn khi
    chạy nhiều worker song song: `_finalize` dùng compare_and_set, worker thua
    cuộc chỉ đọc lại bản đã chốt, không lỗi."""
    now = _now()
    cursor = db[EXAM_ATTEMPTS].find({"status": "in_progress", "due_at": {"$lte": now}})
    count = 0
    async for doc in cursor:
        await _finalize(db, doc, answers=doc.get("answers", {}), auto_submitted=True)
        count += 1
    return count


async def grade_essay_answer_job(db, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handler cho job `grade_essay_answer` — gọi từ `app/worker.py`."""
    from app.exam_bank.services.grading_service import grade_short_answer

    attempt_id = payload["attempt_id"]
    question_id = payload["question_id"]

    doc = await db[EXAM_ATTEMPTS].find_one({"_id": ObjectId(attempt_id)})
    if doc is None:
        return {"skipped": "attempt_not_found"}
    question = await db[QUESTIONS].find_one({"_id": ObjectId(question_id)})
    if question is None:
        return {"skipped": "question_not_found"}

    # ponytail: read-modify-write không qua compare_and_set (chấp nhận vì
    # background_job_service chỉ chạy 1 job cùng lúc mỗi worker); nếu chạy
    # nhiều worker song song trên CÙNG attempt (khác câu tự luận thì vẫn an
    # toàn), thêm optimistic-lock retry ở đây.
    results = doc.get("results", [])
    target = next((r for r in results if r["question_id"] == question_id), None)
    if target is None or target.get("ai_score") is not None:
        return {"skipped": "already_graded_or_missing"}

    evidence_context = []
    if question.get("subject_id") and question.get("grade") and question.get("source_chunk_ids"):
        evidence_context = await resolve_context(
            db,
            query=f"{question['content']} {question['correct_answer']}",
            subject_id=question["subject_id"],
            grade=question["grade"],
            topic_id=question.get("topic_id"),
            language="en" if question["subject_id"] == "tieng_anh" else None,
        )
        stored_ids = set(question["source_chunk_ids"])
        evidence_context = [chunk for chunk in evidence_context if chunk.chunk_id in stored_ids]
    output_language = (
        resolve_output_language(
            subject_id=question["subject_id"],
            grade=question["grade"],
            explicit=question.get("output_language"),
        )
        if question.get("subject_id") and question.get("grade")
        else None
    )
    score, confidence, feedback = await grade_short_answer(
        question_content=question["content"],
        reference_answer=question["correct_answer"],
        student_answer=target.get("student_answer") or "",
        max_points=target["points_possible"],
        evidence_context=evidence_context,
        output_language=output_language,
    )
    target["ai_score"] = score
    target["ai_confidence"] = confidence
    target["ai_feedback"] = feedback
    if target.get("teacher_score") is None:
        target["final_score"] = score
    target["is_correct"] = score >= target["points_possible"] * 0.5

    total_score = sum(r["final_score"] for r in results)
    all_graded = all(r.get("ai_score") is not None or r["question_type"] != "short_answer" for r in results)
    new_status = "graded" if all_graded else doc["status"]

    await db[EXAM_ATTEMPTS].update_one(
        {"_id": ObjectId(attempt_id)},
        {"$set": {"results": results, "total_score": total_score, "status": new_status, "updated_at": _now()}},
    )
    if all_graded:
        exam = await db[EXAMS].find_one({"_id": ObjectId(doc["exam_id"])})
        if exam is not None:
            await upsert_submission_notification(
                db,
                teacher_id=exam["owner_id"],
                attempt_id=attempt_id,
                title=f"Đã chấm xong đề {exam['code']}",
                content="Đã chấm xong — bài làm đã sẵn sàng để xem lại.",
                action_url=f"/exams/{doc['exam_id']}/grading",
            )
    return {"score": score, "confidence": confidence}
