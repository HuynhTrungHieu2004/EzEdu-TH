import numpy as np
from app.database.mongodb import get_database
from app.services.llm_service import get_embedding, get_embeddings

def init_chroma_client():
    """Fallback mock client to comply with settings configurations"""
    return None

async def add_document_chunks(document_id: str, user_id: str, chunks: list[str]):
    """
    Computes text embeddings via the Gemini API, then saves the chunks
    along with their vectors directly into MongoDB.
    """
    db = get_database()
    
    # 1. Fetch embeddings from Gemini API
    try:
        embeddings = get_embeddings(chunks)
    except Exception as e:
        print(f"Embedding generation error: {e}")
        # Fallback to zero vectors in case of API failure
        embeddings = [[0.0] * 768 for _ in chunks]

    # 2. Structure MongoDB documents
    chunk_docs = []
    for idx, chunk in enumerate(chunks):
        chunk_docs.append({
            "document_id": document_id,
            "user_id": user_id,
            "chunk_index": idx,
            "content": chunk,
            "embedding": embeddings[idx]
        })

    # 3. Save to database
    await db["document_chunks"].delete_many({"document_id": document_id})
    if chunk_docs:
        await db["document_chunks"].insert_many(chunk_docs)

async def search_relevant_chunks(document_id: str, user_id: str, query: str, n_results: int = 5) -> list[dict]:
    """
    Performs a vector search across document chunks stored in MongoDB by
    calculating cosine similarity with the query vector embedding.
    """
    db = get_database()
    
    # 1. Retrieve all chunks belonging to the document
    cursor = db["document_chunks"].find({"document_id": document_id})
    db_chunks = [doc async for doc in cursor]
    if not db_chunks:
        return []

    # 2. Embed the query text
    try:
        query_vector = get_embedding(query)
    except Exception as e:
        print(f"Query embedding generation error: {e}")
        # Fallback: return the first few chunks directly
        results = []
        for c in db_chunks[:n_results]:
            results.append({
                "id": str(c["_id"]),
                "text": c["content"],
                "metadata": {"chunk_index": c["chunk_index"], "document_id": document_id},
                "distance": 1.0
            })
        return results

    # 3. Calculate Cosine Similarity for each chunk
    q_vec = np.array(query_vector)
    q_norm = np.linalg.norm(q_vec)
    
    scored_chunks = []
    for c in db_chunks:
        c_emb = c.get("embedding")
        if not c_emb or len(c_emb) != len(query_vector):
            similarity = 0.0
        else:
            c_vec = np.array(c_emb)
            c_norm = np.linalg.norm(c_vec)
            if q_norm == 0 or c_norm == 0:
                similarity = 0.0
            else:
                similarity = np.dot(q_vec, c_vec) / (q_norm * c_norm)
                
        scored_chunks.append({
            "id": str(c["_id"]),
            "text": c["content"],
            "metadata": {"chunk_index": c["chunk_index"], "document_id": document_id},
            "similarity": float(similarity)
        })

    # 4. Sort and return top N matches
    scored_chunks.sort(key=lambda x: x["similarity"], reverse=True)
    
    results = []
    for sc in scored_chunks[:n_results]:
        results.append({
            "id": sc["id"],
            "text": sc["text"],
            "metadata": sc["metadata"],
            "distance": float(1.0 - sc["similarity"])  # Distance metric
        })
        
    return results
