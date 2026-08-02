# Thiết kế: Tái thiết kế giao diện "Bảng đen & Bút đỏ" (Chalkboard & Red Pen)

Ngày: 2026-08-03

## Bối cảnh

Repo đã qua 2 đợt redesign toàn diện trước đó:
1. **Cycle 1 (đã ship, đang chạy trên `main`)**: indigo/teal/amber, "MagicSchool-inspired" ở mức nguyên tắc (whitespace rộng, không glassmorphism), font Inter.
2. **Cycle 2 (đã spec + code, KHÔNG merge)**: "Editorial Classroom Energy" — nền cream, tím hoàng gia, font Be Vietnam Pro, nằm ở branch `codex/premium-magicschool-redesign` chưa từng lên `main`.

Người dùng yêu cầu hướng thẩm mỹ **hoàn toàn mới**, khác cả 2 bản trên, giữ nguyên 100% chức năng (không đổi logic/API/props component). Đối tượng: học sinh THPT + giáo viên Việt Nam, tone "thân thiện nhưng trưởng thành, không trẻ con".

## Hướng thẩm mỹ: Bảng đen & Bút đỏ

Lấy cảm hứng trực tiếp từ trải nghiệm cốt lõi của sản phẩm — bảng đen lớp học + bút đỏ giáo viên chấm bài — gắn thẳng vào chức năng chính (AI tạo đề, chấm điểm), không dùng ẩn dụ trừu tượng. Tránh 2 khuôn mẫu AI-generated phổ biến (cream+serif+terracotta, và nền tối+neon).

### Màu sắc (CSS variables mới trong `tokens.css`)

| Token | Giá trị | Vai trò |
|---|---|---|
| `--ez-primary` | `#1D3B2C` | Xanh bảng đen đậm — nút chính, nav active |
| `--ez-background` | `#FAF9F6` | Trắng phấn ấm |
| `--ez-accent` (bút đỏ) | `#D64545` | Đỏ san hô ấm — điểm số, dấu tick, CTA quan trọng, dùng THƯA |
| `--ez-text` | `#23262B` | Than ấm (không đen thuần) |
| `--ez-surface-muted` | `#EEF3EF` | Sage nhạt — nền card phụ |

Giữ nguyên bộ token dark-mode tương ứng (tính theo cùng công thức đã có trong `tokens.css`, chỉ đổi giá trị base).

**Kiểm tra bắt buộc lúc build**: đo contrast ratio thật giữa `--ez-accent` trên `--ez-background` và `--ez-text` trên `--ez-background` — phải đạt WCAG AA (4.5:1 cho text thường, 3:1 cho text lớn/UI component). Không đoán, đo bằng công cụ thật (browser devtools hoặc contrast checker) trước khi chốt giá trị cuối.

### Typography

- Heading: **Lexend** (600–700) — tự tin, rõ ràng, hỗ trợ dấu tiếng Việt, không nằm trong nhóm font bị lạm dụng (Inter/Roboto/Fraunces/Geist/Plus Jakarta Sans/Space Grotesk)
- Body: **Source Sans 3**
- Sans-only toàn bộ — không dùng serif để tránh rủi ro thiếu dấu tiếng Việt ở 1 số family serif ít phổ biến

### Signature components (mới, thêm vào `frontend/src/components/ui/`)

- `ChalkUnderline` — SVG gạch chân tay vẽ, dùng dưới mọi H1 trang (thay cho việc chỉ có eyebrow label như hiện tại)
- `RedCheckmark` — SVG dấu tích, dùng cho trạng thái hoàn thành/đạt/đúng
- `GradeStamp` — badge tròn kiểu con dấu, dùng cho điểm số nổi bật (StatTile, kết quả bài thi)

Cả 3 là component thuần hiển thị (props: value/label/className), không gọi API, không thay thế logic của component nghiệp vụ nào.

### Layout

**Trang public (landing, features, faq...)**: hero bất đối xứng — headline bên trái, "phiếu chấm bài" mock nghiêng nhẹ 3° bên phải (dùng `RedCheckmark` + `GradeStamp` thật, không phải ảnh tĩnh) bên phải.

**App shell (`AppLayout.tsx`)**: giữ nguyên cấu trúc nav/routing hiện có — chỉ đổi CSS của active-state (pill sáng generic → dấu vuông nhỏ kiểu bookmark bên trái mục đang chọn) và thêm `ChalkUnderline` dưới mọi `PageHeader`/H1.

**Bảng/danh sách**: `DataTable`, `Badge`, `Tabs`, `StatTile`, `Card` giữ nguyên props/API, chỉ đổi giá trị token màu/radius/font kế thừa từ `tokens.css` — không sửa logic component.

### Motion

Tối giản: hover 150–200ms, không thêm animation trang trí thừa. Ngoại lệ duy nhất: hiệu ứng "viết chalk" cho `ChalkUnderline` trên trang landing, chạy 1 lần lúc load, tôn trọng `prefers-reduced-motion` (tắt hẳn animation nếu user bật).

## Phạm vi & lộ trình triển khai (47 trang — chia 6 giai đoạn)

Không làm 1 lần cho cả 47 trang. Mỗi giai đoạn merge/verify riêng:

1. **Nền tảng**: `tokens.css` (màu/font/radius mới) + 3 signature component mới + sửa CSS active-state trong `AppLayout.tsx`
2. **Trang public** (~8 trang: landing, features, how-it-works, faq, login/register...)
3. **Component dùng chung** (`Card`/`DataTable`/`Tabs`/`StatTile`/`Badge` — đổi token, không đổi API) — tự động lan ra mọi trang gọi chúng
4. **Trang học sinh** (~15 trang)
5. **Trang giáo viên** (~15 trang, gồm `ContentHistoryPage.tsx`/`ProgressPage.tsx` vừa build ở tính năng lịch sử)
6. **Trang admin** (~16 trang)

## Ràng buộc bắt buộc (áp dụng mọi giai đoạn)

- **Không đổi logic/props/API của bất kỳ component hay hàm React nào** — chỉ đổi giá trị CSS/token/className và các file thuần trình bày (JSX cấu trúc section, không đổi state/effect/data-fetching)
- Không đổi test backend (không đụng logic backend)
- Sau mỗi giai đoạn: `npx tsc -b --noEmit` phải sạch trước khi merge
- Verify bằng browser thật ở 375px/768px/1440px + dark mode, không chỉ nhìn code

## Testing

- Không có test backend mới (không đổi logic backend)
- Không có Playwright e2e mới (đổi giao diện, không đổi hành vi/luồng thao tác)
- Mỗi giai đoạn: `tsc -b --noEmit` sạch + screenshot browser thật trước/sau + đo contrast WCAG AA cho các cặp màu mới + check responsive 3 breakpoint + dark mode

## Ngoài phạm vi (không làm trong lần này)

- Không đổi bất kỳ hành vi/logic/API nào (chỉ thuần thị giác)
- Không viết lại `AppLayout.tsx` cấu trúc nav — chỉ đổi CSS active-state
- Không động vào branch `codex/premium-magicschool-redesign` cũ (bỏ qua hoàn toàn, không merge/tham khảo code, chỉ tham khảo làm ví dụ "hướng đã bị từ chối")
- Không thêm animation ngoài phạm vi đã liệt kê ở mục Motion
