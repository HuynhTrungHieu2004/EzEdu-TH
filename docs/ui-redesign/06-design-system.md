# EzEdu AI — Design System (Giai đoạn 3)

- **Ngày:** 2026-07-28
- **Dựa trên:** [01-audit-report.md](01-audit-report.md) → [05-component-map.md](05-component-map.md)
- **Trạng thái:** Đã triển khai. Token và 21 component nền tảng đã có trong mã nguồn.

---

## 1. Hệ thống styling thực tế của project

Khảo sát trước khi quyết định (yêu cầu "xác định hệ thống styling thực tế", "không cài Tailwind nếu không cần thiết"):

| Hạng mục | Thực tế |
|---|---|
| CSS framework | **Không có.** CSS thuần, viết tay |
| Số dòng CSS | 5.850 dòng trong 10 file |
| Biến CSS | **Đã có** — bộ tên riêng (`--crystal-500`, `--ink`, `--accent`, `--glass-bg`…) |
| Dark mode | **Đã có** — `[data-theme="dark"]` trên `<html>`, quản lý bởi `contexts/ThemeContext.tsx` |
| Font | Inter, nạp từ Google Fonts trong `index.css` |
| Icon | `lucide-react` **đã có trong `package.json`** nhưng navigation lại dùng emoji |
| Reduced motion | Có ở 3 file, không đồng bộ |
| Phong cách cũ | "Crystal Luminous" — tím/hồng, glassmorphism (`rgba` + blur) |

### Quyết định

**Không cài Tailwind. Không thay UI library.** Dự án đã có cơ chế biến CSS và dark mode hoạt động tốt; vấn đề không phải thiếu công cụ mà là thiếu **tổ chức**: màu hex rải rác, tên biến không theo hệ thống, không có thang spacing/radius/z-index.

Giải pháp: thêm một **tầng token chuẩn** ở trên, và **ánh xạ tên biến cũ thành alias** trỏ về token mới.

```
styles/tokens.css   ← token mới (--ez-*) + alias tên cũ
styles/base.css     ← reset, typography semantic, focus, reduced motion
index.css           ← CSS cũ, chạy nguyên vẹn nhờ alias
components/ui/ui.css ← CSS của component nền tảng
```

Cách này cho phép đổi toàn bộ nhận diện của app **mà không phải sửa 5.850 dòng CSS cũ**, và cho phép rút alias dần theo từng trang được thiết kế lại. Không có "big bang".

### Điểm đã loại bỏ khỏi phong cách cũ

| Bỏ | Lý do |
|---|---|
| Glassmorphism (`--glass-bg: rgba(...)` + blur) | Surface trong suốt làm chữ giảm tương phản và là dấu hiệu "template AI" rõ nhất. Alias `--glass-bg` giờ trỏ về surface đục |
| Gradient text trên tiêu đề | Đã sửa 2 chỗ trong `index.css` (`.sidebar-brand-text h1`, `.eyebrow`) sang màu đặc. Gradient chữ là trang trí, không mang nghĩa |
| Bóng phát sáng (`--shadow-glow`) | Alias trỏ về `--ez-shadow-md`. Thẻ phân tách bằng nền + viền, không bằng hào quang |
| Emoji làm icon | Chuyển sang `lucide-react` |

---

## 2. Art direction

Ba hướng được cân nhắc trước khi chọn:

| Hướng | Mô tả | Vì sao không chọn / chọn |
|---|---|---|
| **A. Kế thừa tím "Crystal"** | Giữ tím/hồng + glassmorphism đang có | ❌ Tím-hồng gradient + kính mờ là tổ hợp phổ biến nhất của giao diện do AI sinh ra. Tương phản chữ kém trên surface trong suốt |
| **B. Học thuật trung tính** | Xám + một màu nhấn xanh, rất tiết chế | ❌ Sạch nhưng nhạt. Học sinh phổ thông là người dùng chính; giao diện quá khô sẽ không thân thiện |
| **C. Indigo + Teal + Amber** ✅ | Indigo làm màu chính (tin cậy, học thuật), teal cho kiểm chứng/đúng-sai, amber cho chú ý/thành tích. Surface đục, bóng tối giản, khoảng trắng rộng | ✅ Giữ được chiều sâu thị giác bằng **lớp nền** thay vì bằng bóng và gradient. Ba màu có vai trò nghiệp vụ rõ ràng, không phải trang trí |

**Nhận diện riêng, không trùng website tham khảo.** Trang tham khảo dùng đỏ `rgb(229,50,50)` trên nền `rgb(237,240,242)`. EzEdu AI dùng indigo `#3d52d5` trên nền `#f6f7fb`. Chỉ có **nguyên lý** được học: nền không trắng tinh, bóng gần như không dùng, section tách biệt, thang chữ nhảy bậc dứt khoát.

### Nguyên tắc tạo chiều sâu mà không gây rối

1. **Chiều sâu bằng lớp nền, không bằng bóng.** Nền app `#f6f7fb` → surface `#ffffff` → surface-muted `#eef0f6`. Ba bậc là đủ.
2. **Bóng chỉ cho lớp thực sự nổi lên**: dropdown, dialog, drawer, toast. Thẻ tĩnh dùng `--ez-shadow-xs` hoặc không bóng.
3. **Mỗi màu một nhiệm vụ.** Indigo = hành động chính. Teal = hành động phụ/kiểm chứng. Amber = chú ý. Đỏ/xanh/vàng/xanh dương = trạng thái. Không dùng màu để trang trí.

---

## 3. Color tokens

### 3.1 Bảng màu gốc

| Họ | Vai trò | Các bậc |
|---|---|---|
| Indigo | Primary | 50 → 950 (11 bậc) |
| Teal | Secondary | 50 → 900 |
| Amber | Accent | 50 → 800 |
| Neutral | Nền, chữ, viền | 0, 25, 50 → 950 |
| Green / Red / Blue | Success / Error / Info | 50, 100, 500 → 700 |

### 3.2 Token semantic

| Nhóm | Token | Sáng | Tối |
|---|---|---|---|
| **Background** | `--ez-bg` | `#f6f7fb` | `#10131f` |
| | `--ez-bg-subtle` | `#eef0f6` | `#1a1e2e` |
| **Surface** | `--ez-surface` | `#ffffff` | `#1a1e2e` |
| | `--ez-surface-subtle` | `#fbfcfe` | `#1f2436` |
| | `--ez-surface-muted` | `#eef0f6` | `#262c40` |
| | `--ez-surface-hover` | `#eef0f6` | `#262c40` |
| | `--ez-surface-active` | `#e2e5ef` | `#2f3648` |
| **Text** | `--ez-text` | `#1a1e2e` | `#eaecf4` |
| | `--ez-text-secondary` | `#545b73` | `#b0b6c8` |
| | `--ez-text-muted` | `#6f7791` | `#8b92a8` |
| | `--ez-text-on-brand` | `#ffffff` | `#ffffff` |
| | `--ez-text-link` | `#3d52d5` | `#94a4f6` |
| **Border** | `--ez-border` | `#e2e5ef` | `#313850` |
| | `--ez-border-subtle` | `#eef0f6` | `#262c40` |
| | `--ez-border-strong` | `#cbd0de` | `#414a66` |
| | `--ez-border-focus` | `#4d5fe0` | `#94a4f6` |
| **Primary** | `--ez-primary` | `#3d52d5` | `#6b7ded` |
| | `--ez-primary-hover` | `#3341ad` | `#94a4f6` |
| | `--ez-primary-active` | `#2b3688` | `#bcc7fb` |
| | `--ez-primary-subtle` | `#eef1fe` | `rgba(107,125,237,.14)` |
| **Secondary** | `--ez-secondary` | `#0e9f8e` | `#57c8bb` |
| **Accent** | `--ez-accent` | `#e8890c` | `#fabf57` |
| **Success** | `--ez-success` | `#0e7a49` | `#4ec98a` |
| **Warning** | `--ez-warning` | `#c26c06` | `#fabf57` |
| **Error** | `--ez-error` | `#b82323` | `#f2726f` |
| **Info** | `--ez-info` | `#185cad` | `#62a6ec` |

Mỗi màu trạng thái có ba biến thể: màu đặc (`--ez-error`), nền nhạt (`--ez-error-subtle`), viền (`--ez-error-border`), và màu chữ dùng trên nền nhạt (`--ez-error-text`). Điều này cần thiết vì màu đặc thường không đủ tương phản khi dùng làm chữ trên nền nhạt của chính nó.

### 3.3 Dark mode

Dự án đã hỗ trợ dark mode nên toàn bộ token đều có bản tối. Nguyên tắc: **không đảo màu**, mà chọn lại bậc. Ở nền tối, primary phải sáng lên (indigo-600 → indigo-400) để giữ tương phản; bóng phải đậm hơn mới thấy được.

---

## 4. Typography

| Vai trò | Token | Cỡ | Weight | Line-height |
|---|---|---|---|---|
| Display | `--ez-text-display` | 64px | 800 | 1.05 |
| H1 | `--ez-text-h1` | 40px | 700 | 1.2 |
| H2 | `--ez-text-h2` | 32px | 700 | 1.2 |
| H3 | `--ez-text-h3` | 24px | 700 | 1.2 |
| H4 | `--ez-text-h4` | 20px | 600 | 1.2 |
| H5 | `--ez-text-h5` | 18px | 600 | 1.2 |
| H6 | `--ez-text-h6` | 16px | 600 | 1.2 |
| Body | `--ez-text-body` | 16px | 400 | 1.65 |
| Body nhỏ | `--ez-text-body-sm` | 14px | 400 | 1.4 |
| Caption | `--ez-text-caption` | 13px | 400–600 | 1.4 |
| Button | `--ez-text-button` | 15px | 600 | 1 |

**Font family:** `--ez-font-sans` = Inter (đã nạp sẵn), `--ez-font-mono` cho mã.

Hai quyết định có lý do:

- **Line-height thân chữ 1.65** — cao hơn mức thường thấy (1.5). Tiếng Việt có dấu phụ ở cả trên và dưới; dòng quá sát làm dấu của dòng dưới chạm chữ dòng trên.
- **Letter-spacing âm cho chữ lớn** (`--ez-tracking-tight: -0.02em` cho display/H1/H2). Inter ở cỡ lớn bị rời chữ nếu để tracking mặc định.

Thang chữ nhảy bậc rõ (64 → 40 → 32 → 24 → 20 → 18 → 16) để cấp bậc thị giác không bị nhoè — đây là điều học được từ website tham khảo.

---

## 5. Spacing · Radius · Shadow · Z-index

### 5.1 Spacing — thang 4px

`0 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128`

Token `--ez-space-0` → `--ez-space-32`. Thêm `--ez-section-y: 96px` cho khoảng cách dọc giữa các section trang public (`--ez-section-y-sm: 64px` cho mobile).

### 5.2 Border radius

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--ez-radius-xs` | 4px | vòng focus, chi tiết nhỏ |
| `--ez-radius-sm` | 6px | mục dropdown, skeleton |
| `--ez-radius-md` | 10px | button, input, select |
| `--ez-radius-lg` | 14px | card, list item |
| `--ez-radius-xl` | 20px | card lớn, dialog, drawer |
| `--ez-radius-2xl` | 28px | khối section nổi |
| `--ez-radius-full` | 9999px | chip, badge, avatar |

### 5.3 Shadow — dùng rất tiết chế

| Token | Dùng cho |
|---|---|
| `--ez-shadow-xs` | card tĩnh |
| `--ez-shadow-sm` | card khi hover |
| `--ez-shadow-md` | phần tử nổi nhẹ |
| `--ez-shadow-lg` | dropdown, toast |
| `--ez-shadow-xl` | dialog, drawer |

Không có shadow "glow". Không dùng shadow màu.

### 5.4 Z-index — thang cố định

`base 0 · raised 10 · sticky 100 · sidebar 200 · overlay 300 · drawer 400 · dialog 500 · dropdown 600 · tooltip 700 · toast 800 · skip-link 900`

Không được viết số z-index tuỳ ý trong component. Skip link ở trên cùng để luôn tới được bằng bàn phím.

---

## 6. Breakpoints & container

| Mốc | Giá trị | Ý nghĩa |
|---|---|---|
| — | < 480px | điện thoại nhỏ; **360px là mức hẹp nhất phải hỗ trợ** |
| sm | ≥ 480px | điện thoại |
| md | ≥ 768px | tablet dọc |
| **lg** | ≥ 1024px | **mốc đổi sidebar ↔ bottom nav** |
| xl | ≥ 1280px | desktop |
| 2xl | ≥ 1536px | desktop rộng |

| Container | Giá trị | Dùng cho |
|---|---|---|
| `--ez-container-sm` | 640px | form, trang đăng nhập |
| `--ez-container-md` | 840px | nội dung đọc dài |
| `--ez-container-lg` | 1120px | trang app tiêu chuẩn |
| `--ez-container-xl` | 1280px | trang public |

Lớp `.ez-container` canh giữa và có padding ngang, tự giảm padding dưới 480px. Media query phải viết giá trị trực tiếp vì CSS không đọc được `var()` trong `@media` — biến `--ez-bp-*` chỉ để tra cứu.

**Chống cuộn ngang:** `body { overflow-x: hidden }` trong `base.css`, cộng với lớp `.ez-scroll-x` cho nội dung rộng (bảng, thanh tab) tự cuộn trong khối riêng.

---

## 7. Quy tắc icon

| Quy tắc | Thực hiện |
|---|---|
| Không dùng emoji thay icon | Toàn bộ emoji trong navigation được thay bằng `lucide-react` |
| Một thư viện icon duy nhất | `lucide-react` (đã có sẵn, không thêm dependency) |
| Icon trang trí phải bị ẩn với screen reader | `aria-hidden="true"` trên mọi icon đi kèm chữ |
| Icon-only button bắt buộc có `aria-label` **và** tooltip | **Cưỡng chế bằng TypeScript** (xem dưới) |

### Cưỡng chế `aria-label` ở tầng type

`Button` dùng union type: khi `iconOnly: true` thì `aria-label` là **bắt buộc**. Quên nó là **lỗi biên dịch**, không phải lỗi phát hiện lúc review:

```tsx
<Button iconOnly><X /></Button>
// TS2322: Property 'aria-label' is missing but required in type 'IconOnlyButtonProps'

<Button iconOnly aria-label="Đóng"><X /></Button>  // ✅
```

Component `Tooltip` phản ứng với cả `mouseenter/leave` và `focus/blur`, nên người dùng bàn phím cũng nhận được tooltip, không chỉ người dùng chuột.

---

## 8. Component states

21 component nền tảng tại `frontend/src/components/ui/`. Bảng trạng thái đầy đủ nằm ở [05-component-map.md §2](05-component-map.md).

| # | Component | File | Ghi chú |
|---|---|---|---|
| 1 | Button | `Button.tsx` | 6 biến thể × 3 cỡ; `type="button"` mặc định để không submit form ngoài ý muốn |
| 2 | Input | `Input.tsx` | hỗ trợ icon đầu/cuối, `aria-invalid` |
| 3 | Textarea | `Textarea.tsx` | |
| 4 | Select | `Select.tsx` | dùng `<select>` gốc để có sẵn bàn phím + bộ chọn mobile |
| 5 | Checkbox | `Choice.tsx` | |
| 6 | Radio | `Choice.tsx` | |
| 7 | RadioCard | `Choice.tsx` | lựa chọn dạng thẻ lớn |
| 8 | Dialog | `Dialog.tsx` | focus trap, Escape, khoá cuộn body, mobile thành bottom sheet |
| 9 | Drawer | `Drawer.tsx` | 3 hướng (left/right/bottom) |
| 10 | Dropdown | `Dropdown.tsx` | điều hướng bằng mũi tên, Home/End, click ngoài, trả focus về trigger |
| 11 | Tabs | `Tabs.tsx` | `role="tablist"`, mũi tên trái/phải, id sinh từ `useId` |
| 12 | Card | `Card.tsx` | 6 phần: Card/Header/Title/Description/Body/Footer |
| 13 | Badge | `Badge.tsx` | 7 biến thể + dạng số đếm |
| 14 | Alert | `ui.css` | 4 tone, dùng qua class (component hoá khi cần) |
| 15 | Toast | `Toast.tsx` | `ToastProvider` + `useToast`, tự đóng, `aria-live="polite"` |
| 16 | Skeleton | `Skeleton.tsx` | `aria-hidden` vì là trang trí |
| 17 | EmptyState | `States.tsx` | |
| 18 | ErrorState | `States.tsx` | `role="alert"`, có nút thử lại |
| 19 | PageHeader | `Headers.tsx` | eyebrow, back link, actions, skeleton |
| 20 | SectionHeader | `Headers.tsx` | |
| 21 | Thêm | `StatTile`, `ProgressBar`, `ProgressSteps`, `Chip`, `ChipGroup`, `FormField`, `Tooltip`, `Spinner`, `PermissionDeniedState`, `FeatureDisabledState` | |

Hai state ngoài yêu cầu nhưng cần thiết theo audit: `PermissionDeniedState` (cho trường hợp thiếu quyền chi tiết) và `FeatureDisabledState` (cho `enable_personalization = false`).

### Trạng thái tránh layout shift

`Button` khi loading giữ nguyên `children` và chỉ thay `leadingIcon` bằng spinner → chiều rộng không đổi. `StatTile` dùng `font-variant-numeric: tabular-nums` → số không nhảy khi cập nhật.

---

## 9. Motion

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--ez-duration-fast` | 150ms | hover, đổi màu, viền |
| `--ez-duration-base` | 200ms | mặc định |
| `--ez-duration-slow` | 300ms | dialog, drawer trượt |

Toàn bộ nằm trong khoảng 150–300ms theo yêu cầu. Easing: `--ez-ease-standard: cubic-bezier(0.2, 0, 0.2, 1)`.

**Reduced motion** được tôn trọng tuyệt đối trong `base.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`scroll-behavior: smooth` chỉ bật trong `@media (prefers-reduced-motion: no-preference)`, không bật mặc định rồi mới tắt.

Không có animation trang trí: không phần tử nào tự chuyển động khi người dùng không tương tác, trừ `Skeleton` (báo đang tải) và `Spinner` (báo đang xử lý) — cả hai đều mang thông tin.

---

## 10. Accessibility

| Yêu cầu | Thực hiện |
|---|---|
| **Contrast WCAG** | Chữ thường đạt ≥ 4.5:1, chữ lớn ≥ 3:1. `--ez-primary` `#3d52d5` cho tỉ lệ **6.18:1** với trắng, **5.83:1** với nền app — đủ AA cho cả chữ và nút. Mỗi màu trạng thái có bản `-text` riêng để không dùng màu đặc làm chữ trên nền nhạt |
| **Keyboard navigation** | Dialog/Drawer có focus trap; Dropdown và Tabs điều hướng bằng mũi tên + Home/End; Escape đóng mọi lớp nổi; focus trả về trigger khi đóng |
| **Focus visible** | `:focus-visible { outline: 2px solid var(--ez-ring-color); outline-offset: 2px }` toàn cục. Không có chỗ nào `outline: none` mà không thay thế |
| **Semantic HTML** | `base.css` định nghĩa `h1`–`h6` đúng cấp; `CardTitle`/`PageHeader`/state components đều nhận prop `as`/`titleAs` để trang tự chọn cấp heading đúng, tránh lỗi thứ bậc như website tham khảo (`h1` 20px nhưng tiêu đề thị giác là `h2` 72px) |
| **Touch target** | `--ez-touch-min: 44px`. Dưới 768px, `.ez-btn`, `.ez-chip`, `.ez-input`, `.ez-select`, `.ez-dropdown-item` đều nâng lên 44px |
| **Form label rõ ràng** | `FormField` render `<label htmlFor>` thật; `useFieldIds` sinh id nhất quán cho input/hint/error |
| **Error gần trường nhập** | `.ez-field-error` nằm **ngay sau** input trong DOM, có `role="alert"` và icon `AlertCircle` để không chỉ dựa vào màu. Khi có lỗi thì gợi ý bị ẩn để screen reader không đọc trùng |
| **Không chỉ dựa vào màu** | Trạng thái luôn có dấu hiệu thứ hai: icon (alert, step), gạch chân (link trong văn bản), thanh chỉ báo (nav active), `aria-current` |
| **Skip link** | `.ez-skip-link` là phần tử focus được đầu tiên, `z-index` cao nhất |
| **Input font 16px trên mobile** | Tránh iOS tự zoom khi focus vào trường |

### Chi tiết đáng lưu ý

- **`Select` dùng `<select>` gốc** thay vì tự dựng combobox. Đây là lựa chọn có chủ ý: bộ chọn gốc cho sẵn hành vi bàn phím đúng và bộ chọn dạng bánh xe trên iOS/Android, thứ mà một combobox tự viết rất khó làm đúng.
- **`Skeleton` mang `aria-hidden="true"`** vì nó là trang trí; thông báo "đang tải" thuộc về vùng live region hoặc `aria-busy` của phần tử thật.
- **`ProgressSteps`** thêm chữ trạng thái ẩn (`ez-sr-only`) cho từng bước — "chưa thực hiện / đang thực hiện / hoàn thành / lỗi" — vì marker chỉ là số hoặc icon.

---

## 11. Kiểm chứng

| Lệnh | Kết quả |
|---|---|
| `npx tsc -b --force` | ✅ 0 lỗi |
| `npx eslint src` | ✅ 0 lỗi |
| `npx vite build` | ✅ thành công |

Bundle sau build: JS 806.13 kB (gzip 205.20 kB), CSS 152.90 kB (gzip 28.17 kB). Cảnh báo chunk > 500 kB vẫn còn — đây là vấn đề đã ghi nhận từ audit (M5), sẽ xử lý bằng `React.lazy` ở giai đoạn cuối, không phải do design system.

### Lỗi đã sửa trong quá trình triển khai

| Lỗi | Xử lý |
|---|---|
| `useFieldIds` export cùng file component → vi phạm `react-refresh/only-export-components` | Tách sang `useFieldIds.ts` riêng |
| `Button` không mặc định `type` → nút trong `<form>` sẽ submit ngoài ý muốn | Mặc định `type="button"` |
| Gradient text ở `.sidebar-brand-text h1` và `.eyebrow` | Chuyển sang màu đặc |
| Ký tự sai trong token `--ez-indigo-900` | Sửa thành `#232b6b` |

---

## 12. Cách dùng

```tsx
import { Button, Card, CardBody, PageHeader, EmptyState } from '../components/ui';
```

Barrel `components/ui/index.ts` là **điểm nhập duy nhất** và cũng là nơi nạp `ui.css` — component riêng lẻ không tự import CSS để tránh nạp trùng.

### Ba quy tắc bắt buộc

1. **Không viết mã màu trực tiếp trong component.** Luôn dùng token `--ez-*`.
2. **Không viết số z-index tuỳ ý.** Dùng thang `--ez-z-*`.
3. **Không dùng emoji làm icon.** Dùng `lucide-react`.

### Công cụ đã dùng

| Công cụ | Dùng vào việc gì |
|---|---|
| Playwright | Đo hệ thống thị giác của website tham khảo ở 3 kích thước; kiểm chứng route theo từng vai trò |
| Hook thiết kế Impeccable | Quét tự động khi ghi file; phát hiện 2 chỗ gradient text trong CSS cũ — đã sửa |
| Cân nhắc art direction | Ba hướng ở §2, chọn hướng C kèm lý do. Không dùng quy trình chọn 3 bản nháp có tương tác vì yêu cầu là thực thi tự chủ, không dừng chờ xác nhận |

---

## 13. Việc còn lại

| Hạng mục | Trạng thái |
|---|---|
| Token + base + 21 component nền tảng | ✅ Xong |
| Rút alias tên biến cũ | Theo từng trang được thiết kế lại |
| `Alert` thành component TSX | Hiện dùng qua class; component hoá khi có trang cần |
| Code-splitting bằng `React.lazy` | Giai đoạn cuối |
| Áp dụng vào từng trang | Giai đoạn 4 (trang chủ) và 5 (khu vực đã đăng nhập) |
