import re
import json
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

def verify_facts_and_claims(
    answer: str,
    required_facts: List[str],
    forbidden_claims: List[str]
) -> Dict[str, Any]:
    """
    Checks if all required facts are present and no forbidden claims are present.
    """
    ans_lower = answer.lower()
    
    missing_facts = []
    for fact in required_facts:
        if fact.lower() not in ans_lower:
            missing_facts.append(fact)
            
    violated_claims = []
    for claim in forbidden_claims:
        if claim.lower() in ans_lower:
            violated_claims.append(claim)
            
    return {
        "passed": len(missing_facts) == 0 and len(violated_claims) == 0,
        "missing_facts": missing_facts,
        "violated_claims": violated_claims
    }

def verify_abstention(answer: str, should_abstain: bool) -> bool:
    """
    Checks if the answer correctly abstained from answering if should_abstain is True.
    """
    if not should_abstain:
        return True
        
    abstain_keywords = [
        "không tìm thấy", "chưa đủ bằng chứng", "không có thông tin",
        "tài liệu học tập không chứa", "không thể trả lời"
    ]
    ans_lower = answer.lower()
    return any(kw in ans_lower for kw in abstain_keywords)

async def run_llm_judge(
    answer: str,
    question: str,
    expected_answer: str,
    live_enabled: bool = False,
    judge_model: str = "gemini-2.5-flash"
) -> Dict[str, Any]:
    """
    A secondary metric evaluator that uses an LLM-as-a-judge (0-4 rubric).
    Only runs if live_enabled is True.
    """
    if not live_enabled:
        return {
            "judge_model": "mock",
            "scores": {"correctness": 4, "relevance": 4, "completeness": 4, "groundedness": 4, "clarity": 4},
            "explanation": "Mock LLM judge score."
        }
        
    # Standard prompt and schema definition
    prompt = f"""Bạn là một vị giám khảo khách quan chấm điểm câu trả lời của AI trợ lý học tập.
Hãy đánh giá câu trả lời sau dựa trên câu hỏi và đáp án mẫu:

Câu hỏi: {question}
Câu trả lời cần chấm: {answer}
Đáp án mẫu chuẩn: {expected_answer}

Hãy chấm điểm từ 0 đến 4 cho các khía cạnh sau:
- correctness: Tính chính xác so với đáp án mẫu.
- relevance: Tính liên quan trực tiếp đến câu hỏi.
- completeness: Tính đầy đủ, không thiếu thông tin cốt lõi.
- groundedness: Tính trung thực, không tự tiện bịa đặt.
- clarity: Tính mạch lạc, dễ hiểu của tiếng Việt.

Phản hồi bắt buộc phải trả về dưới định dạng JSON với cấu trúc:
{{
    "scores": {{
        "correctness": 4,
        "relevance": 4,
        "completeness": 4,
        "groundedness": 4,
        "clarity": 4
    }},
    "explanation": "Giải thích chi tiết lý do chấm điểm..."
}}
"""
    try:
        from app.services.llm_service import get_gemini_client
        client = get_gemini_client()
        
        # Call with timeout
        import asyncio
        async def _call():
            return client.models.generate_content(
                model=judge_model,
                contents=prompt,
                config={
                    "response_mime_type": "application/json"
                }
            )
        
        response = await asyncio.wait_for(_call(), timeout=15.0)
        res_text = response.text or ""
        parsed = json.loads(res_text)
        return {
            "judge_model": judge_model,
            "scores": parsed.get("scores", {}),
            "explanation": parsed.get("explanation", "")
        }
    except Exception as e:
        logger.error(f"LLM Judge error: {e}")
        return {
            "judge_model": judge_model,
            "error": str(e),
            "scores": {"correctness": 0, "relevance": 0, "completeness": 0, "groundedness": 0, "clarity": 0},
            "explanation": f"Lỗi trong quá trình LLM Judge: {e}"
        }
