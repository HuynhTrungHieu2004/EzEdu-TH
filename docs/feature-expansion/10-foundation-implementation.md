# 10 — Bàn giao: Hạ tầng dùng chung (Giai đoạn 2)

> Tiếp theo [00](00-current-system-audit.md)–[05](05-risk-register.md) (Giai đoạn 1, đã hoàn thành). Phạm vi giai đoạn này: xây primitive hạ tầng dùng chung cho mọi phân hệ nghiệp vụ sẽ triển khai ở giai đoạn 3–7. **Chưa triển khai UI/nghiệp vụ nào** — đúng yêu cầu.

## Dependency đã thêm
**Không có.** Toàn bộ hạ tầng giai đoạn này (idempotency, optimistic concurrency, job queue, structured logging, migration) viết bằng Python thuần + Motor/pymongo đã có sẵn — đúng nguyên tắc "chỉ thêm dependency khi có lý do kỹ thuật rõ ràng" và quyết định kiến trúc ở [01-target-architecture.md](01-target-architecture.md) (không Redis/Celery/Temporal ở giai đoạn này).

## File đã tạo mới

| File | Việc |
|---|---|
| `backend/app/core/correlation.py` | Middleware sinh/lan truyền `request_id`/`correlation_id` (header `X-Request-ID`/`X-Correlation-ID`), context var dùng xuyên suốt 1 request, `CorrelationIdLogFilter` gắn 2 id vào mọi log record |
| `backend/app/core/logging_config.py` | Structured logging (JSON) — `configure_logging()` gọi 1 lần, thay handler mặc định bằng `JsonLogFormatter`, không đổi log riêng của uvicorn (propagate=False) |
| `backend/app/core/idempotency.py` | `run_idempotent(db, scope, key, fn)` — idempotency-key trên MongoDB (collection `idempotency_records`, unique index `(scope,key)`), không cần Redis |
| `backend/app/core/concurrency.py` | `compare_and_set(...)` — optimistic concurrency qua field `version`, tăng dần, 409 khi lệch |
| `backend/app/core/rate_limit.py` | `SlidingWindowLimiter` — tách ra từ `learning_chat_service.py` thành tiện ích dùng chung (không đổi hành vi cũ) |
| `backend/app/services/background_job_service.py` | Hàng đợi job trên MongoDB (collection `background_jobs`): `enqueue`, `claim_next` (atomic, chống 2 worker nhận trùng job), `mark_succeeded`, `mark_failed` (retry có backoff tăng dần, dead-letter khi hết lượt), `process_one` |
| `backend/app/worker.py` | Tiến trình worker độc lập — chạy `python -m app.worker` (từ thư mục `backend/`), poll `background_jobs`, dispatch theo `HANDLERS` dict (hiện để trống — giai đoạn sau đăng ký handler thật) |
| `backend/scripts/migrations/__init__.py`, `backend/scripts/migrations/0001_standardize_document_fields.py` | Migration mẫu chuẩn hoá field (`version`, `created_by`, `updated_by`, `deleted_at`, `checksum`) cho collection `documents` hiện có — có `--dry-run`, `--rollback`, `--confirm-production`, idempotent |
| `backend/tests/test_idempotency.py` (5 test) | Idempotency: chạy 1 lần, key khác nhau độc lập, scope khác nhau độc lập, conflict khi đang xử lý, retry được phép sau khi thất bại |
| `backend/tests/test_background_jobs.py` (9 test) | Job queue: enqueue/claim, 2 worker không nhận trùng job, bỏ qua job chưa đến hạn, thành công, retry+backoff+dead-letter, dedup theo idempotency-key, dispatch qua handler, hàng đợi rỗng, handler lỗi không crash worker |
| `backend/tests/test_concurrency.py` (3 test) | Compare-and-set: ghi thành công khi version khớp, từ chối khi version cũ (409), version tăng dần qua nhiều lần ghi tuần tự |
| `backend/tests/test_correlation.py` (7 test) | Middleware sinh id mới khi không có header, giữ nguyên id client gửi lên, 2 request khác id nhau, có header timing, filter log gắn giá trị mặc định ngoài request |
| `backend/tests/test_migration_standardize_fields.py` (5 test) | Migration: dry-run không sửa dữ liệu, forward backfill đúng field, idempotent khi chạy lại, rollback gỡ đúng field, rollback dry-run không sửa gì |

## File đã sửa

| File | Thay đổi |
|---|---|
| `backend/app/main.py` | Gọi `configure_logging()` đầu file; thêm bước tạo index cho `idempotency_records`/`background_jobs` trong `lifespan()` (idempotent, có try/except không chặn startup nếu lỗi); đăng ký `correlation_id_middleware` — đặt SAU `error_monitoring_middleware` trong file một cách có chủ đích (Starlette: middleware đăng ký sau cùng trở thành lớp ngoài cùng, chạy trước — đã xác minh qua đọc source `Starlette.add_middleware`/`build_middleware_stack`) để log lỗi cũng có `request_id` |
| `backend/app/services/learning_chat_service.py` | Xoá định nghĩa `SlidingWindowLimiter` cục bộ, import từ `app.core.rate_limit` — **không đổi hành vi**: `rate_limiter` (instance module-level) vẫn giữ đúng thông báo lỗi cũ ("tối đa 15 câu hỏi/phút") qua subclass `_ChatRateLimiter`; mọi import hiện có (`chat.py`, `test_conversation_management.py`, `test_learning_chat.py`) vẫn hoạt động nguyên vẹn nhờ re-export |
| `.gitignore` | Thêm `dist/`, `build/`, `coverage/`, `*.log`, `test-results/`, `frontend/test-results/`, `playwright-report/`, `.playwright-mcp/`, `*.tsbuildinfo` — dọn theo yêu cầu kiểm tra file build/cache/log/screenshot đang bị Git theo dõi |

## Dọn Git tracking (theo yêu cầu kiểm tra trước khi tiếp tục)
Phát hiện `test-results/.last-run.json` (file trạng thái Playwright) đang bị Git theo dõi — đã chạy `git rm --cached test-results/.last-run.json` (gỡ khỏi tracking, **giữ nguyên file trên đĩa**, không xoá mã nguồn nào). Không phát hiện `node_modules/`, `__pycache__/`, ảnh/video Playwright, hay file `.env` nào khác đang bị track — `.gitignore` gốc đã che đúng những mục này từ trước.

## Migration

**Chạy thử (dry-run) trên database thật — chỉ đọc, không ghi:**
```
python -m scripts.migrations.0001_standardize_document_fields --dry-run
```
Kết quả thật: phát hiện **14 document** trong collection `documents` trên MongoDB Atlas đang dùng, cả 14 đều thiếu đủ 5 field mới (chưa từng chạy migration này trước đây) — script liệt kê đúng từng `_id` sẽ được cập nhật.

**CHƯA áp dụng ghi thật** (`--dry-run` off) lên database dùng chung — đây là thao tác sửa đổi dữ liệu thật trên toàn bộ collection `documents`, cần xác nhận riêng từ người phụ trách trước khi chạy (đúng nguyên tắc thận trọng với hành động khó hoàn tác trên hệ thống dùng chung). Script đã kiểm thử đầy đủ trên dữ liệu mẫu (mongomock) — sẵn sàng chạy thật khi được xác nhận.

**Rollback:** `python -m scripts.migrations.0001_standardize_document_fields --rollback [--dry-run]` — đã kiểm thử, gỡ đúng 5 field vừa thêm, không đụng field khác.

## Lệnh chạy worker
```
cd backend
source ../.venv/bin/activate
python -m app.worker
```
Đã chạy thử thật (background, 4 giây, sau đó gửi SIGTERM) — xác nhận: kết nối MongoDB thành công, tạo index thành công, log JSON có `request_id`/`correlation_id`, dừng an toàn (đóng kết nối Mongo) khi nhận SIGTERM. `HANDLERS` dict hiện trống — chưa có job nào được enqueue trong ứng dụng thật (đúng phạm vi giai đoạn 2, chưa có nghiệp vụ nào dùng job queue).

## Test đã chạy

```
python -m pytest tests -q --no-header -p no:cacheprovider
```

**Kết quả: 284 passed** (256 test cũ + 28 test mới của giai đoạn này), 0 fail, 0 lỗi mới. Xác nhận refactor `learning_chat_service.py` không phá bất kỳ test hiện có nào (bao gồm `test_learning_chat.py::test_rate_limiter` và `test_conversation_management.py` — cả hai đều dùng `SlidingWindowLimiter`/`rate_limiter` qua đường import cũ).

**Kiểm tra thủ công bổ sung trên server thật (không phải chỉ mongomock):**
- Khởi động lại `uvicorn app.main:app` — log JSON hiển thị đúng ngay từ dòng đầu tiên, không lỗi.
- `GET /health/ready` → `{"status":"healthy", "services": {tất cả "healthy"}}` — không hồi quy.
- Header response có `X-Request-ID`, `X-Correlation-ID`, `X-Response-Time-Ms` — xác nhận middleware hoạt động trên request thật, không chỉ trong `TestClient`.

## RBAC / Security — không có endpoint mới cần bảo vệ ở giai đoạn này
Giai đoạn 2 không thêm bất kỳ API endpoint công khai nào (chỉ thêm module hạ tầng nội bộ + 1 script migration chạy tay) — do đó không có "role guard"/"ownership check" mới cần kiểm thử ở giai đoạn này. Cơ chế RBAC hiện có (`app/core/rbac.py`, đã có `test_rbac.py` bao phủ) được giữ nguyên, sẽ tái sử dụng khi giai đoạn 3 thêm endpoint thật (`/question-bank/*`, `/exam-blueprints/*`...).

## Quyết định đã áp dụng đúng theo nguyên tắc đã đặt ra
- Không thêm Redis chỉ để đếm rate-limit hay hiển thị đồng hồ — `SlidingWindowLimiter` (in-memory) tiếp tục dùng, chỉ tổng quát hoá vị trí đặt code.
- Không thêm Celery/Temporal — job queue tối giản trên chính MongoDB đang dùng.
- Không đổi database.
- Không sửa nghiệp vụ hiện có — mọi thay đổi ở `main.py`/`learning_chat_service.py` là bổ sung/tái tổ chức thuần tuý, đã xác nhận qua test suite đầy đủ không hồi quy.

## Giả định / hạng mục chưa xử lý, cần lưu ý ở giai đoạn sau
- **Observability timing chi tiết** (thời gian upload/parse/embedding/retrieval/AI-response/chấm bài như yêu cầu) — hạ tầng đã sẵn sàng (`JsonLogFormatter` nhận bất kỳ `extra={...}` nào, `analytics_service.record_event()` hiện có cũng đã hỗ trợ `latency_ms`), nhưng **chưa retrofit** vào từng bước xử lý hiện có (extract/index/transcribe) — việc này để lại cho từng giai đoạn nghiệp vụ sau tự đo đúng bước của mình, tránh sửa lan rộng nhiều file không cần thiết ở giai đoạn hạ tầng thuần tuý này.
- **Chuẩn hoá field cho các collection khác** (`question_sets`, `question_attempts`, `users`) — migration mẫu chỉ làm với `documents` (đại diện, phục vụ trực tiếp giai đoạn 5 Cloudinary sắp tới). Các collection khác sẽ có migration riêng khi giai đoạn tương ứng cần đến field đó (ví dụ `exam_attempts` mới hoàn toàn, không cần migrate từ `question_attempts`).
- Migration `0001` mới chạy dry-run thật, **chưa áp dụng ghi thật** — cần xác nhận riêng trước khi giai đoạn 5 (Cloudinary) bắt đầu đọc field `checksum`/`version` trên `documents`.
