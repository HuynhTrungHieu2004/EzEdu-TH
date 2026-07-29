# EzEdu AI — Sửa luồng xem và chấm kết quả thi

- Ngày: 2026-07-29

## Nguyên nhân

Phiên bản code được tiếp quản không còn literal student/attempt/submission ID thử trong `ExamGradingPage`. ID thật đã đi từ đề thi được chọn tại `ExamBlueprintDetailPage` sang route chấm bài. Phần còn thiếu là:

- route chưa chặn `examId` sai định dạng trước khi gọi API;
- UI chưa phân biệt không tồn tại, không đủ quyền và lỗi hệ thống;
- trang giáo viên hiển thị raw `student_id` vì response attempt không có tên;
- backend gọi `ObjectId(...)` trực tiếp với ID route, khiến ID sai định dạng có thể thành lỗi 500;
- backend chưa chặn điểm giáo viên cao hơn điểm tối đa của câu.

## Route trước và sau

Không đổi route:

- Giáo viên: `/exams/:examId/grading`.
- Học sinh: `/take-exam/:examId`.

`examId` là định danh đề thật được lấy từ `exam.id` trong danh sách đề đã sinh. Mỗi thao tác ghi đè sử dụng `attempt.id` và `question_id` từ response API; không dùng `studentId` làm định danh lượt làm bài.

## Nguồn ID thật

1. Giáo viên chọn “Chấm bài” trên một đề đã publish.
2. `ExamBlueprintDetailPage` điều hướng bằng `exam.id`.
3. `ExamGradingPage` gọi `GET /exams/{examId}/attempts`.
4. Nút ghi đè gọi `POST /exam-attempts/{attempt.id}/override`.
5. Học sinh bắt đầu/khôi phục lượt làm qua `POST /exams/{examId}/attempts/start`; backend suy ra `student_id` từ access token và trả `attempt.id`.

Không có `student_id` do frontend tự gửi trong các request trên.

## Frontend guard

- Chỉ chấp nhận `examId` Mongo ObjectId 24 ký tự; ID thiếu/sai không tạo request.
- Phân biệt state 403, 404 và lỗi hệ thống.
- Không gọi override nếu điểm rỗng, không phải số, âm hoặc vượt điểm tối đa.
- Chống double click bằng loading/disabled theo từng câu.
- Refresh trực tiếp và Back/Forward giữ đúng ID vì nguồn sự thật nằm trong URL.
- Tên/email học sinh từ backend được ưu tiên; không còn render raw `student_id`.
- Route giáo viên vẫn nằm trong `RoleRoute(TEACHER_ONLY)`. Admin không được mở route frontend này vì nghiệp vụ hiện hành chưa cấp route chấm cho Admin.

## Backend guard

- Mọi endpoint học sinh dùng `current_user.id`; `_load_own_attempt` đối chiếu `attempt.student_id`, nên học sinh không thể xem/lưu/nộp attempt của người khác.
- Danh sách attempt và ghi đè điểm kiểm tra đề thuộc `actor_id`; Admin chỉ được bỏ qua ownership nếu thuộc tập role Admin hiện hành.
- ID exam/attempt sai định dạng trả 404 thay vì lỗi nội bộ.
- Ghi đè dùng `attempt_id` + `question_id`, xác minh question có trong results của attempt.
- Điểm do frontend gửi phải từ 0 đến `points_possible`; tổng điểm luôn được backend tính lại từ results.
- API danh sách attempt bổ sung `student_name`/`student_email` bằng lookup server-side. Đây là field response tùy chọn, không thay đổi field hoặc request contract cũ.

## Test đã chạy

- Frontend TypeScript: pass.
- ESLint các file ExamGrading/API liên quan: pass.
- Frontend production build: pass.
- Backend targeted: `26 passed` cho `test_exam_bank_attempt.py` và `test_exam_bank_role_guard.py`.
- Test hồi quy mới:
  - ID exam/attempt sai định dạng trả 404.
  - teacher list có tên/email học sinh khi user tồn tại.
  - điểm ghi đè vượt điểm tối đa bị từ chối.
- Test sẵn có đã xác nhận:
  - học sinh không xem attempt người khác;
  - giáo viên sở hữu đề được ghi đè;
  - giáo viên ngoài quyền bị 403;
  - role guard học sinh/giáo viên/Admin;
  - attempt không tồn tại;
  - luồng submit, AI grading và override.

## Chưa thể xác minh ở giai đoạn này

Click-through bằng tài khoản thật, refresh route và kiểm tra network/console được gom vào Playwright responsive ở báo cáo `13-playwright-responsive-report.md`. Không dùng tài khoản hoặc dữ liệu production.

---

## Xác nhận độc lập của Claude (2026-07-29)

Không phát hiện vấn đề nào cần sửa thêm — mọi tuyên bố ở trên đã được verify trực tiếp trong mã nguồn (không chỉ đọc báo cáo), xem `16-claude-post-codex-review.md` mục 7 và 3:

- `examId` được chặn bằng regex 24-hex ở frontend (`ExamGradingPage.tsx`) **và** bằng `_object_id_or_404()` ở backend (`attempt_service.py`) — ID sai định dạng trả 404, không phải lỗi 500.
- Không còn `student_id` thô hiển thị cho giáo viên; `attempt.student_name || attempt.student_email` được backend join sẵn.
- Ownership: `_load_own_attempt()` chặn học sinh xem attempt người khác (403); `list_attempts_for_exam()`/`override_score()` chặn giáo viên ngoài quyền sở hữu đề (403 nếu không phải admin).
- Điểm ghi đè bị chặn nếu vượt điểm tối đa của câu (422) — cả ở validate phía client (`disabled={!validScore}`) lẫn phía backend (`attempt_service.py` dòng ~322).
- Backend test targeted `pytest -q tests/test_exam_bank_attempt.py tests/test_exam_bank_role_guard.py` tự chạy lại: `26 passed` — khớp con số báo cáo.

Không có thay đổi nào được thực hiện cho `ExamGradingPage`/`attempt_service.py` trong lượt sửa lỗi này vì không có gì để sửa.
