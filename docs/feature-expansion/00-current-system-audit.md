# 00 — Khảo sát hệ thống hiện tại (2026-07-29)

> Giai đoạn 1 của chuỗi phát triển mở rộng EzEdu AI. Tài liệu này là nguồn sự thật duy nhất về "hiện trạng" cho toàn bộ các giai đoạn sau — không suy đoán, mọi khẳng định đều trích dẫn file:dòng cụ thể. Khảo sát thực hiện trên bản sao project tại `/Users/macos/Documents/Zalo Received Files/chuyende-thunghiem-1`.

**Giả định chưa xác minh (cần người phụ trách xác nhận):**
- Không tìm thấy `CLAUDE.md` ở gốc project — coi như chưa có quy ước riêng nào bắt buộc phải tuân theo ngoài những gì suy ra được từ code.
- Không rõ môi trường "production" thật của EzEdu AI trông như thế nào (bao nhiêu tài liệu, bao nhiêu người dùng đồng thời) — mọi đánh giá "chi phí vận hành"/"độ phức tạp" ở tài liệu 01 dựa trên quy mô suy đoán từ `app/core/config.py` (`max_documents_per_user=200`, quota nhỏ) — tức là một hệ thống **quy mô nhỏ/vừa**, không phải hạ tầng lớn.
- `sentry-sdk` có trong `requirements.txt` nhưng không được khởi tạo ở đâu — không rõ đây là dự định dở dang hay dependency thừa.
- `opentelemetry-*` xuất hiện gián tiếp qua `chromadb` — cần xác nhận đây chỉ là transitive dependency, không phải chủ đích dùng OTEL ở tầng ứng dụng.

**Đã xác minh và SỬA lại một giả định ban đầu sai:** Gemini Grounding with Google Search **đã được triển khai thật**, không phải tính năng cần xây từ đầu ở giai đoạn 5 — xem mục 7 mới bên dưới.

---

## 1. Stack hiện tại

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Frontend framework | React 19.2 + Vite 8 + react-router-dom 7 | Không có Redux/Zustand/react-query/SWR — state cục bộ qua `useState`/Context. Không có WebSocket client lib. |
| Backend framework | FastAPI 0.137 + Uvicorn (async) | Toàn bộ router là `async def`. |
| Database | MongoDB qua Motor (`pymongo` driver async) | Không có ORM/ODM (không Beanie/MongoEngine) — routers/services gọi `get_database()` rồi thao tác dict thô. Riêng `app/personalization/repositories/` có lớp repository trừu tượng (ngoại lệ duy nhất). |
| Vector DB | ChromaDB (persistent client, `backend/chroma_db/`) | Có thật, không phải mock. Collection đặt tên theo `document_chunks_{source}_{dimension}d`. |
| AI provider | Groq (`llama-3.3-70b-versatile`) + Gemini (`gemini-2.5-flash`, `text-embedding-004`) | Gọi trực tiếp qua hàm rời rạc trong `app/services/llm_service.py`, **không có lớp abstraction chung** (không có `class LLMProvider` interface). |
| File storage | Cloudinary SDK, có fallback lưu đĩa cục bộ (`local://` pseudo-URL) | Xem chi tiết mục 6. |
| Auth | JWT (python-jose) + bcrypt | `app/routers/auth.py`, `app/core/security.py`. |
| Background job | **Chỉ có FastAPI `BackgroundTasks`** | Không Celery/RQ/arq/APScheduler. Không sống sót qua restart (có cơ chế phục hồi thủ công cho verification, KHÔNG có cho transcription). |
| Logging | `logging` chuẩn của Python | Không structlog. Sentry cài nhưng chưa init. |
| Monitoring | Middleware tự viết (`error_monitoring_middleware`) + `activity_logs` + `analytics_service` (usage events) | Không OpenTelemetry ở tầng app. |
| Test | `unittest.IsolatedAsyncioTestCase` + `mongomock_motor` | 29 file, không pytest fixtures, không `conftest.py`. |

---

## 2. Luồng xử lý học liệu hiện tại (đầu-cuối)

```
POST /documents/upload
  → lưu file tạm (backend/uploads/) → upload_file_to_cloudinary()
      ├─ Cloudinary configured  → cloudinary.uploader.upload/upload_large()
      └─ Cloudinary KHÔNG configured → copy vào backend/uploads/persisted_{uuid}_{name}, trả "local://..." giả lập
  → insert Mongo `documents` {status:"uploaded", cloudinary_url, cloudinary_public_id, media_kind, ...}
  → NẾU là tài liệu (không phải video): extract_and_store_document_content() chạy ĐỒNG BỘ ngay trong request upload
      → status "processed" | "failed"
  → NẾU là video: KHÔNG tự động làm gì thêm — cần gọi riêng POST /{id}/transcribe

POST /{id}/extract        (tài liệu — có thể gọi lại force=true)
  → status "extracting" → pymupdf/python-docx/python-pptx → "processed" | "failed"

POST /{id}/transcribe     (video only, cần GROQ_API_KEY)
  → status "transcribing" → BackgroundTasks chạy ffmpeg + Groq Whisper → "transcribed" | "failed"
  → CHẠY NGẦM QUA BackgroundTasks — KHÔNG có cơ chế phục hồi nếu server restart giữa chừng

POST /{id}/index          (cả tài liệu lẫn video, cần document đã "processed"/"transcribed")
  → status "indexing" → chunk (semantic + langchain fallback) → embed (Gemini hoặc hash nội bộ) → ghi ChromaDB + Mongo document_chunks → "indexed" | "index_failed"

POST /questions/generate  (yêu cầu status == "indexed", 409 nếu chưa)
  → TF-IDF keyword extraction → sinh câu hỏi song song Groq+Gemini → dedupe → cross-validate (CẢ HAI phải "valid") → Bloom classification → lưu question_sets{questions:[], workflow_counts, keywords, bloom_distribution}
```

**Trạng thái tài liệu đầy đủ** (field `status` trên `documents`): `uploaded → {extracting → processed | failed}` hoặc `{transcribing → transcribed | failed} → {indexing → indexed | index_failed} `, cộng thêm `deleting` (transient) và cờ độc lập `quarantined_at` (không phải status, chặn extract/index/chat/gen khi bật).

**Khoá tương tranh (optimistic lock):** `app/services/document_mutation_service.py` — field `document_mutation_token/operation/previous_status` trên chính document, trả 409 nếu có thao tác khác đang chạy. Đây là cơ chế **compare-and-set thủ công**, không dùng field `version` số nguyên tăng dần kiểu thông thường.

---

## 3. Sơ đồ dữ liệu hiện có (theo yêu cầu Nhiệm vụ 1.2)

| Thực thể yêu cầu khảo sát | Đã có trong hệ thống? | Collection / vị trí | Field chính |
|---|---|---|---|
| **User** | ✅ Có | `users` | `_id, email, password_hash, full_name, role, status(active/locked/deleted), is_active, deleted_at, email_verified, permissions_override, current_quota, created_at, updated_at, last_login_at`. Schema: `app/schemas/auth.py` |
| **Role** | ✅ Có (đơn giản, không bảng riêng) | field `role` trên `users`, catalog quyền ở `app/core/rbac.py` | 8 giá trị: `user, student, lecturer, analyst, support, moderator, admin, super_admin`. `ROLE_PERMISSIONS` map role→permission set (chỉ áp dụng cho 5 role quản trị; `student/lecturer/user` không có permission chi tiết, chỉ role-check thô). |
| **Document** | ✅ Có | `documents` | Xem mục 2. **KHÔNG có field `version`, `checksum`, `tags`, `deleted_at` (xoá cứng, không soft-delete)** — đây là khoảng trống so với yêu cầu Cloudinary mở rộng (giai đoạn 5). |
| **Question** | ✅ Có (nested, không phải document Mongo độc lập) | `questions[]` **nhúng bên trong** `question_sets` — KHÔNG phải collection riêng `questions` | Field mỗi câu: `question, options, correct_answer, explanation, difficulty, question_type, bloom_level, tags, status(draft/review_pending/approved/published), reviewed_by, reviewed_at, published_at`. **KHÔNG có** `subject_id, grade, curriculum_version, chapter_id, topic_id, learning_outcome_id, points, expected_time_seconds, source_chunk_ids, citation, version, owner_id` (owner suy ra từ `question_sets.user_id`, không có ở từng câu) — đây là khoảng trống lớn nhất so với domain model ngân hàng câu hỏi (giai đoạn 3). |
| **Question set** | ✅ Có | `question_sets` | `document_id, user_id, document_name, question_count, difficulty, question_type, questions[], validation_stats, keywords[], bloom_distribution{}, workflow_counts{}, published_question_count, audience_type(all/classes), target_class_ids[], created_at, updated_at`. Đây là thực thể gần nhất với "đề thi" hiện tại — **KHÔNG có `duration_minutes`, không có ma trận nguồn gốc (blueprint), không có mã đề tương đương**. |
| **Exam** | ❌ **KHÔNG có model riêng** | — | "Exam" hiện chỉ là **nhãn hiển thị/log** (`activity_logs.action="exam_created"`, admin view `GET /admin/content/exams` chỉ là repackage của `question_sets`). Không có blueprint, không có phiên bản đề, không có thời gian giới hạn. **Đây là khoảng trống cốt lõi nhất** mà giai đoạn 3 & 4 phải lấp đầy. |
| **Exam attempt** | 🟡 Có một dạng rất hạn chế | `question_attempts` | `question_set_id, user_id, answers[], score, max_score, percent, created_at`. **KHÔNG có** `started_at, expires_at, submitted_at, status machine, version, submission_type` — đây là luyện tập tự do không giới hạn thời gian, KHÔNG phải "exam attempt" theo nghĩa giai đoạn 4 yêu cầu. Phải mở rộng mạnh, không thể tái sử dụng nguyên trạng. |
| **Answer** | 🟡 Nhúng trong `question_attempts.answers[]` | — | `question_index, answer, is_correct` (suy từ code, cần đọc thêm schema `app/schemas/question.py:85-111` khi triển khai chi tiết). Không có timestamp riêng từng câu, không có version. |
| **Score** | 🟡 Nhúng | `question_attempts.score/max_score/percent` | Chỉ có kết quả tổng, không có `grading_details`, không có audit thay đổi điểm, không có điểm AI-gợi-ý riêng với điểm cuối. |
| **Conversation** | ✅ Có | `conversations` (suy từ `test_conversation_management.py`, `app/services/learning_chat_service.py`) | Dùng cho tính năng hỏi-đáp AI (chat.py) — không phải trọng tâm giai đoạn này nhưng là ví dụ tốt cho pattern "citation + evidence_status" đã có sẵn (`app/schemas/chat.py:62-77`), có thể tái sử dụng ý tưởng cho giai đoạn 6 (kho tri thức chuẩn) và giai đoạn 5 (Internet có kiểm chứng). |
| **Knowledge source** | ❌ **KHÔNG có** | — | Không có source registry, không có khái niệm "kho tri thức chuẩn" tách biệt khỏi "tài liệu giáo viên tự tải lên". Giai đoạn 6 phải xây từ đầu — nhưng có thể **tái sử dụng gần như nguyên vẹn** pipeline chunk/embed/index hiện tại của `documents.py`/`rag_service.py`, chỉ cần thêm metadata registry bọc ngoài. |

---

## 4. Phần tái sử dụng được / phải mở rộng / phải migration

### Tái sử dụng gần như nguyên vẹn
- **Pipeline chunk + embedding + ChromaDB** (`rag_service.py`, `text_chunking_service.py`) — đã có hybrid rerank, đã tách theo `(source, dimension)`, đủ tốt cho cả "kho tri thức chuẩn" (giai đoạn 6) lẫn "khai thác Internet" (giai đoạn 5, phần lưu snapshot làm học liệu).
- **Cơ chế feature flag** (`app/core/config.py` + `require_feature_enabled` dependency) — dùng lại y nguyên cho mọi tính năng mới (Cloudinary bắt buộc, exam timer, web-grounding, v.v.), đã được kiểm chứng qua module `personalization`.
- **Pattern "vertical slice" của `app/personalization/`** (`api/`, `schemas/`, `services/`, `repositories/`, `constants/`, đăng ký router có prefix + dependency gate riêng trong `main.py`) — khuôn mẫu kiến trúc tốt nhất hiện có, nên áp dụng cho mọi phân hệ mới (exam-bank, timed-exam, cloudinary-reuse, web-knowledge, curriculum-kb).
- **RBAC trung tâm** (`app/core/rbac.py`: `require_role`, `require_permission`, `Permission` catalog) — nên chuyển các router "nghiệp vụ" (documents/questions) sang dùng lại helper này thay vì role-check rời rạc, và **bắt buộc** dùng cho mọi endpoint mới.
- **Document mutation lock** (optimistic CAS qua `document_mutation_token`) — mẫu tốt để tái sử dụng cho `ExamAttempt`/`ExamBlueprint` version-conflict thay vì phát minh lại.
- **Dual-AI cross-validation pattern** trong sinh câu hỏi — mẫu tham khảo tốt cho "AI chấm tự luận + confidence + teacher override" ở giai đoạn 4.
- **`activity_log_service` + `analytics_service`** — dùng lại cho audit log & telemetry của mọi phân hệ mới, không cần phát minh cơ chế mới.

### Phải mở rộng
- **`documents` collection**: thêm `version`, `checksum` (SHA-256), `tags[]`, `deleted_at` (soft-delete), `asset_id`/`public_id` tách biệt rõ khỏi cloudinary_url hiện tại (giai đoạn 5).
- **Từ `questions[]` nhúng → cân nhắc collection `questions` độc lập** (xem mục "API contract có nguy cơ" bên dưới) để hỗ trợ ngân hàng câu hỏi dùng chung nhiều đề, versioning từng câu, source tracking (giai đoạn 3).
- **`question_attempts` → `exam_attempts` với state machine đầy đủ** thời gian, version, autosave (giai đoạn 4) — không thể chỉ thêm field, cần thiết kế lại luồng ghi (patch-per-answer thay vì ghi toàn bộ mảng).
- **RBAC ở `documents.py`/`questions.py`**: hiện dùng role-check cục bộ (`ensure_lecturer_or_admin`, `_can_manage_questions`) thay vì `require_permission` trung tâm — nên hợp nhất khi thêm phân quyền chi tiết hơn cho ngân hàng câu hỏi (ai được sửa câu của người khác, ai được duyệt).

### Phải migration (dữ liệu thật đã tồn tại)
- Toàn bộ `question_sets.questions[]` hiện có (dữ liệu thật trên MongoDB Atlas) phải được migrate nếu quyết định tách thành collection `questions` riêng — không được phá hỏng các bộ đề đã publish.
- `documents` hiện có không có `checksum`/`version` — migration cần backfill cho các bản ghi cũ (tính checksum hồi tố nếu file gốc còn truy cập được; với các bản ghi `local://` đã mất file thì đánh dấu `checksum: null` thay vì lỗi).

---

## 5. API contract có nguy cơ bị ảnh hưởng

| Endpoint hiện tại | Nguy cơ khi mở rộng |
|---|---|
| `GET /questions/{id}` và mọi endpoint trả `QuestionSetResponse` | Nếu tách `questions[]` thành collection riêng, response shape cho frontend (`QuestionCard`, `QuestionSetEditorPage`, `PracticeAttemptPage` — vừa được viết lại trong phiên redesign UI) **phải giữ nguyên hình dạng JSON** hoặc mọi trang đó vỡ. Ưu tiên: giữ response denormalized (join ở tầng service), đổi lưu trữ ở tầng DB. |
| `POST /questions/{id}/attempts` | Đây là API "luyện tập tự do", **không được xoá** khi thêm "thi có giới hạn thời gian" — phải là hai luồng song song (practice vs timed exam), không thay thế lẫn nhau, tránh phá tính năng luyện tập hiện có của học sinh. |
| `POST /documents/upload`, response `DocumentUploadResponse` | Thêm `checksum`/`version`/`asset_id` phải là field **optional/bổ sung**, không đổi field cũ, để không phá `documentApi.ts` phía frontend đang parse response này. |
| `GET /admin/content/exams` | Hiện là view ảo trên `question_sets`. Khi có `Exam`/`ExamBlueprint` thật, endpoint này cần quyết định: trỏ sang entity mới hay giữ nguyên nghĩa cũ ("bộ câu hỏi") — **phải làm rõ với người phụ trách sản phẩm**, tránh nhập nhằng hai khái niệm "exam". |
| `app/routers/documents.py` status machine | Giai đoạn 6 (kho chuẩn) và giai đoạn 5 (Cloudinary tái sử dụng) đều cần trạng thái tương tự nhưng có ý nghĩa khác (`registered`, `checksum_verified`...) — **không tái sử dụng cùng field `status` với cùng tập giá trị** cho `documents` và `knowledge_sources`, tránh nhầm lẫn trạng thái giữa hai loại thực thể khác nhau. |

## 6. Gemini Grounding with Google Search — ĐÃ CÓ THẬT (quan trọng cho giai đoạn 5)

Khác với giả định ban đầu ("cần đánh giá công nghệ mới"), `app/services/learning_chat_service.py` (hàm `ask_advanced_question`) **đã gọi Gemini Grounding thật** trong luồng "Hỏi đáp AI nâng cao" hiện có:

- Bật tool `google_search` có điều kiện: `if retrieval_mode in ["web_only","hybrid"] and payload.use_web_search: tools = [{"google_search": {}}]` (`learning_chat_service.py:604-607`).
- Trích citation thật từ `response.candidates[0].grounding_metadata.grounding_chunks` (`learning_chat_service.py:629-655`), khử trùng theo URL, giới hạn `settings.MAX_WEB_CITATIONS`.
- **Đã có chấm điểm độ tin cậy nguồn theo domain** — `get_domain_score(url)` (`learning_chat_service.py:296-309`): `.gov(.vn)` → 100, `.edu(.vn)` → 90, danh sách trắng học thuật cứng (`developer.mozilla.org`, `docs.python.org`, `w3.org`, `ietf.org`) → 80, `.org` khác → 20, còn lại → 10. Đây là bản **rất sơ khai** so với yêu cầu giai đoạn 5 (chưa phân biệt "trường đại học" khỏi "chính phủ", chưa hạ điểm SEO-content/forum/mạng-xã-hội có chủ đích, không có `published_at`/`accessed_at`, không phát hiện nguồn mâu thuẫn, không có snapshot lưu trữ).
- `clean_hallucinated_urls()` (`learning_chat_service.py:258+`) đã lọc bỏ URL do model tự bịa không nằm trong danh sách citation đã xác minh — đúng tinh thần "không tạo citation giả" nhưng mới áp dụng ở tầng hậu-xử-lý text, chưa có tầng "claim ↔ source mapping" tường minh như yêu cầu.
- **Kết luận cho giai đoạn 5:** đây là công việc **mở rộng/hardening một tính năng đang chạy thật**, không phải xây mới từ số 0. Trọng tâm giai đoạn 5 nên là: (a) tách logic grounding này ra khỏi `learning_chat_service.py` thành module riêng có thể tái sử dụng cho "lưu thành học liệu", (b) nâng cấp domain-scoring, (c) thêm redaction dữ liệu nhạy cảm trước khi gửi query, (d) thêm cache/rate-limit/quota theo ngày, (e) thêm bước "giáo viên duyệt trước khi xuất bản" — không viết lại phần gọi Gemini Grounding đã hoạt động.

## 7. Vùng dễ xung đột giữa các phân hệ mới

1. **Cloudinary (giai đoạn 5) và Document pipeline hiện tại dùng chung 1 file `cloudinary_service.py`** — mọi thay đổi ở đây ảnh hưởng ngay upload tài liệu đang chạy thật. Phải thêm, không sửa hành vi fallback cục bộ hiện có.
2. **Ngân hàng câu hỏi (giai đoạn 3) và hệ thống sinh câu hỏi hiện tại dùng chung `question_sets`/`questions[]`** — nếu tách bảng sai cách sẽ phá luồng giáo viên đang sửa/duyệt/publish (vừa sửa 1 lỗi Critical ở đây trong phiên trước — xem `docs/ui-redesign/00-progress-log.md`).
3. **Thi có giờ (giai đoạn 4) và luyện tập tự do dùng chung khái niệm "câu hỏi đã publish"** — cần đảm bảo học sinh không bị lẫn giữa "bài luyện tập" và "bài thi chính thức" ở cùng một danh sách.
4. **Kho tri thức chuẩn (giai đoạn 6) và pipeline RAG hiện tại dùng chung ChromaDB + collection naming** — phải đặt tên collection/namespace riêng (`curriculum_kb_*`) để tránh trộn lẫn kết quả tìm kiếm giữa tài liệu giáo viên tự tải và tài liệu chuẩn đã duyệt.
5. **Web-grounding (giai đoạn 5–6 chồng lấn)** — quy tắc "không tự động coi nội dung web là kiến thức chuẩn" phải được thực thi ở tầng dữ liệu (collection/flag khác nhau), không chỉ ở UI.
6. **Background job**: nếu giai đoạn 2 (nền tảng) chọn giải pháp queue mới (không phải BackgroundTasks), MỌI job hiện tại (`run_video_transcription_task`, `run_verification_task`) phải migrate sang cùng cơ chế — không được có 2 hệ thống background song song lâu dài.
