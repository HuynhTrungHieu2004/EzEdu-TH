import unicodedata
import re

def normalize_title(title: str) -> str:
    """
    Normalizes a Vietnamese title:
    1. Unicode NFD normalization (decomposes characters).
    2. Lowercase conversion.
    3. Strips all diacritic/combining marks (Mn category).
    4. Replaces 'đ' and 'Đ' with 'd'.
    5. Normalizes multiple spaces to a single space, and strips boundaries.
    """
    if not title:
        return ""
    
    # 1. Unicode NFD normalization
    nfd_form = unicodedata.normalize("NFD", title)
    
    # 2. Lowercase
    lowercase_str = nfd_form.lower()
    
    # 3. Strip Mn diacritics
    stripped_chars = [c for c in lowercase_str if unicodedata.category(c) != "Mn"]
    
    # 4. Replace đ
    joined_str = "".join(stripped_chars)
    replaced_d = joined_str.replace("đ", "d").replace("Đ", "d")
    
    # 5. Normalize whitespace
    normalized_spaces = re.sub(r"\s+", " ", replaced_d).strip()
    
    return normalized_spaces
