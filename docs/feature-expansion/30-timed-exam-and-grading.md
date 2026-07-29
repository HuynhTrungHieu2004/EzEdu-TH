# 30 — Bàn giao: Làm bài thi có giới hạn thời gian + tự chấm điểm (Giai đoạn 4)

> Tiếp theo [20-exam-bank-and-blueprint.md](20-exam-bank-and-blueprint.md) (Giai đoạn 3, đã hoàn thành). Phạm vi: học sinh làm bài thi có đồng hồ đếm ngược do SERVER quyết định, ba lớp tự nộp bài khi hết giờ, chấm tự động trắc nghiệm/đúng-sai, chấm câu tự luận bằng AI kèm độ tin cậy, giáo viên ghi đè điểm.

## Dependency đã thêm
**Không có.** Tái sử dụng nguyên vẹn hạ tầng đã có: `background_job_service`/`worker.py` (Giai đoạn 2) cho hàng đợi chấm AI + quét tự nộp; client Gemini + định dạng thẻ (`parse_tag_block`) đã có ở `learning_chat_service.py`; `compare_and_set`/`run_idempotent` (Giai đoạn 2) cho optimistic concurrency.

## Domain model mới — `exam_attempts` (trong `app/exam_bank/`)

Lượt làm bài, tách biệt exam (đề — Giai đoạn 3) khỏi attempt (lượt làm — giai đoạn này). Trạng thái: `in_progress → submitted → graded` (gộp "hết giờ" vào `submitted`/`graded` với cờ `auto_submitted`, không thêm trạng thái `expired` riêng — ít trạng thái hơn, dễ suy luận hơn).

### Đồng hồ đếm ngược do SERVER quyết định
`started_at`/`due_at` tính và lưu ở server lúc `POST /exams/{id}/attempts/start` (`due_at = started_at + duration_minutes` của đề). Mọi response của attempt kèm thêm `server_now` — client tính `remaining = due_at - (Date.now() + (server_now - Date.now() lúc nhận response))`, đếm mượt giữa các lần gọi API mà không cần hỏi server mỗi giây, nhưng KHÔNG BAO GIỜ dùng đồng hồ máy học sinh để quyết định hết giờ hay chưa — mọi quyết định "hết giờ" thật sự nằm ở server (so `due_at` với `datetime.now(UTC)` phía backend).

### Ba lớp tự nộp bài (auto-submit)
1. **Client** — `ExamAttemptPage.tsx` tự gọi `/submit` khi đếm ngược về 0 (chủ đạo, trải nghiệm mượt nhất).
2. **Autosave** (`PATCH /exam-attempts/{id}/autosave`) — mỗi lần gọi, server kiểm tra nếu đã quá `due_at` thì tự chốt nộp bằng đúng câu trả lời vừa gửi lên, không chờ lớp 1. Bắt trường hợp học sinh quay lại sau khi hết giờ mà client không kịp tự submit.
3. **Worker nền** (`app/worker.py`, hàm `sweep_expired_attempts`, chạy mỗi 30s) — quét toàn bộ attempt `in_progress` đã quá `due_at` mà học sinh không quay lại nữa (đóng tab hẳn). Cả 3 lớp dùng chung một hàm `_finalize()` qua `compare_and_set` — an toàn khi 2 lớp cùng chốt nộp gần như đồng thời (bên thua chỉ đọc lại bản đã chốt, không lỗi).

### Chấm điểm
- **Trắc nghiệm/đúng-sai**: so khớp chính xác ngay lúc nộp (`_is_answer_correct`, không qua AI) — nhất quán với yêu cầu "không dùng AI thay thế bước kiểm tra ràng buộc/chính xác" đã áp dụng từ Giai đoạn 3.
- **Tự luận ngắn (`short_answer`)**: xếp hàng job `grade_essay_answer` (background job, KHÔNG chấm trong chính request HTTP — đúng nguyên tắc "không chạy tác vụ AI dài trong request" của Giai đoạn 2) → `app/worker.py` xử lý → gọi Gemini theo đúng định dạng thẻ đã dùng ở `learning_chat_service.py` (`[SCORE]`/`[CONFIDENCE]`/`[FEEDBACK]`) → cập nhật điểm + độ tin cậy (confidence 0.0–1.0) vào kết quả câu đó, chuyển `submitted → graded` khi mọi câu tự luận đã chấm xong.
- **Nếu Gemini lỗi** (hết quota, timeout...): trả về điểm 0, confidence 0, nhận xét "Không thể tự chấm câu này — cần giáo viên chấm thủ công" — KHÔNG âm thầm coi là đúng, để giáo viên biết cần xem lại (đã kiểm chứng thật khi Gemini free-tier hết quota lúc kiểm thử, xem mục "Blocker" bên dưới).
- **Giáo viên ghi đè** (`POST /exam-attempts/{id}/override`): thay `final_score` của 1 câu bất kỳ bằng điểm giáo viên nhập, tính lại tổng điểm — chỉ giáo viên sở hữu đề (hoặc admin) mới ghi đè được.

## File backend đã tạo mới

| File | Việc |
|---|---|
| `app/exam_bank/schemas/attempt.py` | `AttemptStatus`, `AttemptStartResponse`, `AttemptAutosaveRequest`, `AttemptSubmitRequest`, `AttemptOverrideRequest`, `AttemptQuestionResult`, `AttemptResponse` |
| `app/exam_bank/services/attempt_service.py` | `start_attempt`, `autosave`, `submit_attempt`, `_finalize` (dùng chung 3 lớp tự nộp), `override_score`, `list_attempts_for_exam`, `sweep_expired_attempts`, `grade_essay_answer_job`, hàm `_aware()` (xem mục Bug bên dưới) |
| `app/exam_bank/services/grading_service.py` | `grade_short_answer()` — gọi Gemini, parse thẻ, luôn trả kết quả (không ném lỗi ra ngoài job) |
| `app/exam_bank/api/attempts.py` | Router: xem bảng endpoint bên dưới |
| `backend/tests/test_exam_bank_attempt.py` (14 test) | Xem mục Test |

## File backend đã sửa

| File | Thay đổi |
|---|---|
| `app/exam_bank/services/exam_service.py` | Thêm `get_exam_questions_for_student()` — câu hỏi cho học sinh làm bài, LUÔN ẩn đáp án (khác `preview_exam` dành cho giáo viên có thể chọn hiện đáp án) |
| `app/exam_bank/api/deps.py` | Thêm `require_student_actor` — chỉ role `student` được làm bài (khác `require_exam_bank_actor` dành cho giáo viên) |
| `app/exam_bank/api/__init__.py` | Đăng ký `attempts.router` |
| `app/exam_bank/constants/collections.py`, `app/exam_bank/repositories/indexes.py` | Thêm `EXAM_ATTEMPTS`, index `(exam_id, student_id)` unique (1 học sinh chỉ 1 lượt/đề) và `(status, due_at)` cho sweep |
| `app/worker.py` | Đăng ký handler `grade_essay_answer` + vòng lặp gọi `sweep_expired_attempts` mỗi 30s (lớp tự nộp #3) |
| `backend/tests/test_exam_bank_role_guard.py` | Thêm test `require_student_actor` |

### Endpoint mới

```
POST   /api/v1/exams/{exam_id}/attempts/start   (học sinh)
GET    /api/v1/exams/{exam_id}/questions        (học sinh — câu hỏi, luôn ẩn đáp án)
GET    /api/v1/exam-attempts/{id}               (học sinh — chỉ xem lượt của chính mình)
PATCH  /api/v1/exam-attempts/{id}/autosave      (học sinh)
POST   /api/v1/exam-attempts/{id}/submit        (học sinh)
GET    /api/v1/exams/{exam_id}/attempts         (giáo viên — bảng chấm bài)
POST   /api/v1/exam-attempts/{id}/override      (giáo viên — ghi đè điểm)
```

## Frontend

| File | Việc |
|---|---|
| `frontend/src/api/examBankApi.ts` | Thêm type `Attempt`/`AttemptStart`/`AttemptQuestionResult` + hàm gọi 7 endpoint trên |
| `frontend/src/pages/student/ExamAttemptPage.tsx` | Trang làm bài: đếm ngược tính từ `due_at`/`server_now`, tự lưu mỗi 10s, tự nộp khi về 0, hiện kết quả (kèm trạng thái "đang chấm tự luận" nếu còn câu chưa AI chấm xong, tự hỏi lại mỗi 5s tới khi `graded`) |
| `frontend/src/pages/teacher/ExamGradingPage.tsx` | Bảng chấm bài: danh sách học sinh đã làm, điểm AI + độ tin cậy + nhận xét cho từng câu tự luận, ô nhập điểm ghi đè |
| `frontend/src/pages/teacher/ExamBlueprintDetailPage.tsx` | Thêm nút **Publish** (thiếu ở Giai đoạn 3 — không publish thì không ai làm bài được) và nút **Chấm bài** dẫn sang trang chấm khi đề đã publish |
| `frontend/src/App.tsx`, `AppLayout.tsx` | Route `/take-exam/:examId` (chỉ học sinh), `/exams/:examId/grading` (chỉ giáo viên) |

## Bug phát hiện và tự sửa trong phiên này (trước khi bàn giao)

**Bug (nghiêm trọng, sẽ khiến MỌI học sinh bị tự nộp bài ngay khi vừa mở đề):** PyMongo/Motor đọc lại `datetime` từ MongoDB KHÔNG có `tzinfo` (BSON lưu UTC nhưng không giữ offset), dù lúc ghi vào là `datetime.now(timezone.utc)` (aware). Khi FastAPI/Pydantic serialize giá trị naive này ra JSON, chuỗi ISO thiếu hậu tố `Z`/offset (`"2026-07-28T23:53:00.123456"` thay vì `"...123456Z"`) — trình duyệt hiểu `new Date(...)` với chuỗi này là **giờ địa phương**, không phải UTC. Với máy chủ chạy giờ Việt Nam (UTC+7), điều này khiến `due_at` bị hiểu lệch ~7 tiếng so với UTC thật — học sinh vừa mở đề đã thấy đồng hồ hiển thị đã hết giờ, tự động nộp bài trắng ngay lập tức.

Phát hiện khi kiểm thử thật trên trình duyệt: tạo đề thi hạn 5 phút, vào làm bài, log request cho thấy `/submit` bị gọi ngay sau `/start` dù chưa nhập gì.

**Đã sửa:** thêm hàm `_aware()` trong `attempt_service.py`, gắn lại `tzinfo=UTC` cho MỌI trường datetime (`started_at`, `due_at`, `submitted_at`, `created_at`, `updated_at`) trước khi đưa vào `AttemptResponse`/`AttemptStartResponse`. Thêm test hồi quy `test_due_at_is_timezone_aware_after_reload_from_db` (đọc lại từ DB, không dùng object vừa insert, để bắt đúng lỗi này). Đã kiểm chứng lại trên trình duyệt thật sau khi sửa — đồng hồ đếm ngược hiển thị đúng `4:57` ngay sau khi bắt đầu làm bài đề hạn 5 phút.

**Lưu ý cho các giai đoạn sau:** đây là lỗi mang tính hệ thống — BẤT KỲ field datetime nào đọc từ Mongo và có làm phép tính/so sánh ở phía client (không chỉ hiển thị) đều có nguy cơ tương tự. Các field chỉ hiển thị (ví dụ `created_at` dạng text) không bị ảnh hưởng về mặt chức năng dù cũng lệch múi giờ khi hiển thị — nằm ngoài phạm vi sửa của giai đoạn này.

**Bug thứ hai (bảo mật, tự phát hiện và sửa trước khi test):** `override_score()` ban đầu không kiểm tra quyền sở hữu — bất kỳ giáo viên nào đăng nhập cũng có thể ghi đè điểm bài làm của đề thi giáo viên KHÁC (chỉ cần biết `attempt_id`). Phát hiện khi tự rà lại từng service function so với pattern ownership-check đã dùng nhất quán ở Giai đoạn 3 (`_load_owned_exam`, `_load_owned_blueprint`...), trước khi viết test. **Đã sửa**: `override_score` giờ nhận thêm `actor_id`/`is_admin`, load `exam` qua `attempt.exam_id` và kiểm tra `exam.owner_id == actor_id` (hoặc admin) trước khi cho ghi đè — có test `test_override_rejects_non_owner_teacher` xác nhận trả 403.

## Test đã chạy

```
python -m pytest tests -q
```
**357 passed**, 0 fail (342 test cũ từ Giai đoạn 1–3 + 15 test mới: 14 ở `test_exam_bank_attempt.py`, 1 thêm ở `test_exam_bank_role_guard.py`).

Bao phủ: tạo lượt làm bài với `due_at` do server tính, gọi "start" 2 lần không tạo 2 lượt, chặn làm bài đề chưa publish, autosave rồi nộp bài chấm trắc nghiệm ngay lập tức, nộp bài có câu tự luận giữ trạng thái `submitted` + xếp đúng số job vào hàng đợi, job chấm AI cập nhật điểm/trạng thái/chuyển `graded`, giáo viên ghi đè điểm thay thế điểm AI, ghi đè bị chặn nếu không sở hữu đề (403), autosave sau khi hết giờ tự chốt nộp, worker quét tự nộp đúng số lượt quá giờ, học sinh không xem được lượt làm bài của người khác (403), câu hỏi cho học sinh luôn ẩn đáp án, không lấy được câu hỏi của đề chưa publish, **và** datetime trả về sau khi đọc lại từ DB có tzinfo (test hồi quy cho bug ở trên).

## Kiểm thử thủ công trên server thật + trình duyệt (không chỉ mongomock)

Tài khoản giáo viên/học sinh tạo tạm (đã xoá sạch sau khi kiểm thử — xem mục dọn dẹp). Chạy cả `uvicorn` và `python -m app.worker` song song (bắt buộc — lớp tự nộp #3 và chấm AI cần worker chạy).

1. Tạo 2 câu hỏi (1 trắc nghiệm 2đ, 1 tự luận 3đ), duyệt, tạo ma trận 5 điểm/5 phút, validate (OPTIMAL), sinh đề, **publish** (nút mới thêm ở bước này).
2. Học sinh vào `/take-exam/{examId}` — lần đầu với đề hạn 1 phút: do thời gian thao tác qua nhiều lệnh curl/tool call vượt quá 1 phút, bài tự động bị chốt nộp trước khi kịp trả lời — xác nhận trực tiếp lớp tự nộp #2 hoạt động đúng trong điều kiện thật (không phải giả lập).
3. Tạo lại đề hạn 5 phút — **phát hiện bug đồng hồ ở trên** (bị tự nộp ngay lập tức) → sửa → kiểm chứng lại: đồng hồ hiện đúng `4:57`, làm bài, chọn đáp án trắc nghiệm đúng, nhập câu tự luận, bấm Nộp bài.
4. Kết quả ngay sau khi nộp: câu trắc nghiệm chấm đúng ngay (`Đúng · 2/2 điểm`), câu tự luận `Đang chấm…`.
5. Worker xử lý job `grade_essay_answer` — **gặp lỗi thật từ Gemini** (`429 RESOURCE_EXHAUSTED` — hết quota free-tier `generate_content_free_tier_requests`, giới hạn 20/ngày) → xác nhận cơ chế dự phòng hoạt động đúng: điểm 0, độ tin cậy 0%, nhận xét "Không thể tự chấm câu này — cần giáo viên chấm thủ công", trạng thái vẫn chuyển `graded` (không kẹt ở `submitted`).
6. Giáo viên vào `/exams/{examId}/grading` — thấy đúng câu trả lời học sinh, điểm AI 0/3, độ tin cậy 0%, nhận xét trên. Nhập điểm ghi đè `3`, bấm Ghi đè — tổng điểm cập nhật đúng từ `2/5` lên `5/5`, badge "Đã ghi đè: 3 điểm" hiện đúng.

## Blocker đã ghi nhận (không chặn phần còn lại)

**Gemini API free-tier hết quota** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, giới hạn 20 request/ngày) trong lúc kiểm thử chấm tự luận thật — đây là giới hạn tài khoản bên ngoài, không phải lỗi code. Cơ chế dự phòng (điểm 0 + độ tin cậy 0% + yêu cầu giáo viên chấm tay) đã hoạt động đúng như thiết kế khi gặp lỗi này — không có bài nào bị chấm sai âm thầm. Cần nâng hạn mức Gemini (gói trả phí) hoặc đợi reset quota để kiểm thử với các câu trả lời cần chấm ngữ nghĩa đa dạng hơn.

## RBAC / Security

- `require_student_actor` — chỉ role `student` gọi được `start`/`autosave`/`submit`/`get` lượt làm bài của chính mình (403 nếu vai trò khác hoặc không phải chủ lượt).
- `require_exam_bank_actor` (Giai đoạn 3) tái sử dụng cho `list_attempts`/`override` — chỉ giáo viên sở hữu đề (hoặc admin) xem được bảng chấm và ghi đè điểm (xem mục Bug thứ hai ở trên).
- Optimistic concurrency (`compare_and_set`) trên mọi thao tác ghi vào attempt — 2 request cạnh tranh (ví dụ autosave và sweep cùng lúc chốt nộp) không tạo 2 kết quả khác nhau.

## Giả định / hạng mục chưa xử lý, cần lưu ý ở giai đoạn sau

- **Không có trang "danh sách đề đã publish" cho học sinh tự tìm** — học sinh cần được giáo viên chia sẻ trực tiếp đường link `/take-exam/{examId}` (hoặc admin/lớp học gửi). Chưa xây trang duyệt đề công khai theo lớp học — nằm ngoài yêu cầu tối thiểu của giai đoạn này, để lại cho giai đoạn tích hợp cuối nếu cần.
- **`grade_essay_answer_job` không dùng `compare_and_set`** (đọc-sửa-ghi thường) — chấp nhận vì `background_job_service` chỉ xử lý 1 job/lần/worker; nếu sau này chạy nhiều worker song song thật sự chấm 2 câu tự luận CÙNG một attempt đồng thời, cần thêm optimistic-lock retry (đã ghi chú `ponytail:` ngay tại code).
- **Không có UI giáo viên xem trạng thái hàng đợi chấm** (bao nhiêu job đang chờ, job nào thất bại/dead-letter) — worker đã ghi log JSON đầy đủ (Giai đoạn 2), nhưng chưa có màn hình admin hiển thị. Để lại cho giai đoạn QA/vận hành cuối nếu cần.
- Rủi ro lệch múi giờ đã sửa cho `exam_attempts`, nhưng là lỗi mang tính hệ thống — nếu giai đoạn sau thêm field datetime mới mà client có tính toán trên đó (không chỉ hiển thị), cần áp dụng `_aware()` tương tự.
