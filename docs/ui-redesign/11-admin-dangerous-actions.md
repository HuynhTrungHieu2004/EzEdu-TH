# EzEdu AI — Xác nhận thao tác nguy hiểm

- Ngày: 2026-07-29

## Phạm vi

Đã rà soát các thao tác ghi dữ liệu có hậu quả lớn trong khu vực Admin và luồng giáo viên:

- xóa tài khoản, học liệu, bộ câu hỏi, câu hỏi và lớp học;
- khóa tài khoản, đặt lại mật khẩu, đổi vai trò và quota;
- xử lý lại/cách ly học liệu;
- sinh câu hỏi bằng AI và sinh lại câu hỏi;
- duyệt/lưu trữ hàng loạt;
- lưu cấu hình hệ thống, feature flag và xuất bản nội dung;
- khởi chạy lập chỉ mục tài liệu.

## Quy ước xác nhận

- Dialog dùng component chung, có focus trap, Escape, tiêu đề và mô tả liên kết bằng ARIA.
- Hiển thị rõ đối tượng, phạm vi ảnh hưởng và khả năng hoàn tác.
- Thao tác không thể hoàn tác yêu cầu nhập `XÓA`, email tài khoản hoặc `RESET` tùy ngữ cảnh.
- Các thao tác quản trị quan trọng yêu cầu lý do; lý do được gửi cùng request để backend ghi audit.
- Nút xác nhận bị khóa nếu dữ liệu chưa hợp lệ hoặc request đang chạy.
- Không thể đóng dialog hoặc bấm lặp trong lúc request đang chạy.
- Sinh câu hỏi/lập chỉ mục nêu rõ số lượng, phạm vi tài liệu và khả năng tiêu thụ quota.

## Phòng vệ backend

- Endpoint Admin tiếp tục kiểm tra quyền theo RBAC và không tin điều kiện ẩn/hiện nút ở frontend.
- Payload quota từ chối key không hỗ trợ, boolean, số âm và giá trị vượt ngưỡng.
- Bulk question IDs phải là Mongo ObjectId hợp lệ, được khử trùng lặp và giới hạn tối đa 500.
- Sinh câu hỏi kiểm tra chủ sở hữu, trạng thái đã lập chỉ mục, loại câu hỏi, giới hạn hệ thống và quota AI.
- Override điểm thi kiểm tra quyền sở hữu đề, attempt, question và điểm tối đa.

## Kiểm thử

- Frontend TypeScript: pass.
- ESLint các file thay đổi: pass.
- Frontend production build: pass.
- Backend targeted: `42 passed` cho Admin AI, question bank, exam attempt và role guard.
- Không còn `window.confirm`, `window.prompt` hoặc lời gọi `confirm(...)` trong source TypeScript/TSX.

## Giới hạn

Các thao tác khôi phục hoặc bỏ cách ly có thể hoàn tác và không phá hủy dữ liệu nên không bắt nhập cụm xác nhận. Việc click-through trên trình duyệt với tài khoản thật sẽ được ghi riêng trong báo cáo Playwright; không dùng dữ liệu production để kiểm thử.

---

## Lỗi Claude phát hiện và đã sửa (2026-07-29)

`16-claude-post-codex-review.md` (mã **C1**, mức High) phát hiện: tuyên bố "Payload quota từ chối key không hỗ trợ, boolean, số âm và giá trị vượt ngưỡng" ở trên **chỉ đúng cho một trong hai endpoint cập nhật quota song song trong hệ thống**.

- `PATCH /admin/ai/quota/users/{id}` (`AdminAIPage.tsx` gọi) — có validate qua `AIQuotaUpdateRequest` (`field_validator` gọi `_validated_quota`, nay đổi tên public thành `validated_quota`). **Đúng như báo cáo.**
- `PATCH /admin/users/{id}/quota` (`AdminUsersPage.tsx` gọi qua `adminUsersApi.updateQuota` — đây mới là đường UI thật mà trang "Người dùng" dùng) — schema `AdminUserQuotaUpdateRequest` nhận `dict[str, Any]` **không có validator nào**, chấp nhận key lạ, giá trị boolean, số âm, hoặc số vượt 10 tỷ. **Sai với tuyên bố.**

### Đã sửa

- `backend/app/schemas/admin_ai.py`: đổi tên hàm `_validated_quota` (private) thành `validated_quota` (public) để tái dùng hợp lệ giữa hai module — không đổi logic bên trong hàm.
- `backend/app/schemas/admin_users.py`: thêm `@field_validator("current_quota")` cho `AdminUserQuotaUpdateRequest`, gọi `validated_quota()` giống hệt endpoint AI — cùng một quy tắc chặn key lạ/boolean/âm/vượt ngưỡng cho cả hai đường cập nhật quota.
- Thêm 2 test hồi quy trong `backend/tests/test_admin_users.py`: `test_update_quota_persists_valid_payload` (giá trị hợp lệ vẫn lưu đúng) và `test_update_quota_rejects_invalid_payload` (4 trường hợp: key lạ, boolean, âm, vượt ngưỡng — đều phải raise `ValidationError`).

### Kiểm thử

- `pytest -q tests/test_admin_users.py`: 12 passed (10 cũ + 2 mới).
- `pytest -q tests/test_admin_ai.py`: 5 passed (xác nhận đổi tên hàm không phá endpoint AI).
- `pytest -q` toàn bộ: 411 passed (409 cũ + 2 mới), không regression.
- `tsc -b`, `eslint`, `npm run build`: sạch (không đổi gì ở frontend cho fix này, chỉ backend).

Không đổi API contract có thể quan sát được từ client (request/response shape của `PATCH /admin/users/{id}/quota` giữ nguyên) — chỉ thêm điều kiện từ chối cho input không hợp lệ mà trước đây bị chấp nhận nhầm.
