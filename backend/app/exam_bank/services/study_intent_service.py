"""Deterministic Vietnamese intent recognition for the review-exam chat flow."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

from app.personalization.schemas.onboarding import VN_SUBJECTS


@dataclass(frozen=True)
class StudyIntent:
    subject_id: Optional[str]
    subject_label: Optional[str]


_REVIEW_PATTERNS = (
    r"\bon tap\b",
    r"\bon mon\b",
    r"\bon thi\b",
    r"\bluyen de\b",
    r"\bluyen tap\b",
    r"\blam (?:mot )?de\b",
    r"\bde on\b",
)

_SUBJECT_ALIASES = {
    "toan": "toan",
    "ngu van": "ngu_van",
    "van": "ngu_van",
    "tieng anh": "tieng_anh",
    "anh": "tieng_anh",
    "vat li": "vat_li",
    "vat ly": "vat_li",
    "ly": "vat_li",
    "hoa hoc": "hoa_hoc",
    "hoa": "hoa_hoc",
    "sinh hoc": "sinh_hoc",
    "sinh": "sinh_hoc",
    "lich su": "lich_su",
    "su": "lich_su",
    "dia li": "dia_li",
    "dia ly": "dia_li",
    "dia": "dia_li",
    "tin hoc": "tin_hoc",
    "cong nghe": "cong_nghe",
    "gdktpl": "gdktpl",
}


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.casefold())
    ascii_text = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    ascii_text = ascii_text.replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", " ", ascii_text).strip()


def detect_study_intent(text: str) -> Optional[StudyIntent]:
    normalized = _normalize(text)
    if not normalized or not any(re.search(pattern, normalized) for pattern in _REVIEW_PATTERNS):
        return None

    subject_id: Optional[str] = None
    # Longest alias first prevents "ly" from stealing "vat ly".
    for alias, candidate_id in sorted(_SUBJECT_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        if re.search(rf"\b{re.escape(alias)}\b", normalized):
            subject_id = candidate_id
            break

    return StudyIntent(
        subject_id=subject_id,
        subject_label=VN_SUBJECTS.get(subject_id) if subject_id else None,
    )
