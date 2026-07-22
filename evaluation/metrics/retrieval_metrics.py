from typing import List, Dict, Any

def calculate_hit_at_k(actual_chunks: List[Dict[str, Any]], expected_chunk_indices: List[int], k: int) -> float:
    """
    Returns 1.0 if any chunk in the top K of actual_chunks matches one of the expected_chunk_indices,
    otherwise 0.0.
    """
    if not expected_chunk_indices:
        return 1.0  # vacuously true if none expected
    
    top_k = actual_chunks[:k]
    for chunk in top_k:
        idx = chunk.get("metadata", {}).get("chunk_index")
        if idx in expected_chunk_indices:
            return 1.0
            
    return 0.0

def calculate_recall_at_k(actual_chunks: List[Dict[str, Any]], expected_chunk_indices: List[int], k: int) -> float:
    """
    Returns the fraction of expected chunks that are retrieved in the top K.
    """
    if not expected_chunk_indices:
        return 1.0
        
    top_k = actual_chunks[:k]
    retrieved_indices = set()
    for chunk in top_k:
        idx = chunk.get("metadata", {}).get("chunk_index")
        if idx is not None:
            retrieved_indices.add(idx)
            
    matched = len(retrieved_indices.intersection(expected_chunk_indices))
    return float(matched) / len(expected_chunk_indices)

def calculate_mrr(actual_chunks: List[Dict[str, Any]], expected_chunk_indices: List[int]) -> float:
    """
    Returns the reciprocal rank of the first correct chunk in actual_chunks.
    """
    if not expected_chunk_indices:
        return 1.0
        
    for index, chunk in enumerate(actual_chunks):
        idx = chunk.get("metadata", {}).get("chunk_index")
        if idx in expected_chunk_indices:
            return 1.0 / (index + 1)
            
    return 0.0

def verify_user_isolation(actual_chunks: List[Dict[str, Any]], authorized_user_id: str) -> bool:
    """
    Returns True if ALL retrieved chunks belong to the authorized_user_id.
    """
    for chunk in actual_chunks:
        owner_id = chunk.get("metadata", {}).get("user_id")
        if owner_id and owner_id != authorized_user_id:
            return False
    return True
