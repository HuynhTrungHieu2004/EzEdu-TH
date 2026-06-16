import json
import logging
from datetime import datetime, timezone
from bson import ObjectId
from app.database.mongodb import get_database
from app.services.llm_service import generate_json, generate_json_with_file

logger = logging.getLogger(__name__)

def build_question_prompt(context: str, question_count: int, difficulty: str, question_type: str) -> str:
    """Builds a structured prompt demanding JSON response matching the question type and difficulty constraints."""
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

def build_video_question_prompt(question_count: int, difficulty: str, question_type: str) -> str:
    """Builds a structured prompt demanding JSON response matching the question type and difficulty constraints for video inputs."""
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
7. Trả về kết quả dưới dạng JSON Array hợp lệ chứa các object câu hỏi. Không kèm bất kỳ giải thích nào bên ngoài JSON.

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

async def generate_questions(
    document_id: str,
    user_id: str,
    question_count: int,
    difficulty: str,
    question_type: str
) -> dict:
    """
    Loads chunks, prepares prompt, queries Gemini API, parses output, and saves
    the question set to the MongoDB 'question_sets' collection.
    """
    db = get_database()
    
    # Verify the document exists and fetch its metadata
    document = await db["documents"].find_one({"_id": ObjectId(document_id)})
    if not document:
        raise FileNotFoundError("Document not found.")

    has_transcript = False
    if document.get("media_kind") == "video":
        content_doc = await db["document_contents"].find_one({"document_id": document_id})
        if content_doc and content_doc.get("extracted_text"):
            has_transcript = True

    if document.get("media_kind") == "document" or has_transcript:
        # 1. Fetch document chunks
        cursor = db["document_chunks"].find({"document_id": document_id}).sort("chunk_index", 1)
        chunks = [doc["content"] async for doc in cursor]
        if not chunks:
            # Fallback to full extracted text from document_contents if chunks aren't indexed yet
            content_doc = await db["document_contents"].find_one({"document_id": document_id})
            if content_doc:
                chunks = [content_doc["extracted_text"]]
            else:
                raise ValueError("Nội dung học liệu chưa được trích xuất hoặc lập chỉ mục.")

        context = "\n\n".join(chunks)
        
        # 2. Build prompt and generate content using Gemini
        prompt = build_question_prompt(context, question_count, difficulty, question_type)
        raw_json = generate_json(prompt)
    else:
        # Direct video question generation fallback
        if not document.get("cloudinary_url"):
            raise ValueError("Video URL is missing or not uploaded to Cloudinary.")
            
        import uuid
        import os
        from pathlib import Path
        
        temp_dir = Path("/Users/macos/Documents/Zalo Received Files/chuyende02/backend/uploads")
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_file_path = temp_dir / f"temp_gen_{uuid.uuid4()}_{document.get('original_filename', 'video.mp4')}"
        
        try:
            # Download video locally
            logger.info(f"Downloading video from {document['cloudinary_url']} to {temp_file_path}...")
            await download_file(document["cloudinary_url"], str(temp_file_path))
            
            prompt = build_video_question_prompt(question_count, difficulty, question_type)
            raw_json = generate_json_with_file(prompt, str(temp_file_path))
        except Exception as e:
            logger.error(f"Error processing video question generation: {e}")
            raise ValueError(f"Failed to generate questions from video: {str(e)}")
        finally:
            if temp_file_path.exists():
                os.remove(temp_file_path)
    
    # 3. Safe JSON parsing
    try:
        questions_list = json.loads(raw_json)
        # Handle cases where response wraps the list in a dictionary
        if isinstance(questions_list, dict):
            for key, value in questions_list.items():
                if isinstance(value, list):
                    questions_list = value
                    break
    except Exception as parse_err:
        # Fallback regex-like substring parser
        try:
            start_idx = raw_json.find('[')
            end_idx = raw_json.rfind(']')
            if start_idx != -1 and end_idx != -1:
                questions_list = json.loads(raw_json[start_idx:end_idx+1])
            else:
                raise parse_err
        except Exception:
            raise ValueError(f"Gemini API returned an invalid JSON array format: {raw_json[:200]}...")

    if not isinstance(questions_list, list):
        raise ValueError("Failed to parse Gemini output as a valid question list.")

    # 4. Save to MongoDB
    now = datetime.now(timezone.utc)
    question_set = {
        "document_id": document_id,
        "user_id": user_id,
        "document_name": document.get("original_filename", "Tài liệu không tên"),
        "question_count": len(questions_list),
        "difficulty": difficulty,
        "question_type": question_type,
        "questions": questions_list,
        "created_at": now,
        "updated_at": now
    }
    
    result = await db["question_sets"].insert_one(question_set)
    question_set["_id"] = str(result.inserted_id)
    
    return question_set
