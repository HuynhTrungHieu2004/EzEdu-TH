"""
K-Means Document Clustering Service
=====================================
Sử dụng thuật toán K-Means từ scikit-learn để phân cụm tài liệu
dựa trên vector embeddings đã lưu trong ChromaDB.

Thuật toán K-Means hoạt động bằng cách:
1. Chọn K tâm cụm ngẫu nhiên ban đầu (centroids)
2. Gán mỗi điểm dữ liệu (document vector) vào cụm có tâm gần nhất
3. Cập nhật tâm cụm = trung bình các điểm trong cụm
4. Lặp lại bước 2-3 cho đến khi hội tụ

Silhouette Score được dùng để tự động chọn K tối ưu:
- Score gần 1: Các cụm rõ ràng, tách biệt tốt
- Score gần 0: Các cụm chồng chéo nhau
- Score âm: Phân cụm kém
"""

import logging
from typing import List, Dict, Optional, Tuple

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

logger = logging.getLogger(__name__)


def find_optimal_k(vectors: np.ndarray, max_k: int = 8) -> int:
    """
    Tìm số cụm K tối ưu bằng phương pháp Silhouette Score.
    
    Args:
        vectors: Ma trận vector embeddings (n_samples, n_features)
        max_k: Số cụm tối đa để thử
    
    Returns:
        Số cụm tối ưu K
    """
    n_samples = len(vectors)
    if n_samples <= 2:
        return 1
    
    # K phải nhỏ hơn số lượng mẫu
    max_possible_k = min(max_k, n_samples - 1)
    if max_possible_k < 2:
        return 1
    
    best_k = 2
    best_score = -1.0
    
    for k in range(2, max_possible_k + 1):
        try:
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10, max_iter=300)
            labels = kmeans.fit_predict(vectors)
            
            # Silhouette score cần ít nhất 2 cụm với ít nhất 2 mẫu
            unique_labels = set(labels)
            if len(unique_labels) < 2:
                continue
                
            score = silhouette_score(vectors, labels)
            logger.debug(f"  K={k}: Silhouette Score = {score:.4f}")
            
            if score > best_score:
                best_score = score
                best_k = k
        except Exception as e:
            logger.warning(f"  K={k} failed: {e}")
            continue
    
    logger.info(f"📊 Optimal K = {best_k} (Silhouette Score = {best_score:.4f})")
    return best_k


def cluster_documents(
    document_vectors: Dict[str, np.ndarray],
    k: Optional[int] = None,
) -> List[Dict]:
    """
    Phân cụm tài liệu dựa trên vector embeddings sử dụng K-Means.
    
    Args:
        document_vectors: Dict mapping document_id -> average embedding vector
        k: Số cụm (None = auto-detect bằng Silhouette Score)
    
    Returns:
        Danh sách cụm:
        [
            {
                "cluster_id": 0,
                "document_ids": ["doc1", "doc2"],
                "centroid": [0.1, 0.2, ...],
                "size": 2
            },
            ...
        ]
    """
    if not document_vectors:
        return []
    
    doc_ids = list(document_vectors.keys())
    vectors = np.array([document_vectors[did] for did in doc_ids])
    
    if len(doc_ids) <= 1:
        return [{
            "cluster_id": 0,
            "document_ids": doc_ids,
            "size": len(doc_ids)
        }]
    
    # Auto-detect optimal K if not specified
    if k is None:
        k = find_optimal_k(vectors)
    
    # Ensure k doesn't exceed number of documents
    k = min(k, len(doc_ids))
    
    if k <= 1:
        return [{
            "cluster_id": 0,
            "document_ids": doc_ids,
            "size": len(doc_ids)
        }]
    
    # Run K-Means
    logger.info(f"🔬 Running K-Means clustering with K={k} on {len(doc_ids)} documents...")
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10, max_iter=300)
    labels = kmeans.fit_predict(vectors)
    
    # Group documents by cluster
    clusters = {}
    for idx, label in enumerate(labels):
        label = int(label)
        if label not in clusters:
            clusters[label] = {
                "cluster_id": label,
                "document_ids": [],
                "size": 0
            }
        clusters[label]["document_ids"].append(doc_ids[idx])
        clusters[label]["size"] += 1
    
    result = sorted(clusters.values(), key=lambda c: c["cluster_id"])
    logger.info(f"✅ Clustered into {len(result)} groups: {[c['size'] for c in result]}")
    
    return result


def find_similar_documents(
    target_vector: np.ndarray,
    all_vectors: Dict[str, np.ndarray],
    exclude_id: str,
    top_n: int = 5,
) -> List[Dict]:
    """
    Tìm tài liệu tương tự dựa trên Cosine Similarity.
    
    Args:
        target_vector: Vector embedding của tài liệu gốc
        all_vectors: Dict mapping document_id -> average embedding vector
        exclude_id: Document ID cần loại bỏ (chính nó)
        top_n: Số tài liệu tương tự tối đa
    
    Returns:
        Danh sách tài liệu tương tự kèm điểm tương đồng:
        [{"document_id": "abc", "similarity": 0.92}, ...]
    """
    if not all_vectors:
        return []
    
    similarities = []
    target_norm = np.linalg.norm(target_vector)
    
    if target_norm == 0:
        return []
    
    for doc_id, vec in all_vectors.items():
        if doc_id == exclude_id:
            continue
        
        vec_norm = np.linalg.norm(vec)
        if vec_norm == 0:
            continue
        
        # Cosine similarity
        cos_sim = float(np.dot(target_vector, vec) / (target_norm * vec_norm))
        similarities.append({
            "document_id": doc_id,
            "similarity": round(cos_sim, 4)
        })
    
    # Sort by similarity descending
    similarities.sort(key=lambda x: x["similarity"], reverse=True)
    return similarities[:top_n]


def get_document_vectors_from_chroma(user_id: str) -> Dict[str, np.ndarray]:
    """
    Lấy vector embedding trung bình của mỗi tài liệu từ ChromaDB.
    Tính trung bình (mean) các chunk vectors thuộc cùng document để
    tạo 1 vector đại diện cho toàn bộ tài liệu.
    
    Returns:
        Dict mapping document_id -> average embedding vector (np.ndarray)
    """
    from app.services.rag_service import init_chroma_client, COLLECTION_NAME
    
    try:
        client = init_chroma_client()
        collections = client.list_collections()
        
        doc_vectors: Dict[str, list] = {}  # doc_id -> list of vectors
        
        for collection_meta in collections:
            col_name = getattr(collection_meta, "name", str(collection_meta))
            if not (col_name == COLLECTION_NAME or col_name.startswith(f"{COLLECTION_NAME}_")):
                continue
            
            try:
                collection = client.get_collection(col_name)
                # Get all items for this user
                results = collection.get(
                    where={"user_id": user_id},
                    include=["embeddings", "metadatas"]
                )
                
                if not results or not results.get("ids"):
                    continue
                
                embeddings = results.get("embeddings", [])
                metadatas = results.get("metadatas", [])
                
                if embeddings is None or len(embeddings) == 0:
                    continue
                
                for idx, emb in enumerate(embeddings):
                    if emb is None:
                        continue
                    meta = metadatas[idx] if idx < len(metadatas) else {}
                    doc_id = meta.get("document_id", "")
                    if doc_id:
                        if doc_id not in doc_vectors:
                            doc_vectors[doc_id] = []
                        doc_vectors[doc_id].append(np.array(emb))
            except Exception as e:
                logger.warning(f"Failed to read collection {col_name}: {e}")
                continue
        
        # Average vectors per document
        result = {}
        for doc_id, vectors in doc_vectors.items():
            if vectors:
                avg_vec = np.mean(vectors, axis=0)
                result[doc_id] = avg_vec
        
        logger.info(f"📊 Retrieved vectors for {len(result)} documents from ChromaDB")
        return result
        
    except Exception as e:
        logger.error(f"Failed to get document vectors from ChromaDB: {e}")
        return {}
