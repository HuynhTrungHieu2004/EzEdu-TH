# Ảnh so sánh trước/sau — redesign 2026-08

Spec §11 yêu cầu "có ảnh so sánh trước/sau cho các trang trọng yếu". Bộ ảnh này đáp ứng khoản đó.

## Cách chụp

- **Trước**: commit `d7d4de5` (`docs: plan redesign foundation implementation`) — trạng thái ngay trước khi
  merge lát foundation. Chụp trong một git worktree riêng để không phải revert code đang chạy.
- **Sau**: `main` sau khi trả hết nợ lát 10.
- Cùng một bộ fixture Playwright, cùng viewport `desktop-1440` (1440×900), cùng `stubApi` — khác biệt trong
  ảnh là khác biệt của giao diện, không phải của dữ liệu.

Chụp lại khi cần: dựng worktree ở commit gốc, chạy cùng spec chụp ảnh ở cả hai bên, so từng cặp.

## Các cặp ảnh

| Trang | Trước | Sau | Thay đổi chính |
| --- | --- | --- | --- |
| Dashboard học sinh | `before-student-dashboard.png` | `after-student-dashboard.png` | Sidebar navy theo vai trò, banner navy→teal, stat tile đếm số, hành động nhanh vào theo stagger |
| Hỏi đáp AI (học sinh) | `before-student-chat.png` | `after-student-chat.png` | Ba cột vừa khít khung (trước bị tràn 854px trên viewport 844px), ô nhập luôn trong tầm nhìn |
| Kho học liệu (giáo viên) | `before-teacher-documents.png` | `after-teacher-documents.png` | Bảng dùng chung + thanh lọc + trạng thái đọc được, thay bảng CSS legacy không có bộ lọc |
| Dashboard giáo viên | `before-teacher-dashboard.png` | `after-teacher-dashboard.png` | Cùng khung app mới, số liệu đếm lên, banner học thuật |
| Tổng quan quản trị | `before-admin-dashboard.png` | `after-admin-dashboard.png` | Sidebar nhóm thu gọn, stat tile stagger + đếm số |
| Đăng nhập | `before-login.png` | `after-login.png` | Bố cục hai vùng (thương hiệu navy + form), lỗi cạnh từng trường |
| Onboarding học sinh | `before-onboarding.png` | `after-onboarding.png` | Form dài một trang → stepper bốn bước có quay lại và giữ nháp |
