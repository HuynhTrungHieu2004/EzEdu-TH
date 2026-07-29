"""Chấm điểm câu tự luận ngắn (short_answer) bằng AI — kèm độ tin cậy, để
giáo viên có thể ghi đè (`AttemptOverrideRequest`). Trắc nghiệm/đúng-sai
KHÔNG qua đây — chấm chính xác tuyệt đối bằng so khớp (`_is_answer_correct`),
không cần AI.

Dùng đúng client/mô hình Gemini và định dạng thẻ (tag-block) đã có sẵn ở
`learning_chat_service.py` — không phát minh định dạng JSON riêng.
"""

import asyncio
import logging

from app.core.config import settings
from app.services.learning_chat_service import parse_tag_block
from app.services.llm_service import get_gemini_client

logger = logging.getLogger("app.exam_bank.services.grading_service")


async def grade_short_answer(
    *, question_content: str, reference_answer: str, student_answer: str, max_points: float
) -> tuple[float, float, str]:
    """Trả về (điểm, độ tin cậy 0-1, nhận xét). Không ném lỗi ra ngoài — nếu
    Gemini lỗi/parse thất bại, trả điểm 0 kèm confidence 0 để giáo viên biết
    cần tự chấm lại (không âm thầm coi là đúng).
    """
    prompt = f"""Bạn là giáo viên chấm bài tự luận ngắn. Chấm câu trả lời của học sinh so với đáp án tham khảo, thang điểm tối đa {max_points}.

Câu hỏi: {question_content}
Đáp án tham khảo: {reference_answer}
Câu trả lời của học sinh: {student_answer}

Chấm điểm công bằng, chấp nhận diễn đạt khác nhưng đúng ý. Trả lời đúng định dạng:
[SCORE] điểm số từ 0 đến {max_points} [/SCORE]
[CONFIDENCE] độ tin cậy từ 0.0 đến 1.0 [/CONFIDENCE]
[FEEDBACK] nhận xét ngắn gọn cho học sinh [/FEEDBACK]"""

    try:
        client = get_gemini_client()
        model_name = settings.GEMINI_MODEL or "gemini-2.5-flash"

        def _call_ai():
            return client.models.generate_content(model=model_name, contents=prompt)

        response = await asyncio.to_thread(_call_ai)
        text = response.text or ""

        score = float(parse_tag_block(text, "SCORE", "0"))
        confidence = float(parse_tag_block(text, "CONFIDENCE", "0"))
        feedback = parse_tag_block(text, "FEEDBACK", "")

        score = max(0.0, min(score, max_points))
        confidence = max(0.0, min(confidence, 1.0))
        return score, confidence, feedback
    except Exception as exc:  # noqa: BLE001 - lỗi AI không được làm hỏng luồng chấm bài
        logger.error("grading_service.ai_grade_failed", extra={"error": str(exc)})
        return 0.0, 0.0, "Không thể tự chấm câu này — cần giáo viên chấm thủ công."
