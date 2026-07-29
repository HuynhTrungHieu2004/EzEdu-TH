# EzEdu AI — Báo cáo accessibility

- Ngày: 2026-07-29
- Chuẩn tự động tham chiếu: WCAG 2.0 A/AA và WCAG 2.1 A/AA qua axe

## Kết luận

Các bề mặt được quét không còn violation axe trong fixture đã kiểm tra. Kết quả này không phải chứng nhận đạt toàn bộ WCAG: chưa có audit thủ công với screen reader và chưa click-through mọi happy path nghiệp vụ bằng dữ liệu tích hợp thật.

## Thay đổi đã thực hiện

- Thêm skip-to-content cho App layout, Public layout, landing và public information pages.
- Đích `main` có `tabIndex={-1}` để nhận focus sau khi kích hoạt skip link.
- Loại landmark `main` lồng nhau ở các trang Admin và một số trang nội dung.
- Chuẩn hóa heading đầu trang maintenance thành `h1`.
- Bỏ ảnh sticker trang trí tham chiếu asset không tồn tại; icon trang trí dùng `aria-hidden`.
- Input file ở landing có accessible name.
- Skeleton stack có `aria-busy`, live region và status text cho screen reader.
- Dialog dùng `aria-modal`, liên kết title/description, focus trap, Escape, khóa scroll và trả focus.
- ConfirmDialog không cho đóng khi request đang chạy.
- Màu neutral 500 được điều chỉnh để text phụ đạt ngưỡng tương phản AA trên nền sáng.
- Touch target mobile và focus ring lấy từ design token; `prefers-reduced-motion` được tôn trọng trong global CSS.

## Kiểm tra tự động

- 84 lần thực thi trong `accessibility.spec.ts`: 14 ca × 6 viewport.
- 78 lượt quét axe, gồm public light/dark, Admin unavailable state, ExamGrading invalid state và dialog xác nhận trên sáu viewport.
- Keyboard assertions: skip link, thứ tự tab form login, focus trap/return focus của dialog Admin.
- Semantic/responsive assertions bổ sung nằm trong bộ route smoke.
- Kết quả toàn bộ Playwright: `438 passed`.

## Ma trận bàn phím

| Luồng | Mức xác minh | Ghi chú |
|---|---|---|
| Đăng nhập | Tự động | Label và thứ tự Email → Mật khẩu → Đăng nhập |
| Sidebar/navigation theo role | Một phần | Link route và role guard được smoke; chưa audit toàn bộ chuỗi Tab thủ công |
| Mở Công cụ AI | Một phần | Route Teacher/Student render; chưa click-through bằng keyboard với backend thật |
| Upload học liệu | Tĩnh | Label/input/touch target có; không gửi file do không có môi trường tích hợp |
| Form sinh câu hỏi | Tĩnh | Route/error state có; chưa chạy happy path bằng keyboard |
| Chuyển tab | Tĩnh | Component Tabs có semantic button/ARIA; chưa audit mọi trang bằng screen reader |
| Mở/đóng modal | Tự động | Escape, focus trap và return focus |
| Xác nhận Admin | Tự động | Lý do/email, disabled state và axe trong dialog |
| Mobile navigation/overflow drawer | Một phần | Responsive/overflow route smoke đạt; chưa audit screen reader thủ công |

## Hạng mục cần audit thủ công tiếp

- VoiceOver/NVDA: tên, role, state và thứ tự đọc trên các trang dữ liệu thật.
- Announcement khi API success/error thay đổi động ở mọi nghiệp vụ.
- Bảng lớn với header association và điều hướng screen reader.
- Zoom 200–400%, high-contrast/forced-colors và reflow ở nội dung dài bất thường.
- Keyboard happy path upload, sinh câu hỏi, làm bài và chấm bài trên môi trường test tích hợp.

---

## Cập nhật của Claude (2026-07-29)

Khi migrate `AdminFeatureFlagsPage.tsx`/`AdminSettingsPage.tsx` sang design system (xem `09-admin-refactor.md`), trường "Allowed roles" đổi từ `<select multiple>` sang `ChipGroup`/`Chip`. Component `Chip` (`components/ui/ChipGroup.tsx`) đã tự gắn `aria-pressed` và render bằng `<button type="button">` thật — giữ đúng ngữ nghĩa toggle button có thể thao tác bằng bàn phím (Tab + Enter/Space), không cần thêm ARIA thủ công. `FormField` bao quanh mỗi trường vẫn tự nối `label`/`id`/`aria-describedby` như mô tả ở trên.

Không có thay đổi accessibility nào khác trong lượt sửa lỗi này — các trang còn lại không đổi cấu trúc DOM/ARIA. Audit thủ công (VoiceOver/NVDA, zoom, forced-colors) vẫn **chưa thực hiện**, giữ nguyên trạng thái từ báo cáo gốc.
