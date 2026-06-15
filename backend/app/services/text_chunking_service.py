import re

def clean_text(text: str) -> str:
    """
    Normalizes whitespace characters, resolves different line ending styles, 
    and removes excessive consecutive line breaks.
    """
    if not text:
        return ""
    # Normalize line breaks
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\r', '\n', text)
    # Remove multiple redundant line breaks
    text = re.sub(r'\n+', '\n', text)
    # Convert consecutive tabs or spaces into a single space
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()

def split_text_into_chunks(text: str, chunk_size: int = 1200, overlap: int = 200) -> list[str]:
    """
    Splits text into overlapping chunks of a specific maximum character length.
    Attempts to break chunks cleanly at a newline or space when possible.
    """
    cleaned = clean_text(text)
    if not cleaned:
        return []

    chunks = []
    start = 0
    text_len = len(cleaned)

    while start < text_len:
        # Define base end point
        end = start + chunk_size
        if end >= text_len:
            chunks.append(cleaned[start:])
            break

        # Attempt to split at a newline or space near the end of the chunk
        split_point = cleaned.rfind('\n', start, end)
        # Only use split point if it falls within the second half of the chunk size
        if split_point == -1 or split_point <= start + (chunk_size // 2):
            split_point = cleaned.rfind(' ', start, end)

        # Fallback to the exact chunk boundary if no clean boundary is found
        if split_point == -1 or split_point <= start + (chunk_size // 2):
            split_point = end

        # Append chunk
        chunks.append(cleaned[start:split_point].strip())
        
        # Advance starting point back by the overlap
        start = split_point - overlap
        
        # Guard against zero/negative steps or trailing loops
        if start < 0:
            start = 0
        if start >= text_len - overlap:
            break

    return [c for c in chunks if c]
