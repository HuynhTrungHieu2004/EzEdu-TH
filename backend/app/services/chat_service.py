from datetime import datetime, timezone

from app.database.mongodb import get_database
from app.services.llm_service import generate_content
from app.services.rag_service import search_relevant_chunks

INSUFFICIENT_INFO_ANSWER = "Tài liệu không cung cấp đủ thông tin để trả lời câu hỏi này."
MAX_SOURCE_CHUNKS = 5
MAX_CONTEXT_CHARS = 6000


def build_chat_prompt(context: str, question: str) -> str:
    """Build a grounded Q&A prompt that forbids answers outside the retrieved document context."""
    return f"""
Bạn là trợ lý học tập.

Yêu cầu bắt buộc:
1. Chỉ trả lời dựa trên NỘI DUNG TÀI LIỆU được cung cấp bên dưới.
2. Không bịa thông tin, không suy diễn ngoài tài liệu, không dùng kiến thức bên ngoài.
3. Nếu tài liệu không cung cấp đủ thông tin để trả lời, bạn phải trả lời đúng nguyên văn:
"{INSUFFICIENT_INFO_ANSWER}"
4. Trả lời bằng tiếng Việt.
5. Trả lời rõ ràng, ngắn gọn, phù hợp cho người học.

NỘI DUNG TÀI LIỆU:
{context}

CÂU HỎI:
{question}

TRẢ LỜI:
"""


def _normalize_answer(answer: str) -> str:
    cleaned = (answer or "").strip()
    if not cleaned:
        return INSUFFICIENT_INFO_ANSWER
    return cleaned


def _truncate_context(chunks: list[dict], limit: int = MAX_CONTEXT_CHARS) -> str:
    selected_parts: list[str] = []
    total = 0

    for index, chunk in enumerate(chunks, start=1):
        text = (chunk.get("text") or "").strip()
        if not text:
            continue
        part = f"[Đoạn {index}]\n{text}"
        additional = len(part) + (2 if selected_parts else 0)
        if selected_parts and total + additional > limit:
            break
        if not selected_parts and len(part) > limit:
            selected_parts.append(part[:limit])
            break
        selected_parts.append(part)
        total += additional

    return "\n\n".join(selected_parts).strip()


async def ask_document_question(document_id: str, user_id: str, question: str) -> dict:
    """
    Retrieve relevant chunks with RAG, ask the configured AI provider for a grounded answer, and save the exchange.
    """
    db = get_database()
    relevant_chunks = await search_relevant_chunks(
        document_id=document_id,
        user_id=user_id,
        query=question,
        n_results=MAX_SOURCE_CHUNKS,
    )

    if not relevant_chunks:
        answer = INSUFFICIENT_INFO_ANSWER
        source_chunks = []
    else:
        context = _truncate_context(relevant_chunks)
        if not context:
            answer = INSUFFICIENT_INFO_ANSWER
            source_chunks = []
        else:
            answer = _normalize_answer(generate_content(build_chat_prompt(context, question)))
            source_chunks = [
                {
                    "chunk_index": chunk.get("metadata", {}).get("chunk_index"),
                    "text": chunk.get("text", ""),
                    "distance": chunk.get("distance"),
                    "text_preview": chunk.get("metadata", {}).get("text_preview"),
                }
                for chunk in relevant_chunks
            ]

    chat_message = {
        "user_id": user_id,
        "document_id": document_id,
        "question": question.strip(),
        "answer": answer,
        "source_chunks": source_chunks,
        "created_at": datetime.now(timezone.utc),
    }

    result = await db["chat_messages"].insert_one(chat_message)

    return {
        "id": str(result.inserted_id),
        "document_id": document_id,
        "question": chat_message["question"],
        "answer": answer,
        "source_chunks": source_chunks,
        "created_at": chat_message["created_at"],
    }


async def get_chat_history(document_id: str, user_id: str) -> list[dict]:
    """Return stored chat history for one user/document pair in chronological order."""
    db = get_database()
    cursor = db["chat_messages"].find(
        {"document_id": document_id, "user_id": user_id}
    ).sort("created_at", 1)

    history: list[dict] = []
    async for item in cursor:
        history.append(
            {
                "id": str(item["_id"]),
                "document_id": item["document_id"],
                "question": item["question"],
                "answer": item["answer"],
                "source_chunks": item.get("source_chunks", []),
                "created_at": item["created_at"],
            }
        )

    return history
