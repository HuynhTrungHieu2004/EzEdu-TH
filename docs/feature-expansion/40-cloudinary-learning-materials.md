# 40 — Bàn giao: Lưu trữ học liệu Cloudinary — dedup, retry, webhook (Giai đoạn 5)

> Tiếp theo [30-timed-exam-and-grading.md](30-timed-exam-and-grading.md) (Giai đoạn 4, đã hoàn thành). Phạm vi: theo đúng quyết định đã chốt ở [01-target-architecture.md](01-target-architecture.md) §Cloudinary — **"Mở rộng, không thay thế"** cơ chế upload hiện có (`app/services/cloudinary_service.py`), thêm: dedup theo checksum để tái sử dụng học liệu, xoá asset qua hàng đợi job có retry (thay vì đồng bộ-rồi-bỏ-qua-lỗi), webhook Cloudinary có xác thực chữ ký + idempotent.

## Dependency đã thêm
**Không có.** `cloudinary==1.44.2` đã có sẵn trong `requirements.txt` từ trước; toàn bộ phần mới dùng `hashlib` (thư viện chuẩn) + hạ tầng job-queue/idempotency đã có từ Giai đoạn 2.

## Vì sao không đổi sang "signed upload" (browser tải thẳng lên Cloudinary)

Yêu cầu ban đầu nhắc "signed uploads" — đã đối chiếu lại với quyết định kiến trúc đã chốt ở Giai đoạn 1 (`01-target-architecture.md`: *"Mở rộng, không thay thế"*) trước khi động vào cơ chế: upload hiện tại đã đi qua server bằng Cloudinary SDK với `api_secret` (`cloudinary.uploader.upload`) — về bản chất đây **đã là một request được ký/xác thực** (server giữ secret, không lộ ra client), chỉ khác "signed upload" kiểu Cloudinary (client tự ký bằng signature server cấp, tải thẳng lên CDN) ở chỗ file đi qua server trước. Đổi sang tải thẳng từ trình duyệt sẽ né được băng thông server nhưng là một thay đổi cơ chế lớn, trong khi kiến trúc đã quyết định không cần — nên **giữ nguyên đường đi hiện tại**, tập trung vào phần thật sự còn thiếu: dedup, retry, webhook, và bổ sung field chuẩn hoá (`checksum`/`version`/`created_by`/`updated_by`/`deleted_at`) cho document mới upload — đúng như migration `0001` (Giai đoạn 2) đã ghi chú trước: *"checksum sẽ được tính cho các document mới upload sau khi giai đoạn 5 triển khai"*.

## Đã làm

### 1. Dedup theo checksum + tái sử dụng học liệu
- `POST /documents/upload` tính SHA-256 ngay trong lúc đọc file theo từng chunk (không đọc file 2 lần).
- Trước khi gọi Cloudinary: tra `documents` theo `(user_id, checksum, deleted_at=None)`. Nếu trùng — **không tải lại lên Cloudinary**, chỉ tăng `reuse_count`, trả về đúng document đã có (`reused: true`). So khớp trong phạm vi 1 người dùng (không dedup chéo người dùng, tránh lộ "ai từng tải file này").
- Document mới upload giờ có đủ field chuẩn theo Giai đoạn 2: `checksum`, `reuse_count`, `version`, `created_by`, `updated_by`, `deleted_at`.
- Index mới: `documents(user_id, checksum)` — tra dedup nhanh.
- Ghi activity log `document_reused` khi tái sử dụng (đã thêm giá trị này vào `ActivityAction` — thiếu thì Pydantic validate lỗi, bị nuốt âm thầm bởi `record_activity`, xem mục Bug bên dưới).

### 2. Xoá asset Cloudinary qua hàng đợi job (retry có backoff)
- Trước đây: xoá đồng bộ trong request, lỗi bị nuốt (`except Exception: pass`) — asset mồ côi vĩnh viễn nếu Cloudinary lỗi tạm thời.
- Giờ: `enqueue_cloudinary_cleanup(db, public_id=...)` xếp job `cleanup_cloudinary_asset` (idempotency-key theo `public_id`, không xoá trùng job) — worker xử lý qua `background_job_service` đã có (retry giới hạn + backoff tăng dần + dead-letter, xem Giai đoạn 2). Áp dụng ở cả 2 chỗ: rollback khi lưu metadata thất bại sau khi đã upload, và khi xoá document thật (`DELETE /documents/{id}`).

### 3. Webhook Cloudinary
- `POST /documents/webhooks/cloudinary` (ẩn khỏi OpenAPI docs — endpoint hệ thống, không dành cho người dùng gọi tay).
- Xác thực bằng chữ ký HMAC thật của Cloudinary (`cloudinary.utils.verify_notification_signature`, header `X-Cld-Timestamp`/`X-Cld-Signature`) — không dùng JWT vì Cloudinary gọi thẳng server-to-server.
- Idempotent theo `notification_type+public_id+timestamp` (đúng quy ước đã ghi sẵn ở `app/core/idempotency.py` từ Giai đoạn 2) — gọi lại 2 lần cùng notification chỉ xử lý 1 lần.
- Cập nhật `cloudinary_notification_status` trên document tương ứng theo `public_id`.
- Logic tách khỏi router (`handle_cloudinary_webhook` trong `cloudinary_service.py`) để kiểm thử được mà không cần dựng `Request` ASGI thật.

## File backend đã sửa

| File | Thay đổi |
|---|---|
| `app/routers/documents.py` | Thêm tính checksum + nhánh dedup trong `upload_document`; thêm route `POST /webhooks/cloudinary`; 2 chỗ xoá Cloudinary đồng bộ đổi thành `enqueue_cloudinary_cleanup` |
| `app/services/cloudinary_service.py` | Thêm `enqueue_cloudinary_cleanup`, `cleanup_cloudinary_asset_job`, `handle_cloudinary_webhook`, `InvalidWebhookSignature` |
| `app/schemas/document.py` | Thêm `checksum`, `reuse_count` vào `DocumentMetadataBase`; thêm `reused` vào `DocumentUploadResponse` |
| `app/schemas/activity_logs.py` | Thêm `"document_reused"` vào `ActivityAction` |
| `app/database/mongodb.py` | Thêm index `documents(user_id, checksum)` |
| `app/worker.py` | Đăng ký handler `cleanup_cloudinary_asset` |
| `frontend/src/api/documentApi.ts` | Thêm field `checksum`/`reuse_count`/`reused` vào `DocumentUploadResponse` |
| `frontend/src/components/FileUpload.tsx` | Hiện thông báo khác khi `reused=true` ("đã dùng lại bản cũ, không tải trùng") |

## Bug tự phát hiện và sửa trước khi bàn giao

**`record_activity("document_reused", ...)` sẽ âm thầm không ghi được gì** — `ActivityAction` là `Literal[...]` liệt kê sẵn các giá trị hợp lệ, `record_activity` validate qua Pydantic (`UserActivityLogCreate`) rồi bọc toàn bộ trong `try/except Exception: log.warning(...)` (best-effort logging, không được phép làm hỏng luồng chính). Nếu thêm action mới mà quên cập nhật `Literal`, lệnh ghi log sẽ ném `ValidationError`, bị nuốt bởi except, và không có bản ghi nào được tạo — không lỗi rõ ràng, chỉ mất âm thầm 1 dòng activity log. Phát hiện khi đọc lại `activity_log_service.py` trước khi viết test (không phải qua lỗi runtime, vì lỗi này tự bản chất không hiện ra). **Đã sửa**: thêm `"document_reused"` vào `ActivityAction`.

## Test đã chạy

```
python -m pytest tests -q
```
**365 passed**, 0 fail (357 test cũ từ Giai đoạn 1–4 + 8 test mới ở `test_documents_cloudinary.py`):
- Tải trùng nội dung (cùng người dùng) → tái sử dụng, không tạo document/job mới.
- Cùng nội dung nhưng khác người dùng → **không** tái sử dụng (upload bình thường, gọi Cloudinary thật 1 lần — đã mock).
- Job `cleanup_cloudinary_asset` được xếp hàng đúng, idempotent theo `public_id` (gọi enqueue 2 lần chỉ tạo 1 job).
- Handler job gọi đúng `delete_file_from_cloudinary`.
- Webhook: từ chối chữ ký sai (401), chấp nhận chữ ký đúng + cập nhật document, gọi lại cùng notification 2 lần chỉ xử lý 1 lần (idempotent).

## Kiểm thử thủ công trên server thật (Cloudinary + MongoDB Atlas thật, không mock)

Tài khoản giáo viên QA tạo tạm (đã xoá sạch sau khi kiểm thử). Chạy cả `uvicorn` và `python -m app.worker`.

1. Tạo 1 file PDF hợp lệ tối thiểu, upload lần 1 → **Cloudinary thật** trả về `secure_url` thật (`res.cloudinary.com/...`), trích xuất văn bản thành công (`text_length: 16`), `checksum` được tính, `reused: false`.
2. Upload LẠI đúng file đó (cùng nội dung) → trả về đúng `document_id` cũ, `reuse_count: 1`, `reused: true`, xác nhận DB chỉ có **đúng 1** document (không tạo bản ghi/asset Cloudinary thứ 2).
3. Xoá document qua `DELETE /documents/{id}` → job `cleanup_cloudinary_asset` được worker xử lý và **thành công thật** (kiểm tra trực tiếp trong `background_jobs`: `status: "succeeded"`) — asset Cloudinary thật đã bị xoá qua hàng đợi, không phải xoá đồng bộ.
4. Gọi `POST /documents/webhooks/cloudinary` với chữ ký HMAC tính bằng đúng `CLOUDINARY_API_SECRET` thật của project (tính trong script nội bộ, không in ra secret) → `200 {"handled":"eager"}`. Gọi lại **y hệt** request đó lần 2 → cùng kết quả (idempotent, không xử lý lại). Gọi với chữ ký sai → `401`.

## RBAC / Security
- Webhook không dùng JWT — bảo vệ bằng xác thực chữ ký HMAC của chính Cloudinary (không xác thực được thì 401/400), đúng mô hình server-to-server.
- Dedup chỉ so khớp trong phạm vi `user_id` của người gọi — không rò rỉ thông tin "ai đã từng tải file này" giữa các người dùng khác nhau.
- Không đổi RBAC hiện có của `/documents/*` (vẫn `ensure_lecturer_or_admin`/`get_owned_document` như cũ).

## Giả định / hạng mục chưa xử lý, cần lưu ý ở giai đoạn sau
- **Chưa backfill checksum cho document cũ** — đúng như migration `0001` đã ghi rõ từ trước, các document tải lên TRƯỚC giai đoạn này vẫn có `checksum: None`, sẽ không tham gia dedup cho tới khi được tải lại lần nữa (tự nhiên có checksum từ lần đó). Không chạy migration hồi tố (không có cách tính checksum khi chỉ còn URL Cloudinary, không còn file gốc cục bộ).
- **Webhook chưa có nơi cấu hình `notification_url`** khi gọi `cloudinary.uploader.upload(...)` — muốn Cloudinary thực sự GỌI webhook này (không chỉ nhận request test tay), cần thêm `notification_url=...` vào lời gọi upload trong `cloudinary_service.py` VÀ cấu hình domain public trỏ tới server (không khả dụng ở môi trường dev local này — endpoint đã sẵn sàng, chỉ chưa "bật" phía gửi vì thiếu domain công khai). Để lại cho môi trường triển khai thật.
- **Dedup không dùng unique index** (chỉ check-rồi-ghi, không ràng buộc DB) — 2 request upload cùng nội dung thật sự đồng thời (hiếm) có thể tạo 2 document trùng checksum thay vì 1; chấp nhận vì tần suất cực thấp và hậu quả chỉ là lãng phí nhẹ dung lượng, không sai dữ liệu — nếu cần siết chặt, thêm partial unique index `(user_id, checksum)` where `deleted_at: null` và xử lý `DuplicateKeyError` giống mẫu `enqueue()` đã dùng ở Giai đoạn 2.
