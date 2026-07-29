# 01 — Đánh giá công nghệ & kiến trúc mục tiêu

> Dựa trên [00-current-system-audit.md](00-current-system-audit.md). Chưa cài bất kỳ package nào ở tài liệu này — chỉ đánh giá.

---

## Phần A — Đánh giá công nghệ (Nhiệm vụ 2)

| Công nghệ | Vấn đề giải quyết | Có thật sự cần không | Giải pháp hiện có | Chi phí vận hành | Độ phức tạp | Quyết định |
|---|---|---|---|---|---|---|
| **Redis** | Cache truy vấn, session/rate-limit đếm nhanh, pub/sub cho đồng hồ thi real-time, hàng đợi job | **Có, nhưng hẹp phạm vi** — chỉ cho: (a) rate-limit/quota đếm theo cửa sổ thời gian (hiện đang đếm bằng query Mongo, chấp nhận được ở quy mô nhỏ nhưng sẽ chậm khi tăng tải), (b) cache kết quả web-grounding theo normalized query (giai đoạn 5, TTL rõ ràng). **Không dùng để hiển thị đồng hồ đếm ngược** — đồng hồ là tính toán frontend đồng bộ với `expires_at` từ backend, không cần Redis. | Hiện đang dùng Mongo trực tiếp cho quota/rate-limit (`system_settings.py`, `analytics_service.py`) — đủ dùng ở quy mô hiện tại (vài trăm người dùng). | Thấp nếu chỉ dùng cho cache/rate-limit (managed Redis, không cần cluster) | Thấp–vừa | **Hoãn.** Bắt đầu không có Redis; đo tải thật của quota-check và cache web-grounding trước. Chỉ thêm khi có số liệu cho thấy Mongo-based counting là nút thắt cổ chai. Nếu thêm, dùng đúng 2 việc trên, không dùng làm nguồn sự thật cho state của bài thi. |
| **OR-Tools CP-SAT** | Giải bài toán ràng buộc đa chiều khi sinh đề theo ma trận (đủ số câu, đúng tỷ lệ chủ đề/Bloom/độ khó/dạng câu, không trùng câu, không vượt thời gian) | **Có, đúng như yêu cầu giai đoạn 3.** Đây là bài toán constraint-satisfaction/optimization kinh điển — heuristic tự viết (vòng lặp chọn ngẫu nhiên có điều kiện) sẽ không đảm bảo tối ưu và khó chứng minh INFEASIBLE đúng. | Không có gì tương đương hiện tại — sinh câu hỏi hiện tại là AI-generate, không phải chọn-từ-ngân-hàng-theo-ràng-buộc. | Thấp (thư viện Python thuần, không cần service ngoài, không cần license) | Vừa — cần chuyển đổi mọi ràng buộc thành biến/hệ số nguyên, cần thời gian học cách mô hình hoá đúng (boolean var mỗi câu × mỗi vị trí, hoặc đơn giản hơn: biến chọn/không-chọn mỗi câu) | **Chấp nhận, dùng đúng vai trò constraint-solver.** Không dùng AI thay thế bước kiểm tra ràng buộc (đúng nguyên tắc đã nêu) — AI chỉ sinh/gắn nhãn câu hỏi vào ngân hàng, CP-SAT chọn tổ hợp câu thoả ma trận. |
| **Cloudinary SDK** | Lưu trữ tệp học liệu bền vững, tái sử dụng | **Đã dùng rồi**, không phải công nghệ mới | `app/services/cloudinary_service.py` đã có, kèm fallback local | Đã trả chi phí vận hành hiện tại (free/paid tier tuỳ cấu hình) | Thấp — mở rộng field metadata, không đổi cơ chế | **Mở rộng, không thay thế.** Xem [40-cloudinary-learning-materials.md](40-cloudinary-learning-materials.md). |
| **Gemini Grounding with Google Search** | Tìm nguồn Internet có kiểm chứng cho giai đoạn 5, tránh tự viết scraper HTML (vi phạm ToS Google, dễ vỡ) | **Đã dùng rồi — KHÔNG phải công nghệ mới cần đánh giá.** Đã xác minh: `learning_chat_service.py:604-655` gọi thật `tools=[{"google_search":{}}]`, trích citation từ `grounding_metadata.grounding_chunks`, đã có hàm chấm điểm domain sơ khai `get_domain_score()` (`.gov`→100, `.edu`→90, whitelist học thuật→80, `.org`→20, khác→10). Xem `00-current-system-audit.md` §6. | `learning_chat_service.py` (luồng "Hỏi đáp AI nâng cao") — hoạt động thật, chỉ là bản sơ khai chưa đủ chặt theo yêu cầu giai đoạn 5 (chưa redaction, chưa cache/quota ngày, chưa tách module tái sử dụng, chưa "lưu thành học liệu"). | Theo token/request của Gemini, có định mức miễn phí giới hạn — cần rate-limit + quota theo ngày như yêu cầu (hiện CHƯA có rate-limit riêng cho web-grounding, chỉ có `CHAT_RATE_LIMIT_PER_MINUTE` chung). | Thấp (đã chạy) → Vừa (phần mở rộng: redaction, cache, module hoá) | **Không đánh giá lại — mở rộng/hardening tính năng đã có**, không viết lại phần gọi grounding. Giai đoạn 5 tập trung: tách module, nâng cấp domain-scoring, thêm redaction + cache + quota ngày + bước giáo viên duyệt. |
| **Gemini URL Context** | Lấy nội dung đầy đủ từ URL cụ thể mà grounding trả về, phục vụ trích dẫn chính xác hơn | **Có**, dùng bổ sung cho Grounding khi cần đọc sâu một nguồn cụ thể (bước "URL Context cho nguồn được chọn nếu cần" trong pipeline giai đoạn 5) | Không có | Theo token, thấp hơn grounding vì chỉ gọi khi cần | Thấp | **Chấp nhận, dùng có điều kiện** (không gọi cho mọi nguồn, chỉ nguồn được chọn để tổng hợp). |
| **Structured Outputs** (Gemini) | Đảm bảo response JSON đúng schema cho claim/citation, giảm lỗi parse | **Có.** Hệ thống hiện tại đã tự ép "trả JSON nghiêm ngặt" bằng prompt engineering (`build_question_prompt`) — Structured Outputs làm việc này đáng tin cậy hơn, đúng hướng cải tiến sẵn có, không phải công nghệ lạ. | Prompt-based JSON hiện tại (`generate_json`, `gemini_generate_json`) — hoạt động nhưng phụ thuộc kỷ luật của model | Không tăng chi phí vận hành đáng kể | Thấp | **Chấp nhận**, áp dụng dần cho cả sinh câu hỏi hiện tại lẫn tính năng mới, không bắt buộc phải làm cùng lúc. |
| **Temporal** | Workflow phục hồi được qua nhiều bước, thời gian dài (ví dụ: ingest kho tri thức chuẩn nhiều giờ, có OCR, có human review giữa chừng) | **Không cần ở quy mô hiện tại.** Theo đúng nguyên tắc đã nêu ("không đưa Temporal vào nếu queue hiện tại đủ") — pipeline dài nhất hiện tại (transcribe video) mất vài chục giây tới vài phút, không phải nhiều giờ/nhiều ngày với human-in-the-loop phức tạp. | `BackgroundTasks` + polling — đủ cho quy mô này nếu bổ sung retry/idempotency đúng cách (xem giai đoạn 2). | Temporal cần vận hành thêm 1 service (Temporal server) — chi phí vận hành/độ phức tạp không tương xứng với bài toán hiện tại | Cao nếu thêm | **Từ chối cho giai đoạn 1–6.** Ghi nhận lại: nếu kho tri thức chuẩn (giai đoạn 6) sau này cần workflow multi-day có human-review-gate phức tạp thật sự, xét lại — không phải bây giờ. Thay vào đó dùng state machine + job queue đơn giản có retry/timeout/idempotency (xem giai đoạn 2). |
| **OpenTelemetry** | Observability chuẩn hoá (trace, metric) xuyên suốt các phân hệ mới | **Có nhu cầu thật** — 5 phân hệ mới đều cần đo latency (upload/parse/embed/retrieval/AI-response/chấm bài) như yêu cầu giai đoạn 2. Nhưng OTEL đầy đủ (collector, exporter, backend) là hạ tầng quan sát, không phải chỉ 1 thư viện. | Hiện chỉ có `activity_log_service`/`analytics_service` ghi Mongo — đủ để BẮT ĐẦU nhưng không có trace phân tán, không có dashboard chuẩn. | OTEL SDK miễn phí; chi phí thật nằm ở backend (Jaeger/Grafana Tempo/Honeycomb...) — **chưa xác định** backend nào khả dụng cho project này (giả định chưa xác minh). | Vừa (SDK) → Cao (nếu cần vận hành collector/backend riêng) | **Chấp nhận SDK ở mức tối thiểu, hoãn phần hạ tầng backend.** Dùng `structlog`/logging có `correlation_id`/`request_id` (giai đoạn 2, không cần OTEL) làm nền tảng ngay; thêm OTEL span/exporter thật khi có backend quan sát được xác nhận. Không để việc thiếu OTEL chặn tiến độ đo lường timing cơ bản. |
| **SSE hoặc WebSocket** | Đồng bộ đồng hồ đếm ngược bài thi, cập nhật trạng thái autosave real-time | **Không bắt buộc.** Yêu cầu chính (giai đoạn 4) đã nêu rõ: không dựa duy nhất vào bất kỳ cơ chế real-time nào làm nguồn sự thật — polling định kỳ (ví dụ mỗi 15–30s đồng bộ lại `server_now`/`expires_at`) đủ đáp ứng "không nhấp nháy, hỗ trợ tab background, hỗ trợ reconnect" nếu làm đúng debounce/backoff. | Không có SSE/WS nào trong stack hiện tại (frontend không có client lib nào cho việc này). | Polling: chi phí thấp, tận dụng REST API sẵn có. SSE/WS: cần hạ tầng giữ kết nối lâu (không tầm thường với FastAPI + nhiều worker). | Polling thấp; WS/SSE vừa-cao | **Dùng polling định kỳ + tính lại từ `expires_at`/`server_now` ở client, không dùng SSE/WebSocket.** Đúng nguyên tắc "backend là nguồn thời gian chính" — polling đơn giản, dễ kiểm thử, đủ tốt cho bài toán đồng hồ đếm ngược. Có thể xét WS sau nếu cần thông báo tức thời nhiều người dùng cùng lúc (không phải yêu cầu hiện tại). |
| **Background worker hiện có (BackgroundTasks) hoặc giải pháp thay thế** | Chạy tác vụ dài (transcribe, index, chấm bài, ingest kho tri thức, sinh đề theo ma trận nếu chậm) ngoài request-response | **Cần thay thế một phần** — `BackgroundTasks` không có: hàng đợi bền (mất khi restart), không retry tự động, không trạng thái job truy vấn được, không giới hạn concurrency. Những tác vụ MỚI (auto-submit sweeper, chấm bài tự luận AI, ingest kho chuẩn) cần trạng thái bền + retry — điều `BackgroundTasks` không cho. | `BackgroundTasks` (2 chỗ dùng, xem 00-current-system-audit.md §Background job) | Một job-queue nhẹ (ví dụ: bảng Mongo `jobs` tự quản lý với `status/attempts/next_run_at/locked_by/locked_until`, worker là 1 tiến trình `asyncio` polling định kỳ) — không cần service ngoài, không cần Redis/RabbitMQ. | Thấp–vừa | **Xây dựng "job queue tối giản trên Mongo"** (collection `background_jobs`, xem [10-foundation-implementation.md](10-foundation-implementation.md)) thay vì Celery/Temporal. Đủ retry-giới-hạn, timeout, trạng thái, idempotency-key theo đúng yêu cầu, không thêm hạ tầng vận hành mới. Giữ nguyên `BackgroundTasks` cho các tác vụ ngắn/không-cần-bền hiện có (không migrate ngay, tránh phá tính năng đang chạy) — chỉ dùng job-queue mới cho tính năng MỚI (auto-submit sweeper, chấm tự luận, ingest kho chuẩn dài hơi). |

**Nguyên tắc đã tuân thủ khi đánh giá:**
- Không đưa Temporal vào vì queue Mongo đơn giản + BackgroundTasks hiện tại đủ cho quy mô/độ dài tác vụ hiện có.
- Không đưa Redis vào chỉ để hiển thị đồng hồ — đồng hồ tính từ `expires_at` (backend) ở client, polling xác nhận lại.
- Không thay toàn bộ RAG — ChromaDB + `rag_service.py` hiện tại được mở rộng (namespace mới cho kho chuẩn), không thay thế.
- Không đổi database — mọi field mới đều thêm vào MongoDB hiện có.
- AI provider được bọc qua abstraction (xem Phần B, mục "AI provider abstraction") để không khoá cứng Gemini/Groq.

---

## Phần B — Kiến trúc mục tiêu (Nhiệm vụ 3)

### 1. Domain model
Xem chi tiết đầy đủ ở [02-data-model-plan.md](02-data-model-plan.md). Nguyên tắc tổng quát: **mọi entity mới đều có bộ field chuẩn hoá chung** (id, `created_at/updated_at`, `created_by/updated_by`, `owner_id`, `status`, `version`, `deleted_at` nếu áp dụng, audit event riêng) — xem [10-foundation-implementation.md](10-foundation-implementation.md) mục "Chuẩn hoá field".

### 2. API boundaries
- Mỗi phân hệ mới là **một router group riêng, prefix riêng, đăng ký kiểu vertical-slice** giống `app/personalization/` — không nhét endpoint mới vào `questions.py`/`documents.py` hiện có (giảm rủi ro回归 cho tính năng đang chạy thật).
- Namespace đề xuất: `/api/v1/question-bank/*`, `/api/v1/exam-blueprints/*`, `/api/v1/exams/*`, `/api/v1/exam-attempts/*`, `/api/v1/learning-materials/*` (Cloudinary tái sử dụng — có thể là phần mở rộng của `documents.py` thay vì router mới, vì đây thực chất là cùng một entity `Document`), `/api/v1/web-knowledge/*`, `/api/v1/curriculum/*`.
- Chi tiết endpoint từng phân hệ: [03-api-plan.md](03-api-plan.md).
- **AI provider abstraction**: thêm 1 interface tối giản `class GenerationProvider(Protocol)` với `generate_json(...)`, `embed(...)` — bọc quanh các hàm hiện có trong `llm_service.py` (không viết lại `llm_service.py`, chỉ thêm lớp adapter mỏng), để tính năng mới (chấm tự luận AI, tổng hợp web-grounding) không gọi thẳng `groq`/`gemini` SDK mà gọi qua interface này.

### 3. Background processing
- **Job queue tối giản trên Mongo** (collection `background_jobs`): `{_id, job_type, payload, status(pending/running/succeeded/failed/dead_letter), attempts, max_attempts, next_run_at, locked_by, locked_until, idempotency_key(unique index), result, error, created_at, updated_at}`.
- Worker: 1 tiến trình asyncio riêng (`python -m app.worker`) polling `background_jobs` mỗi N giây, `find_one_and_update` với điều kiện `status:"pending", next_run_at:{$lte: now}` để lock an toàn (tránh 2 worker xử lý cùng job — dùng chính optimistic-lock pattern đã có ở `document_mutation_service.py`).
- Dùng cho: auto-submit sweeper (giai đoạn 4), chấm tự luận AI bất đồng bộ (giai đoạn 4), ingest kho tri thức chuẩn dài hơi (giai đoạn 6), retry gọi Cloudinary khi lỗi tạm thời (giai đoạn 5).
- **Không migrate** 2 tác vụ `BackgroundTasks` hiện có (transcribe, verify) trong phạm vi các giai đoạn này — rủi ro/lợi ích không tương xứng; ghi nhận trong risk register là nợ kỹ thuật đã biết.

### 4. Storage
- MongoDB vẫn là nguồn sự thật chính cho mọi metadata (giữ nguyên quyết định "không đổi database").
- Cloudinary vẫn là nơi lưu file nhị phân (mở rộng metadata, không thay cơ chế — giai đoạn 5).
- ChromaDB vẫn là vector store, thêm namespace/collection mới cho kho tri thức chuẩn, tách biệt tài liệu giáo viên tự tải.

### 5. Caching
- Cache tối thiểu, có mục đích rõ: kết quả web-grounding theo normalized-query (TTL vài giờ tới vài ngày tuỳ độ "thời sự" của chủ đề), không cache kết quả cá nhân hoá/điểm số.
- Bắt đầu bằng cache trong Mongo (collection `web_knowledge_cache` với TTL index) — **không cần Redis ngay**, đúng quyết định ở Phần A.

### 6. Search và retrieval
- Interface retrieval chung `KnowledgeRetriever` (Protocol) với 2 cài đặt: `ChromaRetriever` (hiện tại, mở rộng filter theo môn/lớp/chương trình/phiên bản) và khả năng thêm `GeminiFileSearchRetriever` sau này **chỉ nếu có lợi rõ ràng đã đo được** — không migrate mặc định (đúng nguyên tắc giai đoạn 6).

### 7. Role-based access control
- Chuyển dần các endpoint MỚI sang dùng `require_role`/`require_permission` trung tâm (`app/core/rbac.py`) thay vì role-check cục bộ kiểu cũ — bổ sung permission mới vào `Permission` catalog: `question_bank.manage`, `exam_blueprint.manage`, `exam.publish`, `exam_attempt.grade_override`, `curriculum.publish`, v.v.
- Ownership check ở tầng service (không chỉ role) cho mọi entity có `owner_id` — học sinh không bao giờ gọi được API ghi của giáo viên/admin dù có sửa role ở phía client (backend luôn là nguồn xác thực role, đọc lại từ JWT + DB mỗi request, không tin field role trong payload gửi lên).

### 8. Audit log
- Dùng lại `activity_log_service`/`admin_audit_service` hiện có cho mọi hành động ghi của các phân hệ mới (tạo blueprint, publish đề, override điểm, publish nguồn kho chuẩn...) — không phát minh cơ chế audit mới.

### 9. Versioning
- Field `version: int` tăng dần trên mọi entity có thể sửa đồng thời (Question, ExamBlueprint, Exam, ExamAttempt) — dùng cho optimistic concurrency (so khớp version khi ghi, 409 nếu lệch, client phải tải lại).
- Field `document_version`/`curriculum_version` (string, ví dụ "2018", "2006") cho nội dung giáo dục — khác ý nghĩa với `version` số nguyên ở trên, không được nhầm lẫn hai khái niệm.

### 10. Observability
- Structured logging (JSON logger, không đổi thư viện — chỉ đổi format của `logging` chuẩn) kèm `correlation_id`/`request_id` gắn qua middleware mới (giai đoạn 2), log ra timing các bước (upload/parse/embed/retrieval/AI-response/chấm bài) như yêu cầu, KHÔNG log nội dung prompt/câu trả lời chứa dữ liệu nhạy cảm (chỉ log độ dài, hash, hoặc metadata).
- Tận dụng `analytics_service` hiện có để mở rộng thêm operation_type mới (`exam_grading`, `web_grounding_search`, `curriculum_ingest`) theo đúng field đã có (`latency_ms, provider, model, status, error_code`).

### 11. Retry và idempotency
- Idempotency-key bắt buộc cho: nộp bài thi, autosave, tạo blueprint từ template, generate exam từ blueprint, webhook Cloudinary — lưu key vào unique index, request lặp lại trả kết quả đã lưu thay vì chạy lại.
- Retry giới hạn (ví dụ tối đa 3 lần, backoff tăng dần) cho mọi lời gọi ra ngoài (AI provider, Cloudinary) — đã có tiền lệ `MAX_RETRIES: int = 2` trong `config.py`, mở rộng áp dụng nhất quán.

### 12. Feature flags
- Mỗi phân hệ mới có 1 flag riêng trong `system_settings`/`config.py`, theo đúng mẫu `PERSONALIZATION_ENABLED` hiện có: `ENABLE_EXAM_BLUEPRINT`, `ENABLE_TIMED_EXAM`, `ENABLE_WEB_KNOWLEDGE`, `ENABLE_CURRICULUM_KB` — mặc định `False`, bật dần theo roadmap.

### 13. Migration strategy
- Mọi migration là **script độc lập, idempotent, có dry-run**, đặt tại `backend/scripts/migrations/` (thư mục mới, cạnh `bootstrap_admin.py` đã có) — không dùng framework migration nặng (không cần thiết ở quy mô này), chỉ cần script Python thuần theo mẫu `bootstrap_admin.py` (đã có sẵn guard production, connect/close Mongo rõ ràng).
- Nguyên tắc bắt buộc: backfill field mới với giá trị mặc định an toàn (không phá dữ liệu cũ), có thể chạy lại nhiều lần không gây trùng lặp (kiểm tra field đã tồn tại trước khi set).

### 14. Rollback strategy
- Vì mọi migration chỉ **thêm field** (không xoá/đổi kiểu field cũ), rollback = bỏ qua field mới (ứng dụng cũ vẫn đọc được document). Với thay đổi cấu trúc lớn hơn (ví dụ tách `questions[]` thành collection riêng — nếu quyết định làm), rollback cần script nghịch đảo tương ứng, viết cùng lúc với migration xuôi, kiểm thử cả hai chiều trên dữ liệu mẫu trước khi chạy trên dữ liệu thật.

---

## Ghi chú kết thúc Nhiệm vụ 2 & 3
- Chưa cài đặt package nào (OR-Tools, Cloudinary mở rộng, v.v.) — chỉ đánh giá theo đúng yêu cầu "không tự động cài".
- Chưa migration database, chưa sửa nghiệp vụ hiện có.
- Giả định chưa xác minh cần theo dõi tiếp ở giai đoạn 2: có backend quan sát (Grafana/Honeycomb...) khả dụng không.
- Đã xác minh (không còn là giả định): `learning_chat_service.py` dùng Gemini Grounding thật, không phải schema rỗng — xem `00-current-system-audit.md` §6.
