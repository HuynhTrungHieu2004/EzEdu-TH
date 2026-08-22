"""
Verification Service — Kiểm tra kiến thức học liệu đầu vào
=============================================================
Phát hiện lỗi OCR, số liệu sai, thuật ngữ lệch, mâu thuẫn nội bộ
bằng dual-AI cross-check (Gemini + Groq).
"""

import asyncio
import hashlib
import hmac
import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Callable, Optional

from bson import ObjectId
from pydantic import ValidationError
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.database.mongodb import get_database
from app.schemas.analytics import UsageEventCreate
from app.schemas.verification import VerificationIssue
from app.services.document_mutation_service import (
    acquire_document_mutation_lock,
    finalize_document_mutation,
    mutation_owner_filter,
    recover_interrupted_document_mutations,
)
from app.services.llm_service import (
    claude_generate_json,
    gemini_generate_json,
    generate_json,
    is_claude_available,
    is_gemini_available,
    is_groq_available,
    start_claude_usage_capture,
    stop_claude_usage_capture,
)
from app.services.text_chunking_service import split_text_into_chunks
from app.services.rag_service import add_document_chunks
from app.services.analytics_service import new_attempt_id, new_event_id, record_event
from app.curriculum_kb.services.context_service import GroundedChunk, resolve_context

logger = logging.getLogger(__name__)

BATCH_SIZE = 5
CONFIDENCE_THRESHOLD = 0.5
MAX_CONTEXT_PER_BATCH = 12000
LLM_MAX_ATTEMPTS = 3
LLM_RETRY_BASE_DELAY_SECONDS = 1.0

ACTIVE_SESSION_INDEX = "verification_active_session_unique"
MUTABLE_DOCUMENT_STATUSES = {
    "processed",
    "transcribed",
    "indexed",
    "index_failed",
}


def compute_content_revision_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class VerificationInProgressError(RuntimeError):
    """Raised when an active session already owns the document verification lock."""

    def __init__(self, session_id: str):
        super().__init__("A verification session is already processing this document.")
        self.session_id = session_id


class VerificationStateError(RuntimeError):
    """Raised when resolve/apply is requested for an invalid session state."""


class VerificationProviderError(RuntimeError):
    """Raised when no configured LLM provider can return a valid response."""


class VerificationCancelledError(RuntimeError):
    """Raised when the document or its active session was deleted/cancelled."""


class VerificationContentChangedError(RuntimeError):
    """Raised when extracted_text changes while a session is processing."""


# ═══════════════════════════════════════════════════════════════════════════
# Prompt Engineering
# ═══════════════════════════════════════════════════════════════════════════

def _build_verification_prompt(
    chunks_text: str,
    batch_index: int,
    valid_chunk_indices: Optional[list[int]] = None,
) -> str:
    """Build a prompt that asks the LLM to identify issues in document chunks."""
    valid_chunk_indices = valid_chunk_indices or [0]
    valid_indices_text = ", ".join(str(index) for index in valid_chunk_indices)
    example_chunk_index = valid_chunk_indices[0]
    return f"""Bạn là chuyên gia kiểm định chất lượng nội dung học liệu. Nhiệm vụ: kiểm tra kỹ các đoạn văn bản dưới đây và phát hiện MỌI vấn đề về chất lượng nội dung.

YÊU CẦU KIỂM TRA (xét từng đoạn):
1. **ocr_error**: Ký tự bị sai do scan/OCR (ví dụ: "hoá" → "hóa", "duợc" → "được", ký tự lạ, dấu sai)
2. **factual_error**: Phát biểu sai sự thật so với kiến thức khoa học phổ thông (ví dụ: "Nước sôi ở 90°C")
3. **suspicious_number**: Số liệu bất thường, sai đơn vị, sai bậc độ lớn (ví dụ: "Dân số VN: 10 triệu")
4. **terminology_error**: Thuật ngữ chuyên ngành bị dùng sai ngữ cảnh (ví dụ: "Quang hợp xảy ra ở ribosome")
5. **internal_contradiction**: Thông tin mâu thuẫn giữa các đoạn (ví dụ: Đoạn A nói X, Đoạn B nói ngược lại)
6. **incomplete_content**: Câu bị cắt ngang, nội dung thiếu logic, đoạn không hoàn chỉnh

QUY TẮC BẮT BUỘC:
- Chỉ báo cáo vấn đề thực sự. KHÔNG bịa ra lỗi không tồn tại.
- Với mỗi issue, PHẢI trích dẫn CHÍNH XÁC đoạn văn gốc có vấn đề (original_text).
- Đề xuất sửa (suggested_fix) phải cụ thể, rõ ràng.
- confidence: 0.0 = không chắc chắn, 1.0 = hoàn toàn chắc chắn.
- severity: "low" = lỗi nhỏ không ảnh hưởng nghĩa, "medium" = có thể gây hiểu nhầm, "high" = sai nghiêm trọng.
- Nếu KHÔNG tìm thấy vấn đề nào → trả về danh sách rỗng.
- chunk_index PHẢI là đúng số ghi trong nhãn [Đoạn N]. Các giá trị hợp lệ của batch này: [{valid_indices_text}].
- Không có công cụ tra cứu nguồn bên ngoài trong lượt này. Luôn đặt source_reference = null; TUYỆT ĐỐI không tự tạo URL hoặc trích dẫn.

NỘI DUNG CẦN KIỂM TRA (Batch #{batch_index + 1}):
--- BẮT ĐẦU NỘI DUNG ---
{chunks_text}
--- KẾT THÚC NỘI DUNG ---

Trả về JSON theo format:
{{
  "issues": [
    {{
      "chunk_index": {example_chunk_index},
      "issue_type": "factual_error",
      "severity": "high",
      "original_text": "Đoạn văn gốc có vấn đề (trích dẫn chính xác)",
      "suggested_fix": "Nội dung đề xuất thay thế",
      "reason": "Giải thích chi tiết tại sao đây là lỗi",
      "confidence": 0.9,
      "source_reference": null
    }}
  ]
}}

Chỉ trả JSON, không thêm gì khác."""


def _build_cross_check_prompt(issues_json: str, chunks_text: str) -> str:
    """Build a prompt for cross-checking issues found by the other AI."""
    return f"""Bạn là chuyên gia kiểm định độc lập. Một hệ thống AI khác đã phát hiện các vấn đề sau trong tài liệu. Nhiệm vụ của bạn: XÁC MINH từng issue xem có thực sự đúng không.

NỘI DUNG TÀI LIỆU:
--- BẮT ĐẦU ---
{chunks_text}
--- KẾT THÚC ---

CÁC VẤN ĐỀ CẦN XÁC MINH:
{issues_json}

VỚI MỖI ISSUE, hãy:
1. Kiểm tra original_text có tồn tại trong tài liệu không.
2. Đánh giá issue_type có chính xác không.
3. Đánh giá suggested_fix có hợp lý không.
4. Cho điểm confidence mới (0.0-1.0) theo đánh giá của BẠN.
5. verdict: "confirmed" nếu bạn đồng ý đây là lỗi thật, "rejected" nếu bạn cho rằng đây KHÔNG phải lỗi (false positive).
6. Không tự tạo nguồn hoặc URL. Việc kiểm tra này chỉ là đối chiếu bởi mô hình thứ hai, không phải xác minh nguồn bên ngoài.

Trả về JSON:
{{
  "verifications": [
    {{
      "index": 0,
      "verdict": "confirmed",
      "confidence": 0.85,
      "reason": "Lý do xác nhận hoặc bác bỏ"
    }}
  ]
}}

Chỉ trả JSON, không thêm gì khác."""


# ═══════════════════════════════════════════════════════════════════════════
# Core Verification Logic
# ═══════════════════════════════════════════════════════════════════════════

def _format_chunks_for_prompt(chunks: list[str], start_index: int) -> str:
    """Format a batch of chunks into a prompt-ready string."""
    parts = []
    for i, chunk in enumerate(chunks):
        parts.append(f"[Đoạn {start_index + i}]\n{chunk}")
    return "\n\n".join(parts)


def _extract_json_object(raw: str) -> dict:
    """Parse a provider response and reject malformed/non-object JSON."""
    if not raw or not raw.strip():
        raise ValueError("LLM returned an empty response.")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("LLM response does not contain a JSON object.")
        try:
            data = json.loads(raw[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ValueError("LLM returned malformed JSON.") from exc

    if not isinstance(data, dict):
        raise ValueError("LLM JSON response must be an object.")
    return data


def _parse_issues_response(raw: str) -> list[dict]:
    """Parse a provider response while preserving a legitimate empty list."""
    issues = _extract_json_object(raw).get("issues")
    if not isinstance(issues, list):
        raise ValueError("LLM response field 'issues' must be a list.")
    if any(not isinstance(issue, dict) for issue in issues):
        raise ValueError("Every item in LLM response field 'issues' must be an object.")
    return issues


def _parse_cross_check_response(raw: str) -> list[dict]:
    """Parse a cross-check response."""
    verifications = _extract_json_object(raw).get("verifications")
    if not isinstance(verifications, list):
        raise ValueError("LLM response field 'verifications' must be a list.")
    return [item for item in verifications if isinstance(item, dict)]


async def _call_llm_with_retry(
    provider_name: str,
    generate: Callable[[str], str],
    prompt: str,
) -> str:
    """Run a synchronous SDK call off the event loop with bounded retries."""
    last_error: Optional[Exception] = None
    for attempt in range(1, LLM_MAX_ATTEMPTS + 1):
        try:
            return await asyncio.to_thread(generate, prompt)
        except Exception as exc:
            last_error = exc
            logger.warning(
                "%s verification call failed (attempt %s/%s): %s",
                provider_name,
                attempt,
                LLM_MAX_ATTEMPTS,
                exc.__class__.__name__,
            )
            if attempt < LLM_MAX_ATTEMPTS:
                await asyncio.sleep(LLM_RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1)))
    raise VerificationProviderError(
        f"{provider_name} không trả về được kết quả hợp lệ."
    ) from last_error


def _coerce_chunk_index(value, start_index: int, chunk_count: int) -> Optional[int]:
    """Accept the documented global index and tolerate legacy local indices."""
    if isinstance(value, bool):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    try:
        index = int(value)
    except (TypeError, ValueError):
        return None

    valid_global = range(start_index, start_index + chunk_count)
    if index in valid_global:
        return index
    if 0 <= index < chunk_count:
        return start_index + index
    return None


def _normalize_primary_issues(
    issues: list[dict],
    chunks: list[str],
    start_index: int,
    provider: str,
) -> list[dict]:
    """Validate untrusted LLM output before cross-checking or persistence."""
    normalized: list[dict] = []
    for raw_issue in issues:
        chunk_index = _coerce_chunk_index(
            raw_issue.get("chunk_index"),
            start_index,
            len(chunks),
        )
        if chunk_index is None:
            logger.info("Dropping issue with invalid chunk_index: %r", raw_issue.get("chunk_index"))
            continue

        original_text = raw_issue.get("original_text")
        suggested_fix = raw_issue.get("suggested_fix")
        reason = raw_issue.get("reason")
        if not all(isinstance(value, str) and value.strip() for value in (original_text, suggested_fix, reason)):
            continue

        original_text = original_text.strip()
        suggested_fix = suggested_fix.strip()
        reason = reason.strip()
        corresponding_chunk = chunks[chunk_index - start_index]
        if original_text not in corresponding_chunk:
            logger.info(
                "Dropping issue because original_text is not in chunk %s.",
                chunk_index,
            )
            continue
        if original_text == suggested_fix:
            continue

        try:
            confidence = float(raw_issue.get("confidence"))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(confidence):
            continue

        candidate = {
            "chunk_index": chunk_index,
            "issue_type": raw_issue.get("issue_type"),
            "severity": raw_issue.get("severity", "medium"),
            "original_text": original_text,
            "suggested_fix": suggested_fix,
            "reason": reason,
            "confidence": confidence,
            # The current pipeline does not use a real web-grounding tool. Never
            # persist a citation merely invented by a model.
            "source_reference": None,
            "external_verified": False,
            "ai_provider": provider,
        }
        try:
            normalized.append(VerificationIssue.model_validate(candidate).model_dump())
        except ValidationError:
            logger.info("Dropping issue that failed schema validation.")

    return normalized


async def _verify_issue_fact_with_search(issue: dict) -> tuple[Optional[str], bool]:
    """
    Verify the fact of an issue using Gemini with Google Search grounding.
    Returns (source_reference, external_verified).
    """
    if not is_gemini_available():
        return None, False

    prompt = f"""Hãy kiểm tra tính chính xác của thông tin học liệu sau:
Nội dung gốc trong tài liệu: "{issue['original_text']}"
Lỗi nghi ngờ: "{issue['reason']}"
Đề xuất sửa: "{issue['suggested_fix']}"

Hãy tra cứu internet và xác minh xem đề xuất sửa này có chính xác và hợp lý theo các tài liệu chính thức uy tín không.
"""
    try:
        from app.services.llm_service import get_gemini_client
        client = get_gemini_client()
        model = settings.GEMINI_MODEL or "gemini-2.5-flash"
        
        def _call():
            return client.models.generate_content(
                model=model,
                contents=prompt,
                config={"tools": [{"google_search": {}}]}
            )
            
        response = await asyncio.to_thread(_call)
        metadata = getattr(response.candidates[0], "grounding_metadata", None)
        
        sources = []
        if metadata:
            for chunk in getattr(metadata, "grounding_chunks", []):
                web = getattr(chunk, "web", None)
                if web:
                    title = getattr(web, "title", None)
                    uri = getattr(web, "uri", None)
                    if title and uri:
                        sources.append(f"{title}: {uri}")
                        
        if sources:
            source_reference = "; ".join(sources[:3])
            return source_reference, True
            
        return "Chưa đối chiếu được nguồn bên ngoài.", False
    except Exception as e:
        logger.warning("Factual verification with search grounding failed: %s", e)
        return "Gặp lỗi khi truy xuất nguồn kiểm chứng.", False


async def verify_batch(
    chunks: list[str],
    start_index: int,
    batch_index: int,
    *,
    db=None,
    subject_id: str | None = None,
    grade: int | None = None,
    topic_id: str | None = None,
    local_evidence: list[GroundedChunk] | None = None,
) -> list[dict]:
    """
    Verify a single batch of chunks using dual-AI cross-check.
    Returns a list of confirmed issues with adjusted confidence.
    """
    if not chunks:
        return []

    curriculum_scoped = subject_id is not None and grade is not None
    if (subject_id is None) != (grade is None):
        raise ValueError("subject_id and grade must be supplied together")
    if curriculum_scoped and local_evidence is None:
        local_evidence = await resolve_context(
            db or get_database(),
            query=" ".join(chunks)[:1000],
            subject_id=subject_id,
            grade=grade,
            topic_id=topic_id,
            language="en" if subject_id == "tieng_anh" else None,
        )
    if curriculum_scoped and not local_evidence:
        return []

    chunks_text = _format_chunks_for_prompt(chunks, start_index)
    if len(chunks_text) > MAX_CONTEXT_PER_BATCH:
        raise ValueError("Batch verification context exceeds the configured safe limit.")

    valid_chunk_indices = list(range(start_index, start_index + len(chunks)))
    prompt = _build_verification_prompt(chunks_text, batch_index, valid_chunk_indices)

    if settings.AI_TEXT_PROVIDER == "claude":
        if not is_claude_available():
            raise VerificationProviderError("Chưa cấu hình Claude để kiểm tra nội dung.")
        raw = await _call_llm_with_retry(
            "Claude", lambda value: claude_generate_json(value, quality=True), prompt
        )
        parsed_issues = _parse_issues_response(raw)
        normalized = _normalize_primary_issues(
            parsed_issues, chunks, start_index, "claude"
        )
        if parsed_issues and not normalized:
            raise VerificationProviderError("Claude chỉ trả về vấn đề không hợp lệ.")
        confirmed = [issue for issue in normalized if issue["confidence"] >= CONFIDENCE_THRESHOLD]
        if local_evidence:
            source_reference = "; ".join(
                f"{chunk.title} [{chunk.chunk_id}]" for chunk in local_evidence[:3]
            )
            for issue in confirmed:
                issue["source_reference"] = source_reference
                issue["external_verified"] = True
        return confirmed

    # Step 1: Primary detection (prefer Gemini for factual knowledge)
    primary_issues: list[dict] = []
    primary_provider = "unknown"
    successful_primary_call = False
    provider_errors: list[str] = []

    if is_gemini_available():
        try:
            raw = await _call_llm_with_retry("Gemini", gemini_generate_json, prompt)
            parsed_issues = _parse_issues_response(raw)
            primary_issues = _normalize_primary_issues(
                parsed_issues,
                chunks,
                start_index,
                "gemini",
            )
            if parsed_issues and not primary_issues:
                raise ValueError("Gemini returned only invalid verification issues.")
            successful_primary_call = True
            primary_provider = "gemini"
            logger.info(f"  Batch {batch_index + 1}: Gemini found {len(primary_issues)} issues")
        except Exception as e:
            provider_errors.append(f"Gemini: {e}")
            logger.warning(f"  Batch {batch_index + 1}: Gemini detection failed: {e}")

    if not primary_issues and is_groq_available():
        try:
            raw = await _call_llm_with_retry("Groq", generate_json, prompt)
            parsed_issues = _parse_issues_response(raw)
            primary_issues = _normalize_primary_issues(
                parsed_issues,
                chunks,
                start_index,
                "groq",
            )
            if parsed_issues and not primary_issues:
                raise ValueError("Groq returned only invalid verification issues.")
            successful_primary_call = True
            primary_provider = "groq"
            logger.info(f"  Batch {batch_index + 1}: Groq found {len(primary_issues)} issues")
        except Exception as e:
            provider_errors.append(f"Groq: {e}")
            logger.warning(f"  Batch {batch_index + 1}: Groq detection failed: {e}")

    if not successful_primary_call:
        if not is_gemini_available() and not is_groq_available():
            raise VerificationProviderError(
                "Chưa cấu hình Gemini hoặc Groq để kiểm tra nội dung."
            )
        raise VerificationProviderError(
            "Không dịch vụ AI nào trả về kết quả hợp lệ. " + "; ".join(provider_errors)
        )

    if not primary_issues:
        return []

    # Step 2: Cross-check with the other AI
    cross_verifications: list[dict] = []
    issues_json = json.dumps(primary_issues, ensure_ascii=False, indent=2)
    cross_prompt = _build_cross_check_prompt(issues_json, chunks_text)

    cross_provider = "groq" if primary_provider == "gemini" else "gemini"
    try:
        if cross_provider == "gemini" and is_gemini_available():
            raw = await _call_llm_with_retry("Gemini", gemini_generate_json, cross_prompt)
            cross_verifications = _parse_cross_check_response(raw)
        elif cross_provider == "groq" and is_groq_available():
            raw = await _call_llm_with_retry("Groq", generate_json, cross_prompt)
            cross_verifications = _parse_cross_check_response(raw)
    except Exception as e:
        logger.warning(f"  Batch {batch_index + 1}: Cross-check ({cross_provider}) failed: {e}")

    # Step 3: Merge results — only keep confirmed issues
    confirmed_issues: list[dict] = []
    cross_map: dict[int, dict] = {}
    for verification in cross_verifications:
        try:
            verification_index = int(verification.get("index"))
        except (TypeError, ValueError):
            continue
        if 0 <= verification_index < len(primary_issues):
            cross_map[verification_index] = verification

    for idx, issue in enumerate(primary_issues):
        cross = cross_map.get(idx)

        verdict = str(cross.get("verdict", "")).lower() if cross else ""
        if cross and verdict == "rejected":
            logger.info(
                "  Issue #%s rejected by cross-check: %s",
                idx,
                str(cross.get("reason", ""))[:80],
            )
            continue

        # Average confidence between primary and cross-check
        primary_conf = issue["confidence"]
        if cross and verdict == "confirmed":
            try:
                cross_conf = float(cross.get("confidence", primary_conf))
            except (TypeError, ValueError):
                cross_conf = primary_conf
            if math.isfinite(cross_conf) and 0.0 <= cross_conf <= 1.0:
                issue["confidence"] = round((primary_conf + cross_conf) / 2.0, 2)
            issue["ai_provider"] = "both"
        else:
            issue["ai_provider"] = primary_provider

        # Filter by confidence threshold
        if issue["confidence"] < CONFIDENCE_THRESHOLD:
            logger.info(f"  Issue #{idx} below confidence threshold ({issue['confidence']})")
            continue

        # Fact checking and grounding
        if local_evidence:
            source_ref = "; ".join(
                f"{chunk.title} [{chunk.chunk_id}]" for chunk in local_evidence[:3]
            )
            ext_verified = True
        else:
            source_ref, ext_verified = await _verify_issue_fact_with_search(issue)
        issue["source_reference"] = source_ref
        issue["external_verified"] = ext_verified

        try:
            confirmed_issues.append(
                VerificationIssue.model_validate(issue).model_dump()
            )
        except ValidationError:
            logger.info("Dropping merged issue that failed schema validation.")

    return confirmed_issues


# ═══════════════════════════════════════════════════════════════════════════
# Session Management
# ═══════════════════════════════════════════════════════════════════════════

async def ensure_verification_indexes() -> None:
    """Create indexes used for atomic active-session locking and scoped reads."""
    db = get_database()
    await db["verification_sessions"].create_index(
        [("active_key", ASCENDING)],
        name=ACTIVE_SESSION_INDEX,
        unique=True,
        sparse=True,
    )
    await db["verification_sessions"].create_index(
        [
            ("document_id", ASCENDING),
            ("user_id", ASCENDING),
            ("created_at", DESCENDING),
        ],
        name="verification_sessions_latest",
    )
    await db["verification_sessions"].create_index(
        [("document_id", ASCENDING)],
        name="verification_sessions_doc_id",
    )
    await db["verification_sessions"].create_index(
        [("user_id", ASCENDING)],
        name="verification_sessions_user_id",
    )
    await db["verification_sessions"].create_index(
        [("status", ASCENDING)],
        name="verification_sessions_status",
    )
    await db["verification_sessions"].create_index(
        [("created_at", DESCENDING)],
        name="verification_sessions_created_at",
    )
    await db["verification_sessions"].create_index(
        [
            ("document_id", ASCENDING),
            ("content_revision_hash", ASCENDING),
        ],
        name="verification_sessions_doc_hash",
    )
    await db["verification_issues"].create_index(
        [
            ("session_id", ASCENDING),
            ("user_id", ASCENDING),
            ("chunk_index", ASCENDING),
        ],
        name="verification_issues_by_session",
    )


async def recover_interrupted_verification_sessions() -> int:
    """Fail background sessions left behind by a previous app process."""
    db = get_database()
    now = datetime.now(timezone.utc)
    result = await db["verification_sessions"].update_many(
        {"status": "processing"},
        {
            "$set": {
                "status": "failed",
                "error_message": (
                    "Phiên kiểm tra bị gián đoạn do máy chủ khởi động lại. "
                    "Vui lòng chạy kiểm tra lại."
                ),
                "updated_at": now,
                "completed_at": now,
            },
            "$unset": {"active_key": ""},
        },
    )
    recovered_mutations = await recover_interrupted_document_mutations(db)
    if recovered_mutations:
        logger.warning(
            "Recovered %s interrupted document mutations.",
            recovered_mutations,
        )
    return result.modified_count


async def get_latest_verification_session(
    document_id: str,
    user_id: str,
) -> Optional[dict]:
    """Return the newest session for an owned document."""
    db = get_database()
    return await db["verification_sessions"].find_one(
        {"document_id": document_id, "user_id": user_id},
        sort=[("created_at", DESCENDING), ("_id", DESCENDING)],
    )


async def _get_latest_completed_session(
    document_id: str,
    user_id: str,
    expected_session_id: Optional[str] = None,
) -> dict:
    session = await get_latest_verification_session(document_id, user_id)
    if not session:
        raise VerificationStateError("Học liệu chưa có phiên kiểm tra nào.")
    if expected_session_id and str(session["_id"]) != expected_session_id:
        raise VerificationStateError(
            "Phiên kiểm tra trên màn hình đã cũ. Vui lòng tải lại kết quả mới nhất."
        )
    if session.get("status") != "completed":
        raise VerificationStateError(
            "Chỉ có thể xử lý vấn đề sau khi phiên kiểm tra mới nhất hoàn tất."
        )
    return session


def _validate_session_content_revision(session: dict, current_text: str) -> None:
    expected_hash = session.get("content_revision_hash")
    if not expected_hash:
        raise VerificationStateError(
            "Phiên kiểm tra cũ không có phiên bản nội dung. Vui lòng chạy kiểm tra lại."
        )
    if not hmac.compare_digest(
        expected_hash,
        compute_content_revision_hash(current_text),
    ):
        raise VerificationStateError(
            "Nội dung đã thay đổi sau phiên kiểm tra. Vui lòng chạy kiểm tra lại."
        )


async def _ensure_verification_target_active(
    document_id: str,
    user_id: str,
    session_id: str,
) -> None:
    """Abort background work once its document/session is deleted or cancelled."""
    db = get_database()
    session_object_id = ObjectId(session_id)
    session, document = await asyncio.gather(
        db["verification_sessions"].find_one(
            {
                "_id": session_object_id,
                "document_id": document_id,
                "user_id": user_id,
                "status": "processing",
            }
        ),
        db["documents"].find_one(
            {
                "_id": ObjectId(document_id),
                "user_id": user_id,
                "status": {"$ne": "deleting"},
            }
        ),
    )
    if not session or not document:
        raise VerificationCancelledError(
            "Tài liệu hoặc phiên kiểm tra không còn hoạt động."
        )


async def _ensure_content_snapshot_current(
    content_id: ObjectId,
    user_id: str,
    expected_updated_at: Optional[datetime],
    expected_revision_hash: str,
) -> None:
    db = get_database()
    current = await db["document_contents"].find_one(
        {"_id": content_id, "user_id": user_id},
        {"updated_at": 1, "extracted_text": 1},
    )
    if (
        not current
        or current.get("updated_at") != expected_updated_at
        or not hmac.compare_digest(
            compute_content_revision_hash(current.get("extracted_text", "")),
            expected_revision_hash,
        )
    ):
        raise VerificationContentChangedError(
            "Nội dung đã thay đổi trong khi phiên kiểm tra đang chạy."
        )


async def create_verification_session(
    document_id: str,
    user_id: str,
    total_chunks: int,
    content_revision_hash: Optional[str] = None,
) -> dict:
    """Create one active session atomically for a user/document pair."""
    db = get_database()
    await ensure_verification_indexes()

    existing = await db["verification_sessions"].find_one(
        {
            "document_id": document_id,
            "user_id": user_id,
            "status": "processing",
        }
    )
    if existing:
        raise VerificationInProgressError(str(existing["_id"]))

    now = datetime.now(timezone.utc)
    active_key = f"{user_id}:{document_id}"
    session = {
        "document_id": document_id,
        "user_id": user_id,
        "active_key": active_key,
        "status": "processing",
        "total_chunks": total_chunks,
        "total_chunks_processed": 0,
        "total_issues_found": 0,
        "issues_accepted": 0,
        "issues_rejected": 0,
        "issues_pending": 0,
        "successful_chunks": 0,
        "failed_chunks": 0,
        "ai_model": (
            settings.CLAUDE_QUALITY_MODEL
            if settings.AI_TEXT_PROVIDER == "claude"
            else settings.GEMINI_MODEL or "gemini-2.5-flash"
        ),
        "summary": None,
        "severity_stats": {"low": 0, "medium": 0, "high": 0, "critical": 0},
        "content_revision_hash": content_revision_hash,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }
    try:
        result = await db["verification_sessions"].insert_one(session)
    except DuplicateKeyError as exc:
        existing = await db["verification_sessions"].find_one(
            {"active_key": active_key, "status": "processing"}
        )
        if existing:
            raise VerificationInProgressError(str(existing["_id"])) from exc
        raise
    session["_id"] = result.inserted_id
    return session


async def update_session_progress(
    session_id,
    chunks_processed: int,
    issues_found: int,
    successful_chunks: int = 0,
    failed_chunks: int = 0,
):
    """Update session progress during batch processing."""
    db = get_database()
    await db["verification_sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "total_chunks_processed": chunks_processed,
                "total_issues_found": issues_found,
                "issues_pending": issues_found,
                "successful_chunks": successful_chunks,
                "failed_chunks": failed_chunks,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )


async def complete_session(
    session_id,
    total_issues: int,
    status: str = "completed",
    error: Optional[str] = None,
    successful_chunks: int = 0,
    failed_chunks: int = 0,
    severity_stats: Optional[dict] = None,
    summary: Optional[str] = None,
):
    """Mark session as completed, partially_completed, or failed."""
    db = get_database()
    now = datetime.now(timezone.utc)
    await db["verification_sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "status": status,
                "total_issues_found": total_issues,
                "issues_pending": total_issues,
                "successful_chunks": successful_chunks,
                "failed_chunks": failed_chunks,
                "severity_stats": severity_stats or {"low": 0, "medium": 0, "high": 0, "critical": 0},
                "summary": summary or f"Phát hiện {total_issues} lỗi trong tài liệu.",
                "error_message": error,
                "updated_at": now,
                "completed_at": now,
            },
            "$unset": {"active_key": ""},
        },
    )


async def save_issues(session_id: str, document_id: str, user_id: str, issues: list[dict]):
    """Save validated issues, then remove them if their parent was deleted mid-write."""
    if not issues:
        return

    db = get_database()
    now = datetime.now(timezone.utc)
    docs = []
    for issue in issues:
        docs.append({
            "session_id": session_id,
            "document_id": document_id,
            "user_id": user_id,
            "chunk_index": issue.get("chunk_index", 0),
            "issue_type": issue.get("issue_type", "factual_error"),
            "severity": issue.get("severity", "medium"),
            "original_text": issue.get("original_text", ""),
            "suggested_fix": issue.get("suggested_fix", ""),
            "reason": issue.get("reason", ""),
            "confidence": issue.get("confidence", 0.5),
            "source_reference": issue.get("source_reference"),
            "external_verified": issue.get("external_verified", False),
            "ai_provider": issue.get("ai_provider", "unknown"),
            "resolution": "pending",
            "user_edited_text": None,
            "resolved_at": None,
            "applied_at": None,
            "created_at": now,
        })
    result = await db["verification_issues"].insert_many(docs)

    # Deleting a document can race a provider call. Never leave orphan issues.
    document_exists = await db["documents"].find_one(
        {
            "_id": ObjectId(document_id),
            "user_id": user_id,
            "status": {"$ne": "deleting"},
        },
        {"_id": 1},
    )
    session_exists = await db["verification_sessions"].find_one(
        {"_id": ObjectId(session_id), "document_id": document_id, "user_id": user_id},
        {"_id": 1},
    )
    if not document_exists or not session_exists:
        await db["verification_issues"].delete_many(
            {"_id": {"$in": result.inserted_ids}}
        )
        raise VerificationCancelledError(
            "Tài liệu hoặc phiên kiểm tra đã bị xóa khi đang lưu kết quả."
        )


def _deduplicate_issues(issues: list[dict]) -> list[dict]:
    """Collapse the same finding emitted from overlapping chunks."""
    unique: list[dict] = []
    for issue in sorted(
        issues,
        key=lambda item: (item.get("chunk_index", 0), item.get("issue_type", "")),
    ):
        normalized_original = " ".join(issue.get("original_text", "").split()).casefold()
        normalized_fix = " ".join(issue.get("suggested_fix", "").split()).casefold()
        duplicate_index: Optional[int] = None
        for index, existing in enumerate(unique):
            if (
                issue.get("issue_type") == existing.get("issue_type")
                and normalized_original
                == " ".join(existing.get("original_text", "").split()).casefold()
                and normalized_fix
                == " ".join(existing.get("suggested_fix", "").split()).casefold()
                and abs(
                    int(issue.get("chunk_index", 0))
                    - int(existing.get("chunk_index", 0))
                )
                <= 1
            ):
                duplicate_index = index
                break
        if duplicate_index is None:
            unique.append(issue)
        elif issue.get("confidence", 0) > unique[duplicate_index].get("confidence", 0):
            unique[duplicate_index] = issue
    return unique


async def run_verification_task(document_id: str, user_id: str, session_id: str):
    """
    Background task: verify all chunks of a document.
    Called by the router via BackgroundTasks.
    """
    db = get_database()
    started_at = asyncio.get_running_loop().time()
    usage_status = "failure"
    usage_error_code = "500_INTERNAL"
    successful_chunks = 0
    failed_chunks = 0
    errors_list: list[str] = []
    usage_capture_token = (
        start_claude_usage_capture() if settings.AI_TEXT_PROVIDER == "claude" else None
    )

    try:
        await _ensure_verification_target_active(document_id, user_id, session_id)

        # Load extracted text
        content_doc = await db["document_contents"].find_one(
            {"document_id": document_id, "user_id": user_id}
        )
        if not content_doc or not content_doc.get("extracted_text"):
            await complete_session(session_id, 0, status="failed", error="Không tìm thấy nội dung trích xuất.")
            return

        raw_text = content_doc["extracted_text"]
        content_updated_at = content_doc.get("updated_at")
        current_revision_hash = compute_content_revision_hash(raw_text)
        session_doc = await db["verification_sessions"].find_one(
            {"_id": ObjectId(session_id), "user_id": user_id}
        )
        if not session_doc:
            raise VerificationCancelledError("Phiên kiểm tra không còn tồn tại.")
        if session_doc.get("content_revision_hash"):
            if not hmac.compare_digest(
                session_doc["content_revision_hash"],
                current_revision_hash,
            ):
                raise VerificationContentChangedError(
                    "Nội dung đã thay đổi trước khi phiên kiểm tra bắt đầu."
                )
        else:
            # Compatibility for a processing session created by an older build.
            await db["verification_sessions"].update_one(
                {"_id": session_doc["_id"], "status": "processing"},
                {"$set": {"content_revision_hash": current_revision_hash}},
            )

        # extracted_text is the source of truth. Existing indexed chunks can be
        # stale after a force extract or a failed re-index.
        chunks = split_text_into_chunks(raw_text)
        if not chunks:
            await complete_session(session_id, 0, status="failed", error="Không thể chia đoạn nội dung tài liệu.")
            return

        # Update total_chunks
        await db["verification_sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "total_chunks": len(chunks),
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

        # Process in batches
        all_issues: list[dict] = []
        total_processed = 0

        for batch_start in range(0, len(chunks), BATCH_SIZE):
            await _ensure_verification_target_active(document_id, user_id, session_id)
            batch_end = min(batch_start + BATCH_SIZE, len(chunks))
            batch_chunks = chunks[batch_start:batch_end]
            batch_index = batch_start // BATCH_SIZE
            batch_size = len(batch_chunks)

            logger.info(f"🔍 Verifying batch {batch_index + 1} (chunks {batch_start}-{batch_end - 1})...")
            try:
                batch_issues = await verify_batch(batch_chunks, batch_start, batch_index)
                await _ensure_content_snapshot_current(
                    content_doc["_id"],
                    user_id,
                    content_updated_at,
                    current_revision_hash,
                )
                all_issues.extend(batch_issues)
                all_issues = _deduplicate_issues(all_issues)
                successful_chunks += batch_size
            except Exception as e:
                logger.error(f"  Batch {batch_index + 1} failed: {e}")
                failed_chunks += batch_size
                errors_list.append(f"Mệnh đề {batch_start + 1} - {batch_end}: {str(e)[:80]}")

            total_processed = batch_end
            await update_session_progress(
                session_id,
                total_processed,
                len(all_issues),
                successful_chunks,
                failed_chunks,
            )

        if successful_chunks == 0 and failed_chunks > 0:
            raise VerificationProviderError(
                "Tất cả các đoạn phân tích đều thất bại: " + "; ".join(errors_list[:3])
            )

        # Save all issues
        await _ensure_verification_target_active(document_id, user_id, session_id)
        await _ensure_content_snapshot_current(
            content_doc["_id"],
            user_id,
            content_updated_at,
            current_revision_hash,
        )
        await save_issues(session_id, document_id, user_id, all_issues)
        await _ensure_content_snapshot_current(
            content_doc["_id"],
            user_id,
            content_updated_at,
            current_revision_hash,
        )
        await complete_session(session_id, len(all_issues))
        usage_status = "success"
        usage_error_code = None

        logger.info(f"✅ Verification completed: {len(all_issues)} issues found in {len(chunks)} chunks")

    except VerificationCancelledError as exc:
        logger.info("Verification task %s cancelled: %s", session_id, exc)
    except VerificationProviderError as exc:
        usage_error_code = "PROVIDER_DOWN"
        logger.error("Verification task %s failed because providers were unavailable: %s", session_id, exc)
        await db["verification_issues"].delete_many({"session_id": session_id})
        await complete_session(
            session_id,
            0,
            status="failed",
            error="Dịch vụ AI không trả về được kết quả hợp lệ. Vui lòng thử lại sau.",
        )
    except VerificationContentChangedError as exc:
        usage_error_code = "INVALID_RESPONSE"
        logger.info("Verification task %s stopped: %s", session_id, exc)
        await db["verification_issues"].delete_many({"session_id": session_id})
        await complete_session(
            session_id,
            0,
            status="failed",
            error="Nội dung đã thay đổi trong khi kiểm tra. Vui lòng chạy kiểm tra lại.",
        )
    except Exception as e:
        logger.exception("Verification task %s failed", session_id)
        await db["verification_issues"].delete_many({"session_id": session_id})
        await complete_session(session_id, 0, status="failed", error=f"Lỗi kiểm tra: {str(e)[:300]}")
    finally:
        claude_usage = (
            stop_claude_usage_capture(usage_capture_token)
            if usage_capture_token is not None
            else {}
        )
        await record_event(UsageEventCreate(
            event_id=new_event_id(),
            logical_request_id=session_id,
            attempt_id=new_attempt_id(),
            attempt_number=1,
            is_final=True,
            event_kind="logical_operation",
            user_id=user_id,
            operation_type="document_verification",
            feature="document_verification",
            provider="anthropic" if settings.AI_TEXT_PROVIDER == "claude" else "mixed",
            model_name=(settings.CLAUDE_QUALITY_MODEL if settings.AI_TEXT_PROVIDER == "claude" else "groq+gemini"),
            model=(settings.CLAUDE_QUALITY_MODEL if settings.AI_TEXT_PROVIDER == "claude" else "groq+gemini"),
            status=usage_status,
            error_code=usage_error_code,
            latency_ms=int((asyncio.get_running_loop().time() - started_at) * 1000),
            input_tokens=claude_usage.get("input_tokens"),
            output_tokens=claude_usage.get("output_tokens"),
            total_tokens=claude_usage.get("total_tokens"),
            document_id=document_id,
            request_id=session_id,
            created_at=datetime.now(timezone.utc),
        ), database=db)


# ═══════════════════════════════════════════════════════════════════════════
# Resolve & Apply
# ═══════════════════════════════════════════════════════════════════════════

async def resolve_issues(
    document_id: str,
    user_id: str,
    resolutions: list[dict],
    expected_session_id: Optional[str] = None,
) -> int:
    """
    Resolve issues: mark as accepted/rejected/edited.
    Returns the count of resolved issues.
    """
    db = get_database()
    initial_session = await _get_latest_completed_session(
        document_id,
        user_id,
        expected_session_id,
    )
    document, content_doc = await asyncio.gather(
        db["documents"].find_one(
            {"_id": ObjectId(document_id), "user_id": user_id}
        ),
        db["document_contents"].find_one(
            {"document_id": document_id, "user_id": user_id}
        ),
    )
    if not document or not content_doc or not content_doc.get("extracted_text"):
        raise VerificationStateError("Không tìm thấy nội dung học liệu để xử lý.")
    original_status = document.get("status")
    if original_status not in MUTABLE_DOCUMENT_STATUSES:
        raise VerificationStateError(
            "Học liệu đang được xử lý bởi một yêu cầu khác. Vui lòng thử lại sau."
        )
    _validate_session_content_revision(initial_session, content_doc["extracted_text"])

    lock_token = await acquire_document_mutation_lock(
        db,
        document_id,
        user_id,
        expected_status=original_status,
        operation="verification_resolve",
        locked_status=original_status,
        expected_updated_at=document.get("updated_at"),
    )
    if not lock_token:
        raise VerificationStateError(
            "Học liệu vừa được xử lý bởi một yêu cầu khác. Vui lòng thử lại sau."
        )

    resolved_count = 0
    try:
        # Re-check both the latest session and content after acquiring the lock.
        session = await _get_latest_completed_session(
            document_id,
            user_id,
            expected_session_id or str(initial_session["_id"]),
        )
        current_content = await db["document_contents"].find_one(
            {"_id": content_doc["_id"], "user_id": user_id}
        )
        if not current_content or not current_content.get("extracted_text"):
            raise VerificationStateError("Không tìm thấy nội dung học liệu để xử lý.")
        _validate_session_content_revision(session, current_content["extracted_text"])

        session_id = str(session["_id"])
        now = datetime.now(timezone.utc)
        for resolution in resolutions:
            issue_id = resolution.get("issue_id")
            action = resolution.get("action")
            edited_text = resolution.get("edited_text")

            if not ObjectId.is_valid(issue_id) or action not in {
                "accepted",
                "rejected",
                "edited",
            }:
                continue
            if action == "edited":
                edited_text = edited_text.strip() if isinstance(edited_text, str) else ""
                if not edited_text:
                    continue
            else:
                edited_text = None

            result = await db["verification_issues"].update_one(
                {
                    "_id": ObjectId(issue_id),
                    "session_id": session_id,
                    "document_id": document_id,
                    "user_id": user_id,
                    "applied_at": None,
                },
                {
                    "$set": {
                        "resolution": action,
                        "resolved_at": now,
                        "user_edited_text": edited_text,
                    }
                },
            )
            resolved_count += result.modified_count

        if resolved_count > 0:
            issue_scope = {
                "session_id": session_id,
                "document_id": document_id,
                "user_id": user_id,
            }
            accepted, rejected, edited, pending = await asyncio.gather(
                db["verification_issues"].count_documents(
                    {**issue_scope, "resolution": "accepted"}
                ),
                db["verification_issues"].count_documents(
                    {**issue_scope, "resolution": "rejected"}
                ),
                db["verification_issues"].count_documents(
                    {**issue_scope, "resolution": "edited"}
                ),
                db["verification_issues"].count_documents(
                    {**issue_scope, "resolution": "pending"}
                ),
            )
            await db["verification_sessions"].update_one(
                {"_id": session["_id"], "user_id": user_id},
                {
                    "$set": {
                        "issues_accepted": accepted + edited,
                        "issues_rejected": rejected,
                        "issues_pending": pending,
                        "updated_at": now,
                    },
                },
            )
    finally:
        released = await finalize_document_mutation(
            db,
            document_id,
            user_id,
            lock_token,
            final_status=original_status,
            error_message=document.get("error_message"),
            required_status=original_status,
        )
        if not released:
            logger.error("Lost verification resolve lock for document %s", document_id)

    return resolved_count


def _whitespace_flexible_spans(text: str, needle: str) -> list[tuple[int, int]]:
    """Locate cleaned prompt text in the original text without losing whitespace."""
    parts = re.split(r"(\s+)", needle)
    pattern = "".join(r"\s+" if part.isspace() else re.escape(part) for part in parts)
    if not pattern:
        return []
    return [match.span() for match in re.finditer(pattern, text)]


def _plan_issue_replacements(
    current_text: str,
    issues: list[dict],
) -> list[tuple[int, int, str, ObjectId]]:
    """Locate exact, non-overlapping replacements using chunk_index as a hint."""
    chunks = split_text_into_chunks(current_text)
    occupied: list[tuple[int, int]] = []
    planned: list[tuple[int, int, str, ObjectId]] = []

    for issue in sorted(issues, key=lambda item: item.get("chunk_index", 0)):
        original = issue.get("original_text")
        if not isinstance(original, str) or not original:
            continue

        if issue.get("resolution") == "edited":
            replacement = issue.get("user_edited_text")
        else:
            replacement = issue.get("suggested_fix")
        if not isinstance(replacement, str) or not replacement.strip() or replacement == original:
            continue

        occurrences = _whitespace_flexible_spans(current_text, original)
        if not occurrences:
            logger.warning("Could not find original_text for issue %s", issue.get("_id"))
            continue

        chunk_index = issue.get("chunk_index", 0)
        try:
            chunk_index = int(chunk_index)
        except (TypeError, ValueError):
            chunk_index = 0

        expected_position = 0
        if chunks:
            expected_position = int(
                max(0, min(chunk_index, len(chunks) - 1))
                * len(current_text)
                / max(1, len(chunks))
            )

        # Prefer an occurrence that is actually inside the referenced chunk.
        preferred_spans: set[tuple[int, int]] = set()
        if 0 <= chunk_index < len(chunks) and original in chunks[chunk_index]:
            chunk_text = chunks[chunk_index]
            for chunk_start, chunk_end in _whitespace_flexible_spans(
                current_text,
                chunk_text,
            ):
                preferred_spans.update(
                    span
                    for span in occurrences
                    if span[0] >= chunk_start and span[1] <= chunk_end
                )

        available = [
            span
            for span in occurrences
            if not any(
                span[0] < occupied_end and span[1] > occupied_start
                for occupied_start, occupied_end in occupied
            )
        ]
        if not available:
            continue

        start, end = min(
            available,
            key=lambda candidate: (
                candidate not in preferred_spans,
                abs(candidate[0] - expected_position),
            ),
        )
        occupied.append((start, end))
        planned.append((start, end, replacement.strip(), issue["_id"]))

    return planned


async def apply_accepted_fixes(
    document_id: str,
    user_id: str,
    expected_session_id: Optional[str] = None,
) -> dict:
    """
    Apply all accepted/edited fixes to the extracted_text,
    then re-chunk and re-index into ChromaDB.
    Returns {"applied_count": N, "reindexed": bool}.
    """
    db = get_database()
    initial_session = await _get_latest_completed_session(
        document_id,
        user_id,
        expected_session_id,
    )
    document, content_doc = await asyncio.gather(
        db["documents"].find_one(
            {"_id": ObjectId(document_id), "user_id": user_id}
        ),
        db["document_contents"].find_one(
            {"document_id": document_id, "user_id": user_id}
        ),
    )
    if not document:
        raise VerificationStateError("Không tìm thấy học liệu để áp dụng bản sửa.")
    if not content_doc or not content_doc.get("extracted_text"):
        raise VerificationStateError("Không tìm thấy nội dung trích xuất để áp dụng bản sửa.")

    original_status = document.get("status")
    if original_status not in MUTABLE_DOCUMENT_STATUSES:
        raise VerificationStateError(
            "Học liệu đang được xử lý bởi một yêu cầu khác. Vui lòng thử lại sau."
        )
    _validate_session_content_revision(initial_session, content_doc["extracted_text"])

    lock_token = await acquire_document_mutation_lock(
        db,
        document_id,
        user_id,
        expected_status=original_status,
        operation="verification_apply",
        locked_status="indexing",
        expected_updated_at=document.get("updated_at"),
    )
    if not lock_token:
        raise VerificationStateError(
            "Học liệu vừa được xử lý bởi một yêu cầu khác. Vui lòng thử lại sau."
        )

    lock_finished = False
    content_mutated = False
    applied_count = 0
    try:
        # Everything below is based on a snapshot taken after owning the lock.
        session = await _get_latest_completed_session(
            document_id,
            user_id,
            expected_session_id or str(initial_session["_id"]),
        )
        content_doc = await db["document_contents"].find_one(
            {"document_id": document_id, "user_id": user_id}
        )
        if not content_doc or not content_doc.get("extracted_text"):
            raise VerificationStateError(
                "Không tìm thấy nội dung trích xuất để áp dụng bản sửa."
            )
        current_text = content_doc["extracted_text"]
        _validate_session_content_revision(session, current_text)
        session_id = str(session["_id"])
        already_applied_ids = set(
            content_doc.get("applied_verification_issue_ids", [])
        )

        accepted_issues: list[dict] = []
        ledger_applied_issue_ids: list[ObjectId] = []
        cursor = db["verification_issues"].find(
            {
                "session_id": session_id,
                "document_id": document_id,
                "user_id": user_id,
                "resolution": {"$in": ["accepted", "edited"]},
                "applied_at": None,
            }
        ).sort("chunk_index", 1)
        async for issue in cursor:
            if str(issue["_id"]) in already_applied_ids:
                ledger_applied_issue_ids.append(issue["_id"])
            else:
                accepted_issues.append(issue)

        if ledger_applied_issue_ids:
            await db["verification_issues"].update_many(
                {
                    "_id": {"$in": ledger_applied_issue_ids},
                    "session_id": session_id,
                    "user_id": user_id,
                    "applied_at": None,
                },
                {
                    "$set": {
                        "applied_at": content_doc.get("updated_at")
                        or datetime.now(timezone.utc)
                    }
                },
            )

        retry_pending_reindex = bool(
            content_doc.get("verification_reindex_pending")
        )
        if not accepted_issues and not retry_pending_reindex:
            lock_finished = await finalize_document_mutation(
                db,
                document_id,
                user_id,
                lock_token,
                final_status=original_status,
                error_message=document.get("error_message"),
                required_status="indexing",
            )
            if not lock_finished:
                raise VerificationStateError(
                    "Mất quyền sở hữu khóa học liệu. Vui lòng tải lại."
                )
            return {"applied_count": 0, "reindexed": False}

        replacements = _plan_issue_replacements(current_text, accepted_issues)
        if accepted_issues and len(replacements) != len(accepted_issues):
            raise VerificationStateError(
                "Một hoặc nhiều đoạn gốc không còn tồn tại trong nội dung. "
                "Hãy chạy kiểm tra lại trước khi áp dụng."
            )

        modified_text = current_text
        for start, end, replacement, _issue_id in sorted(
            replacements,
            key=lambda item: item[0],
            reverse=True,
        ):
            modified_text = (
                modified_text[:start] + replacement + modified_text[end:]
            )

        applied_issue_ids = [issue_id for *_rest, issue_id in replacements]
        applied_count = len(applied_issue_ids)
        now = datetime.now(timezone.utc)
        content_update = {
            "$set": {
                "extracted_text": modified_text,
                "text_length": len(modified_text),
                "updated_at": now,
                "verification_reindex_pending": True,
                "content_revision": lock_token,
            }
        }
        if applied_issue_ids:
            content_update["$addToSet"] = {
                "applied_verification_issue_ids": {
                    "$each": [str(issue_id) for issue_id in applied_issue_ids]
                }
            }

        update_result = await db["document_contents"].update_one(
            {
                "_id": content_doc["_id"],
                "user_id": user_id,
                "extracted_text": current_text,
                "updated_at": content_doc.get("updated_at"),
            },
            content_update,
        )
        if update_result.modified_count != 1:
            raise VerificationStateError(
                "Nội dung vừa thay đổi bởi một yêu cầu khác. Vui lòng tải lại."
            )
        content_mutated = True

        new_revision_hash = compute_content_revision_hash(modified_text)
        await db["verification_sessions"].update_one(
            {"_id": session["_id"], "user_id": user_id},
            {
                "$set": {
                    "content_revision_hash": new_revision_hash,
                    "updated_at": now,
                }
            },
        )
        if applied_issue_ids:
            await db["verification_issues"].update_many(
                {
                    "_id": {"$in": applied_issue_ids},
                    "session_id": session_id,
                    "user_id": user_id,
                    "applied_at": None,
                },
                {"$set": {"applied_at": now}},
            )

        new_chunks = split_text_into_chunks(modified_text)
        if not new_chunks:
            raise ValueError("Không thể tạo đoạn văn bản sau khi áp dụng bản sửa.")
        await add_document_chunks(document_id, user_id, new_chunks)

        # Do not publish indexed status unless both the content revision and
        # document mutation token still belong to this operation.
        finished_at = datetime.now(timezone.utc)
        content_finish = await db["document_contents"].update_one(
            {
                "_id": content_doc["_id"],
                "user_id": user_id,
                "content_revision": lock_token,
                "extracted_text": modified_text,
            },
            {
                "$set": {
                    "verification_reindex_pending": False,
                    "verification_reindexed_at": finished_at,
                }
            },
        )
        if content_finish.matched_count != 1:
            raise RuntimeError("Content revision ownership was lost during re-index.")

        lock_finished = await finalize_document_mutation(
            db,
            document_id,
            user_id,
            lock_token,
            final_status="indexed",
            error_message=None,
            required_status="indexing",
        )
        if not lock_finished:
            remaining_document = await db["documents"].find_one(
                {"_id": ObjectId(document_id)}, {"_id": 1}
            )
            if not remaining_document:
                await db["document_chunks"].delete_many(
                    {"document_id": document_id, "user_id": user_id}
                )
            raise RuntimeError("Document mutation ownership was lost during re-index.")

        logger.info(
            "✅ Re-indexed %s chunks after applying %s fixes",
            len(new_chunks),
            applied_count,
        )
        return {"applied_count": applied_count, "reindexed": True}

    except VerificationStateError:
        raise
    except Exception:
        logger.exception("Re-indexing failed after applying verification fixes")
        if content_mutated:
            await db["document_contents"].update_one(
                {
                    "document_id": document_id,
                    "user_id": user_id,
                    "content_revision": lock_token,
                },
                {"$set": {"verification_reindex_pending": True}},
            )
            if not lock_finished:
                lock_finished = await finalize_document_mutation(
                    db,
                    document_id,
                    user_id,
                    lock_token,
                    final_status="index_failed",
                    error_message="Không thể re-index sau khi áp dụng bản sửa.",
                    required_status="indexing",
                )
            return {
                "applied_count": applied_count,
                "reindexed": False,
                "error_message": (
                    "Đã lưu bản sửa nhưng re-index thất bại. Hãy thử áp dụng lại."
                ),
            }
        raise
    finally:
        if not lock_finished:
            restored = await finalize_document_mutation(
                db,
                document_id,
                user_id,
                lock_token,
                final_status=(
                    "index_failed" if content_mutated else original_status
                ),
                error_message=(
                    "Không thể re-index sau khi áp dụng bản sửa."
                    if content_mutated
                    else document.get("error_message")
                ),
                required_status="indexing",
            )
            if not restored:
                logger.error(
                    "Lost verification apply lock for document %s",
                    document_id,
                )
