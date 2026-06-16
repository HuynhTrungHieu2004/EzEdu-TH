import re

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


def split_text_into_chunks(text: str, chunk_size: int = 1200, overlap: int = 200) -> list[str]:
    """Split cleaned text into overlapping chunks suitable for RAG indexing."""
    cleaned = clean_text(text)
    if not cleaned:
        return []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
        length_function=len,
        is_separator_regex=False,
    )
    return [chunk.strip() for chunk in splitter.split_text(cleaned) if chunk and chunk.strip()]
