from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Literal

from langdetect import DetectorFactory, LangDetectException, detect

DetectorFactory.seed = 0

OutputLanguage = Literal["vi", "en"]

_VIETNAMESE_DIACRITICS = re.compile(
    r"[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]",
    re.IGNORECASE,
)
_VIETNAMESE_WORDS = {
    "cua", "la", "va", "mot", "nhung", "duoc", "trong", "cho", "voi",
    "khi", "da", "dung", "cau", "dap", "an", "dong", "tu", "dien", "ta",
}


class LanguageMismatchError(ValueError):
    pass


def resolve_output_language(
    *,
    subject_id: str,
    grade: int,
    explicit: str | None,
) -> OutputLanguage:
    if explicit is not None:
        if explicit not in {"vi", "en"}:
            raise ValueError("output_language must be 'vi' or 'en'")
        return explicit
    return "en" if subject_id == "tieng_anh" and 6 <= grade <= 12 else "vi"


def validate_output_language(fields: Iterable[str], *, expected: OutputLanguage) -> None:
    linguistic = [
        value.strip()
        for value in fields
        if value and len(re.findall(r"[A-Za-zÀ-ỹ]", value)) >= 2
    ]
    text = "\n".join(linguistic)
    if not text:
        raise LanguageMismatchError("No linguistic output is available for language validation")
    if expected == "en":
        if _VIETNAMESE_DIACRITICS.search(text):
            raise LanguageMismatchError("Expected English output but found Vietnamese text")
        words = re.findall(r"[a-z]+", text.casefold())
        vietnamese_hits = sum(word in _VIETNAMESE_WORDS for word in words)
        if vietnamese_hits >= 4 and vietnamese_hits / max(len(words), 1) >= 0.08:
            raise LanguageMismatchError("Expected English output but found Vietnamese vocabulary")
    try:
        detected = detect(text)
    except LangDetectException as exc:
        raise LanguageMismatchError("Output language could not be determined") from exc
    if detected != expected:
        raise LanguageMismatchError(f"Expected {expected} output, detected {detected}")
