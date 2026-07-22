import re
from datetime import datetime
from enum import Enum
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator, model_validator

class RatingType(str, Enum):
    HELPFUL = "helpful"
    NOT_HELPFUL = "not_helpful"

class ReasonCode(str, Enum):
    INCORRECT_INFORMATION = "incorrect_information"
    OFF_TOPIC = "off_topic"
    INCOMPLETE = "incomplete"
    HARD_TO_UNDERSTAND = "hard_to_understand"
    UNSUPPORTED_CITATION = "unsupported_citation"
    UNRELIABLE_WEB_SOURCE = "unreliable_web_source"
    WRONG_DOCUMENT_SOURCE = "wrong_document_source"
    HALLUCINATED_INFORMATION = "hallucinated_information"
    OUTDATED_INFORMATION = "outdated_information"
    OTHER = "other"

class FeedbackRequest(BaseModel):
    rating: Literal["helpful", "not_helpful"]
    reason_codes: List[ReasonCode] = Field(default_factory=list)
    comment: Optional[str] = Field(None, max_length=500)
    reported_citation_ids: List[str] = Field(default_factory=list)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            return v if v else None
        return v

    @model_validator(mode="after")
    def validate_rules(self) -> "FeedbackRequest":
        # Khử trùng lặp ổn định (giữ nguyên thứ tự xuất hiện)
        self.reason_codes = list(dict.fromkeys(self.reason_codes))
        self.reported_citation_ids = list(dict.fromkeys(self.reported_citation_ids))

        # Giới hạn số lượng
        if len(self.reason_codes) > 5:
            raise ValueError("Chỉ được chọn tối đa 5 lý do lỗi.")
        if len(self.reported_citation_ids) > 5:
            raise ValueError("Chỉ được báo lỗi tối đa 5 nguồn trích dẫn.")

        # Định dạng citation phải khớp regex ^(DOC|WEB)_[1-9]\d*$
        citation_pattern = re.compile(r"^(DOC|WEB)_[1-9]\d*$")
        for cid in self.reported_citation_ids:
            if not citation_pattern.match(cid):
                raise ValueError(f"Định dạng citation '{cid}' không hợp lệ. Phải khớp định dạng DOC_n hoặc WEB_n (n >= 1).")

        # helpful: xóa sạch lý do, comment và citation cũ
        if self.rating == "helpful":
            self.reason_codes = []
            self.comment = None
            self.reported_citation_ids = []
            
        # not_helpful: cần ít nhất reason hoặc comment
        elif self.rating == "not_helpful":
            if not self.reason_codes and not self.comment:
                raise ValueError("Vui lòng cung cấp ít nhất một lý do lỗi hoặc nhận xét chi tiết.")
                
            # ReasonCode.OTHER bắt buộc comment
            if ReasonCode.OTHER in self.reason_codes and not self.comment:
                raise ValueError("Vui lòng nhập nhận xét chi tiết khi chọn lý do 'Khác'.")

        return self

class FeedbackResponse(BaseModel):
    id: str
    message_id: str
    rating: str
    reason_codes: List[str]
    comment: Optional[str] = None
    reported_citation_ids: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        json_encoders = {
            datetime: lambda dt: dt.isoformat()
        }
