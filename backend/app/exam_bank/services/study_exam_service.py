"""Build student review exams from the verified question bank."""

from __future__ import annotations

import hashlib
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from bson import ObjectId
from fastapi import HTTPException, status

from app.exam_bank.constants.collections import EXAMS, QUESTIONS, STUDY_EXAM_REQUESTS
from app.exam_bank.schemas.study_exam import (
    StudyExamCreateRequest,
    StudyExamRequestResponse,
)
from app.exam_bank.services.blueprint_solver_service import solve_blueprint
from app.exam_bank.services.question_variant_service import build_verified_variants
from app.services.question_content_cluster_service import assign_content_clusters

STUDY_EXAM_JOB_TYPE = "generate_study_exam"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _request_result(request: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "request_id": str(request["_id"]),
        "exam_id": request.get("exam_id"),
        "selected_count": int(request.get("selected_count") or 0),
        "shortfall_count": int(request.get("shortfall_count") or 0),
    }


def _to_response(doc: Dict[str, Any]) -> StudyExamRequestResponse:
    return StudyExamRequestResponse(
        id=str(doc["_id"]),
        student_id=doc["student_id"],
        subject_id=doc["subject_id"],
        subject_label=doc["subject_label"],
        grade=doc["grade"],
        topic_id=doc.get("topic_id"),
        topic_label=doc.get("topic_label"),
        difficulty=doc["difficulty"],
        question_count=doc["question_count"],
        status=doc["status"],
        exam_id=doc.get("exam_id"),
        selected_count=int(doc.get("selected_count") or 0),
        shortfall_count=int(doc.get("shortfall_count") or 0),
        error_message=doc.get("error_message"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def _request_snapshot(doc: Dict[str, Any]) -> Dict[str, Any]:
    return _to_response(doc).model_dump()


async def _sync_chat_message(db, request: Dict[str, Any]) -> None:
    message_id = request.get("message_id")
    if not message_id or not ObjectId.is_valid(message_id):
        return
    await db["conversation_messages"].update_one(
        {"_id": ObjectId(message_id), "user_id": request["student_id"], "role": "assistant"},
        {"$set": {"study_exam_request": _request_snapshot(request)}},
    )


async def _validate_chat_context(
    db, *, student_id: str, conversation_id: str | None, message_id: str | None
) -> None:
    if conversation_id is None and message_id is None:
        return
    if not conversation_id or not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc trò chuyện.")
    conversation = await db["conversations"].find_one(
        {"_id": ObjectId(conversation_id), "user_id": student_id, "deleted_at": None}
    )
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc trò chuyện.")
    if message_id:
        if not ObjectId.is_valid(message_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tin nhắn.")
        message = await db["conversation_messages"].find_one(
            {
                "_id": ObjectId(message_id),
                "conversation_id": ObjectId(conversation_id),
                "user_id": student_id,
                "role": "assistant",
            }
        )
        if message is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tin nhắn.")


async def create_study_exam_request(
    db, *, student_id: str, payload: StudyExamCreateRequest
) -> StudyExamRequestResponse:
    existing = await db[STUDY_EXAM_REQUESTS].find_one(
        {"student_id": student_id, "client_request_id": payload.client_request_id}
    )
    if existing is not None:
        return _to_response(existing)

    profile = await db["learner_profiles"].find_one(
        {"user_id": student_id, "onboarding_completed": True}
    )
    grade = (profile or {}).get("grade_level")
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hãy hoàn tất hồ sơ học tập và chọn khối lớp trước khi tạo đề ôn tập.",
        )
    await _validate_chat_context(
        db,
        student_id=student_id,
        conversation_id=payload.conversation_id,
        message_id=payload.message_id,
    )

    from app.personalization.schemas.onboarding import VN_SUBJECTS
    from app.services.background_job_service import enqueue

    now = _now()
    doc = {
        "student_id": student_id,
        "subject_id": payload.subject_id,
        "subject_label": payload.subject_label or VN_SUBJECTS[payload.subject_id],
        "grade": int(grade),
        "curriculum_version": "2018",
        "topic_id": payload.topic_id,
        "topic_label": payload.topic_label,
        "difficulty": payload.difficulty,
        "question_count": payload.question_count,
        "conversation_id": payload.conversation_id,
        "message_id": payload.message_id,
        "client_request_id": payload.client_request_id,
        "status": "pending",
        "exam_id": None,
        "selected_count": 0,
        "shortfall_count": 0,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
    }
    insert = await db[STUDY_EXAM_REQUESTS].insert_one(doc)
    doc["_id"] = insert.inserted_id
    await enqueue(
        db,
        job_type=STUDY_EXAM_JOB_TYPE,
        payload={"request_id": str(insert.inserted_id)},
        idempotency_key=f"study-exam:{student_id}:{payload.client_request_id}",
    )
    await _sync_chat_message(db, doc)
    return _to_response(doc)


async def get_study_exam_request(
    db, *, request_id: str, student_id: str
) -> StudyExamRequestResponse:
    if not ObjectId.is_valid(request_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu tạo đề.")
    doc = await db[STUDY_EXAM_REQUESTS].find_one({"_id": ObjectId(request_id)})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu tạo đề.")
    if doc["student_id"] != student_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với đề ôn tập này.")
    return _to_response(doc)


def _candidate(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "content": str(doc.get("content") or ""),
        "topic_id": doc.get("topic_id"),
        "bloom_level": doc.get("bloom_level", "understand"),
        "difficulty": doc.get("difficulty", "medium"),
        "question_type": doc.get("question_type", "multiple_choice"),
        # Study-exam selection is count-based. The source points remain on the
        # question document and are summed for the resulting exam.
        "points": 1.0,
        "expected_time_seconds": int(doc.get("expected_time_seconds") or 60),
    }


async def _insert_variants(
    db,
    *,
    template_docs: List[Dict[str, Any]],
    needed: int,
    request_id: str,
    existing_contents: set[str],
) -> List[Dict[str, Any]]:
    inserted: List[Dict[str, Any]] = []
    for template_index, template_doc in enumerate(template_docs):
        if len(inserted) >= needed:
            break
        seed_material = f"{request_id}:{template_doc['_id']}:{template_index}".encode()
        seed = int(hashlib.sha256(seed_material).hexdigest()[:16], 16)
        variants = build_verified_variants(
            template_doc,
            needed=needed - len(inserted),
            seed=seed,
        )
        for variant in variants:
            if variant["content"] in existing_contents:
                continue
            now = _now()
            variant.update(
                {
                    "source_document_id": template_doc.get("source_document_id"),
                    "source_chunk_ids": template_doc.get("source_chunk_ids", []),
                    "citation": template_doc.get("citation"),
                    "quality_status": "verified",
                    "tags": list(dict.fromkeys([*(template_doc.get("tags") or []), "parameter_variant"])),
                    "usage_count": 0,
                    "last_used_at": None,
                    "status": "approved",
                    "version": 1,
                    "created_by": "system:study_exam",
                    "updated_by": "system:study_exam",
                    "created_at": now,
                    "updated_at": now,
                    "deleted_at": None,
                }
            )
            result = await db[QUESTIONS].insert_one(variant)
            variant["_id"] = result.inserted_id
            inserted.append(variant)
            existing_contents.add(variant["content"])
            if len(inserted) >= needed:
                break
    return inserted


async def generate_study_exam_job(db, payload: Dict[str, Any]) -> Dict[str, Any]:
    request_id = str(payload["request_id"])
    if not ObjectId.is_valid(request_id):
        raise ValueError("Mã yêu cầu tạo đề không hợp lệ.")
    request_oid = ObjectId(request_id)
    request = await db[STUDY_EXAM_REQUESTS].find_one({"_id": request_oid})
    if request is None:
        return {"skipped": "request_not_found"}
    if request.get("status") == "completed" and request.get("exam_id"):
        return _request_result(request)

    existing_exam = await db[EXAMS].find_one({"source_request_id": request_id})
    if existing_exam is not None:
        completed_at = _now()
        selected_count = len(existing_exam.get("question_ids") or [])
        recovered_fields = {
            "status": "completed",
            "exam_id": str(existing_exam["_id"]),
            "selected_count": selected_count,
            "shortfall_count": max(0, int(request["question_count"]) - selected_count),
            "updated_at": completed_at,
            "completed_at": completed_at,
        }
        await db[STUDY_EXAM_REQUESTS].update_one(
            {"_id": request_oid}, {"$set": recovered_fields}
        )
        request.update(recovered_fields)
        await _sync_chat_message(db, request)
        return _request_result(request)

    await db[STUDY_EXAM_REQUESTS].update_one(
        {"_id": request_oid},
        {"$set": {"status": "running", "error_message": None, "updated_at": _now()}},
    )
    request.update({"status": "running", "error_message": None, "updated_at": _now()})
    await _sync_chat_message(db, request)

    try:
        query: Dict[str, Any] = {
            "subject_id": request["subject_id"],
            "grade": request["grade"],
            "curriculum_version": request.get("curriculum_version", "2018"),
            "status": {"$in": ["approved", "published"]},
            "deleted_at": None,
        }
        if request.get("topic_id"):
            query["topic_id"] = request["topic_id"]
        if request.get("difficulty") != "adaptive":
            query["difficulty"] = request["difficulty"]

        question_docs = [doc async for doc in db[QUESTIONS].find(query)]
        requested_count = int(request["question_count"])
        existing_contents = {str(doc.get("content") or "") for doc in question_docs}
        if len(question_docs) < requested_count:
            template_docs = [doc for doc in question_docs if doc.get("parameter_template")]
            variants = await _insert_variants(
                db,
                template_docs=template_docs,
                needed=requested_count - len(question_docs),
                request_id=request_id,
                existing_contents=existing_contents,
            )
            question_docs.extend(variants)

        if not question_docs:
            raise ValueError("Ngân hàng chưa có câu hỏi đã kiểm chứng phù hợp với lựa chọn này.")

        target_count = min(requested_count, len(question_docs))
        candidates = [_candidate(doc) for doc in question_docs]
        constraints: Dict[str, Any] = {}
        cluster_stats = assign_content_clusters(candidates)
        if cluster_stats.get("applied"):
            cluster_count = max(1, int(cluster_stats.get("cluster_count") or 1))
            constraints["max_questions_per_content_cluster"] = max(
                1, math.ceil(target_count / cluster_count)
            )

        result = solve_blueprint(
            candidates=candidates,
            total_points=float(target_count),
            max_time_seconds=None,
            constraints=constraints,
        )
        if result.status not in ("OPTIMAL", "FEASIBLE") and constraints:
            # Diversity is a soft enhancement for self-study. CP-SAT still
            # performs the final exact-count selection without that soft cap.
            result = solve_blueprint(
                candidates=candidates,
                total_points=float(target_count),
                max_time_seconds=None,
                constraints={},
            )
        if result.status not in ("OPTIMAL", "FEASIBLE"):
            raise ValueError("Không tìm được tổ hợp câu hỏi hợp lệ cho đề ôn tập.")

        selected_ids = result.selected_question_ids
        docs_by_id = {str(doc["_id"]): doc for doc in question_docs}
        total_points = sum(float(docs_by_id[qid].get("points") or 1.0) for qid in selected_ids)
        now = _now()
        exam_doc = {
            "blueprint_id": f"study:{request_id}",
            "blueprint_version": 1,
            "code": f"ON-{request_id[-6:].upper()}",
            "equivalent_group_id": str(uuid.uuid4()),
            "question_ids": selected_ids,
            "question_order_seed": int(request_id[-6:], 16),
            "total_points": total_points,
            "duration_minutes": max(10, target_count * 2),
            "status": "published",
            "published_at": now,
            "audience_type": "all",
            "target_class_ids": [],
            "allow_retake": True,
            "purpose": "student_review",
            "target_student_id": request["student_id"],
            "source_request_id": request_id,
            "version": 1,
            "owner_id": request["student_id"],
            "created_by": request["student_id"],
            "updated_by": request["student_id"],
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        exam_insert = await db[EXAMS].insert_one(exam_doc)
        exam_id = str(exam_insert.inserted_id)
        shortfall = requested_count - len(selected_ids)
        await db[QUESTIONS].update_many(
            {"_id": {"$in": [ObjectId(qid) for qid in selected_ids]}},
            {"$inc": {"usage_count": 1}, "$set": {"last_used_at": now}},
        )
        await db[STUDY_EXAM_REQUESTS].update_one(
            {"_id": request_oid},
            {
                "$set": {
                    "status": "completed",
                    "exam_id": exam_id,
                    "selected_count": len(selected_ids),
                    "shortfall_count": shortfall,
                    "solver_status": result.status,
                    "updated_at": now,
                    "completed_at": now,
                }
            },
        )
        request.update(
            {
                "status": "completed",
                "exam_id": exam_id,
                "selected_count": len(selected_ids),
                "shortfall_count": shortfall,
                "updated_at": now,
            }
        )
        await _sync_chat_message(db, request)
        return _request_result(request)
    except Exception as exc:
        failed_at = _now()
        await db[STUDY_EXAM_REQUESTS].update_one(
            {"_id": request_oid},
            {
                "$set": {
                    "status": "failed",
                    "error_message": str(exc),
                    "updated_at": failed_at,
                }
            },
        )
        request.update({"status": "failed", "error_message": str(exc), "updated_at": failed_at})
        await _sync_chat_message(db, request)
        raise
