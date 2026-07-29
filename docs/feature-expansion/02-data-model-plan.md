# 02 — Kế hoạch mô hình dữ liệu

> Dựa trên [00-current-system-audit.md](00-current-system-audit.md) §3–4. Nguyên tắc: **mọi collection mới đều mang bộ field chuẩn hoá chung** (định nghĩa đầy đủ ở [10-foundation-implementation.md](10-foundation-implementation.md)) — tài liệu này chỉ liệt kê field **đặc thù nghiệp vụ** thêm vào, không lặp lại field chuẩn ở mỗi bảng.

## Bộ field chuẩn hoá dùng chung cho MỌI collection mới
```
_id: ObjectId
created_at: datetime (UTC)
updated_at: datetime (UTC)
created_by: str (user_id)
updated_by: str (user_id)
owner_id: str (user_id) — người/đơn vị sở hữu nghiệp vụ (có thể khác created_by, ví dụ admin tạo hộ)
status: str (theo state machine riêng từng entity, xem dưới)
version: int, mặc định 1 — tăng dần mỗi lần ghi, dùng optimistic concurrency
deleted_at: Optional[datetime] — soft delete, null nếu chưa xoá
```
Chi tiết cơ chế idempotency-key, audit-event xem [10-foundation-implementation.md](10-foundation-implementation.md).

---

## 1. `Question` — Ngân hàng câu hỏi (giai đoạn 3)

**Quyết định mapping:** đề xuất **tách thành collection `questions` độc lập**, KHÔNG tiếp tục nhúng trong `question_sets.questions[]`. Lý do: ngân hàng câu hỏi theo yêu cầu phải được **dùng chung nhiều đề**, có version/lifecycle riêng từng câu, filter theo chủ đề/chuẩn đầu ra độc lập với bất kỳ đề nào — cấu trúc nhúng hiện tại không hỗ trợ việc này (một câu chỉ thuộc đúng 1 `question_set`).

**Chiến lược tránh phá dữ liệu hiện có:** `question_sets.questions[]` (nhúng) **không xoá, không đổi hành vi** — đây tiếp tục là kết quả "sinh đề nhanh" hiện tại của giáo viên (Q&A tự động một-lần, không qua ngân hàng). Collection `questions` mới là bổ sung song song, phục vụ RIÊNG cho luồng ngân hàng câu hỏi/ma trận. Câu hỏi sinh ra qua `/questions/generate` có thể (tuỳ chọn, không bắt buộc) được "đưa vào ngân hàng" — lúc đó mới tạo bản ghi `questions` tương ứng, giữ liên kết `origin_question_set_id`+`origin_question_index` để truy vết nguồn gốc, không di chuyển/xoá dữ liệu gốc.

```
subject_id: str            # FK tới danh mục môn học (tạo mới nếu chưa có danh mục — xem "Subject/Chapter/Topic" bên dưới)
grade: int                 # 6..12 (theo hệ thống hiện tại: subjects/grades đã tồn tại trong personalization onboarding — TÁI SỬ DỤNG danh mục môn/lớp có sẵn ở app/personalization/schemas/onboarding.py, không tạo danh mục song song)
curriculum_version: str    # ví dụ "2018", "2006" — chương trình giáo dục
chapter_id: Optional[str]
topic_id: Optional[str]
learning_outcome_id: Optional[str]   # chuẩn đầu ra — danh mục mới, chưa có tiền lệ trong hệ thống
bloom_level: str            # remember|understand|apply|analyze — TÁI SỬ DỤNG đúng 4 giá trị đã dùng ở question_generation_service.py, KHÔNG thêm evaluate/create để tránh vỡ tương thích với dữ liệu Bloom hiện có
difficulty: str              # easy|medium|hard — tái sử dụng đúng 3 giá trị hiện tại
question_type: str           # multiple_choice|true_false|short_answer — tái sử dụng đúng 3 giá trị hiện tại (không mở rộng "matching/ghép cặp" ở giai đoạn 3; nếu giai đoạn 4 cần "ghép cặp" cho chấm tự động, bổ sung giá trị mới lúc đó, có migration riêng)
content: str
options: Optional[dict]      # giữ nguyên hình dạng {A:..,B:..,C:..,D:..} như hiện tại cho multiple_choice
correct_answer: str
explanation: str
points: float, mặc định 1.0
expected_time_seconds: int, mặc định 60
source_document_id: Optional[str]
source_chunk_ids: list[str] = []
citation: Optional[str]      # trích dẫn nguồn gốc nội dung (trang/mục) nếu có
quality_status: str           # unreviewed|flagged|verified — độc lập với `status` lifecycle (workflow) bên dưới, đây là đánh giá CHẤT LƯỢNG nội dung
origin_question_set_id: Optional[str]   # nếu được đưa vào ngân hàng từ một question_set đã sinh
origin_question_index: Optional[int]
tags: list[str] = []
usage_count: int = 0          # số lần được chọn vào một Exam đã publish — dùng cho ràng buộc "hạn chế câu đã dùng gần đây" ở CP-SAT
last_used_at: Optional[datetime]
```

**Trạng thái (`status`):** `draft → reviewing → approved → published → archived` (đúng theo yêu cầu). Ghi chú khác biệt với workflow hiện tại của `question_sets.questions[].status` (`draft/review_pending/approved/published`) — **không dùng chung tên trạng thái/transition map** để tránh nhầm hai state machine của hai entity khác nhau; đặt tên field code là `QuestionBankStatus` (phân biệt với `QuestionWorkflowStatus` hiện có trong `app/schemas/question.py`).

**Danh mục Subject/Chapter/Topic/LearningOutcome:** hiện KHÔNG có danh mục chuẩn nào trong hệ thống (personalization onboarding chỉ có `subjects[]`/`exam_combinations[]` dạng option tĩnh trả về từ API, không phải collection có thể mở rộng bởi giáo viên). Đề xuất: collection mới `curriculum_taxonomy` (subject/chapter/topic/learning_outcome dạng cây, `parent_id` tự tham chiếu) — **dùng chung cho cả giai đoạn 3 (ngân hàng câu hỏi) và giai đoạn 6 (kho tri thức chuẩn)**, tránh 2 danh mục song song không đồng bộ.

---

## 2. `ExamBlueprint` — Ma trận đề (giai đoạn 3)

```
name: str
subject_id: str
grade: int
curriculum_version: str
total_points: float
duration_minutes: int
constraints: {
  topics: [ { topic_id, question_count?, points? } ],       # theo chủ đề — số câu HOẶC điểm, không bắt buộc cả hai
  bloom_distribution: [ { bloom_level, question_count?, points? } ],
  difficulty_distribution: [ { difficulty, question_count?, points? } ],
  question_type_distribution: [ { question_type, question_count?, points? } ],
  max_time_seconds: Optional[int],                           # tổng expected_time_seconds không vượt quá (nếu set)
  exclude_recently_used_days: Optional[int],                 # loại câu đã dùng trong N ngày gần nhất
}
status: str        # draft|validated|published|archived
```

## 3. `Exam` — Đề thi sinh ra từ blueprint (giai đoạn 3/4)

```
blueprint_id: str
blueprint_version: int      # snapshot version của blueprint tại thời điểm sinh — đề đã publish không đổi theo blueprint sửa sau này
code: str                   # mã đề, ví dụ "101", "102" cho các mã đề tương đương
question_ids: list[str]     # tham chiếu vào collection questions, GIỮ THỨ TỰ hiển thị
question_order_seed: Optional[int]   # seed dùng để đảo câu/đáp án — tái tạo lại được đúng thứ tự
total_points: float
duration_minutes: int
status: str          # draft|ready|published|closed|archived
published_at: Optional[datetime]
audience_type: str    # all|classes — TÁI SỬ DỤNG đúng khái niệm đã có ở question_sets.audience_type
target_class_ids: list[str] = []
equivalent_group_id: Optional[str]   # nhóm các mã đề tương đương cùng 1 lần sinh (101, 102, 103...) trỏ về cùng group
```

---

## 4. `ExamAttempt` — Phiên làm bài có giới hạn thời gian (giai đoạn 4)

**Mapping:** đây là entity **hoàn toàn mới**, KHÔNG tái sử dụng `question_attempts` hiện có (luyện tập tự do, không giới hạn thời gian) — hai collection song song, phục vụ hai mục đích khác nhau như đã ghi ở `00-current-system-audit.md` §5.

```
exam_id: str
user_id: str
status: str    # created|in_progress|submitted|auto_submitted|expired|grading|graded|cancelled|invalidated
started_at: datetime          # UTC, backend sinh, KHÔNG nhận từ client
expires_at: datetime          # started_at + exam.duration_minutes, backend tính
submitted_at: Optional[datetime]
grading_started_at: Optional[datetime]
graded_at: Optional[datetime]
submission_type: Optional[str]   # manual|auto_timeout|auto_sweeper — phân biệt học sinh tự nộp hay hệ thống tự nộp, và nộp bởi lớp nào (frontend request hay background sweeper)
answers: dict[question_id, {
  answer: Any,
  answered_at: datetime,
  revision: int,               # tăng dần mỗi lần sửa câu đó — dùng cho patch-per-answer + tránh ghi đè dữ liệu mới bằng cũ
}]
score: Optional[float]
max_score: float
grading_details: [ {
  question_id, points_earned, max_points, method: "auto"|"rule"|"ai_suggested"|"teacher_override",
  ai_score: Optional[float], ai_confidence: Optional[float], ai_reasoning: Optional[str], ai_evidence: Optional[str],
  teacher_score: Optional[float], teacher_id: Optional[str], teacher_note: Optional[str], overridden_at: Optional[datetime],
} ]
last_autosave_at: Optional[datetime]
idempotency_keys: {              # map action → key đã xử lý, chống double-submit/double-start
  start: Optional[str], submit: Optional[str],
}
```
`version` (từ bộ field chuẩn) dùng cho optimistic concurrency ở MỌI lần ghi `answers` (autosave) — client gửi kèm `version` đã biết, server so khớp, 409 nếu lệch (2 tab cùng sửa).

**Trạng thái đầy đủ** (đúng yêu cầu, có bổ sung `expired/cancelled/invalidated` như đã cân nhắc):
`created → in_progress → {submitted | auto_submitted} → grading → graded`, nhánh phụ: `in_progress → expired` (backend phát hiện quá hạn nhưng chưa kịp chuyển `auto_submitted` — trạng thái trung gian cực ngắn trước khi sweeper/endpoint xử lý xong), `* → cancelled` (giáo viên/admin huỷ phiên lỗi), `* → invalidated` (phát hiện gian lận/lỗi hệ thống nghiêm trọng, điểm không tính).

## 5. `Answer` (nhúng trong `ExamAttempt.answers`, không tách bảng riêng)
Không tạo collection riêng — nhúng theo `dict[question_id, ...]` như trên để hỗ trợ **patch-per-answer** (ghi 1 câu, không ghi đè toàn mảng) hiệu quả bằng Mongo `$set` theo dot-path (`answers.<question_id>.answer`), đúng yêu cầu "gửi patch câu trả lời thay vì toàn bộ bài".

## 6. `Score` (nhúng trong `ExamAttempt`, không tách bảng riêng)
`score`/`max_score`/`grading_details` đã đủ biểu diễn — tách bảng riêng không mang lại lợi ích rõ ràng ở quy mô này, giữ đơn giản.

---

## 7. `KnowledgeSource` — Kho tri thức chuẩn (giai đoạn 6)

```
title: str
organization: str
source_type: str            # sgk|sach_tham_khao|van_ban_bo|tai_lieu_hoc_thuat|khac
url: Optional[str]
asset_id: Optional[str]     # nếu tải lên qua Cloudinary — TÁI SỬ DỤNG cơ chế lưu trữ của documents (giai đoạn 5), KHÔNG dựng cơ chế lưu file riêng
subject_id: str              # trỏ vào cùng curriculum_taxonomy với Question (mục 1)
grade: int
curriculum: str
school_year: Optional[str]
document_code: Optional[str]
edition: Optional[str]
published_at: Optional[datetime]
effective_from: Optional[datetime]
effective_to: Optional[datetime]
checksum: str                # SHA-256, dùng phát hiện trùng — TÁI SỬ DỤNG cùng cơ chế checksum thêm vào Document ở giai đoạn 5
ingestion_status: str         # registered|downloaded|checksum_verified|parsing|normalizing|chunking|embedding|indexing|quality_check|published (xem pipeline chi tiết ở docs/feature-expansion/60-standard-curriculum-knowledge.md khi triển khai)
review_status: str            # pending|approved|rejected
reviewer_id: Optional[str]
supersedes_source_id: Optional[str]
```

**Chunk của kho chuẩn** — collection mới `curriculum_chunks` (KHÔNG dùng chung `document_chunks` hiện tại, để tránh trộn lẫn tài liệu giáo viên tự tải với nội dung đã duyệt chính thức — đúng nguyên tắc đã nêu ở giai đoạn 6):
```
source_id: str
document_version: str
page: Optional[int]
section: Optional[str]
chapter: Optional[str]
topic_id: Optional[str]
subject_id: str
grade: int
curriculum: str
text: str
checksum: str
citation_label: str          # ví dụ "SGK Toán 10, tr.45, Chương 2"
```
Vector tương ứng lưu trong ChromaDB collection riêng `curriculum_chunks_{source}_{dimension}d` (namespace tách biệt `document_chunks_*` hiện tại).

---

## 8. `WebKnowledgeQuery` — Khai thác Internet có kiểm chứng (giai đoạn 5)

Không có tiền lệ collection nào — mới hoàn toàn, nhưng **tái sử dụng schema `WebCitation` đã có** (`app/schemas/chat.py`) làm nền, mở rộng thêm field theo yêu cầu:
```
query: str
normalized_query: str        # dùng làm cache key
purpose: Optional[str]        # phân loại mục đích (giải thích khái niệm, tìm ví dụ, kiểm chứng số liệu...)
redacted: bool                 # có phát hiện/lọc dữ liệu nhạy cảm trong query không
results: [ {
  title, summary, source_url, source_title, publisher, accessed_at, published_at,
  snippet, confidence, evidence_status, conflict_warning: bool,
  claims: [ { claim_text, source_url, confidence } ],
} ]
generated_by_model: str
requested_by_user_id: str
review_status: str            # pending|approved_by_teacher|rejected — trước khi có thể "lưu thành học liệu"
saved_as_document_id: Optional[str]   # nếu giáo viên chọn lưu thành học liệu, trỏ sang Document (giai đoạn 5) đã tạo
```
Cache TTL riêng ở collection `web_knowledge_cache` (key = `normalized_query`, xem `01-target-architecture.md` §Caching).

---

## 9. Bảng tổng hợp mapping "mới hoàn toàn" vs "mở rộng" vs "tái sử dụng nguyên trạng"

| Entity | Quyết định |
|---|---|
| `questions` (ngân hàng) | **Mới hoàn toàn** — song song với `question_sets.questions[]`, không thay thế |
| `curriculum_taxonomy` | **Mới hoàn toàn** — dùng chung cho giai đoạn 3 & 6 |
| `exam_blueprints`, `exams` | **Mới hoàn toàn** |
| `exam_attempts` | **Mới hoàn toàn** — song song với `question_attempts`, không thay thế |
| `documents` | **Mở rộng field** (checksum, version, tags, deleted_at) — không đổi cơ chế |
| `curriculum_sources`, `curriculum_chunks` | **Mới hoàn toàn** — namespace riêng, không trộn với `document_chunks` |
| `web_knowledge_queries`, `web_knowledge_cache` | **Mới hoàn toàn** — logic grounding **tái sử dụng** phần đã có trong `learning_chat_service.py` (xem `00-current-system-audit.md` §6) |
| `background_jobs` | **Mới hoàn toàn** (giai đoạn 2 — nền tảng dùng chung) |
| `users`, `question_sets`, `question_attempts`, `document_chunks`, `activity_logs` | **Tái sử dụng nguyên trạng**, không sửa |
