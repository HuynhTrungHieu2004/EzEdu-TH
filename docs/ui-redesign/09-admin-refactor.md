# EzEdu AI — Refactor giao diện Admin

- Ngày: 2026-07-29
- Phạm vi: toàn bộ 16 route Admin thực tế trong `frontend/src/App.tsx`.

## Kết luận

Prompt 1 trước khi tiếp quản mới hoàn thành nhóm Người dùng. Lượt này đã rà soát và đưa cả 16 trang Admin về cùng design system hiện hành, giữ nguyên route, API contract và nghiệp vụ.

## Inventory

| Nhóm | Route | Trang | Design system |
|---|---|---|---|
| Tổng quan | `/admin/dashboard` | `AdminDashboardPage` | `PageHeader`, `Tabs`, `SectionHeader`, `StatTile`, `SkeletonText`, `ErrorState`, `Dialog` |
| Người dùng | `/admin/users`, `/admin/users/:userId` | `AdminUsersPage`, `AdminUserDetailPage` | `PageHeader`, `Card`, `DataTable`, `FilterBar`, `Pagination`, `Dialog`, states |
| Nội dung | `/admin/documents*`, `/admin/questions*`, `/admin/exams` | 5 trang | `PageHeader`; badge, pagination, empty state và confirmation qua `AdminContentShared` dùng primitives chung |
| AI | `/admin/ai` | `AdminAIPage` | `PageHeader`; badge, pagination và states chung |
| Website | `/admin/website-content` | `AdminWebsiteContentPage` | `PageHeader`, `Badge`, `SkeletonText`, `ErrorState`, `ConfirmDialog` |
| Hệ thống | `/admin/settings`, `/admin/feature-flags`, `/admin/notifications` | 3 trang | `PageHeader`; states, badge, pagination và dialog chung |
| Báo cáo & log | `/admin/reports`, `/admin/activity-logs`, `/admin/audit-logs` | 3 trang | `PageHeader`, `StatGrid`, `SkeletonText`, `ErrorState`, `EmptyState`, `Pagination`, `Dialog` |

## Component dùng chung

- `components/ui/AdminPrimitives.tsx`: `DataTable`, `FilterBar`, `Pagination`, `ConfirmDialog`.
- `pages/AdminContentShared.tsx`: chỉ còn adapter tương thích cho các trang content cũ; adapter gọi `EmptyState`, `Badge`, `Pagination`, `ConfirmDialog`, `FormField`, `Textarea` của design system, không tự dựng bản sao.
- `Dialog` cung cấp focus trap, khóa cuộn nền, phím Escape và trả focus về nút mở.
- `ConfirmDialog` không đóng khi request đang chạy và hỗ trợ vô hiệu hóa xác nhận khi form chưa hợp lệ.

## Trạng thái giao diện

- Loading: skeleton hoặc trạng thái tải rõ ràng.
- Empty: `EmptyState` dùng chung.
- Error: `ErrorState` hoặc adapter state dùng chung; có retry ở Dashboard và hai trang log.
- Permission: `AdminRoute` bảo vệ toàn khu vực; `PermissionDeniedState` được dùng ở trang chi tiết người dùng, các action tiếp tục lọc theo RBAC hiện có.
- Bảng: nằm trong wrapper cuộn ngang cục bộ; bảng Users chuyển sang `DataTable` responsive.
- Modal: dùng portal và kích thước giới hạn viewport từ `Dialog`; không còn modal tự dựng ở Dashboard, Website CMS, Activity Logs hoặc Audit Logs.

## Kiểm thử sau từng nhóm

| Nhóm | TypeScript | ESLint file liên quan | Production build |
|---|---|---|---|
| Users | Pass | Pass | Pass |
| Admin Content | Pass | Pass | Pass |
| Activity/Audit | Pass | Pass | Pass |
| Dashboard | Pass | Pass | Pass |

Build còn cảnh báo chunk chính lớn hơn 500 kB; đây là cảnh báo tối ưu bundle, không phải lỗi build. Kiểm tra route, console và sáu viewport được thực hiện ở giai đoạn Playwright và ghi tại `13-playwright-responsive-report.md`.

## Không thay đổi

- Không đổi route Admin.
- Không đổi request/response API.
- Không đổi permission key hoặc cách backend quyết định quyền.
- Không dùng dữ liệu mock.
- Không xóa CSS cũ chưa thể chứng minh là dead code; CSS còn lại chủ yếu phục vụ layout/bảng/charts đặc thù, dùng token chung.

---

## Cập nhật của Claude (2026-07-29, sau khi rà soát báo cáo 16)

Báo cáo `16-claude-post-codex-review.md` xác nhận phần lớn nội dung ở trên là chính xác (16/16 route render, `DataTable`/`ConfirmDialog`/`PageHeader` dùng thật), nhưng phát hiện 2 trang chưa đạt tới tầng form-control: `AdminFeatureFlagsPage.tsx` và `AdminSettingsPage.tsx` vẫn dùng `<select>`/`<textarea>`/`<input>`/`<button>` thuần thay vì primitive design system. Đã sửa:

- `AdminFeatureFlagsPage.tsx`: chuyển toàn bộ form sang `Card`/`CardBody`/`FormField`/`Select`/`Textarea`/`Input`/`Button`; trường "Allowed roles" đổi từ `<select multiple>` sang `ChipGroup`/`Chip` (bấm để bật/tắt từng role — dễ thao tác và đọc hơn multi-select gốc).
- `AdminSettingsPage.tsx`: chuyển sang `Card`/`CardBody`/`FormField`/`Select`/`Input`/`Button`, dùng `SectionHeader` cho tiêu đề từng nhóm cấu hình thay vì `<h2>` thuần.
- Không đổi logic nghiệp vụ, không đổi API call, không đổi `DANGEROUS_FLAGS`/`DANGEROUS_SETTINGS` (vẫn là set tĩnh phía client — xem `11-admin-dangerous-actions.md` để biết vì sao chưa xử lý).
- 3 chỗ hiển thị raw JSON/enum ở `AdminDashboardPage.tsx` (raw `alert.severity`, raw `source_mode` không nhất quán với badge, JSON dump không format) đã sửa: dùng lại `ERROR_SEVERITY_LABELS` cho cả hai chỗ hiển thị severity, badge/caption `source_mode` dùng chung logic "Live"/"Mock", và JSON object lồng nhau hiển thị qua `<pre>` có format thay vì một chuỗi nén.
- 4 chỗ `color: #fff` viết tay trong `AdminDashboardPage.css` đổi sang `var(--ez-text-on-brand)` — đúng token đã dùng cho các biến thể nút primary/danger khác trong `components/ui/ui.css`.

Đã kiểm tra: `tsc -b`, `eslint`, `npm run build` sạch; xác nhận trực tiếp qua trình duyệt (`/admin/feature-flags`, `/admin/settings`, `/admin/dashboard`) ở cả desktop và mobile (375px) — không lỗi console, không tràn ngang, nút "Lưu" giữ đúng trạng thái disabled khi chưa đổi giá trị.
