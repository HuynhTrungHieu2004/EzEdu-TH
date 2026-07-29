# 03 — Kế hoạch API

> Dựa trên [02-data-model-plan.md](02-data-model-plan.md). Mọi endpoint mới đăng ký theo pattern vertical-slice ([01-target-architecture.md](01-target-architecture.md) §2). Tiền tố chung: `{API_V1_STR}` (hiện là `/api/v1`).

## Nguyên tắc chung áp dụng cho mọi endpoint dưới đây
- Role/ownership check ở **backend**, qua `require_role`/`require_permission` (`app/core/rbac.py`) hoặc ownership check tường minh trong service — không tin field role từ payload frontend.
- Mọi endpoint tạo/nộp/xử lý tốn chi phí nhận header `Idempotency-Key` tuỳ chọn (bắt buộc với nộp bài thi/autosave/generate-exam).
- Response envelope giữ nguyên quy ước hiện có của project (trả thẳng Pydantic model, lỗi qua `HTTPException` — không đổi format lỗi toàn cục).

---

## A. Ngân hàng câu hỏi — `/api/v1/question-bank`

| Method & Path | Việc | Role |
|---|---|---|
| `POST /question-bank/questions` | Tạo câu hỏi thủ công vào ngân hàng | lecturer, admin |
| `POST /question-bank/questions/import` | Import hàng loạt (từ file hoặc từ `question_sets` đã sinh) | lecturer, admin |
| `GET /question-bank/questions` | Lọc theo subject/grade/chapter/topic/bloom/difficulty/type/status/tags, phân trang cursor (tái sử dụng `app/utils/cursor.py` đã có) | lecturer, admin |
| `GET /question-bank/questions/{id}` | Chi tiết 1 câu, kèm lịch sử version | lecturer, admin (ownership: chỉ xem/sửa câu của mình trừ khi có quyền quản trị) |
| `PATCH /question-bank/questions/{id}` | Sửa nội dung — tăng `version`, reset `quality_status` về `unreviewed` nếu đã `approved`/`published` (đúng mẫu hành vi hiện có ở `question_sets` khi sửa câu đã duyệt) | owner, admin |
| `POST /question-bank/questions/{id}/review` | Chuyển trạng thái `draft→reviewing→approved` | reviewer role (lecturer khác owner, hoặc admin) |
| `POST /question-bank/questions/{id}/publish` | `approved→published` | admin hoặc lecturer có quyền |
| `POST /question-bank/questions/{id}/archive` | `*→archived` | owner, admin |
| `POST /question-bank/questions/bulk-approve` | Duyệt hàng loạt theo danh sách id | reviewer |
| `POST /question-bank/questions/bulk-archive` | Lưu trữ hàng loạt | owner, admin |
| `GET /question-bank/taxonomy` | Cây môn/lớp/chương/chủ đề/chuẩn đầu ra (dùng chung giai đoạn 6) | mọi role đã đăng nhập (đọc) |
| `POST /question-bank/taxonomy` | Thêm node danh mục | admin |

## B. Ma trận đề — `/api/v1/exam-blueprints`

| Method & Path | Việc |
|---|---|
| `POST /exam-blueprints` | Tạo blueprint (draft) |
| `GET /exam-blueprints`, `GET /exam-blueprints/{id}` | Danh sách / chi tiết |
| `PATCH /exam-blueprints/{id}` | Sửa constraints (chỉ khi `draft`) |
| `POST /exam-blueprints/{id}/validate` | Chạy CP-SAT ở chế độ "kiểm tra khả thi" (không sinh đề thật) — trả `OPTIMAL/FEASIBLE/INFEASIBLE/UNKNOWN` + phân tích ràng buộc thiếu nếu `INFEASIBLE`; nếu hợp lệ chuyển `draft→validated` |
| `POST /exam-blueprints/{id}/clone` | Nhân bản blueprint (mới ở trạng thái draft) |
| `POST /exam-blueprints/{id}/archive` | Lưu trữ |

## C. Sinh đề & Đề thi — `/api/v1/exams`

| Method & Path | Việc |
|---|---|
| `POST /exams/generate` | Body `{blueprint_id, code_count}` — chạy CP-SAT chọn câu theo ma trận đã `validated`, sinh `code_count` mã đề tương đương (đảo câu/đáp án theo seed), trả về danh sách `Exam` (`draft`) + `equivalent_group_id` |
| `POST /exams/{id}/regenerate-section` | Sinh lại MỘT phần đề (ví dụ 1 nhóm chủ đề không đạt) mà không sinh lại toàn bộ — giữ các câu hợp lệ khác |
| `GET /exams`, `GET /exams/{id}` | Danh sách / chi tiết |
| `GET /exams/{id}/preview` | Xem trước đề (ẩn đáp án tuỳ query param, dùng cho giáo viên duyệt) |
| `POST /exams/{id}/publish` | `ready→published`, body giống `question_sets.publish` hiện có (`audience_type`, `target_class_ids`) |
| `POST /exams/{id}/clone` | Nhân bản (mã đề mới, cùng `equivalent_group_id` hoặc group mới tuỳ tham số) |
| `POST /exams/{id}/archive` | `*→archived` |
| `GET /exams/{id}/export` | Xuất DOCX/PDF — **chỉ nếu** hạ tầng export hiện tại của `question_sets` (`questions.py:1211,1256`) có thể tái sử dụng; xác nhận lại khi triển khai, không hứa trước nếu code export gắn chặt với cấu trúc `question_sets` |

## D. Phiên làm bài có giới hạn thời gian — `/api/v1/exam-attempts`

| Method & Path | Việc |
|---|---|
| `POST /exam-attempts/start` | Body `{exam_id}` + header `Idempotency-Key`. Backend: kiểm tra chưa có attempt `in_progress` hợp lệ cho `(exam_id,user_id)` (unique index), tạo `started_at`/`expires_at` bằng UTC, trả `{attempt, server_now}` |
| `GET /exam-attempts/{id}` | Lấy trạng thái hiện tại — **mọi lần gọi đều tự kiểm tra `expires_at`**, nếu quá hạn và còn `in_progress` thì tự chuyển `auto_submitted` trước khi trả response (lớp phòng-thủ #2 theo yêu cầu) |
| `PATCH /exam-attempts/{id}/answers` | Patch 1 hoặc nhiều câu trả lời, kèm `version` client đang có — 409 nếu version lệch (đã bị ghi đè bởi request khác/tab khác) |
| `POST /exam-attempts/{id}/submit` | Idempotency-Key bắt buộc — nộp bài thủ công, chặn nếu đã `submitted/auto_submitted/graded` (trả lại kết quả cũ thay vì lỗi, đúng tinh thần idempotent) |
| `GET /exam-attempts/{id}/result` | Kết quả — nội dung trả về tuỳ cấu hình giáo viên (điểm/đáp án/giải thích/phân tích Bloom) |
| `GET /exam-attempts?exam_id=...` | (Giáo viên) danh sách attempt của 1 đề — trạng thái, điểm, thời gian làm |
| `POST /exam-attempts/{id}/grading/override` | Giáo viên ghi đè điểm 1 câu tự luận — ghi vào `grading_details[].teacher_score` + audit log |
| `GET /exam-attempts/pending-review?exam_id=...` | Danh sách bài có câu tự luận confidence thấp cần giáo viên duyệt |

**Sweeper nội bộ (không phải API công khai):** job định kỳ trong `background_jobs` quét `exam_attempts` có `status="in_progress"` và `expires_at < now`, chuyển `auto_submitted` (lớp phòng thủ #3) — idempotent nhờ điều kiện `status="in_progress"` trong chính câu lệnh `find_one_and_update`.

## E. Học liệu Cloudinary — mở rộng `/api/v1/documents` hiện có

Không tạo router mới — đây là cùng entity `Document`. Bổ sung endpoint:

| Method & Path | Việc |
|---|---|
| `POST /documents/{id}/reuse-check` | Kiểm tra checksum trùng trước khi upload (trả document đã có nếu trùng, tránh upload lại) |
| `PATCH /documents/{id}/metadata` | Đổi tên hiển thị, gắn tag |
| `POST /documents/{id}/restore` | Khôi phục sau soft-delete (nếu còn trong thời gian cho phép — theo policy xoá) |
| `GET /documents/usage-summary` | Dung lượng đã dùng theo user |
| `POST /webhooks/cloudinary` | Nhận webhook Cloudinary (xác thực chữ ký, idempotent theo `notification_type`+`asset_id`+`timestamp`, đẩy việc nặng vào `background_jobs` thay vì xử lý trực tiếp trong request webhook) |

## F. Khai thác Internet có kiểm chứng — `/api/v1/web-knowledge`

| Method & Path | Việc |
|---|---|
| `POST /web-knowledge/search` | Body `{query, subject_id?, grade?}` — chạy pipeline redaction→grounding→claim-extraction→confidence, trả kết quả theo schema §8 của `02-data-model-plan.md`. Rate-limit theo user + quota ngày (mở rộng cơ chế `enforce_ai_quota` hiện có với feature mới `"web_knowledge_search"`) |
| `POST /web-knowledge/{id}/save-as-material` | Lưu kết quả thành `Document` mới (tái sử dụng pipeline Document ở mục E) — **yêu cầu `review_status="approved_by_teacher"` trước khi gọi**, chặn 403 nếu chưa duyệt |
| `POST /web-knowledge/{id}/reverify` | Chạy lại kiểm chứng cho 1 kết quả đã lưu |
| `GET /web-knowledge/{id}` | Xem chi tiết 1 lần tra cứu đã lưu |

## G. Kho tri thức chuẩn — `/api/v1/curriculum`

| Method & Path | Việc |
|---|---|
| `POST /curriculum/sources` | Đăng ký nguồn mới (`registered`) |
| `POST /curriculum/sources/{id}/upload` hoặc `/{id}/fetch-url` | Nạp file/URL |
| `GET /curriculum/sources`, `GET /curriculum/sources/{id}` | Danh sách/chi tiết + tiến trình ingestion |
| `POST /curriculum/sources/{id}/reprocess` | Chạy lại pipeline từ 1 bước cụ thể |
| `GET /curriculum/sources/{id}/chunks/preview` | Xem trước chunk trước khi duyệt |
| `POST /curriculum/sources/{id}/review` | `approve`/`reject` |
| `POST /curriculum/sources/{id}/publish`, `/unpublish` | Công bố/gỡ |
| `POST /curriculum/sources/{id}/reindex` | Lập lại chỉ mục |
| `GET /curriculum/sources/{id}/versions` | So sánh phiên bản (liên kết `supersedes_source_id`) |
| `GET /curriculum/search` | Query có filter môn/lớp/chương trình/phiên bản/chương/chủ đề/published-only — trả nội dung + nguồn + trang/mục + phiên bản + điểm tương đồng |

---

## Tổng hợp rủi ro API contract (tham chiếu `00-current-system-audit.md` §5)
Không endpoint nào ở trên thay thế/xoá endpoint hiện có. `GET /admin/content/exams` cần quyết định rõ với người phụ trách sản phẩm trước khi giai đoạn C triển khai thật (tránh nhập nhằng "exam" cũ/mới).
