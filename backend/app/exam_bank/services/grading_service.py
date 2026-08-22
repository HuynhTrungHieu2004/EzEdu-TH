"""Chấm điểm câu tự luận ngắn bằng Claude — kèm độ tin cậy, để
giáo viên có thể ghi đè (`AttemptOverrideRequest`). Trắc nghiệm/đúng-sai
KHÔNG qua đây — chấm chính xác tuyệt đối bằng so khớp (`_is_answer_correct`),
không cần AI.

Dùng định dạng thẻ (tag-block) đã có sẵn ở `learning_chat_service.py`.
"""

import asyncio
import logging
from typing import Optional

from app.curriculum_kb.services.context_service import GroundedChunk
from app.services.learning_chat_service import parse_tag_block
from app.services.language_policy_service import validate_output_language
from app.services.llm_service import claude_generate_content

logger = logging.getLogger("app.exam_bank.services.grading_service")


async def grade_short_answer(
    *,
    question_content: str,
    reference_answer: str,
    student_answer: str,
    max_points: float,
    evidence_context: Optional[list[GroundedChunk]] = None,
    output_language: Optional[str] = None,
) -> tuple[float, float, str]:
    """Trả về (điểm, độ tin cậy 0-1, nhận xét). Không ném lỗi ra ngoài — nếu
    Claude lỗi/parse thất bại, trả điểm 0 kèm confidence 0 để giáo viên biết
    cần tự chấm lại (không âm thầm coi là đúng).
    """
    teacher_review = (
        "Not enough verified evidence; a teacher must grade this answer."
        if output_language == "en"
        else "Không đủ bằng chứng đã xác minh — cần giáo viên chấm thủ công."
    )
    if not evidence_context:
        return 0.0, 0.0, teacher_review

    evidence = "\n\n".join(
        f"[CHUNK_ID: {chunk.chunk_id}]\n{chunk.text}" for chunk in evidence_context
    )
    language_instruction = (
        "Write FEEDBACK entirely in English."
        if output_language == "en"
        else "Viết FEEDBACK hoàn toàn bằng tiếng Việt."
    )
    prompt = f"""Bạn là giáo viên chấm bài tự luận ngắn. Chấm câu trả lời của học sinh so với đáp án tham khảo, thang điểm tối đa {max_points}.

Câu hỏi: {question_content}
Đáp án tham khảo: {reference_answer}
Câu trả lời của học sinh: {student_answer}

Bằng chứng được phép dùng:
{evidence}

Chỉ chấm dựa trên đáp án tham khảo và bằng chứng trên. {language_instruction}

Chấm điểm công bằng, chấp nhận diễn đạt khác nhưng đúng ý. Trả lời đúng định dạng:
[SCORE] điểm số từ 0 đến {max_points} [/SCORE]
[CONFIDENCE] độ tin cậy từ 0.0 đến 1.0 [/CONFIDENCE]
[FEEDBACK] nhận xét ngắn gọn cho học sinh [/FEEDBACK]"""

    try:
        text = await asyncio.to_thread(claude_generate_content, prompt, quality=True)

        score = float(parse_tag_block(text, "SCORE", "0"))
        confidence = float(parse_tag_block(text, "CONFIDENCE", "0"))
        feedback = parse_tag_block(text, "FEEDBACK", "")
        if output_language:
            validate_output_language([feedback], expected=output_language)

        score = max(0.0, min(score, max_points))
        confidence = max(0.0, min(confidence, 1.0))
        return score, confidence, feedback
    except Exception as exc:  # noqa: BLE001 - lỗi AI không được làm hỏng luồng chấm bài
        logger.error("grading_service.ai_grade_failed", extra={"error": str(exc)})
        return 0.0, 0.0, teacher_review
