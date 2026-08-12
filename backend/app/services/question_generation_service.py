import json
import logging
from datetime import datetime, timezone
from bson import ObjectId
from app.database.mongodb import get_database
from app.services.llm_service import (
    generate_json,
    gemini_generate_json,
    generate_json_with_file,
    is_gemini_available,
    is_groq_available,
    evaluate_questions_groq,
    evaluate_questions_gemini,
    classify_bloom_levels,
)
from app.services.tfidf_service import extract_keywords
from app.services.question_diversity_service import select_diverse_questions

logger = logging.getLogger(__name__)

BLOOM_INSTRUCTIONS = {
    "remember": """Mức vận dụng: NHẬN BIẾT (Remember)
- Câu hỏi tập trung vào khả năng ghi nhớ, nhận diện, liệt kê các khái niệm/sự kiện/dữ liệu cụ thể từ tài liệu.
- Sử dụng các động từ: liệt kê, nêu, xác định, nhận biết, gọi tên, mô tả.
- Ví dụ: "Hãy nêu...", "Đâu là...", "Liệt kê...""",
    "understand": """Mức vận dụng: THÔNG HIỂU (Understand)
- Câu hỏi đánh giá khả năng giải thích, so sánh, tóm tắt, diễn giải ý nghĩa của thông tin trong tài liệu.
- Sử dụng các động từ: giải thích, so sánh, phân biệt, tóm tắt, diễn giải.
- Ví dụ: "Giải thích tại sao...", "So sánh... và...", "Tóm tắt...""",
    "apply": """Mức vận dụng: VẬN DỤNG (Apply)
- Câu hỏi yêu cầu áp dụng kiến thức từ tài liệu vào tình huống cụ thể hoặc bài toán thực tiễn.
- Sử dụng các động từ: áp dụng, tính toán, giải quyết, minh họa, sử dụng.
- Ví dụ: "Áp dụng... để giải quyết...", "Trong tình huống... sẽ...""",
    "analyze": """Mức vận dụng: VẬN DỤNG CAO (Analyze/Evaluate/Create)
- Câu hỏi đòi hỏi phân tích, đánh giá, suy luận, hoặc tổng hợp sáng tạo dựa trên nội dung tài liệu.
- Sử dụng các động từ: phân tích, đánh giá, so sánh ưu nhược điểm, lập luận, đề xuất.
- Ví dụ: "Phân tích mối quan hệ...", "Đánh giá tính hiệu quả...", "Đề xuất giải pháp...""",
}

def build_bloom_instruction(bloom_level: str | None) -> str:
    if not bloom_level or bloom_level not in BLOOM_INSTRUCTIONS:
        return ""
    return f"\n7. YÊU CẦU VỀ MỨC VẬN DỤNG BLOOM:\n{BLOOM_INSTRUCTIONS[bloom_level]}\n"

def build_question_prompt(context: str, question_count: int, difficulty: str, question_type: str, bloom_level: str | None = None, keywords: list[dict] | None = None) -> str:
    """Builds a structured prompt demanding JSON response matching the question type and difficulty constraints."""
    bloom_instruction = build_bloom_instruction(bloom_level)
    
    # TF-IDF keyword instruction
    keyword_instruction = ""
    if keywords:
        kw_list = ", ".join([kw["keyword"] for kw in keywords[:10]])
        keyword_instruction = f"""\n8. TỪ KHÓA TRỌNG TÂM (trích xuất bởi thuật toán TF-IDF):\n   Các từ khóa quan trọng nhất của tài liệu: [{kw_list}]\n   Hãy ưu tiên sinh câu hỏi xoay quanh các từ khóa trọng tâm này để đảm bảo câu hỏi sát với nội dung cốt lõi nhất của tài liệu.\n"""
    
    return f"""
Bạn là một chuyên gia khảo thí và đánh giá năng lực học sinh/sinh viên. 
Nhiệm vụ của bạn là sinh ra đúng {question_count} câu hỏi đánh giá năng lực hoàn toàn dựa vào tài liệu học liệu dưới đây.

Yêu cầu bắt buộc:
1. Đọc kỹ phần nội dung tài liệu (context) được cung cấp.
2. Chỉ sử dụng thông tin trực tiếp từ tài liệu này để sinh câu hỏi. Tuyệt đối không tự bịa đặt, suy diễn ngoài tài liệu hoặc dùng kiến thức bên ngoài tài liệu.
3. Các câu hỏi sinh ra phải có độ khó là: '{difficulty}' (easy, medium, hard).
4. Thể loại câu hỏi phải là: '{question_type}'. Các loại câu hỏi được hỗ trợ:
   - 'multiple_choice': câu hỏi trắc nghiệm khách quan với 4 lựa chọn (A, B, C, D). correct_answer phải là một trong các chữ cái "A", "B", "C", "D".
   - 'true_false': câu hỏi Đúng/Sai. correct_answer phải là "True" hoặc "False". options phải có 2 lựa chọn: {{"A": "Đúng", "B": "Sai"}}.
   - 'short_answer': câu hỏi tự luận ngắn hoặc điền khuyết. options phải là null hoặc rỗng. correct_answer là đáp án ngắn/từ khóa chính xác.
5. Mỗi câu hỏi phải có phần giải thích (explanation) chi tiết, trích dẫn nội dung từ tài liệu chứng minh cho đáp án đó.
6. Trả về kết quả dưới dạng JSON Array hợp lệ chứa các object câu hỏi. Không kèm bất kỳ giải thích nào bên ngoài JSON.
7. QUAN TRỌNG - CHỈ HỎI VỀ KIẾN THỨC CHUYÊN MÔN:
   - Chỉ đặt câu hỏi về NỘI DUNG KIẾN THỨC, KHÁI NIỆM KHOA HỌC, SỰ KIỆN, LÝ THUYẾT, QUY TRÌNH, CÔNG THỨC được trình bày trong tài liệu.
   - TUYỆT ĐỐI KHÔNG đặt câu hỏi về:
     + Cấu trúc, bố cục, cách trình bày của tài liệu (ví dụ: "Tài liệu trình bày theo thứ tự gì?", "Tài liệu giải thích từ A đến Z nghĩa là gì?")
     + Tác giả, nguồn gốc, mục đích viết tài liệu
     + Lời mời theo dõi kênh, đăng ký, chia sẻ, bình luận
     + Lời chào, lời giới thiệu, lời cảm ơn, quảng cáo
     + Bất kỳ nội dung meta-information nào không phải kiến thức chuyên môn
   - Ví dụ SAI: "Tài liệu khẳng định rằng quá trình quang hợp được giải thích 'từ A đến Z'. Diễn giải ý nghĩa cụm từ này."
   - Ví dụ ĐÚNG: "Pha sáng của quá trình quang hợp diễn ra ở đâu trong lục lạp?"
{bloom_instruction}{keyword_instruction}
Định dạng JSON Schema của kết quả trả về như sau:
[
  {{
    "question": "Nội dung câu hỏi...",
    "options": {{
      "A": "Lựa chọn A...",
      "B": "Lựa chọn B...",
      "C": "Lựa chọn C...",
      "D": "Lựa chọn D..."
    }},
    "correct_answer": "A/True/False/ShortAnswerText",
    "explanation": "Giải thích tại sao đáp án này đúng dựa trên tài liệu...",
    "difficulty": "{difficulty}",
    "question_type": "{question_type}"
  }}
]

---
NỘI DUNG TÀI LIỆU HỌC LIỆU (CONTEXT):
{context}
---
"""

def build_video_question_prompt(question_count: int, difficulty: str, question_type: str, bloom_level: str | None = None) -> str:
    """Builds a structured prompt demanding JSON response matching the question type and difficulty constraints for video inputs."""
    bloom_instruction = build_bloom_instruction(bloom_level)
    return f"""
Bạn là một chuyên gia khảo thí và đánh giá năng lực học sinh/sinh viên. 
Nhiệm vụ của bạn là xem và phân tích kỹ nội dung video được cung cấp ở trên, sau đó sinh ra đúng {question_count} câu hỏi đánh giá năng lực dựa vào nội dung trong video.

Yêu cầu bắt buộc:
1. Xem và hiểu rõ toàn bộ nội dung âm thanh và hình ảnh của video.
2. Chỉ sử dụng thông tin trực tiếp từ video này để sinh câu hỏi. Tuyệt đối không tự bịa đặt, suy diễn ngoài video hoặc dùng kiến thức bên ngoài video.
3. Các câu hỏi sinh ra phải có độ khó là: '{difficulty}' (easy, medium, hard).
4. Thể loại câu hỏi phải là: '{question_type}'. Các loại câu hỏi được hỗ trợ:
   - 'multiple_choice': câu hỏi trắc nghiệm khách quan với 4 lựa chọn (A, B, C, D). correct_answer phải là một trong các chữ cái "A", "B", "C", "D".
   - 'true_false': câu hỏi Đúng/Sai. correct_answer phải là "True" hoặc "False". options phải có 2 lựa chọn: {{"A": "Đúng", "B": "Sai"}}.
   - 'short_answer': câu hỏi tự luận ngắn hoặc điền khuyết. options phải là null hoặc rỗng. correct_answer là đáp án ngắn/từ khóa chính xác.
5. Mỗi câu hỏi phải có phần giải thích (explanation) chi tiết, trích dẫn rõ mốc thời gian hoặc nội dung trong video chứng minh cho đáp án đó.
6. TUYỆT ĐỐI KHÔNG đưa các mốc thời gian cụ thể (ví dụ: 'ở mốc 0:01', 'ở giây thứ 10', 'từ 0:02 đến 0:04') vào trong câu hỏi hoặc các phương án lựa chọn (options). Câu hỏi và các phương án phải hoàn toàn tập trung vào nội dung kiến thức, khái niệm khoa học, hoặc diễn biến được trình bày (ví dụ thay vì hỏi 'Cấu trúc ở mốc 0:01 là gì?' thì hỏi 'Cấu trúc sắc tố hấp thụ ánh sáng trong màng tế bào được dán nhãn là gì?'). Các mốc thời gian chỉ được xuất hiện ở phần giải thích (explanation) để minh chứng cho đáp án.
7. QUAN TRỌNG - CHỈ HỎI VỀ KIẾN THỨC CHUYÊN MÔN:
   - Chỉ đặt câu hỏi về NỘI DUNG KIẾN THỨC, KHÁI NIỆM KHOA HỌC, SỰ KIỆN, LÝ THUYẾT, QUY TRÌNH, CÔNG THỨC, HIỆN TƯỢNG được giảng dạy/trình bày trong video.
   - TUYỆT ĐỐI KHÔNG đặt câu hỏi về:
     + Lời mời theo dõi kênh, đăng ký (subscribe), chia sẻ, like, bình luận, bell notification
     + Tên kênh YouTube, tên người tạo video, lời chào, lời giới thiệu bản thân
     + Cấu trúc, bố cục, cách trình bày của video (ví dụ: "Video trình bày từ A đến Z nghĩa là gì?")
     + Quảng cáo, tài trợ, liên kết, mã giảm giá trong video
     + Phụ đề, giao diện, hiệu ứng, nhạc nền, chất lượng video
     + Bất kỳ nội dung meta-information nào không phải kiến thức chuyên môn
   - Ví dụ SAI: "Mục đích của việc khuyến khích người xem theo dõi kênh là gì?"
   - Ví dụ SAI: "Video trình bày quang hợp 'từ A đến Z' có nghĩa là gì?"
   - Ví dụ ĐÚNG: "Pha sáng của quá trình quang hợp diễn ra ở đâu trong lục lạp?"
   - Ví dụ ĐÚNG: "Sản phẩm cuối cùng của chu trình Calvin là gì?"
8. Trả về kết quả dưới dạng JSON Array hợp lệ chứa các object câu hỏi. Không kèm bất kỳ giải thích nào bên ngoài JSON.
{bloom_instruction}
Định dạng JSON Schema của kết quả trả về như sau:
[
  {{
    "question": "Nội dung câu hỏi...",
    "options": {{
      "A": "Lựa chọn A...",
      "B": "Lựa chọn B...",
      "C": "Lựa chọn C...",
      "D": "Lựa chọn D..."
    }},
    "correct_answer": "A/True/False/ShortAnswerText",
    "explanation": "Giải thích tại sao đáp án này đúng dựa trên video...",
    "difficulty": "{difficulty}",
    "question_type": "{question_type}"
  }}
]
"""

async def download_file(url: str, dest_path: str):
    import os
    import shutil
    if url.startswith("local://") or os.path.exists(url.replace("local://", "")):
        local_path = url.replace("local://", "")
        shutil.copy(local_path, dest_path)
        return
        
    import httpx
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(dest_path, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)


def parse_raw_questions(raw_json: str) -> list[dict]:
    """Helper to safely parse LLM json outputs into question lists."""
    if not raw_json or not raw_json.strip():
        return []
    try:
        data = json.loads(raw_json)
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, list):
                    return value
            return []
        if isinstance(data, list):
            return data
    except Exception:
        try:
            start_idx = raw_json.find('[')
            end_idx = raw_json.rfind(']')
            if start_idx != -1 and end_idx != -1:
                return json.loads(raw_json[start_idx:end_idx+1])
        except Exception:
            pass
    return []


async def generate_questions(
    document_id: str,
    user_id: str,
    question_count: int,
    difficulty: str,
    question_type: str,
    bloom_level: str | None = None
) -> dict:
    """
    Dual-Gen & Dual-Val Question Generation pipeline:
    1. Groq & Gemini concurrently generate N questions each.
    2. Combined pool of questions (2N) is evaluated by BOTH Groq and Gemini.
    3. Invalid/hallucinated questions are filtered out.
    4. Top N questions with highest average score are selected.
    """
    db = get_database()
    
    document = await db["documents"].find_one({"_id": ObjectId(document_id)})
    if not document:
        raise FileNotFoundError("Document not found.")

    has_transcript = False
    if document.get("media_kind") == "video":
        content_doc = await db["document_contents"].find_one({"document_id": document_id})
        if content_doc and content_doc.get("extracted_text"):
            has_transcript = True

    context = ""
    chunks_list = []
    if document.get("media_kind") == "document" or has_transcript:
        cursor = db["document_chunks"].find({"document_id": document_id}).sort("chunk_index", 1)
        chunks_list = [doc["content"] async for doc in cursor]
        if not chunks_list:
            content_doc = await db["document_contents"].find_one({"document_id": document_id})
            if content_doc:
                chunks_list = [content_doc["extracted_text"]]
            else:
                raise ValueError("Nội dung học liệu chưa được trích xuất hoặc lập chỉ mục.")
        context = "\n\n".join(chunks_list)

    # ── Step 0: TF-IDF Keyword Extraction ──
    keywords = []
    if chunks_list:
        logger.info("📊 Running TF-IDF keyword extraction...")
        keywords = extract_keywords(chunks_list, top_n=15)

    # Step 1: Dual Generation
    groq_questions = []
    gemini_questions = []

    # Prepare prompt
    if document.get("media_kind") == "document" or has_transcript:
        prompt = build_question_prompt(context, question_count, difficulty, question_type, bloom_level, keywords=keywords)
        
        # Groq generation
        if is_groq_available():
            logger.info("🤖 Groq is generating questions...")
            try:
                raw_groq = generate_json(prompt)
                groq_questions = parse_raw_questions(raw_groq)
                logger.info(f"  ✅ Groq successfully generated {len(groq_questions)} questions")
            except Exception as e:
                logger.error(f"  ❌ Groq generation failed: {e}")

        # Gemini generation
        if is_gemini_available():
            logger.info("🤖 Gemini is generating questions...")
            try:
                raw_gemini = gemini_generate_json(prompt)
                gemini_questions = parse_raw_questions(raw_gemini)
                logger.info(f"  ✅ Gemini successfully generated {len(gemini_questions)} questions")
            except Exception as e:
                logger.error(f"  ❌ Gemini generation failed: {e}")
    else:
        # Direct video generation (runs on Groq's whisper backend)
        if not document.get("cloudinary_url"):
            raise ValueError("Video URL is missing.")
            
        import uuid
        import os
        from pathlib import Path
        
        temp_dir = Path(__file__).resolve().parents[1] / "uploads"
        temp_dir.mkdir(parents=True, exist_ok=True)
        orig_ext = Path(document.get('original_filename', 'video.mp4')).suffix or '.mp4'
        temp_file_path = temp_dir / f"temp_gen_{uuid.uuid4()}{orig_ext}"
        
        try:
            logger.info(f"Downloading video from {document['cloudinary_url']}...")
            await download_file(document["cloudinary_url"], str(temp_file_path))
            
            prompt = build_video_question_prompt(question_count, difficulty, question_type, bloom_level)
            if is_groq_available():
                logger.info("🤖 Groq is generating questions from video...")
                raw_groq = generate_json_with_file(prompt, str(temp_file_path))
                groq_questions = parse_raw_questions(raw_groq)
                logger.info(f"  ✅ Groq generated {len(groq_questions)} questions from video")
        except Exception as e:
            logger.error(f"Failed to generate questions from video: {e}")
            raise ValueError(f"Failed to generate questions from video: {str(e)}")
        finally:
            if temp_file_path.exists():
                os.remove(temp_file_path)

    # Combine pools
    questions_pool = []
    # Deduplicate basic duplicates (based on question text)
    seen_texts = set()
    for q in (groq_questions + gemini_questions):
        q_text = q.get("question", "").strip().lower()
        if q_text and q_text not in seen_texts:
            seen_texts.add(q_text)
            questions_pool.append(q)

    if not questions_pool:
        raise ValueError("Không thể sinh câu hỏi từ các mô hình AI. Vui lòng kiểm tra lại cấu hình API.")

    # Step 2: Dual Cross-Validation
    validation_stats = {
        "cross_validated": False,
        "total_generated": len(questions_pool),
        "valid_count": 0,
        "invalid_count": 0,
        "fixed_count": 0,
        "replaced_count": 0,
        "validator": "groq+gemini",
    }

    final_questions = []

    # Check if both APIs are available for cross-validation
    if is_gemini_available() and is_groq_available():
        logger.info(f"🔍 Starting dual AI evaluation on {len(questions_pool)} candidate questions...")
        validation_stats["cross_validated"] = True
        
        val_context = context if (document.get("media_kind") == "document" or has_transcript) else "(Video content - context not parsed for validation)"

        # Groq evaluates the pool
        groq_eval = evaluate_questions_groq(questions_pool, val_context)
        # Gemini evaluates the pool
        gemini_eval = evaluate_questions_gemini(questions_pool, val_context)

        # Merge evaluations by index
        evaluated_pool = []
        for idx, question in enumerate(questions_pool):
            # Default fallback values
            g_verdict = "valid"
            g_score = 3
            m_verdict = "valid"
            m_score = 3

            # Look up Groq eval
            for ev in groq_eval:
                if ev.get("index") == idx:
                    g_verdict = ev.get("verdict", "valid")
                    g_score = ev.get("score", 3)
                    break

            # Look up Gemini eval
            for ev in gemini_eval:
                if ev.get("index") == idx:
                    m_verdict = ev.get("verdict", "valid")
                    m_score = ev.get("score", 3)
                    break

            # A question is rejected if EITHER model marks it as invalid
            is_valid = (g_verdict == "valid" and m_verdict == "valid")
            avg_score = (float(g_score) + float(m_score)) / 2.0

            if is_valid:
                question["g_verdict"] = g_verdict
                question["g_score"] = g_score
                question["m_verdict"] = m_verdict
                question["m_score"] = m_score
                question["avg_score"] = avg_score
                evaluated_pool.append({
                    "question": question,
                    "avg_score": avg_score
                })
            else:
                validation_stats["invalid_count"] += 1
                logger.warning(f"  ❌ Rejected Question {idx} (Groq: {g_verdict}, Gemini: {m_verdict}) - {question.get('question')[:50]}...")

        # Sort valid questions by their average score descending
        evaluated_pool.sort(key=lambda x: x["avg_score"], reverse=True)
        final_questions = [item["question"] for item in evaluated_pool]
        
        validation_stats["valid_count"] = len(final_questions)
        logger.info(f"📊 Evaluated pool size: {len(final_questions)} valid questions after filtration")
    else:
        # Fallback to no cross-validation if only one API is present
        final_questions = questions_pool
        validation_stats["valid_count"] = len(final_questions)
        logger.info("ℹ️ Groq or Gemini not fully configured - skipping cross-validation")

    # ── Select the requested count — K-Means khử trùng lặp ngữ nghĩa ──
    # Bước khử trùng ở trên chỉ so khớp chuỗi chính xác, không bắt được các
    # câu khác chữ nhưng cùng ý. Phân cụm embedding rồi mỗi cụm giữ một câu
    # để `question_count` câu cuối trải đều nội dung tài liệu.
    selected_questions, diversity_stats = select_diverse_questions(final_questions, question_count)
    validation_stats["diversity"] = diversity_stats
    if diversity_stats.get("applied"):
        logger.info(
            f"🎯 K-Means chọn {diversity_stats['selected']}/{diversity_stats['pool_size']} câu đa dạng "
            f"(bỏ {diversity_stats['duplicates_dropped']} câu trùng ý, embedding: {diversity_stats.get('embedding_model')})"
        )

    # If we don't have enough questions, fallback to using all questions in pool
    if len(selected_questions) < question_count:
        logger.warning(f"⚠️ Requested {question_count} questions but only {len(selected_questions)} survived verification. Returning all verified ones.")

    # ── Step 3: Bloom's Taxonomy Auto-Classification ──
    bloom_distribution = {}
    if selected_questions:
        logger.info("🎓 Running Bloom's Taxonomy auto-classification...")
        try:
            bloom_results = classify_bloom_levels(selected_questions)
            bloom_map = {item["index"]: item["bloom_level"] for item in bloom_results}
            
            for idx, q in enumerate(selected_questions):
                level = bloom_map.get(idx, "understand")
                # Validate level
                if level not in ("remember", "understand", "apply", "analyze"):
                    level = "understand"
                q["bloom_level"] = level
                q.setdefault("tags", [])
                q.setdefault("status", "draft")
                bloom_distribution[level] = bloom_distribution.get(level, 0) + 1
            
            logger.info(f"📊 Bloom distribution: {bloom_distribution}")
        except Exception as e:
            logger.error(f"Bloom classification failed, using defaults: {e}")
            for q in selected_questions:
                q["bloom_level"] = "understand"
                q.setdefault("tags", [])
                q.setdefault("status", "draft")
            bloom_distribution = {"understand": len(selected_questions)}

    for q in selected_questions:
        q.setdefault("tags", [])
        q.setdefault("status", "draft")
        # Reuse the dual-provider cross-validation score (if it ran) as an honest
        # hallucination-risk signal instead of leaving it permanently null. When
        # only one provider is configured there is no cross-validation score, so
        # the risk is reported as "unknown" rather than fabricated.
        avg_score = q.get("avg_score")
        if avg_score is None:
            q["hallucination_risk"] = "unknown"
        elif avg_score >= 4:
            q["hallucination_risk"] = "low"
        elif avg_score >= 2.5:
            q["hallucination_risk"] = "medium"
        else:
            q["hallucination_risk"] = "high"

    # 4. Save to MongoDB
    now = datetime.now(timezone.utc)
    question_set = {
        "document_id": document_id,
        "user_id": user_id,
        "document_name": document.get("original_filename", "Tài liệu không tên"),
        "question_count": len(selected_questions),
        "difficulty": difficulty,
        "question_type": question_type,
        "questions": selected_questions,
        "validation_stats": validation_stats,
        "keywords": keywords,
        "bloom_distribution": bloom_distribution,
        "workflow_counts": {
            "approved": 0,
            "draft": len(selected_questions),
            "published": 0,
            "review_pending": 0,
        },
        "published_question_count": 0,
        "created_at": now,
        "updated_at": now
    }
    
    result = await db["question_sets"].insert_one(question_set)
    question_set["_id"] = str(result.inserted_id)

    return question_set


async def regenerate_single_question(
    document_id: str,
    difficulty: str,
    question_type: str,
    bloom_level: str | None = None,
    avoid_question_texts: list[str] | None = None,
    database=None,
) -> dict:
    """Generate ONE replacement question from the same document, preserving the
    original question's difficulty/type/bloom level. Unlike the bulk `generate_questions`
    pipeline, this uses a single available provider (no dual cross-validation) —
    reasonable for a one-off admin regeneration rather than a full re-run of the
    dual-generation/dual-validation pipeline. Only supports text documents (and
    videos with an existing transcript); does not re-download/re-transcribe video.
    """
    db = database if database is not None else get_database()
    document = await db["documents"].find_one({"_id": ObjectId(document_id)})
    if not document:
        raise FileNotFoundError("Document not found.")

    cursor = db["document_chunks"].find({"document_id": document_id}).sort("chunk_index", 1)
    chunks_list = [doc["content"] async for doc in cursor]
    if not chunks_list:
        content_doc = await db["document_contents"].find_one({"document_id": document_id})
        if content_doc and content_doc.get("extracted_text"):
            chunks_list = [content_doc["extracted_text"]]
        else:
            raise ValueError("Nội dung học liệu chưa được trích xuất hoặc lập chỉ mục.")
    context = "\n\n".join(chunks_list)

    keywords = extract_keywords(chunks_list, top_n=15) if chunks_list else []
    prompt = build_question_prompt(context, 1, difficulty, question_type, bloom_level, keywords=keywords)

    avoid_set = {text.strip().lower() for text in (avoid_question_texts or []) if text}
    candidates: list[dict] = []
    if is_groq_available():
        try:
            candidates = parse_raw_questions(generate_json(prompt))
        except Exception as e:
            logger.error(f"Groq single-question regeneration failed: {e}")
    if not candidates and is_gemini_available():
        try:
            candidates = parse_raw_questions(gemini_generate_json(prompt))
        except Exception as e:
            logger.error(f"Gemini single-question regeneration failed: {e}")

    if not candidates:
        raise ValueError("Không thể sinh lại câu hỏi từ các mô hình AI. Vui lòng kiểm tra lại cấu hình API.")

    chosen = next(
        (q for q in candidates if q.get("question", "").strip().lower() not in avoid_set),
        candidates[0],
    )
    chosen["tags"] = []
    chosen["status"] = "draft"
    chosen["hallucination_risk"] = "unknown"
    chosen.setdefault("bloom_level", bloom_level or "understand")
    chosen["reviewed_by"] = None
    chosen["reviewed_at"] = None
    chosen["published_at"] = None
    return chosen
