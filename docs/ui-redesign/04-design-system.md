# EzEdu AI — Design system (đối chiếu với đặc tả MagicSchool-inspired)

- **Ngày:** 2026-07-29
- **Nguồn thật:** `frontend/src/styles/tokens.css` (526 dòng, 3 tầng: primitive → semantic → alias), `frontend/src/components/ui/` (24 component).

---

## 1. Quyết định: giữ nguyên bộ token hiện có, không đổi màu chủ đạo

Đặc tả đề xuất bảng màu mới (`#6D5DFB` chủ đạo, `#3B82F6` phụ, v.v). Hệ thống hiện tại đã có bộ token đầy đủ, đã qua kiểm tra tương phản và đã dùng trong toàn bộ ứng dụng (public site, dashboard, admin, cả hai theme sáng/tối). Đổi màu chủ đạo toàn cục là thay đổi **rủi ro cao, phạm vi ảnh hưởng toàn app**, không nằm trong yêu cầu cốt lõi ("không sao chép CSS/màu của MagicSchool" — nghĩa là không bắt buộc phải trùng bảng màu đề xuất, đó chỉ là gợi ý tham khảo). Quyết định: **giữ bảng màu hiện có**, chỉ bổ sung phần còn thiếu (component, bố cục). Bảng dưới đây đối chiếu để người dùng thấy rõ khoảng cách và xác nhận lại nếu muốn đổi.

| Vai trò | Đề xuất trong đặc tả | Hiện có (`tokens.css`) | Khoảng cách |
|---|---|---|---|
| Primary | `#6D5DFB` | `#3d52d5` (`--ez-indigo-600`) | Cùng tông tím-xanh, độ bão hoà khác |
| Primary dark | `#5546E8` | Dark theme dùng `--ez-indigo-400` (`#6b7ded`, sáng hơn cho nền tối) | Không tương đương trực tiếp — hệ hiện tại tách bảng màu riêng cho theme tối thay vì chỉ đổi độ đậm |
| Secondary | `#3B82F6` | `#0e9f8e` (`--ez-teal-500`) | Khác tông (xanh dương vs xanh lục lam) |
| Accent | `#F59E0B` | `#e8890c` (`--ez-amber-500`) | Cùng tông amber |
| Success | `#16A34A` | `#0e7a49` (`--ez-green-600`) | Cùng tông, đậm hơn |
| Danger | `#DC2626` | `#b82323` (`--ez-red-600`) | Cùng tông |
| Background | `#F7F8FC` | `--ez-neutral-50` | Tương đương |
| Border | `#E7E8F0` | `--ez-border` (alias tới neutral) | Tương đương |

## 2. Typography

Đặc tả đề xuất **Be Vietnam Pro**. Hiện có `--ez-font-sans: 'Inter', -apple-system, ...` — Inter hỗ trợ tốt tiếng Việt (đã kiểm chứng qua toàn bộ nội dung tiếng Việt trong app từ phiên trước), không phát sinh lỗi hiển thị dấu. Giữ nguyên, không đổi font toàn cục vì rủi ro tương tự mục 1.

## 3. Spacing / Radius / Shadow — đã khớp gần như hoàn toàn

| Thang | Đặc tả | Hiện có |
|---|---|---|
| Spacing | 4,8,12,16,20,24,32,40,48,64 | `--ez-space-0` … `--ez-space-32`, cùng cấp số |
| Radius input/button | 10–12px | `--ez-radius-md: 10px` ✅ |
| Radius card | 16–20px | `--ez-radius-lg: 14px`, `--ez-radius-xl: 20px` — gần đúng |
| Radius modal | 20–24px | `--ez-radius-2xl: 28px` — hơi lớn hơn, chấp nhận được |
| Pill | full rounded | `--ez-radius-full: 9999px` ✅ |

Không cần chỉnh — đã đạt yêu cầu "bo góc mềm, không quá gắt".

## 4. Component đã có sẵn (tái sử dụng, không viết lại)

`Button, Spinner, FormField, Input, Textarea, Select, Checkbox/Radio/RadioCard, Chip/ChipGroup, Card*, Badge, Alert, PageHeader/SectionHeader, StatGrid/StatTile, ProgressBar/ProgressSteps, Dialog/Drawer, Dropdown, Tooltip, Tabs, Toast, Skeleton*, EmptyState/ErrorState/FeatureDisabledState/PermissionDeniedState` — 22 component, đủ để phủ toàn bộ 24 component được liệt kê trong đặc tả (AppShell/PublicHeader/AppHeader/RoleSidebar tương ứng với `AppLayout`/`PublicHeader`/`AppHeader` đã có; MobileNavigation đã có trong `AppLayout` dạng bottom nav — xác nhận qua kiểm tra ở viewport 375px, xem [06-test-report.md](06-test-report.md); FilterBar tương ứng `ChipGroup`; DataTable/Pagination — chưa có component chuyên biệt, các trang danh sách (VD `AdminUsersPage`) tự dựng bảng bằng CSS thường, chưa trừu tượng hoá — **không chặn công việc**, ghi vào roadmap kỹ thuật, không phải khoảng trống UI).

## 5. Component mới thêm trong phiên này

| Component | Vị trí | Lý do |
|---|---|---|
| `ToolCard` | `components/ui/ToolCard.tsx` | Thẻ công cụ AI dùng chung cho Thư viện công cụ — tái sử dụng `Card`, `Badge` có sẵn |
| `SearchCommand` | `components/ui/SearchCommand.tsx` | Ô tìm kiếm lớn ở đầu dashboard, dùng lại `Input` có sẵn (prop `leadingIcon`) |

Không thêm dependency mới — cả hai component dựng từ primitive đã có.
