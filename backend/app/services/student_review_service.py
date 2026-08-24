import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import random

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.services.background_job_service import DEFAULT_MAX_ATTEMPTS


STUDENT_DOCUMENT_CLASSIFY_JOB_TYPE = "student_document_classify"
STUDENT_REVIEW_GENERATE_JOB_TYPE = "student_review_generate"
CLASSIFICATION_ERROR_MESSAGE = "Không thể phân loại tài liệu. Vui lòng thử lại sau."
GENERATION_ERROR_MESSAGE = "Không thể sinh bộ câu hỏi. Vui lòng thử lại sau."
INSUFFICIENT_QUESTIONS_MESSAGE = "Cần ít nhất 3 câu hỏi đạt chất lượng. Vui lòng thử lại."

REVIEW_STATES = {
    "classifying", "needs_confirmation", "ready_to_generate",
    "generating", "ready", "failed",
}

ALLOWED_TRANSITIONS = {
    "classifying": {"needs_confirmation", "ready_to_generate", "failed"},
    "needs_confirmation": {"ready_to_generate", "failed"},
    "ready_to_generate": {"generating", "failed"},
    "generating": {"ready", "failed"},
    "ready": set(),
    "failed": set(),
}


async def ensure_student_review_indexes(db) -> None:
    await db.student_reviews.create_index(
        [("user_id", 1), ("client_request_id", 1)],
        name="user_client_request_unique",
        unique=True,
        partialFilterExpression={"client_request_id": {"$type": "string"}},
    )
    await db.student_reviews.create_index([("user_id", 1), ("created_at", -1)])
    await db.student_review_attempts.create_index(
        [("review_id", 1), ("user_id", 1), ("created_at", -1)]
    )
    await db.question_sets.create_index(
        [("user_id", 1), ("purpose", 1), ("review_id", 1)],
        name="student_review_question_set_unique",
        unique=True,
        partialFilterExpression={
            "purpose": "student_review",
            "review_id": {"$type": "string"},
            "deleted_at": None,
        },
    )


def validate_transition(current: str, target: str) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"Invalid student review transition: {current} -> {target}")


def is_valid_student_review_question(question: object) -> bool:
    """Deterministic contract for persisted student-review MCQs."""
    if not isinstance(question, dict) or question.get("question_type") != "multiple_choice":
        return False
    if not isinstance(question.get("question"), str) or not question["question"].strip():
        return False
    options = question.get("options")
    if not isinstance(options, dict) or len(options) != 4:
        return False
    normalized_ids = [key.strip() for key in options if isinstance(key, str)]
    normalized_texts = [value.strip() for value in options.values() if isinstance(value, str)]
    if (
        len(normalized_ids) != 4
        or len(normalized_texts) != 4
        or any(not value for value in normalized_ids + normalized_texts)
        or len(set(normalized_ids)) != 4
        or len(set(normalized_texts)) != 4
    ):
        return False
    answer = question.get("correct_answer")
    explanation = question.get("explanation")
    return (
        isinstance(answer, str)
        and answer in options
        and isinstance(explanation, str)
        and bool(explanation.strip())
    )


def _safe_attempt(attempt: dict) -> dict:
    response = {
        "_id": attempt["_id"],
        "review_id": str(attempt["review_id"]),
        "status": attempt["status"],
        "started_at": attempt["started_at"],
        "created_at": attempt["created_at"],
        "questions": [
            {
                "id": question["question_id"],
                "text": question["text"],
                "options": deepcopy(question["options"]),
            }
            for question in attempt["questions"]
        ],
    }
    if attempt["status"] == "completed":
        response.update({
            key: deepcopy(attempt[key])
            for key in (
                "score", "correct_count", "total_count", "answers", "results", "completed_at"
            )
        })
    return response


def _snapshot_questions(question_set: dict, rng, now: datetime) -> list[dict]:
    question_set_id = str(question_set["_id"])
    snapshots = []
    question_ids = set()
    for index, question in enumerate(question_set.get("questions") or []):
        if not isinstance(question, dict):
            raise ValueError("Student review question is malformed.")
        raw_id = question["id"] if "id" in question else question.get("_id", f"{question_set_id}:{index}")
        if not isinstance(raw_id, (str, ObjectId)) or not str(raw_id).strip():
            raise ValueError("Student review question ID is malformed.")
        question_id = str(raw_id)
        if question_id in question_ids:
            raise ValueError("Student review question IDs must be unique.")
        question_ids.add(question_id)

        text = question.get("question", question.get("text"))
        options = question.get("options")
        correct_option_id = question.get("correct_answer")
        explanation = question.get("explanation")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Student review question text is malformed.")
        if not is_valid_student_review_question(question):
            raise ValueError("Student review question must have exactly four valid choices and an explanation.")

        option_order = [{"id": key, "text": value} for key, value in options.items()]
        rng.shuffle(option_order)
        source = {
            key: deepcopy(value)
            for key, value in question.items()
            if key == "grounding_excerpt" or key.startswith("source_")
        }
        source.setdefault("source_document_id", question_set.get("source_document_id"))
        snapshots.append({
            "question_id": question_id,
            "text": text,
            "options": option_order,
            "correct_option_id": correct_option_id,
            "explanation": explanation,
            "source": source,
            "snapshot_at": now,
        })
    if not snapshots:
        raise ValueError("Student review question set is empty.")
    rng.shuffle(snapshots)
    return snapshots


async def start_attempt(db, user_id: str, review_id: str, rng=None) -> dict:
    """Create an owner-scoped immutable attempt from an existing ready review set."""
    try:
        review_object_id = _object_id(review_id, "review_id")
    except ValueError as exc:
        raise LookupError("Student review was not found.") from exc
    review = await db.student_reviews.find_one({"_id": review_object_id, "user_id": user_id})
    if review is None:
        raise LookupError("Student review was not found.")
    if review.get("state") != "ready":
        raise ValueError("Student review is not ready.")
    try:
        question_set_id = _object_id(review.get("question_set_id"), "question_set_id")
    except ValueError as exc:
        raise ValueError("Student review question set is unavailable.") from exc
    question_set = await db.question_sets.find_one({
        "_id": question_set_id,
        "user_id": user_id,
        "purpose": "student_review",
        "review_id": str(review_object_id),
        "bank_status": "private",
        "deleted_at": None,
    })
    if question_set is None:
        raise ValueError("Student review question set is unavailable.")

    now = datetime.now(timezone.utc)
    attempt = {
        "review_id": str(review_object_id),
        "question_set_id": str(question_set_id),
        "user_id": user_id,
        "status": "in_progress",
        "questions": _snapshot_questions(question_set, rng or random.SystemRandom(), now),
        "started_at": now,
        "created_at": now,
        "updated_at": now,
    }
    inserted = await db.student_review_attempts.insert_one(attempt)
    attempt["_id"] = inserted.inserted_id
    return _safe_attempt(attempt)


async def list_attempts(db, user_id: str, review_id: str) -> list[dict]:
    try:
        review_object_id = _object_id(review_id, "review_id")
    except ValueError as exc:
        raise LookupError("Student review was not found.") from exc
    if await db.student_reviews.find_one({"_id": review_object_id, "user_id": user_id}, {"_id": 1}) is None:
        raise LookupError("Student review was not found.")
    cursor = db.student_review_attempts.find({
        "review_id": str(review_object_id),
        "user_id": user_id,
    }).sort("created_at", -1)
    return [_safe_attempt(attempt) async for attempt in cursor]


async def get_attempt(db, user_id: str, attempt_id: str) -> dict:
    try:
        attempt_object_id = _object_id(attempt_id, "attempt_id")
    except ValueError as exc:
        raise LookupError("Student review attempt was not found.") from exc
    attempt = await db.student_review_attempts.find_one({"_id": attempt_object_id, "user_id": user_id})
    if attempt is None:
        raise LookupError("Student review attempt was not found.")
    return _safe_attempt(attempt)


async def submit_attempt(db, user_id: str, attempt_id: str, answers: dict[str, str]) -> dict:
    try:
        attempt_object_id = _object_id(attempt_id, "attempt_id")
    except ValueError as exc:
        raise LookupError("Student review attempt was not found.") from exc
    owner_query = {"_id": attempt_object_id, "user_id": user_id}
    attempt = await db.student_review_attempts.find_one(owner_query)
    if attempt is None:
        raise LookupError("Student review attempt was not found.")
    if attempt.get("status") == "completed":
        return _safe_attempt(attempt)
    if attempt.get("status") != "in_progress":
        raise ValueError("Student review attempt cannot be submitted.")
    if not isinstance(answers, dict) or any(
        not isinstance(key, str) or not isinstance(value, str) for key, value in answers.items()
    ):
        raise ValueError("Answers must be a string map.")

    questions = attempt.get("questions") or []
    question_by_id = {question.get("question_id"): question for question in questions}
    if len(question_by_id) != len(questions) or set(answers) != set(question_by_id):
        raise ValueError("Answers must contain exactly the attempt question IDs.")
    normalized = {}
    results = []
    correct_count = 0
    for question in questions:
        question_id = question["question_id"]
        option_id = answers[question_id]
        option_ids = {option["id"] for option in question["options"]}
        if option_id not in option_ids:
            raise ValueError("Answer contains an unknown option ID.")
        normalized[question_id] = option_id
        is_correct = option_id == question["correct_option_id"]
        correct_count += int(is_correct)
        results.append({
            "question_id": question_id,
            "selected_option_id": option_id,
            "correct_option_id": question["correct_option_id"],
            "is_correct": is_correct,
            "explanation": question["explanation"],
            "source": deepcopy(question["source"]),
        })

    total_count = len(questions)
    completed_at = datetime.now(timezone.utc)
    completed = await db.student_review_attempts.find_one_and_update(
        {**owner_query, "status": "in_progress"},
        {"$set": {
            "status": "completed",
            "score": round(correct_count * 100 / total_count, 2),
            "correct_count": correct_count,
            "total_count": total_count,
            "answers": normalized,
            "results": results,
            "completed_at": completed_at,
            "updated_at": completed_at,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if completed is None:
        completed = await db.student_review_attempts.find_one(owner_query)
        if completed is None:
            raise LookupError("Student review attempt was not found.")
        if completed.get("status") != "completed":
            raise ValueError("Student review attempt cannot be submitted.")
    return _safe_attempt(completed)


async def list_reviews_with_attempt_history(db, user_id: str) -> list[dict]:
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$addFields": {"_review_id_text": {"$toString": "$_id"}}},
        {"$lookup": {
            "from": "student_review_attempts",
            "localField": "_review_id_text",
            "foreignField": "review_id",
            "as": "_attempts",
        }},
        {"$addFields": {"_owned_attempts": {"$filter": {
            "input": "$_attempts",
            "as": "attempt",
            "cond": {"$eq": ["$$attempt.user_id", user_id]},
        }}}},
        {"$addFields": {
            "_attempt_count": {"$size": "$_owned_attempts"},
            "_completed_attempts": {"$filter": {
                "input": "$_owned_attempts",
                "as": "attempt",
                "cond": {"$eq": ["$$attempt.status", "completed"]},
            }},
        }},
        {"$unwind": {"path": "$_completed_attempts", "preserveNullAndEmptyArrays": True}},
        {"$sort": {"_completed_attempts.completed_at": -1}},
        {"$group": {
            "_id": "$_id",
            "review": {"$first": "$$ROOT"},
            "attempt_count": {"$first": "$_attempt_count"},
            "latest_score": {"$first": "$_completed_attempts.score"},
            "best_score": {"$max": "$_completed_attempts.score"},
        }},
        {"$sort": {"review.created_at": -1}},
    ]
    reviews = []
    async for row in db["student_reviews"].aggregate(pipeline):
        review = row["review"]
        for key in (
            "_review_id_text", "_attempts", "_owned_attempts", "_attempt_count", "_completed_attempts"
        ):
            review.pop(key, None)
        review.update({
            "attempt_count": row["attempt_count"],
            "latest_score": row.get("latest_score"),
            "best_score": row.get("best_score"),
        })
        reviews.append(review)
    return reviews


def _object_id(value: object, label: str) -> ObjectId:
    if not ObjectId.is_valid(str(value or "")):
        raise ValueError(f"Invalid {label}.")
    return ObjectId(str(value))


def _normalized_classification(value: object) -> bool:
    from app.services.document_classification_service import CLASSIFICATION_KEYS

    return (
        isinstance(value, dict)
        and set(value) == CLASSIFICATION_KEYS
        and value.get("method") in {"ai", "student_corrected", "heuristic_fallback"}
        and value.get("status") in {"confirmed", "needs_confirmation", "manual_required"}
    )


def _target_state(classification: dict) -> str:
    return "ready_to_generate" if classification["status"] == "confirmed" else "needs_confirmation"


def _job_max_attempts(payload: dict) -> int:
    value = payload.get("job_max_attempts", DEFAULT_MAX_ATTEMPTS)
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("Invalid job_max_attempts.")
    return value


async def _claim_review_execution(db, review_query: dict, payload: dict, step: str) -> tuple[dict, dict]:
    claimed_at = (payload.get("_background_job") or {}).get("claimed_at")
    if not isinstance(claimed_at, datetime):
        review = await db.student_reviews.find_one(review_query)
        return review, review_query
    field = f"{step}_claim_at"
    review = await db.student_reviews.find_one_and_update(
        {
            **review_query,
            "$or": [{field: {"$exists": False}}, {field: {"$lte": claimed_at}}],
        },
        {"$set": {field: claimed_at}},
        return_document=ReturnDocument.AFTER,
    )
    return review, {**review_query, field: claimed_at}


async def _record_step_failure(
    db,
    review_query: dict,
    *,
    step: str,
    error_message: str,
    payload: dict,
) -> None:
    counter = f"{step}_failures"
    now = datetime.now(timezone.utc)
    review = await db.student_reviews.find_one_and_update(
        review_query,
        {"$inc": {counter: 1}, "$set": {"updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if review is not None and review.get(counter, 0) >= _job_max_attempts(payload):
        await db.student_reviews.update_one(
            {**review_query, counter: review[counter]},
            {"$set": {
                "state": "failed",
                "failed_step": step,
                "error_message": error_message,
                "updated_at": now,
            }},
        )


async def classify_student_document_job(db, payload: dict, llm=None) -> dict:
    """Classify one owned indexed document and persist its normalized result."""
    review_id = _object_id(payload.get("review_id"), "review_id")
    user_id = str(payload.get("user_id") or "")
    review_query = {"_id": review_id, "user_id": user_id}
    review, review_query = await _claim_review_execution(
        db, review_query, payload, "classification"
    )
    if review is None:
        raise ValueError("Student review was not found.")

    try:
        document_id = _object_id(payload.get("document_id"), "document_id")
        if str(review.get("document_id") or "") != str(document_id):
            raise ValueError("Student review document does not match the job payload.")
        document_query = {
            "_id": document_id,
            "user_id": user_id,
            "deleted_at": None,
        }
        document = await db.documents.find_one(document_query)
        if document is None:
            raise ValueError("Student document was not found.")
        if document.get("status") != "indexed":
            raise ValueError("Student document is not indexed.")

        classification = review.get("classification")
        if _normalized_classification(classification):
            target = _target_state(classification)
            now = datetime.now(timezone.utc)
            updated = await db.student_reviews.update_one(
                review_query,
                {
                    "$set": {"state": target, "updated_at": now},
                    "$unset": {
                        "error_message": "",
                        "failed_step": "",
                        "classification_failures": "",
                    },
                },
            )
            if getattr(updated, "matched_count", 0) != 1:
                raise RuntimeError("Student review classification claim is stale.")
            await db.documents.update_one(
                document_query,
                {"$set": {"classification": classification, "updated_at": now}},
            )
            return classification

        from app.services.document_classification_service import classify_document

        classification = await classify_document(db, document, llm=llm)
        target = _target_state(classification)
        validate_transition(review["state"], target)
        now = datetime.now(timezone.utc)
        updated = await db.student_reviews.update_one(
            review_query,
            {
                "$set": {"classification": classification, "state": target, "updated_at": now},
                "$unset": {
                    "error_message": "",
                    "failed_step": "",
                    "classification_failures": "",
                },
            },
        )
        if getattr(updated, "matched_count", 0) != 1:
            raise RuntimeError("Student review classification claim is stale.")
        await db.documents.update_one(
            document_query,
            {"$set": {"classification": classification, "updated_at": now}},
        )
        persisted_review = await db.student_reviews.find_one(review_query, {"classification": 1})
        return persisted_review["classification"]
    except (Exception, asyncio.CancelledError):
        latest_review = await db.student_reviews.find_one(review_query, {"classification": 1})
        if not _normalized_classification((latest_review or {}).get("classification")):
            await _record_step_failure(
                db,
                review_query,
                step="classification",
                error_message=CLASSIFICATION_ERROR_MESSAGE,
                payload=payload,
            )
        raise


async def normalize_corrected_classification(db, values: dict) -> dict:
    """Validate a student correction against the same taxonomy rules as AI output."""
    from app.services.document_classification_service import _taxonomy_id, _validate_metadata

    taxonomy = await db.curriculum_taxonomy.find(
        {"node_type": {"$in": ["subject", "chapter", "topic"]}},
        {"node_type": 1, "parent_id": 1, "grade": 1, "curriculum_version": 1},
    ).to_list(None)
    nodes = {str(node["_id"]): node for node in taxonomy}
    subject_id = _taxonomy_id(values.get("subject_id"), nodes, "subject")
    chapter_id = _taxonomy_id(values.get("chapter_id"), nodes, "chapter")
    if str(nodes[chapter_id].get("parent_id") or "") != subject_id:
        raise ValueError("Classification chapter does not belong to the subject.")
    raw_topic_ids = values.get("topic_ids")
    if not isinstance(raw_topic_ids, list):
        raise ValueError("Classification topic_ids must be a list.")
    topic_ids = list(dict.fromkeys(_taxonomy_id(value, nodes, "topic") for value in raw_topic_ids))
    if any(str(nodes[topic_id].get("parent_id") or "") != chapter_id for topic_id in topic_ids):
        raise ValueError("Classification topic does not belong to the chapter.")
    _validate_metadata(
        values,
        [nodes[subject_id], nodes[chapter_id], *(nodes[value] for value in topic_ids)],
    )
    return {
        "subject_id": subject_id,
        "grade": values["grade"],
        "curriculum_version": values["curriculum_version"],
        "chapter_id": chapter_id,
        "topic_ids": topic_ids,
        "confidence": 1.0,
        "method": "student_corrected",
        "status": "confirmed",
        "classified_at": datetime.now(timezone.utc),
    }


def _validated_generation_config(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("Student review generation config is missing.")
    question_count = value.get("question_count")
    if isinstance(question_count, bool) or not isinstance(question_count, int) or not 3 <= question_count <= 50:
        raise ValueError("Student review question_count is invalid.")
    if value.get("difficulty") not in {"easy", "medium", "hard"}:
        raise ValueError("Student review difficulty is invalid.")
    if value.get("question_type") != "multiple_choice":
        raise ValueError("Student review question_type is invalid.")
    if value.get("bloom_level") not in {None, "remember", "understand", "apply", "analyze"}:
        raise ValueError("Student review bloom_level is invalid.")
    style_counts = value.get("question_style_counts")
    if style_counts is not None:
        if not isinstance(style_counts, dict) or set(style_counts) != {"knowledge", "cloze", "calculation"}:
            raise ValueError("Student review question_style_counts is invalid.")
        if any(isinstance(count, bool) or not isinstance(count, int) or count < 0 for count in style_counts.values()):
            raise ValueError("Student review question_style_counts is invalid.")
        if sum(style_counts.values()) != question_count:
            raise ValueError("Student review question_style_counts total is invalid.")
    return value


async def _finish_generation(db, review_query: dict, question_set_id: str, generated: int, requested: int) -> dict:
    now = datetime.now(timezone.utc)
    fields = {"state": "ready", "question_set_id": question_set_id, "updated_at": now}
    update = {"$set": fields, "$unset": {
        "error_message": "",
        "failed_step": "",
        "generation_failures": "",
    }}
    result = {"review_id": str(review_query["_id"]), "question_set_id": question_set_id, "state": "ready"}
    if generated < requested:
        warning = f"Chỉ tạo được {generated}/{requested} câu đạt chất lượng."
        fields["warning"] = warning
        result["warning"] = warning
    else:
        update["$unset"]["warning"] = ""
    updated = await db.student_reviews.update_one(review_query, update)
    if getattr(updated, "matched_count", 0) != 1:
        raise RuntimeError("Student review generation claim is stale.")
    return result


def _review_question_set_query(review_id: ObjectId, user_id: str) -> dict:
    return {
        "user_id": user_id,
        "purpose": "student_review",
        "review_id": str(review_id),
        "deleted_at": None,
    }


async def _find_review_question_set(db, review: dict, review_id: ObjectId, user_id: str) -> dict | None:
    query = _review_question_set_query(review_id, user_id)
    attached_id = review.get("question_set_id")
    if ObjectId.is_valid(str(attached_id or "")):
        attached = await db.question_sets.find_one({
            **query,
            "_id": ObjectId(str(attached_id)),
        })
        if attached is not None:
            return attached
    return await db.question_sets.find_one(query)


async def _delete_incomplete_question_set(db, question_set: dict, review_id: ObjectId, user_id: str) -> None:
    question_set_id = question_set.get("_id")
    if not ObjectId.is_valid(str(question_set_id or "")):
        raise RuntimeError("Incomplete student review set has an invalid id.")
    query = {
        **_review_question_set_query(review_id, user_id),
        "_id": ObjectId(str(question_set_id)),
    }
    result = await db.question_sets.delete_one(query)
    remaining = await db.question_sets.count_documents(query)
    if getattr(result, "deleted_count", 0) not in {0, 1} or remaining != 0:
        raise RuntimeError("Incomplete student review set could not be removed.")


async def _valid_question_count(db, question_set: dict, review_id: ObjectId, user_id: str) -> int:
    questions = question_set.get("questions") or []
    valid = [question for question in questions if is_valid_student_review_question(question)]
    if len(valid) == len(questions) or len(valid) < 3:
        return len(valid)
    question_set_id = question_set.get("_id")
    if not ObjectId.is_valid(str(question_set_id or "")):
        raise RuntimeError("Student review set has an invalid id.")
    result = await db.question_sets.update_one(
        {
            **_review_question_set_query(review_id, user_id),
            "_id": ObjectId(str(question_set_id)),
        },
        {"$set": {
            "questions": valid,
            "question_count": len(valid),
            "workflow_counts.draft": len(valid),
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    if getattr(result, "matched_count", 0) != 1:
        raise RuntimeError("Student review set could not be validated.")
    question_set["questions"] = valid
    question_set["question_count"] = len(valid)
    return len(valid)


async def generate_student_review_job(db, payload: dict, generator=None) -> dict:
    """Generate one private review set through the existing question generator."""
    review_id = _object_id(payload.get("review_id"), "review_id")
    user_id = str(payload.get("user_id") or "")
    review_query = {"_id": review_id, "user_id": user_id}
    review, review_query = await _claim_review_execution(
        db, review_query, payload, "generation"
    )
    if review is None:
        raise ValueError("Student review was not found.")

    try:
        document_id = _object_id(payload.get("document_id"), "document_id")
        if str(review.get("document_id") or "") != str(document_id):
            raise ValueError("Student review document does not match the job payload.")
        classification = review.get("classification")
        if not _normalized_classification(classification) or classification.get("status") != "confirmed":
            raise ValueError("Student review classification is not confirmed.")
        config = _validated_generation_config(review.get("generation_config"))

        existing = await _find_review_question_set(db, review, review_id, user_id)
        if existing is not None:
            generated = await _valid_question_count(db, existing, review_id, user_id)
            if generated >= 3:
                return await _finish_generation(
                    db, review_query, str(existing["_id"]), generated, config["question_count"]
                )
            await _delete_incomplete_question_set(db, existing, review_id, user_id)

        document = await db.documents.find_one({
            "_id": document_id,
            "user_id": user_id,
            "deleted_at": None,
        })
        if document is None or document.get("status") != "indexed":
            raise ValueError("Student document is not available for generation.")

        if generator is None:
            from app.services.question_generation_service import generate_questions

            generator = generate_questions
        try:
            question_set = await generator(
                document_id=str(document_id),
                user_id=user_id,
                question_count=config["question_count"],
                difficulty=config["difficulty"],
                question_type=config["question_type"],
                bloom_level=config.get("bloom_level"),
                question_style_counts=config.get("question_style_counts"),
                subject_id=classification["subject_id"],
                grade=classification["grade"],
                topic_id=(classification.get("topic_ids") or [None])[0],
                question_set_metadata={
                    "purpose": "student_review",
                    "review_id": str(review_id),
                    "bank_status": "private",
                    "promotion_status": "not_submitted",
                    "curriculum_version": classification["curriculum_version"],
                    "chapter_id": classification["chapter_id"],
                    "source_document_id": str(document_id),
                    "deleted_at": None,
                },
            )
        except DuplicateKeyError:
            question_set = await _find_review_question_set(db, review, review_id, user_id)
            if question_set is None:
                raise
        question_set_id = str(question_set.get("_id") or "")
        generated = await _valid_question_count(db, question_set, review_id, user_id)
        if generated < 3:
            await _delete_incomplete_question_set(db, question_set, review_id, user_id)
            await db.student_reviews.update_one(
                review_query,
                {
                    "$set": {
                        "state": "failed",
                        "failed_step": "generation",
                        "error_message": INSUFFICIENT_QUESTIONS_MESSAGE,
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$unset": {"question_set_id": "", "warning": ""},
                },
            )
            return {"review_id": str(review_id), "state": "failed"}
        return await _finish_generation(
            db, review_query, question_set_id, generated, config["question_count"]
        )
    except (Exception, asyncio.CancelledError):
        await db.student_reviews.update_one(
            review_query,
            {"$unset": {"question_set_id": "", "warning": ""}},
        )
        await _record_step_failure(
            db,
            review_query,
            step="generation",
            error_message=GENERATION_ERROR_MESSAGE,
            payload=payload,
        )
        raise
