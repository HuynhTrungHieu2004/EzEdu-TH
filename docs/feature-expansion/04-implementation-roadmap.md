# 04 — Lộ trình triển khai

> Thứ tự bắt buộc theo yêu cầu ban đầu. Mỗi giai đoạn **chỉ bắt đầu sau khi giai đoạn trước hoàn thành và có file bàn giao tương ứng** — quy tắc do người phụ trách đặt ra, áp dụng nghiêm ngặt cho toàn bộ chuỗi.

| # | Giai đoạn | File bàn giao | Phụ thuộc |
|---|---|---|---|
| 1 | Khảo sát & thiết kế kiến trúc | `00`–`05` (tài liệu này) | Không |
| 2 | Hạ tầng dùng chung | `10-foundation-implementation.md` | Giai đoạn 1 |
| 3 | Ma trận & ngân hàng đề | `20-exam-bank-and-blueprint.md` | Giai đoạn 2 (cần idempotency, version, RBAC mở rộng, job queue) |
| 4 | Phiên thi & chấm điểm | `30-timed-exam-and-grading.md` | Giai đoạn 2 + 3 (cần `Exam`/`Question` đã có từ giai đoạn 3; cần job queue cho sweeper) |
| 5 | Cloudinary | `40-cloudinary-learning-materials.md` | Giai đoạn 2 (idempotency cho webhook, job queue cho xoá/migration nền) |
| 6 | Khai thác Internet | `50-grounded-web-knowledge.md` | Giai đoạn 2 (cache/rate-limit) + giai đoạn 5 (lưu kết quả thành Document) |
| 7 | Kho tri thức chuẩn | `60-standard-curriculum-knowledge.md` | Giai đoạn 2 + 5 (tái sử dụng lưu trữ Cloudinary + pipeline chunk/embedding) |
| 8 | Tích hợp & QA cuối | `70`–`74` | Toàn bộ giai đoạn 2–7 |

**Ghi chú thứ tự 5/6 so với yêu cầu gốc:** yêu cầu gốc liệt kê "Cloudinary" ở bước 4 và "khai thác Internet" ở bước 5 — giữ nguyên đúng thứ tự đó (đánh số lại thành 5 và 6 trong bảng trên vì bảng này gộp cả giai đoạn khảo sát+nền tảng làm bước 1–2, không đổi thứ tự nghiệp vụ đã yêu cầu). Lý do phụ thuộc kỹ thuật khớp với thứ tự này: "khai thác Internet" (giai đoạn 6 nghiệp vụ) cần API "lưu thành học liệu" đã có ở Cloudinary (giai đoạn 5 nghiệp vụ) — đúng thứ tự đã cho, không cần đảo.

## Giả định về nhịp độ
Đây là 8 giai đoạn có quy mô rất khác nhau — giai đoạn 4 (thi có giờ + chấm điểm, đặc biệt phần idempotency/auto-submit/chấm tự luận AI có review) và giai đoạn 7 (kho tri thức chuẩn, có OCR/versioning/review) là hai giai đoạn nặng nhất, tương đương hoặc lớn hơn toàn bộ phần còn lại cộng lại. Không cam kết mốc thời gian cụ thể trong tài liệu này — mỗi giai đoạn tự báo cáo kết quả thật (build/test pass) trong file bàn giao riêng, không tuyên bố "xong" cho giai đoạn nào chưa thực sự chạy test.

## Danh sách file dự kiến sẽ sửa/tạo ở các giai đoạn sau (báo cáo theo yêu cầu "Kết thúc giai đoạn")

### Giai đoạn 2 — Hạ tầng dùng chung
- Mới: `backend/app/core/idempotency.py`, `backend/app/core/correlation.py` (middleware), `backend/app/services/background_job_service.py`, `backend/app/worker.py`, `backend/scripts/migrations/__init__.py` + script mẫu đầu tiên, `backend/tests/test_background_jobs.py`, `backend/tests/test_idempotency.py`.
- Sửa: `backend/app/main.py` (đăng ký middleware mới, khởi động worker theo cấu hình), `backend/app/core/config.py` (feature flags mới), `backend/app/core/rbac.py` (permission mới nếu cần).

### Giai đoạn 3 — Ma trận & ngân hàng đề
- Mới: `backend/app/exam_bank/` (vertical slice: `api/`, `schemas/`, `services/`, `repositories/`), `backend/app/services/blueprint_solver_service.py` (OR-Tools CP-SAT), `backend/tests/test_exam_bank.py`, `backend/tests/test_blueprint_solver.py`.
- Sửa: `backend/requirements.txt` (thêm `ortools`), `backend/app/main.py` (đăng ký router).
- Frontend: trang mới ngân hàng câu hỏi + trình tạo ma trận (chưa xác định tên file cụ thể — sẽ chốt khi đọc lại cấu trúc `frontend/src/pages/teacher/` ở đầu giai đoạn 3).

### Giai đoạn 4 — Phiên thi & chấm điểm
- Mới: `backend/app/exam_session/` (vertical slice), `backend/app/services/exam_grading_service.py`, job sweeper trong `background_job_service.py`, `backend/tests/test_exam_attempts.py`, `backend/tests/test_auto_submit.py`, `backend/tests/test_grading.py`.
- Frontend: trang làm bài có đồng hồ đếm ngược (mới), trang kết quả, trang giáo viên theo dõi/chấm tự luận.

### Giai đoạn 5 — Cloudinary
- Sửa: `backend/app/services/cloudinary_service.py` (mở rộng, không viết lại), `backend/app/routers/documents.py` (endpoint mới ở `03-api-plan.md` §E), `backend/app/schemas/document.py`.
- Mới: `backend/scripts/migrations/xxxx_backfill_document_checksum.py`, webhook handler, `backend/tests/test_document_reuse.py`, `backend/tests/test_cloudinary_webhook.py`.

### Giai đoạn 6 — Khai thác Internet
- Mới: `backend/app/web_knowledge/` (vertical slice, tách logic grounding ra khỏi `learning_chat_service.py` thành service dùng chung), `backend/tests/test_web_knowledge.py`.
- Sửa: `backend/app/services/learning_chat_service.py` (refactor tối thiểu để dùng chung service grounding mới, KHÔNG đổi hành vi chat hiện tại).

### Giai đoạn 7 — Kho tri thức chuẩn
- Mới: `backend/app/curriculum/` (vertical slice), pipeline ingestion, admin UI tương ứng, `backend/tests/test_curriculum_ingestion.py`.

### Giai đoạn 8 — Tích hợp & QA
- Không tạo module mới — chỉ test/QA/tài liệu vận hành.

Danh sách trên là **dự kiến**, sẽ xác nhận/điều chỉnh lại ở đầu mỗi giai đoạn sau khi đọc code thời điểm đó (có thể đã đổi do các giai đoạn trước).
