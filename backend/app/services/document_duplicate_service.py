"""Phát hiện học liệu gần trùng bằng TF-IDF.

Hệ thống đã có bước khử trùng theo `checksum` (`routers/documents.py`): tải lại
đúng file cũ thì tái dùng bản ghi, không lưu thêm. Nhưng checksum chỉ bắt được
**trùng y hệt từng byte**. Cùng một bài giảng xuất lại thành PDF khác, sửa vài
dòng, hay lưu sang định dạng khác đều cho checksum khác hoàn toàn.

Mô-đun này bắt phần còn lại: **gần trùng về nội dung**.

**Vì sao dùng TF-IDF chứ không dùng embedding?** Hệ thống đã có embedding và
đã dùng nó cho chức năng "học liệu liên quan". Nhưng hai bài toán khác nhau:

- *Liên quan* là quan hệ **ngữ nghĩa** — hai bài khác nhau về cùng chủ đề nên
  được coi là liên quan. Embedding làm đúng việc này.
- *Trùng lặp* là quan hệ **từ vựng** — cùng một văn bản, có thể sửa vài chữ.
  Embedding cho điểm cao với cả hai bài khác nhau cùng chủ đề, nên dùng nó ở
  đây sẽ báo trùng nhầm hàng loạt. TF-IDF nhạy với việc dùng lại đúng từ ngữ,
  đúng thứ tự, nên phân biệt được "cùng chủ đề" với "cùng văn bản".

Cùng một phép đo cosine, hai không gian vector khác nhau, chọn theo bản chất
bài toán — không phải theo công cụ nào sẵn có.

**Cảnh báo chứ không chặn.** Giáo viên có thể cố ý giữ hai phiên bản của cùng
một bài giảng. Việc của hệ thống là chỉ ra, không phải quyết định thay.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.services.tfidf_service import _tokenize_vietnamese

logger = logging.getLogger(__name__)

# Ngưỡng coi là gần trùng, chọn theo số đo chứ không theo cảm tính. Đo trên các
# cặp văn bản tiếng Việt thực tế:
#
#   Copy nguyên                 1.0000  ─┐
#   Sửa vài chữ                 0.9574   │ trùng thật
#   Thêm một đoạn cuối          0.7338   │
#   Rút gọn còn một nửa         0.6718  ─┘
#   ────────────────────────── ngưỡng 0.60 nằm trong vùng trống ──────────────
#   Cùng chương, khác bài       0.1109  ─┐
#   Khác môn hoàn toàn          0.0103   │ không trùng
#   Cùng môn, khác chương       0.0000  ─┘
#
# Khoảng trống giữa hai nhóm rất rộng (0.11 → 0.67) nên ngưỡng không nhạy cảm
# với thay đổi nhỏ. Đặt nghiêng về phía ít báo nhầm: giáo viên bị cảnh báo sai
# vài lần sẽ bỏ qua mọi cảnh báo về sau.
NEAR_DUPLICATE_THRESHOLD = 0.60

# Số cảnh báo tối đa hiển thị — nhiều hơn thì thành nhiễu.
DEFAULT_LIMIT = 3


def find_near_duplicates(
    text: str,
    others: Sequence[Tuple[str, str]],
    *,
    threshold: float = NEAR_DUPLICATE_THRESHOLD,
    limit: int = DEFAULT_LIMIT,
) -> List[Dict[str, Any]]:
    """Tìm các tài liệu có nội dung gần trùng với `text`.

    `others` là các cặp `(document_id, nội_dung)` để đối chiếu. Trả về danh
    sách đã sắp theo độ tương đồng giảm dần.

    Không bao giờ ném lỗi: đây là bước cảnh báo bổ trợ, hỏng thì thôi chứ không
    được chặn việc tải học liệu lên.
    """
    target = (text or "").strip()
    candidates = [(doc_id, body.strip()) for doc_id, body in others if (body or "").strip()]
    if not target or not candidates:
        return []

    corpus = [target] + [body for _, body in candidates]
    try:
        vectorizer = TfidfVectorizer(
            analyzer="word",
            tokenizer=_tokenize_vietnamese,
            ngram_range=(1, 2),
            min_df=1,
            sublinear_tf=True,
        )
        matrix = vectorizer.fit_transform(corpus)
        scores = cosine_similarity(matrix[0:1], matrix[1:])[0]
    except Exception as exc:  # noqa: BLE001 - không được chặn luồng tải học liệu
        logger.warning(
            "Bỏ qua kiểm tra học liệu gần trùng: %s: %s", exc.__class__.__name__, exc
        )
        return []

    found = [
        {"document_id": doc_id, "similarity": round(float(score), 4)}
        for (doc_id, _), score in zip(candidates, scores)
        if float(score) >= threshold
    ]
    found.sort(key=lambda item: item["similarity"], reverse=True)
    return found[:limit]


async def check_document_for_duplicates(
    db,
    *,
    document_id: str,
    user_id: str,
    text: str,
    threshold: float = NEAR_DUPLICATE_THRESHOLD,
    limit: int = DEFAULT_LIMIT,
) -> List[Dict[str, Any]]:
    """Đối chiếu một tài liệu với các học liệu khác của cùng người dùng.

    Chỉ so trong phạm vi `user_id` — giống nguyên tắc của bước khử trùng theo
    checksum, để không lộ việc người khác đã tải tài liệu nào.
    """
    if not (text or "").strip():
        return []

    others: List[Tuple[str, str]] = []
    cursor = db["documents"].find(
        {"user_id": user_id, "deleted_at": None, "_id": {"$ne": _as_object_id(document_id)}},
        {"_id": 1},
    )
    other_ids = [str(doc["_id"]) async for doc in cursor]
    if not other_ids:
        return []

    async for content in db["document_contents"].find(
        {"document_id": {"$in": other_ids}}, {"document_id": 1, "extracted_text": 1}
    ):
        body = content.get("extracted_text") or ""
        if body.strip():
            others.append((str(content["document_id"]), body))

    matches = find_near_duplicates(text, others, threshold=threshold, limit=limit)
    if not matches:
        return []

    # Ghép tên để giáo viên biết trùng với tài liệu nào, thay vì một dãy id.
    names: Dict[str, str] = {}
    async for doc in db["documents"].find(
        {"_id": {"$in": [_as_object_id(m["document_id"]) for m in matches]}},
        {"_id": 1, "original_filename": 1},
    ):
        names[str(doc["_id"])] = doc.get("original_filename", "")
    for match in matches:
        match["original_filename"] = names.get(match["document_id"], "")
    return matches


def _as_object_id(value: str) -> Any:
    from bson import ObjectId

    return ObjectId(value) if ObjectId.is_valid(value) else value
