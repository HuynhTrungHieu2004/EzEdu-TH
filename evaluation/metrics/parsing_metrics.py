from typing import List, Dict, Any

def evaluate_parsing_and_chunking(
    chunks: List[str],
    original_text: str,
    required_sentences: List[str]
) -> Dict[str, Any]:
    """
    Computes empty chunks, duplicate rate, fact preservation, overlap, and chunk lengths.
    """
    if not chunks:
        return {
            "empty_chunks": 0,
            "duplicate_chunk_rate": 0.0,
            "fact_preservation_rate": 0.0,
            "avg_chunk_length": 0.0,
            "max_chunk_length": 0,
            "overlap_duplication_ratio": 0.0
        }
        
    empty_chunks = sum(1 for c in chunks if not c.strip())
    
    unique_chunks = set(chunks)
    duplicate_chunks = len(chunks) - len(unique_chunks)
    duplicate_chunk_rate = float(duplicate_chunks) / len(chunks)
    
    chunk_lengths = [len(c) for c in chunks]
    avg_chunk_length = sum(chunk_lengths) / len(chunks)
    max_chunk_length = max(chunk_lengths)
    
    # Calculate overlap duplication ratio (number of repeated chars across chunks)
    total_len = sum(len(c) for c in chunks)
    original_len = len(original_text)
    overlap_duplication_ratio = float(max(0, total_len - original_len)) / max(1, original_len)
    
    # Fact preservation: check if required sentences exist in at least one chunk (ignoring whitespace)
    matched_sentences = 0
    for sentence in required_sentences:
        clean_sentence = " ".join(sentence.split()).lower()
        preserved = False
        for chunk in chunks:
            clean_chunk = " ".join(chunk.split()).lower()
            if clean_sentence in clean_chunk:
                preserved = True
                break
        if preserved:
            matched_sentences += 1
            
    fact_preservation_rate = (
        float(matched_sentences) / len(required_sentences) if required_sentences else 1.0
    )
    
    return {
        "empty_chunks": empty_chunks,
        "duplicate_chunk_rate": duplicate_chunk_rate,
        "fact_preservation_rate": fact_preservation_rate,
        "avg_chunk_length": avg_chunk_length,
        "max_chunk_length": max_chunk_length,
        "overlap_duplication_ratio": overlap_duplication_ratio
    }
