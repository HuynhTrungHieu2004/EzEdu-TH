# Chalkboard & Red Pen Redesign — Phase 1: Nền tảng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đặt nền tảng cho toàn bộ redesign "Bảng đen & Bút đỏ" — đổi token màu/chữ trong `tokens.css`, thêm 3 signature component, restyle active-state của sidebar nav. Giai đoạn này KHÔNG sửa từng trang (đó là Phase 2-6) — chỉ sửa lớp token dùng chung + component mới, để mọi trang đang gọi đúng token/component sẵn có tự động đổi màu theo.

**Architecture:** `tokens.css` có 3 tầng: PRIMITIVE (bảng màu thô) → SEMANTIC (vai trò, component chỉ được dùng tầng này) → ALIAS (tên biến cũ, tương thích ngược). Giai đoạn này: thêm 2 bảng màu PRIMITIVE mới (`forest` xanh bảng đen, `coral` đỏ bút), rồi trỏ lại các biến SEMANTIC (`--ez-primary`, `--ez-accent`, `--ez-bg`, `--ez-text`, `--ez-surface-muted`, gradient, ring) sang bảng mới. Component nào đã tuân thủ đúng nguyên tắc "chỉ dùng SEMANTIC" (khai báo ngay đầu file `tokens.css`) sẽ tự đổi màu mà không cần sửa code — đã xác nhận qua đọc `Headers.tsx`/`app-layout.css` là đúng vậy.

**Tech Stack:** React + TypeScript + Vite, CSS thuần (không Tailwind), Google Fonts (Lexend, Source Sans 3).

## Global Constraints

- KHÔNG đổi logic/props/API của bất kỳ component hay hàm React nào trong toàn bộ giai đoạn 1 — chỉ đổi CSS/token và thêm 3 component thuần hiển thị mới.
- KHÔNG đổi test backend (giai đoạn này không đụng backend).
- Sau mỗi task: `cd frontend && npx tsc -b --noEmit` phải sạch trước khi commit.
- Không dùng Tailwind — CSS thuần theo đúng convention hiện có của `tokens.css`/`ui.css`/`app-layout.css`.
- Font: Lexend (heading) + Source Sans 3 (body) — sans-only, không dùng serif (rủi ro thiếu dấu tiếng Việt ở font ít phổ biến).
- Màu neo chính xác theo spec đã duyệt: primary `#1D3B2C`, accent `#D64545`, background `#FAF9F6`, text `#23262B`, surface-muted `#EEF3EF`.
- Mọi cặp màu chữ/nền mới phải đạt WCAG AA (4.5:1 chữ thường, 3:1 chữ lớn/UI) — đo bằng công cụ thật, không đoán (xem Task 1 Step cuối).

---

### Task 1: Bảng màu mới trong `tokens.css`

**Files:**
- Modify: `frontend/src/styles/tokens.css`

**Interfaces:**
- Produces: primitive mới `--ez-forest-50` … `--ez-forest-800`, `--ez-coral-50` … `--ez-coral-800` — Task 3-5 (signature component) và mọi CSS sau này tham chiếu qua lớp SEMANTIC (`--ez-primary`, `--ez-accent`), không tham chiếu primitive trực tiếp.
- Produces: SEMANTIC đổi giá trị (không đổi tên biến) — mọi component hiện có (`Button`, `Badge`, `StatTile`, `AppLayout`...) tự động nhận màu mới, không cần sửa file của chúng trong task này.

- [ ] **Step 1: Thêm 2 bảng màu PRIMITIVE mới**

Trong `frontend/src/styles/tokens.css`, thêm ngay sau khối `--ez-amber-*` (trước dòng `/* Neutral —`, khoảng dòng 75):

```css
  /* Forest green — primary mới cho redesign "Bảng đen & Bút đỏ"
     (docs/superpowers/specs/2026-08-03-chalkboard-redesign-design.md).
     Neo đúng #1D3B2C. */
  --ez-forest-50:  #eef5f1;
  --ez-forest-100: #d6e5dc;
  --ez-forest-200: #afcabe;
  --ez-forest-300: #7da893;
  --ez-forest-400: #4c7d63;
  --ez-forest-500: #2e5a44;
  --ez-forest-600: #1d3b2c;
  --ez-forest-700: #12261c;
  --ez-forest-800: #0b1912;

  /* Coral red — accent "bút đỏ" mới. Neo đúng #D64545. Cố ý khác tông
     --ez-red-* (dùng cho error/destructive) để 2 vai trò không lẫn nhau
     dù cùng họ đỏ: coral ấm hơn, dùng làm điểm nhấn tích cực (dấu tick,
     điểm số), red giữ nguyên vai trò lỗi/xoá. */
  --ez-coral-50:  #fdebea;
  --ez-coral-100: #fbd2d0;
  --ez-coral-200: #f5a7a3;
  --ez-coral-300: #ec7b76;
  --ez-coral-400: #e15f58;
  --ez-coral-500: #d64545;
  --ez-coral-600: #b93636;
  --ez-coral-700: #962a2a;
  --ez-coral-800: #6e1f1f;
```

- [ ] **Step 2: Trỏ lại SEMANTIC — sáng (khối `:root` số 10, dòng ~310-395)**

Thay các dòng sau (giữ nguyên tên biến, chỉ đổi giá trị vế phải):

```css
  /* Primary — Forest green thay Indigo */
  --ez-primary:         var(--ez-forest-600);
  --ez-primary-hover:   var(--ez-forest-700);
  --ez-primary-active:  var(--ez-forest-800);
  --ez-primary-subtle:  var(--ez-forest-50);
  --ez-primary-border:  var(--ez-forest-200);
  --ez-primary-text:    var(--ez-forest-700);
```

```css
  /* Accent — Coral "bút đỏ" thay Amber. Amber vẫn giữ cho --ez-warning
     (vai trò cảnh báo, không liên quan tới màu nhấn thương hiệu). */
  --ez-accent:        var(--ez-coral-500);
  --ez-accent-hover:  var(--ez-coral-600);
  --ez-accent-subtle: var(--ez-coral-50);
  --ez-accent-border: var(--ez-coral-200);
  --ez-accent-text:   var(--ez-coral-700);
```

Thêm/sửa 3 dòng nền/chữ/card-phụ (đặt ngay sau khối `/* Nền: ... */`, trước `--ez-bg-inverse`):

```css
  --ez-bg:            #faf9f6; /* trắng phấn — thay neutral-50 */
```

Và trong khối `/* Chữ */`:

```css
  --ez-text:           #23262b; /* than ấm — thay neutral-900 */
```

Và trong khối `/* Surface */`, thêm dòng mới ngay sau `--ez-surface-muted:` gán đè:

```css
  --ez-surface-muted:    #eef3ef; /* sage nhạt — thay neutral-100 */
```

- [ ] **Step 3: Trỏ lại ring/focus và gradient (dòng ~217, ~224-225)**

Đổi:
```css
  --ez-ring-color: var(--ez-forest-500);
```
(thay `var(--ez-indigo-500)`)

Và:
```css
  --ez-gradient-hero: linear-gradient(135deg, var(--ez-coral-400) 0%, var(--ez-forest-500) 55%, var(--ez-forest-700) 100%);
  --ez-gradient-cta:  linear-gradient(120deg, var(--ez-forest-600) 0%, var(--ez-forest-700) 100%);
```

Và trong khối `--ez-border-focus` (SEMANTIC sáng, dòng ~336):
```css
  --ez-border-focus:  var(--ez-forest-500);
```

- [ ] **Step 4: Trỏ lại SEMANTIC — tối (khối `[data-theme='dark']` số 11, dòng ~401-484)**

Đổi các dòng primary/accent/border-focus tương ứng sang bậc sáng hơn của forest/coral (giữ nguyên công thức "bậc sáng hơn cho nền tối" đã áp dụng cho indigo/sky):

```css
  --ez-border-focus:  var(--ez-forest-300);

  --ez-primary:         var(--ez-forest-300);
  --ez-primary-hover:   var(--ez-forest-200);
  --ez-primary-active:  var(--ez-forest-100);
  --ez-primary-subtle:  rgba(125, 168, 147, 0.14);
  --ez-primary-border:  rgba(125, 168, 147, 0.34);
  --ez-primary-text:    var(--ez-forest-100);

  --ez-accent:        var(--ez-coral-300);
  --ez-accent-hover:  var(--ez-coral-200);
  --ez-accent-subtle: rgba(236, 123, 118, 0.14);
  --ez-accent-border: rgba(236, 123, 118, 0.32);
  --ez-accent-text:   var(--ez-coral-200);
```

Và trong khối dark, thêm dòng đè cho text (giữ nguyên `--ez-bg`/`--ez-surface` tối không đổi — redesign chỉ định nghĩa rõ ở chế độ sáng, chế độ tối giữ nguyên xám lạnh hiện có để không phải thiết kế lại toàn bộ dark mode ngoài phạm vi task này):

Không cần đổi `--ez-text`/`--ez-bg` ở khối dark — giữ nguyên giá trị hiện có.

Đổi luôn 2 dòng gradient dark-mode (dòng ~229-230):
```css
[data-theme='dark'] {
  --ez-gradient-hero: linear-gradient(135deg, var(--ez-coral-400) 0%, var(--ez-forest-400) 55%, var(--ez-forest-800) 100%);
  --ez-gradient-cta:  linear-gradient(120deg, var(--ez-forest-400) 0%, var(--ez-forest-600) 100%);
}
```

- [ ] **Step 5: Chạy typecheck (không có lỗi type liên quan CSS, nhưng chạy để chắc không có gì vỡ do thứ tự import)**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi

- [ ] **Step 6: Verify màu bằng browser thật + đo contrast**

Chạy dev server (`frontend`, có sẵn trong `.claude/launch.json`), mở bất kỳ trang nào đang dùng `Button`/`Badge` (ví dụ `/dashboard`), xác nhận:
- Nút primary chuyển sang xanh bảng đen `#1D3B2C`
- Nền trang chuyển sang trắng phấn `#faf9f6`
- Dùng DevTools (hoặc `javascript_tool` gọi `getComputedStyle`) đo contrast ratio thật của: (a) `--ez-text` (`#23262b`) trên `--ez-bg` (`#faf9f6`), (b) `--ez-text-on-brand` (trắng) trên `--ez-primary` (`#1d3b2c`), (c) `--ez-coral-700` (dùng làm `--ez-accent-text`) trên `--ez-bg`. Cả 3 phải ≥ 4.5:1. Nếu cặp nào không đạt, điều chỉnh bậc primitive tương ứng (ví dụ đổi `--ez-accent-text` sang `--ez-coral-800` nếu `700` chưa đủ) rồi đo lại — không merge khi chưa đạt.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles/tokens.css
git commit -m "feat: add forest/coral color primitives, repoint semantic tokens to Chalkboard & Red Pen palette"
```

---

### Task 2: Đổi font sang Lexend (heading) + Source Sans 3 (body)

**Files:**
- Modify: `frontend/src/index.css` (dòng 1 — Google Fonts import)
- Modify: `frontend/src/styles/tokens.css` (thêm `--ez-font-heading`, đổi `--ez-font-sans`)
- Modify: `frontend/src/styles/base.css` (thêm `font-family` cho `h1-h6`)

**Interfaces:**
- Produces: `--ez-font-heading` (mới), `--ez-font-sans` (đổi giá trị) — `base.css` Task này đọc cả 2.

- [ ] **Step 1: Đổi Google Fonts import**

`frontend/src/index.css` dòng 1, đổi:
```css
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap');
```

- [ ] **Step 2: Thêm/đổi biến font trong `tokens.css`**

Trong khối `/* 2. TYPOGRAPHY */` (dòng ~117-121), thay:
```css
  --ez-font-sans: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI',
                  Roboto, 'Helvetica Neue', Arial, sans-serif;
  --ez-font-heading: 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI',
                     Roboto, 'Helvetica Neue', Arial, sans-serif;
```

(giữ nguyên `--ez-font-mono` không đổi)

- [ ] **Step 3: Áp `--ez-font-heading` cho thẻ heading**

`frontend/src/styles/base.css` dòng 39-46, thêm 1 dòng vào khối `h1, h2, h3, h4, h5, h6`:

```css
h1, h2, h3, h4, h5, h6 {
  margin: 0;
  font-family: var(--ez-font-heading);
  color: var(--ez-text);
  font-weight: var(--ez-weight-bold);
  line-height: var(--ez-leading-heading);
  letter-spacing: var(--ez-tracking-snug);
  text-wrap: balance;
}
```

- [ ] **Step 4: Cập nhật alias `--sans` cũ trong `index.css` cho nhất quán (dòng 86)**

Đổi:
```css
  --sans: 'Source Sans 3', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

- [ ] **Step 5: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Mở browser, kiểm tra Network tab thấy font Lexend/Source Sans 3 tải về, heading (h1) đổi sang Lexend, body text đổi sang Source Sans 3 — kiểm bằng `getComputedStyle(document.querySelector('h1')).fontFamily`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/src/styles/tokens.css frontend/src/styles/base.css
git commit -m "feat: switch typography to Lexend (heading) + Source Sans 3 (body)"
```

---

### Task 3: Component `ChalkUnderline` + gắn vào `PageHeader`

**Files:**
- Create: `frontend/src/components/ui/ChalkUnderline.tsx`
- Modify: `frontend/src/components/ui/index.ts` (export)
- Modify: `frontend/src/components/ui/Headers.tsx` (gắn dưới `.ez-page-title`)
- Modify: `frontend/src/components/ui/ui.css` (style `.ez-chalk-underline`)

**Interfaces:**
- Produces: `ChalkUnderline` — `{ className?: string }`, component thuần SVG, không nhận data/logic gì khác. Task 6 (Phase 2 sau này) có thể dùng lại độc lập trên trang public.

- [ ] **Step 1: Tạo component**

Tạo `frontend/src/components/ui/ChalkUnderline.tsx`:

```tsx
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface ChalkUnderlineProps {
  className?: string;
}

/** Gạch chân tay vẽ kiểu phấn — đặt ngay dưới tiêu đề trang (H1). */
export function ChalkUnderline({ className }: ChalkUnderlineProps) {
  return (
    <svg
      className={cx('ez-chalk-underline', className)}
      viewBox="0 0 160 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 6.5 C 30 3, 60 8.5, 90 5 S 140 3, 158 6"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Style trong `ui.css`**

Thêm vào cuối `frontend/src/components/ui/ui.css`:

```css
/* ═══════════════════════════════════════════════════════════════════════
   ChalkUnderline — gạch chân tay vẽ dưới tiêu đề trang
   ═══════════════════════════════════════════════════════════════════════ */
.ez-chalk-underline {
  display: block;
  width: 96px;
  height: 8px;
  margin-top: var(--ez-space-2);
  stroke: var(--ez-accent);
  opacity: 0.85;
}

@media (prefers-reduced-motion: no-preference) {
  .ez-chalk-underline path {
    stroke-dasharray: 200;
    stroke-dashoffset: 200;
    animation: ez-chalk-draw 700ms var(--ez-ease-out) 150ms forwards;
  }

  @keyframes ez-chalk-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
}
```

(Khi `prefers-reduced-motion: reduce`, không có animation nào áp dụng — path hiển thị luôn ở trạng thái cuối vì không có `stroke-dashoffset` ban đầu ngoài khối `@media` trên.)

- [ ] **Step 3: Export**

`frontend/src/components/ui/index.ts` — thêm dòng (đặt cạnh nhóm "Hiển thị"):

```typescript
export { ChalkUnderline } from './ChalkUnderline';
export type { ChalkUnderlineProps } from './ChalkUnderline';
```

- [ ] **Step 4: Gắn vào `PageHeader`**

`frontend/src/components/ui/Headers.tsx` — thêm import:

```typescript
import { ChalkUnderline } from './ChalkUnderline';
```

Sửa khối render title (dòng 47-49), thêm `ChalkUnderline` ngay sau `TitleTag`:

```tsx
          {loading ? (
            <div className="ez-skeleton ez-skeleton-title" />
          ) : (
            <>
              <TitleTag className="ez-page-title">{title}</TitleTag>
              <ChalkUnderline />
            </>
          )}
```

- [ ] **Step 5: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Mở bất kỳ trang app nào dùng `PageHeader` (ví dụ `/teacher/content-history` vừa build ở tính năng lịch sử), xác nhận thấy gạch chân đỏ san hô dưới tiêu đề, có hiệu ứng "vẽ" chạy 1 lần lúc load. Bật `prefers-reduced-motion: reduce` (DevTools rendering emulation) và tải lại — xác nhận gạch chân hiện ngay, không có animation.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/ChalkUnderline.tsx frontend/src/components/ui/index.ts frontend/src/components/ui/Headers.tsx frontend/src/components/ui/ui.css
git commit -m "feat: add ChalkUnderline signature component, attach to PageHeader"
```

---

### Task 4: Component `RedCheckmark`

**Files:**
- Create: `frontend/src/components/ui/RedCheckmark.tsx`
- Modify: `frontend/src/components/ui/index.ts` (export)
- Modify: `frontend/src/components/ui/ui.css` (style `.ez-red-checkmark`)

**Interfaces:**
- Produces: `RedCheckmark` — `{ size?: number; className?: string }`. Dùng ở Phase 4/5 sau này cho trạng thái hoàn thành/đạt (ví dụ thay icon `Check` của lucide trong `ProgressPage.tsx`/`ContentHistoryPage.tsx` — KHÔNG đổi trong task này, chỉ tạo component, việc gắn vào từng trang là Phase 4/5).

- [ ] **Step 1: Tạo component**

Tạo `frontend/src/components/ui/RedCheckmark.tsx`:

```tsx
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface RedCheckmarkProps {
  size?: number;
  className?: string;
}

/** Dấu tích tay vẽ kiểu bút đỏ — dùng cho trạng thái đạt/hoàn thành/đúng. */
export function RedCheckmark({ size = 20, className }: RedCheckmarkProps) {
  return (
    <svg
      className={cx('ez-red-checkmark', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 13 L9.5 18 L20 6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Style trong `ui.css`**

Thêm vào cuối `frontend/src/components/ui/ui.css`:

```css
/* ═══════════════════════════════════════════════════════════════════════
   RedCheckmark — dấu tích bút đỏ tay vẽ
   ═══════════════════════════════════════════════════════════════════════ */
.ez-red-checkmark {
  stroke: var(--ez-accent);
  flex: none;
}
```

- [ ] **Step 3: Export**

`frontend/src/components/ui/index.ts` — thêm:

```typescript
export { RedCheckmark } from './RedCheckmark';
export type { RedCheckmarkProps } from './RedCheckmark';
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi (component chưa được dùng ở đâu trong task này nên không có gì để verify bằng mắt — xác nhận file build sạch là đủ cho task này).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/RedCheckmark.tsx frontend/src/components/ui/index.ts frontend/src/components/ui/ui.css
git commit -m "feat: add RedCheckmark signature component"
```

---

### Task 5: Component `GradeStamp`

**Files:**
- Create: `frontend/src/components/ui/GradeStamp.tsx`
- Modify: `frontend/src/components/ui/index.ts` (export)
- Modify: `frontend/src/components/ui/ui.css` (style `.ez-grade-stamp`)

**Interfaces:**
- Produces: `GradeStamp` — `{ value: string | number; label?: string; size?: 'sm' | 'md' | 'lg'; className?: string }`. Dùng ở Phase 4/5 để thay `StatTile` cho điểm số nổi bật (không đổi `StatTile` trong task này).

- [ ] **Step 1: Tạo component**

Tạo `frontend/src/components/ui/GradeStamp.tsx`:

```tsx
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface GradeStampProps {
  value: string | number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Badge tròn kiểu con dấu chấm điểm — dùng cho điểm số/kết quả nổi bật. */
export function GradeStamp({ value, label, size = 'md', className }: GradeStampProps) {
  return (
    <div className={cx('ez-grade-stamp', `ez-grade-stamp-${size}`, className)}>
      <span className="ez-grade-stamp-value">{value}</span>
      {label ? <span className="ez-grade-stamp-label">{label}</span> : null}
    </div>
  );
}
```

- [ ] **Step 2: Style trong `ui.css`**

Thêm vào cuối `frontend/src/components/ui/ui.css`:

```css
/* ═══════════════════════════════════════════════════════════════════════
   GradeStamp — badge tròn kiểu con dấu chấm điểm
   ═══════════════════════════════════════════════════════════════════════ */
.ez-grade-stamp {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--ez-radius-full);
  border: 2.5px solid var(--ez-accent);
  color: var(--ez-accent-text);
  transform: rotate(-6deg);
  font-family: var(--ez-font-heading);
  line-height: 1.1;
}

.ez-grade-stamp-sm {
  width: 48px;
  height: 48px;
}
.ez-grade-stamp-sm .ez-grade-stamp-value { font-size: var(--ez-text-body-sm); font-weight: var(--ez-weight-bold); }

.ez-grade-stamp-md {
  width: 64px;
  height: 64px;
}
.ez-grade-stamp-md .ez-grade-stamp-value { font-size: var(--ez-text-h4); font-weight: var(--ez-weight-bold); }

.ez-grade-stamp-lg {
  width: 88px;
  height: 88px;
}
.ez-grade-stamp-lg .ez-grade-stamp-value { font-size: var(--ez-text-h2); font-weight: var(--ez-weight-bold); }

.ez-grade-stamp-label {
  font-size: var(--ez-text-caption);
  font-weight: var(--ez-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--ez-tracking-caps);
}
```

- [ ] **Step 3: Export**

`frontend/src/components/ui/index.ts` — thêm:

```typescript
export { GradeStamp } from './GradeStamp';
export type { GradeStampProps } from './GradeStamp';
```

- [ ] **Step 4: Typecheck + verify browser tạm thời**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Không có trang nào gọi `GradeStamp` trong task này (việc gắn vào trang cụ thể là Phase 4/5) — để verify trực quan, tạm thời render thử `<GradeStamp value="8/10" label="Điểm" />` vào 1 trang bất kỳ qua browser console (`document.querySelector('#root')` không đủ, thay vào đó tạm sửa 1 dòng trong `ProgressPage.tsx` để render thử, xem kết quả, RỒI REVERT lại dòng sửa tạm đó trước khi commit — không được commit thay đổi thử nghiệm này vào `ProgressPage.tsx`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/GradeStamp.tsx frontend/src/components/ui/index.ts frontend/src/components/ui/ui.css
git commit -m "feat: add GradeStamp signature component"
```

---

### Task 6: Restyle active-state sidebar nav (bookmark tab)

**Files:**
- Modify: `frontend/src/components/app-layout.css`

**Interfaces:**
- Consumes: token mới từ Task 1 (`--ez-primary`, `--ez-accent`) — không cần Task 3/4/5.
- Không đổi JSX/props của `AppLayout.tsx` — component đã có sẵn `className={active ? 'ez-nav-item ez-nav-item-active' : 'ez-nav-item'}` (xác nhận tại `AppLayout.tsx:305`), task này chỉ sửa CSS của class đã tồn tại.

- [ ] **Step 1: Sửa `.ez-nav-item-active::before`**

`frontend/src/components/app-layout.css` — hiện tại (dòng 156-172):

```css
.ez-nav-item-active {
  background-color: var(--ez-primary-subtle);
  color: var(--ez-primary-text);
  font-weight: var(--ez-weight-semibold);
}

.ez-nav-item-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 var(--ez-radius-full) var(--ez-radius-full) 0;
  background-color: var(--ez-primary);
}

.ez-nav-item-active:hover {
  background-color: var(--ez-primary-subtle);
  color: var(--ez-primary-text);
}
```

Đổi khối `::before` thành hình "bookmark" (hình chữ nhật với 1 góc vát, mô phỏng dấu trang sách/vở):

```css
.ez-nav-item-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 24px;
  clip-path: polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%);
  background-color: var(--ez-accent);
}
```

(Đổi màu bar từ `--ez-primary` sang `--ez-accent` — dùng đúng vai trò "bút đỏ" đánh dấu đang chọn, tương phản rõ với nền `--ez-primary-subtle` xanh nhạt xung quanh.)

- [ ] **Step 2: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi (không đổi file `.tsx` nào ở task này nhưng vẫn chạy để chắc chắn).
Mở app, đăng nhập bất kỳ role nào, xác nhận mục nav đang active có dấu bookmark đỏ vát góc bên trái thay vì thanh thẳng, nền vẫn xanh nhạt như cũ.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/app-layout.css
git commit -m "feat: restyle active nav item as bookmark tab with coral accent"
```

---

## Sau khi hoàn thành Phase 1

Chạy lại toàn bộ để chắc chắn:

```bash
cd frontend && npx tsc -b --noEmit
```

Mở browser, lướt qua vài trang tiêu biểu (`/dashboard`, `/teacher/content-history`, `/learning-history`) xác nhận: màu nền/primary/accent đổi đúng, font Lexend/Source Sans 3 tải và áp dụng đúng, gạch chân chalk xuất hiện dưới mọi tiêu đề trang, nav active-state đổi kiểu bookmark. Chưa cần trang public/landing đẹp ngay (đó là Phase 2) — Phase 1 chỉ cần nền tảng token/component đúng và không có gì vỡ.

Sau khi xong, dùng `superpowers:writing-plans` viết plan cho Phase 2 (trang public) khi sẵn sàng — không viết trước trong file này.
