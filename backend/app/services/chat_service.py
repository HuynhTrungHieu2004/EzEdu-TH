from datetime import datetime, timezone
from bson import ObjectId
from app.database.mongodb import get_database
from app.services.rag_service import search_relevant_chunks
from app.services.llm_service import generate_content

def build_chat_prompt(context: str, question: str) -> str:
    """Creates a RAG prompt constraining the assistant to answer only based on the document context."""
    return f"""
Bạn là một trợ lý học tập AI thông minh. Nhiệm vụ của bạn là trả lời câu hỏi của người dùng dựa trên thông tin được cung cấp dưới đây.

Yêu cầu bắt buộc:
1. Chỉ trả lời dựa trên phần NỘI DUNG TÀI LIỆU (CONTEXT) dưới đây. Tuyệt đối không tự suy diễn hoặc dùng kiến thức ngoài tài liệu để bổ sung.
2. Nếu trong phần CONTEXT không có đủ thông tin hoặc không liên quan đến câu hỏi, hãy trả lời chính xác là: "Xin lỗi, tôi không tìm thấy thông tin này trong tài liệu học tập của bạn." và không cố tự bịa ra câu trả lời.
3. Trả lời ngắn gọn, súc tích, dễ hiểu và đi thẳng vào trọng tâm câu hỏi.

---
NỘI DUNG TÀI LIỆU (CONTEXT):
{context}
---

CÂU HỎI CỦA NGƯỜI DÙNG:
{question}

TRẢ LỜI:
"""

async def ask_document_question(document_id: str, user_id: str, question: str) -> dict:
    """
    Looks up vector chunks via RAG, prepares prompt, fetches answer from Gemini, 
    and registers the interaction in the MongoDB 'chat_messages' collection.
    """
    # 1. Search relevant chunks using RAG
    relevant_chunks = search_relevant_chunks(document_id, user_id, question, n_results=5)
    
    # Fallback to MongoDB direct lookup if ChromaDB did not index or returned empty
    if not relevant_chunks:
        db = get_database()
        cursor = db["document_chunks"].find({"document_id": document_id}).limit(3)
        relevant_chunks = [
            {
                "text": doc["content"],
                "metadata": {"chunk_index": doc["chunk_index"], "document_id": document_id}
            } 
            async for doc in cursor
        ]

    context = "\n\n".join([c["text"] for c in relevant_chunks])
    
    # 2. Call Gemini
    prompt = build_chat_prompt(context, question)
    answer = generate_content(prompt)
    
    # 3. Store conversation to database
    db = get_database()
    chat_message = {
        "document_id": document_id,
        "user_id": user_id,
        "question": question,
        "answer": answer,
        "sources": [
            {
                "chunk_index": c.get("metadata", {}).get("chunk_index"),
                "text": c["text"]
            }
            for c in relevant_chunks
        ],
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db["chat_messages"].insert_one(chat_message)
    chat_message["_id"] = str(result.inserted_id)
    
    return {
        "id": chat_message["_id"],
        "question": question,
        "answer": answer,
        "sources": chat_message["sources"],
        "created_at": chat_message["created_at"]
    }

async def get_chat_history(document_id: str, user_id: str) -> list:
    """Fetches full chat history records sorted in ascending chronological order"""
    db = get_database()
    cursor = db["chat_messages"].find({"document_id": document_id, "user_id": user_id}).sort("created_at", 1)
    
    history = []
    async for doc in cursor:
        history.append({
            "id": str(doc["_id"]),
            "question": doc["question"],
            "answer": doc["answer"],
            "sources": doc.get("sources", []),
            "created_at": doc["created_at"]
        })
        
    return history
