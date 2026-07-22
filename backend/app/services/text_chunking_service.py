import re
import math
from collections import Counter

from langchain_text_splitters import RecursiveCharacterTextSplitter


def clean_text(text: str) -> str:
    """Normalize whitespace and collapse noisy blank lines before chunking."""
    if not text:
        return ""

    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    normalized = re.sub(r"[^\S\n]{2,}", " ", normalized)
    return normalized.strip()


def _fallback_split(text: str, chunk_size: int, overlap: int) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
        length_function=len,
        is_separator_regex=False,
    )
    return [chunk.strip() for chunk in splitter.split_text(text) if chunk and chunk.strip()]


def _semantic_units(text: str) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    units: list[str] = []
    for paragraph in paragraphs:
        if len(paragraph) <= 700:
            units.append(paragraph)
            continue
        sentences = re.split(r"(?<=[.!?。！？])\s+", paragraph)
        units.extend(sentence.strip() for sentence in sentences if sentence.strip())
    return units


def _token_vector(text: str) -> Counter:
    return Counter(re.findall(r"\w+", text.lower()))


def _cosine_similarity(left: Counter, right: Counter) -> float:
    if not left or not right:
        return 0.0
    common = set(left) & set(right)
    dot = sum(left[token] * right[token] for token in common)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def _tail_overlap(text: str, overlap: int) -> str:
    if overlap <= 0 or len(text) <= overlap:
        return ""
    return text[-overlap:].strip()


def split_text_into_chunks(
    text: str,
    chunk_size: int = 1200,
    overlap: int = 200,
    semantic_threshold: float = 0.08,
) -> list[str]:
    """Split cleaned text into topic-aware chunks suitable for RAG indexing."""
    cleaned = clean_text(text)
    if not cleaned:
        return []

    if len(cleaned) <= chunk_size:
        return [cleaned]

    units = _semantic_units(cleaned)
    if not units:
        return _fallback_split(cleaned, chunk_size, overlap)

    chunks: list[str] = []
    current_parts: list[str] = []
    current_text = ""
    current_vector = Counter()

    for unit in units:
        if len(unit) > chunk_size:
            if current_text:
                chunks.append(current_text.strip())
                current_parts = []
                current_text = ""
                current_vector = Counter()
            chunks.extend(_fallback_split(unit, chunk_size, overlap))
            continue

        candidate_text = "\n\n".join(current_parts + [unit]).strip()
        unit_vector = _token_vector(unit)
        similarity = _cosine_similarity(current_vector, unit_vector) if current_text else 1.0
        would_exceed = len(candidate_text) > chunk_size
        topic_shift = bool(current_text) and similarity < semantic_threshold and len(current_text) >= chunk_size * 0.45

        if current_text and (would_exceed or topic_shift):
            chunks.append(current_text.strip())
            tail = _tail_overlap(current_text, overlap)
            current_parts = [tail, unit] if tail else [unit]
            current_text = "\n\n".join(current_parts).strip()
            current_vector = _token_vector(current_text)
        else:
            current_parts.append(unit)
            current_text = candidate_text
            current_vector.update(unit_vector)

    if current_text:
        chunks.append(current_text.strip())

    compacted: list[str] = []
    for chunk in chunks:
        if len(chunk) > chunk_size * 1.15:
            compacted.extend(_fallback_split(chunk, chunk_size, overlap))
        else:
            compacted.append(chunk)
    return [chunk for chunk in compacted if chunk]
