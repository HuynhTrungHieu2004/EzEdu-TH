import sys
import os
import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from bson import ObjectId

# Adjust sys.path to find app module
sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.database.mongodb import connect_to_mongo, close_mongo_connection, get_database
from app.core.security import get_password_hash
from app.services.rag_service import init_chroma_client

DEMO_USER_EMAIL = os.getenv("DEMO_USER_EMAIL", "demo@example.com")
DEMO_USER_PASSWORD = os.getenv("DEMO_USER_PASSWORD", "demopassword123")
DEMO_USER_NAME = "Học Viên Demo"

DOCUMENTS = [
    {
        "title": "Địa lý Việt Nam - Sự thật địa lý chính xác",
        "content": "Việt Nam nằm ở bán đảo Đông Dương, khu vực Đông Nam Á. Thủ đô của Việt Nam là thành phố Hà Nội. Thành phố Hồ Chí Minh là trung tâm kinh tế lớn nhất cả nước. Sông Hồng chảy qua miền Bắc Việt Nam, bồi đắp phù sa cho đồng bằng sông Hồng. Đỉnh Phan-xi-păng là ngọn núi cao nhất Đông Dương với độ cao 3.143 mét.",
        "media_kind": "document",
        "file_type": "docx"
    },
    {
        "title": "Lịch sử thế giới - Dữ kiện cần kiểm chứng",
        "content": "Thủ đô của Việt Nam là thành phố Sa Pa. Thành phố Hồ Chí Minh nằm ở miền Bắc Việt Nam và có dân số hơn 500 triệu người. Đỉnh Phan-xi-păng nằm ở tỉnh Cà Mau với độ cao chỉ 100 mét. Sông Mê Kông bắt nguồn từ châu Úc.",
        "media_kind": "document",
        "file_type": "docx"
    }
]

async def setup_demo_data():
    db = get_database()
    
    # 1. Create or find demo user
    user = await db["users"].find_one({"email": DEMO_USER_EMAIL})
    if not user:
        hashed = get_password_hash(DEMO_USER_PASSWORD)
        user_doc = {
            "email": DEMO_USER_EMAIL,
            "full_name": DEMO_USER_NAME,
            "hashed_password": hashed,
            "created_at": datetime.now(timezone.utc)
        }
        res = await db["users"].insert_one(user_doc)
        user_id = str(res.inserted_id)
        print(f"Created demo user: {DEMO_USER_EMAIL} (ID: {user_id})")
    else:
        user_id = str(user["_id"])
        print(f"Found existing demo user: {DEMO_USER_EMAIL} (ID: {user_id})")

    # 2. Insert demo documents
    for doc_def in DOCUMENTS:
        existing = await db["documents"].find_one({
            "user_id": user_id,
            "original_filename": doc_def["title"]
        })
        
        if existing:
            print(f"Document already exists: '{doc_def['title']}' (ID: {existing['_id']})")
            continue
            
        doc_id = ObjectId()
        doc_record = {
            "_id": doc_id,
            "user_id": user_id,
            "original_filename": doc_def["title"],
            "file_type": doc_def["file_type"],
            "file_size": len(doc_def["content"]),
            "cloudinary_url": f"https://res.cloudinary.com/demo/raw/upload/{doc_id}",
            "cloudinary_public_id": f"demo/{doc_id}",
            "cloudinary_resource_type": "raw",
            "media_kind": doc_def["media_kind"],
            "status": "indexed",  # Ready for RAG
            "error_message": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        await db["documents"].insert_one(doc_record)
        
        # Save content
        content_record = {
            "document_id": doc_id,
            "extracted_text": doc_def["content"],
            "text_length": len(doc_def["content"]),
            "created_at": datetime.now(timezone.utc)
        }
        await db["document_contents"].insert_one(content_record)
        
        # Chunk & Vector indexing simulation
        chroma_client = init_chroma_client()
        collection = chroma_client.get_or_create_collection("document_chunks")
        
        chunk_text = doc_def["content"]
        chunk_id = f"{doc_id}_chunk_0"
        
        collection.add(
            ids=[chunk_id],
            documents=[chunk_text],
            metadatas=[{
                "user_id": user_id,
                "document_id": str(doc_id),
                "chunk_index": 0,
                "text_preview": chunk_text[:200],
                "created_at": datetime.now(timezone.utc).isoformat()
            }]
        )
        print(f"Created and indexed demo document: '{doc_def['title']}' (ID: {doc_id})")

async def cleanup_demo_data():
    db = get_database()
    
    user = await db["users"].find_one({"email": DEMO_USER_EMAIL})
    if not user:
        print("No demo user found to clean up.")
        return
        
    user_id = str(user["_id"])
    
    # 1. Clean up database records
    # Find documents to delete
    cursor = db["documents"].find({"user_id": user_id})
    doc_ids = []
    async for d in cursor:
        doc_ids.append(d["_id"])
        
    # Delete contents
    if doc_ids:
        await db["document_contents"].delete_many({"document_id": {"$in": doc_ids}})
        await db["documents"].delete_many({"_id": {"$in": doc_ids}})
        
    # Delete conversations and messages
    convs = []
    cursor = db["conversations"].find({"user_id": user_id})
    async for c in cursor:
        convs.append(c["_id"])
        
    if convs:
        await db["conversation_messages"].delete_many({"conversation_id": {"$in": convs}})
        await db["conversations"].delete_many({"_id": {"$in": convs}})
        
    # Delete verification sessions
    await db["verification_sessions"].delete_many({"user_id": user_id})
    
    # Delete user
    await db["users"].delete_one({"_id": user["_id"]})
    print(f"Deleted user and all associated DB records for: {DEMO_USER_EMAIL}")
    
    # 2. Clean up ChromaDB vector chunks
    try:
        chroma_client = init_chroma_client()
        collection = chroma_client.get_or_create_collection("document_chunks")
        # Query matching user_id to get ids to delete
        results = collection.get(where={"user_id": user_id})
        ids_to_delete = results.get("ids", [])
        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
            print(f"Deleted {len(ids_to_delete)} vector chunks from ChromaDB for demo user.")
    except Exception as e:
        print(f"Error cleaning ChromaDB chunks: {e}")

async def main():
    parser = argparse.ArgumentParser(description="Demo data manager for AI Question Generator.")
    parser.add_argument("--cleanup", action="store_true", help="Remove all demo data.")
    args = parser.parse_args()
    
    await connect_to_mongo()
    try:
        if args.cleanup:
            print("Cleaning up demo data...")
            await cleanup_demo_data()
        else:
            print("Setting up demo data...")
            await setup_demo_data()
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
