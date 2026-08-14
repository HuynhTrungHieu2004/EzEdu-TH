"""Persist structured study-exam commands as normal advanced-chat messages."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.exam_bank.constants.collections import QUESTIONS
from app.exam_bank.schemas.study_exam import StudyExamConfig
from app.exam_bank.services.study_intent_service import detect_study_intent
from app.personalization.schemas.onboarding import VN_SUBJECTS
from app.schemas.chat import AdvancedChatAskRequest
from app.utils.normalization import normalize_title


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _available_topics(db, *, grade: int) -> list[dict]:
    cursor = db[QUESTIONS].find(
        {
            "subject_id": {"$in": list(VN_SUBJECTS)},
            "grade": grade,
            "status": {"$in": ["approved", "published"]},
            "deleted_at": None,
            "topic_id": {"$ne": None},
        },
        {"subject_id": 1, "topic_id": 1},
    )
    topic_keys: list[tuple[str, str]] = []
    async for doc in cursor:
        subject_id = str(doc.get("subject_id") or "")
        topic_id = str(doc.get("topic_id") or "")
        key = (subject_id, topic_id)
        if subject_id and topic_id and key not in topic_keys:
            topic_keys.append(key)

    names: Dict[str, str] = {}
    object_ids = [
        ObjectId(topic_id)
        for _, topic_id in topic_keys
        if ObjectId.is_valid(topic_id)
    ]
    if object_ids:
        async for node in db["curriculum_taxonomy"].find({"_id": {"$in": object_ids}}):
            names[str(node["_id"])] = node.get("name") or str(node["_id"])
    return [
        {"id": topic_id, "label": names.get(topic_id, topic_id), "subject_id": subject_id}
        for subject_id, topic_id in topic_keys
    ]


def _response_from_message(message: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "answer": message.get("content") or message.get("answer") or "",
        "short_answer": message.get("short_answer"),
        "explanation": message.get("explanation"),
        "key_points": message.get("key_points", []),
        "examples": message.get("examples", []),
        "internal_citations": message.get("internal_citations", []),
        "web_citations": message.get("web_citations", []),
        "retrieval_mode": "study_exam",
        "evidence_status": "well_supported",
        "confidence": 1.0,
        "external_search_status": "not_used",
        "conversation_id": str(message["conversation_id"]),
        "message_id": str(message["_id"]),
        "model_name": "deterministic-study-intent-v1",
        "follow_up_suggestions": [],
        "message_kind": "study_exam_config",
        "study_exam_config": message.get("study_exam_config"),
        "study_exam_request": message.get("study_exam_request"),
    }


async def create_study_exam_chat_response(
    db, *, user_id: str, payload: AdvancedChatAskRequest
) -> Optional[Dict[str, Any]]:
    intent = detect_study_intent(payload.question)
    if intent is None:
        return None

    profile = await db["learner_profiles"].find_one(
        {"user_id": user_id, "onboarding_completed": True}
    )
    grade = (profile or {}).get("grade_level")
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hãy hoàn tất hồ sơ học tập và chọn khối lớp trước khi tạo đề ôn tập.",
        )

    conversation_id = payload.conversation_id
    if conversation_id:
        if not ObjectId.is_valid(conversation_id):
            raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện.")
        conversation = await db["conversations"].find_one(
            {"_id": ObjectId(conversation_id), "user_id": user_id, "deleted_at": None}
        )
        if conversation is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện.")
    else:
        now = _now()
        title = payload.question.strip()[:50]
        insert = await db["conversations"].insert_one(
            {
                "user_id": user_id,
                "title": title,
                "normalized_title": normalize_title(title),
                "scope": "general",
                "document_ids": [],
                "is_pinned": False,
                "pinned_at": None,
                "deleted_at": None,
                "created_at": now,
                "updated_at": now,
            }
        )
        conversation_id = str(insert.inserted_id)

    request_id = payload.request_id or str(ObjectId())
    existing = await db["conversation_messages"].find_one(
        {"request_id": request_id, "role": "assistant", "user_id": user_id}
    )
    if existing is not None:
        return _response_from_message(existing)

    requested_subject = intent.subject_id
    weak_subjects = list((profile or {}).get("weak_subjects") or [])
    suggested_subject = requested_subject or next(
        (subject for subject in weak_subjects if subject in VN_SUBJECTS),
        next(iter(VN_SUBJECTS)),
    )
    topics = await _available_topics(db, grade=int(grade))
    suggested_topics = [
        topic for topic in topics if topic["subject_id"] == suggested_subject
    ]
    config = StudyExamConfig(
        grade=int(grade),
        requested_subject_id=requested_subject,
        suggested_subject_id=suggested_subject,
        suggested_topic_id=suggested_topics[0]["id"] if suggested_topics else None,
        suggested_topic_label=suggested_topics[0]["label"] if suggested_topics else None,
        subjects=[{"id": key, "label": label} for key, label in VN_SUBJECTS.items()],
        topics=topics,
    ).model_dump()
    now = _now()
    conversation_oid = ObjectId(conversation_id)
    await db["conversation_messages"].insert_one(
        {
            "conversation_id": conversation_oid,
            "user_id": user_id,
            "role": "user",
            "content": payload.question.strip(),
            "request_id": request_id,
            "status": "completed",
            "created_at": now,
        }
    )
    answer = "Mình đã lấy khối lớp từ hồ sơ. Hãy chọn nội dung và cấu hình đề ôn tập."
    assistant = {
        "conversation_id": conversation_oid,
        "user_id": user_id,
        "role": "assistant",
        "content": answer,
        "answer": answer,
        "request_id": request_id,
        "status": "completed",
        "message_kind": "study_exam_config",
        "study_exam_config": config,
        "retrieval_mode": "study_exam",
        "evidence_status": "well_supported",
        "confidence": 1.0,
        "internal_citations": [],
        "web_citations": [],
        "external_search_status": "not_used",
        "model_name": "deterministic-study-intent-v1",
        "follow_up_suggestions": [],
        "created_at": now,
    }
    insert = await db["conversation_messages"].insert_one(assistant)
    assistant["_id"] = insert.inserted_id
    await db["conversations"].update_one(
        {"_id": conversation_oid}, {"$set": {"updated_at": now}}
    )
    return _response_from_message(assistant)
