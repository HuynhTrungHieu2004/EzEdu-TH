import json
import re
import subprocess
import tempfile
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import httpx
from groq import Groq
from google import genai
from app.core.config import settings

import logging
logger = logging.getLogger(__name__)
_claude_usage_capture: ContextVar[list | None] = ContextVar(
    "claude_usage_capture", default=None
)


@dataclass(frozen=True)
class ClaudeResult:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    citations: list[dict] = field(default_factory=list)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class ClaudeText(str):
    """String-compatible response carrying usage for existing callers."""

    def __new__(cls, result: ClaudeResult):
        value = super().__new__(cls, result.text)
        value.model = result.model
        value.input_tokens = result.input_tokens
        value.output_tokens = result.output_tokens
        value.total_tokens = result.total_tokens
        return value


def start_claude_usage_capture():
    return _claude_usage_capture.set([])


def stop_claude_usage_capture(token) -> dict[str, int | str]:
    results = _claude_usage_capture.get() or []
    _claude_usage_capture.reset(token)
    return {
        "model": results[-1].model if results else "",
        "input_tokens": sum(result.input_tokens for result in results),
        "output_tokens": sum(result.output_tokens for result in results),
        "total_tokens": sum(result.total_tokens for result in results),
    }


def is_claude_available() -> bool:
    api_key = (settings.ANTHROPIC_API_KEY or "").strip().lower()
    return bool(api_key and not api_key.startswith("your_") and not api_key.startswith("your-"))


def limit_prompt(prompt: str, max_characters: int) -> str:
    if max_characters <= 0:
        return ""
    if len(prompt) <= max_characters:
        return prompt
    if max_characters <= 5:
        return prompt[-max_characters:]
    marker = "\n...\n"
    remaining = max(0, max_characters - len(marker))
    head = (remaining * 3) // 5
    tail = remaining - head
    return prompt[:head] + marker + (prompt[-tail:] if tail else "")


def claude_generate(
    prompt: str,
    *,
    quality: bool,
    system: str | None = None,
    tools: list[dict] | None = None,
    max_retries: int | None = None,
) -> ClaudeResult:
    """Call Claude Messages API with the two approved model classes."""
    if not is_claude_available():
        raise ValueError("ANTHROPIC_API_KEY is not configured in the application environment (.env file).")

    model = settings.CLAUDE_QUALITY_MODEL if quality else settings.CLAUDE_FAST_MODEL
    max_prompt_characters = (
        settings.CLAUDE_QUALITY_MAX_PROMPT_CHARACTERS
        if quality else settings.CLAUDE_FAST_MAX_PROMPT_CHARACTERS
    )
    max_tokens = (
        settings.CLAUDE_QUALITY_MAX_OUTPUT_TOKENS
        if quality else settings.CLAUDE_FAST_MAX_OUTPUT_TOKENS
    )
    payload: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": limit_prompt(prompt, max_prompt_characters)}],
    }
    if system:
        payload["system"] = system
    if tools:
        payload["tools"] = tools

    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    response = None
    retry_count = settings.MAX_RETRIES if max_retries is None else max_retries
    for attempt in range(retry_count + 1):
        try:
            response = httpx.post(
                f"{settings.ANTHROPIC_BASE_URL.rstrip('/')}/v1/messages",
                headers=headers,
                json=payload,
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            break
        except httpx.HTTPStatusError as exc:
            retryable = exc.response.status_code == 429 or exc.response.status_code >= 500
            if not retryable or attempt >= retry_count:
                raise
            delay = float(exc.response.headers.get("retry-after", 2 ** attempt))
            time.sleep(min(max(delay, 0.0), 60.0))
        except httpx.RequestError:
            if attempt >= retry_count:
                raise
            time.sleep(2 ** attempt)

    data = response.json()
    blocks = data.get("content") or []
    text = "\n".join(block.get("text", "") for block in blocks if block.get("type") == "text").strip()
    citations = [citation for block in blocks for citation in (block.get("citations") or [])]
    usage = data.get("usage") or {}
    result = ClaudeResult(
        text=text,
        model=data.get("model") or model,
        input_tokens=int(usage.get("input_tokens") or 0),
        output_tokens=int(usage.get("output_tokens") or 0),
        citations=citations,
    )
    capture = _claude_usage_capture.get()
    if capture is not None:
        capture.append(result)
    return result


def claude_generate_content(prompt: str, *, quality: bool = False) -> str:
    return ClaudeText(claude_generate(prompt, quality=quality))


def claude_generate_json(
    prompt: str, *, quality: bool = True, max_retries: int | None = None
) -> str:
    result = claude_generate(
        prompt,
        quality=quality,
        system="Chỉ trả về JSON hợp lệ, không thêm markdown hoặc nội dung ngoài JSON.",
        max_retries=max_retries,
    )
    try:
        parsed = json.loads(result.text)
    except json.JSONDecodeError as exc:
        raise ValueError("Claude không trả về JSON hợp lệ.") from exc
    if not isinstance(parsed, (dict, list)):
        raise ValueError("Claude JSON phải là object hoặc array.")
    return ClaudeText(result)


def claude_web_search(prompt: str) -> ClaudeResult:
    result = claude_generate(
        prompt,
        quality=True,
        tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": settings.MAX_WEB_CITATIONS}],
    )
    if result.citations:
        return result
    # ponytail: Nghimmo omits structured citations; remove when its gateway preserves them.
    urls = list(dict.fromkeys(
        match.rstrip(".,;:!?)]}'\"")
        for match in re.findall(r"https?://[^\s<>\"]+", result.text)
    ))
    return ClaudeResult(
        text=result.text,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        citations=[{
            "url": url,
            "title": urlparse(url).netloc,
            "cited_text": "",
        } for url in urls],
    )

# ═══════════════════════════════════════════════════════════════════════════
# Groq Client (Whisper transcription + legacy text rollback)
# ═══════════════════════════════════════════════════════════════════════════

_groq_client = None

def get_groq_client():
    """Initializes and returns the Groq client if api_key is configured"""
    global _groq_client
    if _groq_client is not None:
        return _groq_client
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured in the application environment (.env file).")
    _groq_client = Groq(api_key=settings.GROQ_API_KEY)
    return _groq_client


def generate_content(prompt: str) -> str:
    """Generate text with Claude, or Groq while the rollback switch is active."""
    if settings.AI_TEXT_PROVIDER == "claude":
        return claude_generate_content(prompt, quality=False)
    client = get_groq_client()
    model = settings.GROQ_MODEL or "llama-3.3-70b-versatile"
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content


def generate_json(prompt: str) -> str:
    """Generates a JSON formatted string using Groq API with JSON mode"""
    client = get_groq_client()
    model = settings.GROQ_MODEL or "llama-3.3-70b-versatile"
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a helpful assistant that always responds in valid JSON format."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    return response.choices[0].message.content


# ═══════════════════════════════════════════════════════════════════════════
# Gemini Client (legacy rollback only)
# ═══════════════════════════════════════════════════════════════════════════

_gemini_client = None

def get_gemini_client():
    """Initializes and returns the Google GenAI client for Gemini."""
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured. Gemini API key is required.")
    _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_client


def gemini_generate_json(prompt: str) -> str:
    """Generates a JSON formatted string using Gemini API."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured. Gemini API key is required.")
    model = settings.GEMINI_MODEL or "gemini-2.5-flash"
    response = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": settings.GEMINI_API_KEY},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        },
        timeout=settings.AI_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return "".join(
        part.get("text", "")
        for part in response.json()["candidates"][0]["content"]["parts"]
    )


def is_gemini_available() -> bool:
    """Check if Gemini is available (API key configured)."""
    api_key = (settings.GEMINI_API_KEY or "").strip().lower()
    return bool(api_key and not api_key.startswith("your_") and not api_key.startswith("your-"))


def is_groq_available() -> bool:
    """Check if Groq is available (API key configured)."""
    api_key = (settings.GROQ_API_KEY or "").strip().lower()
    return bool(api_key and not api_key.startswith("your_") and not api_key.startswith("your-"))


def generate_json_with_failover(prompt: str, *, quality: bool = True) -> str:
    """Sinh JSON, thử lần lượt các nhà cung cấp đang cấu hình.

    Chọn nhà cung cấp một lần rồi thôi có nghĩa là hạn mức của một bên quyết
    định sống chết của cả tính năng: Gemini trả 429 thì luồng trích xuất tri
    thức dừng hẳn, dù Groq vẫn đang chạy tốt. Hạn mức miễn phí hết hằng ngày
    là chuyện thường, không phải sự cố hiếm.

    Thứ tự giữ nguyên như cũ (Gemini trước) để không đổi hành vi ở đường
    thuận lợi; chỉ khi Gemini hỏng mới chuyển sang Groq.
    """
    if settings.AI_TEXT_PROVIDER == "claude":
        try:
            # Background jobs already retry. Repeating here multiplied one 25s
            # provider timeout into minutes before failover could even start.
            return claude_generate_json(prompt, quality=quality, max_retries=0)
        except Exception as exc:  # noqa: BLE001 - provider lỗi thì dùng fallback đã cấu hình
            if not is_groq_available():
                raise
            logger.warning("Claude sinh JSON thất bại, thử Groq: %s", exc)
            return generate_json(prompt)

    lastest_error: Exception | None = None

    for ten, kha_dung, ham in (
        ("Gemini", is_gemini_available, gemini_generate_json),
        ("Groq", is_groq_available, generate_json),
    ):
        if not kha_dung():
            continue
        try:
            return ham(prompt)
        except Exception as exc:  # noqa: BLE001 - đổi nhà cung cấp với mọi lỗi
            lastest_error = exc
            logger.warning("%s sinh JSON thất bại, thử nhà cung cấp kế tiếp: %s", ten, exc)

    if lastest_error is not None:
        raise lastest_error
    raise RuntimeError(
        "Không có nhà cung cấp AI nào được cấu hình (cần GEMINI_API_KEY hoặc GROQ_API_KEY)."
    )


# ═══════════════════════════════════════════════════════════════════════════
# Cross-Evaluation logic (Dual AI Verification)
# ═══════════════════════════════════════════════════════════════════════════

def build_evaluation_prompt(questions_json: str, context: str) -> str:
    return f"""Bạn là một chuyên gia khảo thí độc lập. Nhiệm vụ của bạn là thẩm định danh sách câu hỏi dựa trên NỘI DUNG TÀI LIỆU GỐC.

YÊU CẦU THẨM ĐỊNH:
1. Đọc tài liệu gốc bên dưới để làm căn cứ đối chiếu.
2. Với từng câu hỏi trong danh sách, hãy kiểm tra:
   - Câu hỏi có đúng kiến thức từ tài liệu không? Nếu tự suy diễn, bịa đặt hoặc dùng kiến thức ngoài tài liệu → Đánh giá verdict = "invalid".
   - Đáp án đúng (correct_answer) có thực sự chính xác theo tài liệu không?
   - Cho điểm (score) từ 1 đến 5 (1: Tệ/Hallucination, 5: Xuất sắc, sát tài liệu nhất).

NỘI DUNG TÀI LIỆU GỐC:
--- BẮT ĐẦU TÀI LIỆU ---
{context}
--- KẾT THÚC TÀI LIỆU ---

DANH SÁCH CÂU HỎI CẦN KIỂM TRA:
{questions_json}

TRẢ VỀ JSON theo format chính xác sau:
{{
  "validations": [
    {{
      "index": 0,
      "verdict": "valid",
      "score": 5,
      "reason": "Giải thích chi tiết lý do..."
    }},
    {{
      "index": 1,
      "verdict": "invalid",
      "score": 1,
      "reason": "Lý do vì sao câu hỏi bị coi là hallucination hoặc sai thông tin..."
    }}
  ]
}}

LƯU Ý: Chỉ trả về đúng JSON, không thêm lời chào hay định dạng markdown khác."""


def evaluate_questions_groq(questions: list[dict], context: str) -> list[dict]:
    """Uses Groq (Llama-3) to evaluate all questions."""
    questions_json = json.dumps(questions, ensure_ascii=False, indent=2)
    prompt = build_evaluation_prompt(questions_json, context)
    try:
        raw = generate_json(prompt)
        res = json.loads(raw)
        return res.get("validations", [])
    except Exception as e:
        logger.error(f"Groq validation failed: {e}")
        return [{"index": i, "verdict": "valid", "score": 3, "reason": "Fallback due to error."} for i in range(len(questions))]


def evaluate_questions_gemini(questions: list[dict], context: str) -> list[dict]:
    """Uses Gemini to evaluate all questions."""
    questions_json = json.dumps(questions, ensure_ascii=False, indent=2)
    prompt = build_evaluation_prompt(questions_json, context)
    try:
        raw = gemini_generate_json(prompt)
        res = json.loads(raw)
        return res.get("validations", [])
    except Exception as e:
        logger.error(f"Gemini validation failed: {e}")
        return [{"index": i, "verdict": "valid", "score": 3, "reason": "Fallback due to error."} for i in range(len(questions))]


# ═══════════════════════════════════════════════════════════════════════════
# Bloom's Taxonomy Auto-Classification
# ═══════════════════════════════════════════════════════════════════════════

BLOOM_CLASSIFICATION_PROMPT = """Bạn là chuyên gia giáo dục. Nhiệm vụ: phân loại từng câu hỏi theo thang Bloom's Taxonomy.

Các cấp độ:
- "remember": Nhận biết — ghi nhớ, nhận diện, liệt kê sự kiện/khái niệm
- "understand": Thông hiểu — giải thích, so sánh, tóm tắt, diễn giải
- "apply": Vận dụng — áp dụng kiến thức vào tình huống cụ thể, tính toán
- "analyze": Vận dụng cao — phân tích, đánh giá, suy luận, sáng tạo

DANH SÁCH CÂU HỎI:
{questions_json}

Trả về JSON:
{{
  "classifications": [
    {{"index": 0, "bloom_level": "remember"}},
    {{"index": 1, "bloom_level": "understand"}}
  ]
}}

Chỉ trả JSON, không thêm gì khác."""


def classify_bloom_levels(questions: list[dict]) -> list[dict]:
    """
    Phân loại tự động cấp độ Bloom cho danh sách câu hỏi.
    Sử dụng Gemini (ưu tiên) hoặc Groq để phân loại.
    
    Returns:
        [{"index": 0, "bloom_level": "remember"}, ...]
    """
    questions_json = json.dumps(
        [{"index": i, "question": q.get("question", "")} for i, q in enumerate(questions)],
        ensure_ascii=False, indent=2
    )
    prompt = BLOOM_CLASSIFICATION_PROMPT.format(questions_json=questions_json)
    
    try:
        if settings.AI_TEXT_PROVIDER == "claude":
            raw = claude_generate_json(prompt, quality=False)
        elif is_gemini_available():
            raw = gemini_generate_json(prompt)
        elif is_groq_available():
            raw = generate_json(prompt)
        else:
            return []
        
        res = json.loads(raw)
        classifications = res.get("classifications", [])
        logger.info(f"🎓 Bloom classification completed for {len(classifications)} questions")
        return classifications
    except Exception as e:
        logger.error(f"Bloom classification failed: {e}")
        # Fallback: assign default levels
        return [{"index": i, "bloom_level": "understand"} for i in range(len(questions))]


def label_cluster_names(clusters: list[dict], doc_previews: dict[str, str]) -> list[dict]:
    """
    Sử dụng AI để tự động đặt tên cho mỗi cụm tài liệu.
    
    Args:
        clusters: Danh sách cụm từ K-Means
        doc_previews: Dict mapping document_id -> text preview (200 ký tự đầu)
    
    Returns:
        clusters với thêm trường "label" cho mỗi cụm
    """
    if not clusters or not doc_previews:
        return clusters
    
    # Build cluster descriptions
    cluster_desc = []
    for cluster in clusters:
        docs_text = []
        for doc_id in cluster.get("document_ids", [])[:5]:  # Max 5 docs per cluster for prompt
            preview = doc_previews.get(doc_id, "")
            if preview:
                docs_text.append(f"- {preview[:200]}")
        cluster_desc.append({
            "cluster_id": cluster["cluster_id"],
            "doc_previews": "\n".join(docs_text)
        })
    
    prompt = f"""Dựa trên nội dung tóm tắt của các tài liệu trong mỗi cụm, hãy đặt tên chủ đề ngắn gọn (2-5 từ) cho từng cụm.

{json.dumps(cluster_desc, ensure_ascii=False, indent=2)}

Trả về JSON:
{{
  "labels": [
    {{"cluster_id": 0, "label": "Tên chủ đề"}},
    {{"cluster_id": 1, "label": "Tên chủ đề"}}
  ]
}}

Chỉ trả JSON, không thêm gì khác."""
    
    try:
        if settings.AI_TEXT_PROVIDER == "claude":
            raw = claude_generate_json(prompt, quality=False)
        elif is_gemini_available():
            raw = gemini_generate_json(prompt)
        elif is_groq_available():
            raw = generate_json(prompt)
        else:
            return clusters
        
        res = json.loads(raw)
        labels = {item["cluster_id"]: item["label"] for item in res.get("labels", [])}
        
        for cluster in clusters:
            cluster["label"] = labels.get(cluster["cluster_id"], f"Cụm {cluster['cluster_id'] + 1}")
        
        return clusters
    except Exception as e:
        logger.error(f"Cluster labeling failed: {e}")
        for cluster in clusters:
            cluster["label"] = f"Cụm {cluster['cluster_id'] + 1}"
        return clusters


# ═══════════════════════════════════════════════════════════════════════════
# Audio / Video Processing (ffmpeg + Groq Whisper)
# ═══════════════════════════════════════════════════════════════════════════

def _has_audio_stream(video_path: str) -> bool:
    """Check if a video file contains an audio stream using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", video_path],
            capture_output=True, text=True, timeout=30
        )
        return "audio" in result.stdout
    except Exception:
        return False


def _extract_audio(video_path: str) -> str:
    """Extracts audio from a video file using ffmpeg, returns path to temporary audio file."""
    if not _has_audio_stream(video_path):
        raise ValueError(
            "Video này không chứa audio. Không thể trích xuất âm thanh để transcribe. "
            "Vui lòng upload video có âm thanh hoặc tài liệu text (PDF/DOCX/PPTX)."
        )
    audio_path = tempfile.mktemp(suffix=".mp3")
    try:
        subprocess.run(
            ["ffmpeg", "-i", video_path, "-vn", "-acodec", "libmp3lame", "-q:a", "4", "-y", audio_path],
            capture_output=True, check=True, timeout=300
        )
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg is not installed. Please install it: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)"
        )
    except subprocess.CalledProcessError as e:
        stderr_text = e.stderr.decode() if e.stderr else "Unknown error"
        error_lines = [line for line in stderr_text.strip().split('\n') if line.strip() and not line.startswith(' ')]
        brief_error = '\n'.join(error_lines[-3:]) if error_lines else stderr_text[-500:]
        raise RuntimeError(f"ffmpeg failed to extract audio: {brief_error}")
    return audio_path


def generate_json_with_file(prompt: str, file_path: str) -> str:
    """Extracts audio from video, transcribes with Groq Whisper, then generates JSON based on transcript."""
    client = get_groq_client()
    model = settings.GROQ_MODEL or "llama-3.3-70b-versatile"
    audio_path = None

    try:
        # 1. Extract audio from video
        logger.info(f"Extracting audio from video {file_path} using ffmpeg...")
        audio_path = _extract_audio(file_path)

        # 2. Transcribe audio with Groq Whisper
        logger.info("Transcribing audio with Groq Whisper API (whisper-large-v3)...")
        with open(audio_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file,
                language="vi"
            )
        transcript = transcription.text
        if not transcript or not transcript.strip():
            raise ValueError("Groq Whisper returned an empty transcript for this video.")
        logger.info(f"Transcript length: {len(transcript)} characters")

        # 3. Combine transcript with prompt and generate JSON
        combined_prompt = f"""Dưới đây là nội dung được trích xuất từ video:

--- BẮT ĐẦU NỘI DUNG VIDEO ---
{transcript}
--- KẾT THÚC NỘI DUNG VIDEO ---

{prompt}"""

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that always responds in valid JSON format."},
                {"role": "user", "content": combined_prompt}
            ],
            response_format={"type": "json_object"}
        )
        return response.choices[0].message.content
    finally:
        # Clean up temporary audio file
        if audio_path:
            try:
                Path(audio_path).unlink(missing_ok=True)
            except Exception as cleanup_err:
                logger.warning(f"Failed to delete temporary audio file: {cleanup_err}")


def transcribe_video(file_path: str) -> str:
    """Extracts audio from video using ffmpeg and transcribes using Groq Whisper API."""
    client = get_groq_client()
    audio_path = None

    try:
        # 1. Extract audio
        logger.info(f"Extracting audio from video {file_path} for transcription...")
        audio_path = _extract_audio(file_path)

        # 2. Transcribe with Groq Whisper
        logger.info("Transcribing with Groq Whisper API (whisper-large-v3)...")
        with open(audio_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file,
                language="vi"
            )
        transcript = (transcription.text or "").strip()
        if not transcript:
            raise ValueError("Groq Whisper returned an empty transcript for this video.")
        return transcript
    finally:
        # Clean up temporary audio file
        if audio_path:
            try:
                Path(audio_path).unlink(missing_ok=True)
            except Exception as cleanup_err:
                logger.warning(f"Failed to delete temporary audio file: {cleanup_err}")


# ═══════════════════════════════════════════════════════════════════════════
# Embeddings (Gemini text-embedding-004 — Completely Free)
# ═══════════════════════════════════════════════════════════════════════════

def get_embedding(text: str) -> list[float]:
    """Generates a vector embedding for a single text input using Gemini embeddings"""
    client = get_gemini_client()
    response = client.models.embed_content(
        model="text-embedding-004",
        contents=text
    )
    return response.embedding.values


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generates vector embeddings for a list of text inputs using Gemini embeddings (batch)"""
    client = get_gemini_client()
    response = client.models.embed_content(
        model="text-embedding-004",
        contents=texts
    )
    return [item.values for item in response.embeddings]
