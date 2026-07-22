import os
import uuid
from datetime import datetime, timezone
from bson import ObjectId
from app.core.config import settings
from app.database.mongodb import get_database, connect_to_mongo, close_mongo_connection
from app.services.rag_service import init_chroma_client, _build_collection_name, _build_embeddings, EMBEDDING_DIMENSION

class EvaluationFixtureManager:
    def __init__(self):
        self.run_id = f"eval_{uuid.uuid4().hex[:8]}"
        self.db = None
        self.chroma_client = None
        self.chroma_collection = None
        self.doc_mapping = {}
        self.inserted_doc_ids = []

    def verify_safety(self):
        if settings.APP_ENV == "production":
            raise RuntimeError("Evaluation suite is REFUSING to run in production environment (APP_ENV=production).")
        
        self.db = get_database()
        if not self.db.name.endswith("_test"):
            raise RuntimeError(
                f"Evaluation suite is REFUSING to run on a non-test database: {self.db.name}. "
                "Database name must end with '_test'."
            )

    async def setup_fixtures(self):
        # 1. Initialize MongoDB connection (which handles mock fallback automatically if offline)
        await connect_to_mongo()
        
        self.verify_safety()
        
        # Clear collections of the test database to avoid duplicate key errors from stale test runs
        await self.db["documents"].delete_many({})
        await self.db["document_contents"].delete_many({})
        await self.db["conversations"].delete_many({})
        await self.db["conversation_messages"].delete_many({})
        await self.db["chat_locks"].delete_many({})
        await self.db["verification_sessions"].delete_many({})
        await self.db["verification_issues"].delete_many({})
        
        # 2. Setup ChromaDB client with prefix collection
        self.chroma_client = init_chroma_client()
        
        # Resolve actual active source ("local" or "gemini") to match production routing
        source, _ = _build_embeddings(["test"])
        collection_name = _build_collection_name(source, EMBEDDING_DIMENSION)
        self.chroma_collection = self.chroma_client.get_or_create_collection(collection_name)
        
        # 3. Pre-generate valid 24-character hexadecimal ObjectId strings for fixtures
        fixtures_dir = os.path.join(os.path.dirname(__file__), "documents")
        
        user_a_id = "eval_user_a_id"
        user_b_id = "eval_user_b_id"
        
        for filename in os.listdir(fixtures_dir):
            if not filename.endswith(".txt"):
                continue
            doc_key = filename.replace(".txt", "")
            self.doc_mapping[doc_key] = str(ObjectId())
            
        for filename in os.listdir(fixtures_dir):
            if not filename.endswith(".txt"):
                continue
                
            doc_key = filename.replace(".txt", "")
            filepath = os.path.join(fixtures_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
                
            owner_id = user_b_id if doc_key == "doc_g_user_b" else user_a_id
            
            # MongoDB registration
            doc_id = self.doc_mapping[doc_key]
            doc_record = {
                "_id": ObjectId(doc_id),
                "user_id": owner_id,
                "original_filename": filename,
                "file_type": "txt",
                "media_kind": "document",
                "file_size": len(content),
                "cloudinary_url": f"https://res.cloudinary.com/test/{doc_id}",
                "status": "indexed",
                "run_id": self.run_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            await self.db["documents"].insert_one(doc_record)
            self.inserted_doc_ids.append(doc_id)
            
            # Save raw content
            content_record = {
                "document_id": doc_id,
                "user_id": owner_id,
                "extracted_text": content,
                "text_length": len(content),
                "run_id": self.run_id,
                "created_at": datetime.now(timezone.utc)
            }
            await self.db["document_contents"].insert_one(content_record)
            
            # ChromaDB registration
            chunk_id = f"{doc_id}_chunk_0"
            
            # Generate deterministic embedding for indexing if using local method
            if source == "local":
                from app.services.rag_service import _local_hash_embedding
                embeddings = [_local_hash_embedding(content)]
            else:
                from app.services.llm_service import get_embeddings
                embeddings = get_embeddings([content])
                
            self.chroma_collection.add(
                ids=[chunk_id],
                documents=[content],
                embeddings=embeddings,
                metadatas=[{
                    "user_id": owner_id,
                    "document_id": doc_id,
                    "chunk_index": 0,
                    "text_preview": content[:100],
                    "run_id": self.run_id,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }]
            )
            
        print(f"Setup completed successfully for run_id: {self.run_id}")

    async def cleanup_fixtures(self):
        if self.db is None:
            return
            
        print(f"Cleaning up fixtures for run_id: {self.run_id}")
        
        try:
            # Clean up MongoDB
            await self.db["documents"].delete_many({})
            await self.db["document_contents"].delete_many({})
            await self.db["conversations"].delete_many({})
            await self.db["conversation_messages"].delete_many({})
            await self.db["chat_locks"].delete_many({})
            await self.db["verification_sessions"].delete_many({})
            await self.db["verification_issues"].delete_many({})
        except Exception as e:
            print(f"MongoDB cleanup warning: {e}")
        
        # Clean up ChromaDB collection
        if self.chroma_collection:
            try:
                results = self.chroma_collection.get(where={"run_id": self.run_id})
                ids = results.get("ids", [])
                if ids:
                    self.chroma_collection.delete(ids=ids)
            except Exception as e:
                print(f"ChromaDB cleanup warning: {e}")
                
        # Close MongoDB connection
        await close_mongo_connection()
