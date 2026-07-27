from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


GradeLevel = Literal[6, 7, 8, 9, 10, 11, 12]

VN_SUBJECTS = {
    "toan": "Toán",
    "ngu_van": "Ngữ văn",
    "tieng_anh": "Tiếng Anh",
    "vat_li": "Vật lí",
    "hoa_hoc": "Hóa học",
    "sinh_hoc": "Sinh học",
    "lich_su": "Lịch sử",
    "dia_li": "Địa lí",
    "gdktpl": "Giáo dục kinh tế và pháp luật",
    "tin_hoc": "Tin học",
    "cong_nghe": "Công nghệ",
}

VN_EXAM_COMBINATIONS = {
    "A00": ("Toán", "Vật lí", "Hóa học"),
    "A01": ("Toán", "Vật lí", "Tiếng Anh"),
    "A02": ("Toán", "Vật lí", "Sinh học"),
    "A03": ("Toán", "Vật lí", "Lịch sử"),
    "A04": ("Toán", "Vật lí", "Địa lí"),
    "A08": ("Toán", "Lịch sử", "Giáo dục kinh tế và pháp luật"),
    "A09": ("Toán", "Địa lí", "Giáo dục kinh tế và pháp luật"),
    "A10": ("Toán", "Vật lí", "Giáo dục kinh tế và pháp luật"),
    "A11": ("Toán", "Hóa học", "Giáo dục kinh tế và pháp luật"),
    "B00": ("Toán", "Hóa học", "Sinh học"),
    "C00": ("Ngữ văn", "Lịch sử", "Địa lí"),
    "C01": ("Ngữ văn", "Toán", "Vật lí"),
    "C02": ("Ngữ văn", "Toán", "Hóa học"),
    "C03": ("Ngữ văn", "Toán", "Lịch sử"),
    "C04": ("Ngữ văn", "Toán", "Địa lí"),
    "C14": ("Ngữ văn", "Toán", "Giáo dục kinh tế và pháp luật"),
    "D01": ("Toán", "Ngữ văn", "Tiếng Anh"),
    "D07": ("Toán", "Hóa học", "Tiếng Anh"),
    "D08": ("Toán", "Sinh học", "Tiếng Anh"),
    "D09": ("Toán", "Lịch sử", "Tiếng Anh"),
    "D10": ("Toán", "Địa lí", "Tiếng Anh"),
    "D14": ("Ngữ văn", "Lịch sử", "Tiếng Anh"),
    "D15": ("Ngữ văn", "Địa lí", "Tiếng Anh"),
    "N01": ("Toán", "Tiếng Anh", "Tin học"),
    "N02": ("Toán", "Tiếng Anh", "Công nghệ"),
    "N03": ("Toán", "Tiếng Anh", "Giáo dục kinh tế và pháp luật"),
    "N04": ("Toán", "Vật lí", "Tin học"),
    "N05": ("Toán", "Vật lí", "Công nghệ"),
    "N06": ("Toán", "Hóa học", "Công nghệ"),
}


class SubjectOptionResponse(BaseModel):
    id: str
    label: str


class ExamCombinationOptionResponse(BaseModel):
    code: str
    label: str
    subjects: list[str]
    group: str


class StudentOnboardingOptionsResponse(BaseModel):
    grades: list[int]
    subjects: list[SubjectOptionResponse]
    exam_combinations: list[ExamCombinationOptionResponse]


class StudentOnboardingRequest(BaseModel):
    grade_level: GradeLevel
    strong_subjects: list[str] = Field(default_factory=list, max_length=12)
    weak_subjects: list[str] = Field(default_factory=list, max_length=12)
    target_exam_combinations: list[str] = Field(default_factory=list, min_length=1, max_length=12)

    @field_validator("strong_subjects", "weak_subjects")
    @classmethod
    def validate_subjects(cls, values: list[str]) -> list[str]:
        cleaned = _unique_values(values)
        invalid = [value for value in cleaned if value not in VN_SUBJECTS]
        if invalid:
            raise ValueError(f"Môn học không hợp lệ: {', '.join(invalid)}")
        return cleaned

    @field_validator("target_exam_combinations")
    @classmethod
    def validate_exam_combinations(cls, values: list[str]) -> list[str]:
        cleaned = [value.upper() for value in _unique_values(values)]
        invalid = [value for value in cleaned if value not in VN_EXAM_COMBINATIONS]
        if invalid:
            raise ValueError(f"Tổ hợp môn không hợp lệ: {', '.join(invalid)}")
        return cleaned

    @model_validator(mode="after")
    def validate_strength_weakness_overlap(self) -> "StudentOnboardingRequest":
        overlap = set(self.strong_subjects).intersection(self.weak_subjects)
        if overlap:
            labels = [VN_SUBJECTS[value] for value in sorted(overlap)]
            raise ValueError(f"Môn đã chọn là điểm mạnh không thể đồng thời là điểm yếu: {', '.join(labels)}")
        return self


class StudentOnboardingResponse(StudentOnboardingRequest):
    user_id: str
    onboarding_completed: bool = False
    onboarding_completed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


def _unique_values(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw_value in values:
        value = raw_value.strip()
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(value)
    return cleaned
