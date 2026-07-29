# EzEdu AI — Báo cáo nhất quán thị giác

- Ngày: 2026-07-29

## Nguồn sự thật

`frontend/src/styles/tokens.css` là nguồn sự thật cho màu sắc, typography, spacing, radius, shadow, z-index, motion, breakpoint tham chiếu và touch target.

Đã sửa thứ tự cascade thành:

1. `index.css` cho lớp legacy;
2. `tokens.css` ghi đè bằng primitive/semantic/alias chuẩn;
3. `base.css` áp dụng reset, typography và accessibility.

Trước sửa đổi, `index.css` được nạp sau token nên bảng màu “Crystal” cũ có thể ghi đè các alias semantic.

## Token semantic chuẩn

Các tên bắt buộc hiện có:

- primary, primary-hover, primary-active;
- secondary;
- accent;
- background;
- surface, surface-muted;
- border;
- text-primary, text-secondary;
- success, warning, danger, info;
- focus-ring.

Các component mới dùng tiền tố `--ez-*`. Alias cũ như `--accent`, `--surface`, `--danger` vẫn được ánh xạ để phần giao diện chưa di trú không bị vỡ.

## Màu sắc

- Màu thương hiệu chính: indigo.
- Màu phụ: teal.
- Màu nhấn: amber.
- Trạng thái dùng success/warning/danger/info nhất quán.
- Các biểu đồ Admin đã bỏ màu hex viết trực tiếp và dùng semantic token.
- Không còn màu hex/RGB viết trực tiếp trong phạm vi component UI, trang Admin, trang teacher, sinh câu hỏi, danh sách/chi tiết học liệu.

Giá trị màu thô chỉ được phép nằm trong file token. Một số CSS legacy ngoài phạm vi đã di trú vẫn còn mã màu cũ và được cô lập bằng alias/cascade; đây là nợ kỹ thuật, không phải nguồn cho component mới.

## Typography và spacing

- Font sans chuẩn là Inter với fallback hệ thống; hỗ trợ đầy đủ tiếng Việt.
- Heading dùng thang 40/32/24/20/18/16px; body mặc định 16px; caption 13px.
- Line-height thân bài 1.65 để dấu tiếng Việt không bị chật.
- Spacing dùng thang 4px.
- Control tiêu chuẩn 40–48px; touch target trên mobile tối thiểu 44px.

## Responsive và component

- Admin dùng PageHeader, SectionHeader, StatTile, Card, DataTable/Pagination, Badge, FormField và Dialog dùng chung.
- Bảng rộng cuộn trong container riêng, không làm `body` tràn ngang.
- Grid Admin giảm cột tại 1100/900/760/640px tùy mật độ dữ liệu.
- Dialog mobile chiếm chiều rộng khả dụng, footer xếp hợp lý và khóa đóng khi request nguy hiểm đang chạy.
- Skeleton dùng `aria-busy` và live status, trong khi hình giả chỗ bị ẩn với trình đọc màn hình.

## Kiểm tra

- TypeScript: pass.
- ESLint file thay đổi: pass.
- Quét màu viết trực tiếp trong phạm vi đã chuẩn hóa: `0` kết quả.
- Production build được chạy lại trong giai đoạn QA cuối.

Kiểm tra hình ảnh ở sáu viewport, dark mode và overflow được ghi tại `13-playwright-responsive-report.md`.
