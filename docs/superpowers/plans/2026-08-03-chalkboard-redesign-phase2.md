# Chalkboard & Red Pen Redesign — Phase 2: Trang public Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Áp dụng nền tảng token/component từ Phase 1 lên toàn bộ 8 trang public (landing, features, how-it-works, faq, login, register, maintenance, not-found) — xoá sạch màu tím/hồng cũ còn hardcode trong `index.css`/`PublicLayout.css`, và dựng hero bất đối xứng mới với mock "phiếu chấm bài" theo đúng spec.

**Architecture:** Điều tra xác nhận `components/public/public-page.css` (dùng bởi `LandingPage`/`PublicInfoPages`) đã 100% dùng token SEMANTIC (0 hex cứng, 269 lượt `var(--ez-*)`) — không cần sửa màu ở file đó, trừ 1 dòng lẻ (`.ezp-section-dark .ezp-eyebrow`) còn trỏ về token cũ của Cycle 1 (indigo). Toàn bộ phần "chưa lên token" nằm ở 2 file legacy: `index.css` (nền `body` toàn site + trang `/login`, `/register`) và `PublicLayout.css` (mini header/footer bọc `/login`, `/register`, `/maintenance`) — cả 2 chưa từng được Phase 1 đụng tới vì Phase 1 chỉ sửa `tokens.css`/`base.css`/component mới. Việc còn lại là hero mới: thay `CharacterIllustration` trong `Hero` (file `LandingSections.tsx`) bằng 1 component trình bày thuần mới (`GradedPaperMockup`) ghép từ `RedCheckmark` + `GradeStamp` đã có sẵn từ Phase 1.

**Tech Stack:** React + TypeScript + Vite, CSS thuần (không Tailwind).

## Global Constraints

- KHÔNG đổi logic/props/API của bất kỳ component hay hàm React nào — chỉ đổi CSS/token, xoá CSS chết đã xác nhận không còn `.tsx` nào tham chiếu, và thêm 1 component trình bày thuần mới (`GradedPaperMockup` — không gọi API, không nhận logic nghiệp vụ).
- KHÔNG đổi test backend (giai đoạn này không đụng backend).
- Sau mỗi task: `cd frontend && npx tsc -b --noEmit` phải sạch trước khi commit.
- Không dùng Tailwind — CSS thuần theo đúng convention hiện có.
- Mọi màu mới phải lấy từ token SEMANTIC (`--ez-*`) đã có trong `tokens.css` — không thêm giá trị hex mới, không dùng lại primitive `--ez-indigo-*`/`--ez-sky-*`/`--ez-amber-*` (di sản Cycle 1) hay hex tím/hồng cũ (`#8b7cf8`, `#c084fc`, `#f74a8a`, `#6c3fd1`, v.v. — di sản trước cả Cycle 1).
- Motion: tối giản, không thêm animation trang trí lặp vô hạn. Animation lặp vô hạn thuần trang trí đã có trong code cũ (`crystalPulse`, `crystalFloat`, blob nền của `PublicLayout`) bị xoá/ tĩnh hoá trong giai đoạn này, không phải giữ lại — đây là dọn nợ kỹ thuật đi kèm đúng khu vực đang sửa, không phải phạm vi mới. Animation chạy 1 lần lúc load (như hiệu ứng "vẽ" của `ChalkUnderline`, hoặc `pub-sticker-enter`) được giữ nguyên.
- Trước khi xoá bất kỳ class CSS nào vì lý do "không còn dùng", PHẢI tự grep xác nhận lại trong task đó (không tin vào kết quả grep đã ghi trong plan — code có thể đã đổi từ lúc viết plan tới lúc thực thi).

---

### Task 1: Dọn màu tím/hồng cũ + CSS chết trong `index.css` (nền toàn site + trang auth)

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Không sản sinh interface mới — chỉ đổi giá trị CSS của class/keyframe đã tồn tại, và xoá hẳn các class/keyframe đã xác nhận chết (không `.tsx` nào tham chiếu).

- [ ] **Step 1: Xác nhận lại CSS chết trước khi xoá (bắt buộc — xem Global Constraints)**

Chạy:
```bash
cd frontend/src
grep -rn "hero-home\|hero-content\b\|hero-mark\b\|hero-title\b\|hero-copy\b\|hero-status\b\|hero-actions\b\|hero-visual\b\|hero-chip\b" --include="*.tsx" .
```
Expected: không có kết quả nào (0 dòng). Nếu có kết quả xuất hiện (nghĩa là code đã đổi từ lúc viết plan), DỪNG lại — không xoá phần đó, báo cáo lại cho người dùng thay vì tự quyết định.

- [ ] **Step 2: Đổi `--body-gradient` (sáng) — dòng ~100**

Thay:
```css
  --body-gradient: linear-gradient(180deg, #f8f7ff 0%, #ede9fe 30%, #f0f9ff 60%, #fdf2f8 100%);
```
thành:
```css
  --body-gradient: linear-gradient(180deg, #faf9f6 0%, #f3f7f4 45%, #fdf1ef 100%);
```

- [ ] **Step 3: Đổi `--body-gradient` (tối) — dòng ~187**

Thay:
```css
  --body-gradient:      linear-gradient(180deg, #0f0e1a 0%, #14122a 30%, #0e1a26 60%, #1a0e1a 100%);
```
thành:
```css
  --body-gradient:      linear-gradient(180deg, #1a1e2e 0%, #16211c 50%, #1f1618 100%);
```

- [ ] **Step 4: Đổi nền `body` + chấm lấp lánh — dòng ~207-233**

Thay toàn bộ khối:
```css
body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(ellipse 80% 60% at 10% 20%, rgba(139, 124, 248, 0.12), transparent),
    radial-gradient(ellipse 60% 50% at 90% 80%, rgba(247, 74, 138, 0.08), transparent),
    radial-gradient(ellipse 70% 40% at 50% 10%, rgba(14, 165, 233, 0.07), transparent),
    radial-gradient(ellipse 50% 60% at 80% 30%, rgba(251, 191, 36, 0.05), transparent),
    var(--body-gradient);
}

/* Crystal sparkle grid */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background-image:
    radial-gradient(circle 1.5px at center, rgba(139, 124, 248, 0.18) 0%, transparent 100%);
  background-size: 40px 40px;
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.02));
  animation: sparkleShift 20s ease-in-out infinite;
  opacity: var(--sparkle-opacity);
}
```
thành:
```css
body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(ellipse 80% 60% at 10% 20%, rgba(29, 59, 44, 0.08), transparent),
    radial-gradient(ellipse 60% 50% at 90% 80%, rgba(214, 69, 69, 0.06), transparent),
    var(--body-gradient);
}

/* Chấm lấp lánh tĩnh — bỏ animation lặp vô hạn theo nguyên tắc motion tối giản */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background-image:
    radial-gradient(circle 1.5px at center, rgba(29, 59, 44, 0.14) 0%, transparent 100%);
  background-size: 40px 40px;
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.02));
  opacity: var(--sparkle-opacity);
}
```
(giữ nguyên khối `body::after` — chỉ là lớp phủ trắng trung tính, không liên quan màu thương hiệu, không đổi)

- [ ] **Step 5: Xoá khối CSS chết "HERO / WELCOME"**

Xoá toàn bộ khối từ comment `HERO / WELCOME` tới hết `.hero-chip span` (khoảng dòng 676-815 — dùng Step 1 để xác nhận lại phạm vi chính xác trước khi xoá):

```css
/* ═══════════════════════════════════════════════════════════════
   HERO / WELCOME
   ═══════════════════════════════════════════════════════════════ */

.hero-home {
  width: min(100%, 1100px);
  margin: 0 auto;
  min-height: calc(100svh - 40px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 1fr);
  align-items: center;
  gap: clamp(28px, 5vw, 50px);
  padding: clamp(30px, 5vw, 50px) clamp(18px, 4vw, 30px);
  text-align: left;
}

.hero-content { display: grid; gap: 20px; }

.hero-mark, .auth-mark {
  display: inline-grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #8b7cf8, #c084fc, #f74a8a);
  box-shadow: 0 12px 30px rgba(139,124,248,0.25), 0 0 0 3px rgba(255,255,255,0.5);
  font-weight: 900;
  animation: crystalPulse 4s ease-in-out infinite;
}

.hero-mark {
  width: 56px;
  height: 56px;
  border-radius: var(--ez-radius-md);
  font-size: 20px;
}

.hero-title {
  max-width: 680px;
  margin: 0;
  color: var(--text-h);
  font-size: clamp(38px, 5.5vw, 64px);
  font-weight: 900;
  line-height: 1.0;
  letter-spacing: -0.03em;
}

.hero-copy {
  max-width: 600px;
  color: var(--text);
  font-size: clamp(15px, 1.8vw, 17px);
  line-height: 1.75;
}

.hero-status {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border: 1px solid rgba(139,124,248,0.15);
  border-radius: var(--ez-radius-full);
  background: var(--glass-white);
  backdrop-filter: blur(12px);
  box-shadow: var(--hero-status-shadow, var(--shadow-soft));
  color: var(--text-h);
  font-size: 13px;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-visual {
  position: relative;
  min-height: clamp(340px, 40vw, 500px);
  border-radius: var(--radius-xl);
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(255,255,255,0.7), rgba(255,255,255,0.2)),
    linear-gradient(135deg, rgba(139,124,248,0.15), rgba(247,74,138,0.12), rgba(14,165,233,0.10));
  border: 1px solid rgba(255,255,255,0.8);
  box-shadow: var(--shadow), 0 0 40px rgba(139,124,248,0.08);
  animation: crystalFloat 6s ease-in-out infinite;
}

.hero-visual::before {
  content: '';
  position: absolute;
  inset: 16px;
  border-radius: var(--ez-radius-xl);
  border: 1px solid rgba(255,255,255,0.7);
  pointer-events: none;
  z-index: 2;
}

.hero-visual img {
  width: 100%;
  height: 100%;
  min-height: inherit;
  object-fit: cover;
  display: block;
}

.hero-visual-caption {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 20px;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.hero-chip {
  padding: 12px;
  border-radius: var(--ez-radius-lg);
  background: var(--glass-white-ultra);
  border: 1px solid var(--border-strong);
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 20px rgba(139,124,248,0.08);
}

.hero-chip strong {
  display: block;
  color: var(--text-h);
  font-size: 16px;
  line-height: 1.1;
}

.hero-chip span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}
```

Xoá hoàn toàn, không thay thế — `.auth-mark` sẽ có rule riêng, đầy đủ, hợp nhất ở Step 6 bên dưới (trong khối AUTH PAGES, không nằm trong khối chết này nữa).

- [ ] **Step 6: Hợp nhất + fix toàn bộ khối AUTH PAGES**

Khối `AUTH PAGES` (khoảng dòng 1230-1338, số dòng sẽ dịch xuống sau Step 5) hiện là:

```css
.auth-page {
  width: 100%;
  min-width: 0;
  flex: 1;
  display: grid;
  place-items: center;
  padding: clamp(24px, 5vw, 50px);
  background: var(--ez-gradient-hero);
  background-size: 200% 200%;
}

.auth-card {
  width: min(100%, 440px);
  margin-inline: auto;
  padding: clamp(28px, 5vw, 40px);
  border-radius: var(--radius-xl);
  background: var(--glass-white-ultra);
  backdrop-filter: blur(24px) saturate(1.3);
  box-shadow: var(--shadow), 0 0 40px rgba(139,124,248,0.06);
}

.auth-header {
  text-align: center;
  margin-bottom: 28px;
}

.auth-mark {
  width: 54px;
  height: 54px;
  margin: 0 auto 16px;
  border-radius: var(--ez-radius-md);
  font-size: 18px;
}

.auth-title {
  margin: 0 0 6px;
  color: var(--text-h);
  font-size: 24px;
  font-weight: 800;
}

.auth-subtitle {
  color: var(--muted);
  font-size: 14px;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  color: var(--text-h);
  font-size: 13px;
  font-weight: 700;
}

.form-input, .form-select {
  width: 100%;
  min-height: 48px;
  border: 1px solid rgba(139,124,248,0.14);
  border-radius: var(--ez-radius-lg);
  background: var(--input-bg);
  color: var(--text-h);
  padding: 12px 16px;
  backdrop-filter: blur(8px);
  transition: all 0.25s ease;
}

.form-input:focus, .form-select:focus {
  border-color: var(--crystal-400);
  background: var(--input-bg-focus);
  box-shadow: var(--ring), 0 0 20px rgba(139,124,248,0.06);
}

.auth-footer {
  margin-top: 22px;
  text-align: center;
  color: var(--text);
  font-size: 14px;
}

.auth-card .alert { margin-bottom: 18px; }

.text-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--crystal-600);
  font-weight: 700;
  cursor: pointer;
  transition: color 0.2s;
}

.text-link:hover { color: var(--crystal-700); }
```

Thay bằng (giữ nguyên `.auth-page`/`.auth-header`/`.auth-title`/`.auth-subtitle`/`.form-stack`/`.form-group`/`.form-label`/`.auth-footer`/`.auth-card .alert` — không đổi vì đã dùng token hoặc màu trung tính đúng vai trò; chỉ đổi `.auth-card`, `.auth-mark` (mới, hợp nhất từ khối đã xoá), `.form-input`/`.form-select`, `.form-input:focus`/`.form-select:focus`, `.text-link`, `.text-link:hover`):

```css
.auth-page {
  width: 100%;
  min-width: 0;
  flex: 1;
  display: grid;
  place-items: center;
  padding: clamp(24px, 5vw, 50px);
  background: var(--ez-gradient-hero);
  background-size: 200% 200%;
}

.auth-card {
  width: min(100%, 440px);
  margin-inline: auto;
  padding: clamp(28px, 5vw, 40px);
  border-radius: var(--radius-xl);
  background: var(--glass-white-ultra);
  backdrop-filter: blur(24px) saturate(1.3);
  box-shadow: var(--shadow);
}

.auth-header {
  text-align: center;
  margin-bottom: 28px;
}

.auth-mark {
  display: inline-grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin: 0 auto 16px;
  border-radius: var(--ez-radius-md);
  background: var(--ez-gradient-cta);
  color: #fff;
  font-weight: 900;
  font-size: 18px;
}

.auth-title {
  margin: 0 0 6px;
  color: var(--text-h);
  font-size: 24px;
  font-weight: 800;
}

.auth-subtitle {
  color: var(--muted);
  font-size: 14px;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  color: var(--text-h);
  font-size: 13px;
  font-weight: 700;
}

.form-input, .form-select {
  width: 100%;
  min-height: 48px;
  border: 1px solid var(--ez-border);
  border-radius: var(--ez-radius-lg);
  background: var(--input-bg);
  color: var(--text-h);
  padding: 12px 16px;
  backdrop-filter: blur(8px);
  transition: all 0.25s ease;
}

.form-input:focus, .form-select:focus {
  border-color: var(--ez-border-focus);
  background: var(--input-bg-focus);
  box-shadow: var(--ring);
}

.auth-footer {
  margin-top: 22px;
  text-align: center;
  color: var(--text);
  font-size: 14px;
}

.auth-card .alert { margin-bottom: 18px; }

.text-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--ez-text-link);
  font-weight: 700;
  cursor: pointer;
  transition: color 0.2s;
}

.text-link:hover { color: var(--ez-primary-hover); }
```

- [ ] **Step 7: Xoá keyframe `crystalPulse`/`crystalFloat` đã hết người dùng**

Xác nhận lại (sau Step 5-6, cả 2 khối dùng chúng đã bị xoá):
```bash
grep -n "crystalPulse\|crystalFloat" frontend/src/index.css
```
Expected: chỉ còn đúng 2 dòng `@keyframes crystalPulse { ... }` và `@keyframes crystalFloat { ... }` (không còn dòng `animation:` nào gọi tới chúng). Xoá cả 2 khối `@keyframes` đó (khoảng dòng 1887-1895 trước Step 5, số dòng sẽ dịch sau khi xoá khối Step 5):

```css
@keyframes crystalPulse {
  0%, 100% { box-shadow: 0 6px 20px rgba(139,124,248,0.25), 0 0 0 2px rgba(255,255,255,0.5); }
  50% { box-shadow: 0 8px 28px rgba(139,124,248,0.35), 0 0 0 3px rgba(255,255,255,0.6), 0 0 16px rgba(192,132,252,0.15); }
}

@keyframes crystalFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
```

Nếu grep cho ra kết quả khác (còn dòng `animation:` nào đó gọi 1 trong 2 keyframe), DỪNG — không xoá, báo lại cho người dùng.

- [ ] **Step 8: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi (task này không đổi `.tsx` nào, chạy để chắc chắn không có gì vỡ do thứ tự file).

- [ ] **Step 9: Verify browser**

Mở `/login` và `/register` bằng dev server, xác nhận: nền trang không còn quầng tím/hồng/xanh dương/vàng cũ, mà là quầng xanh bảng đen + đỏ san hô rất nhạt; ô "Ez" (`.auth-mark`) chuyển sang gradient xanh bảng đen (`--ez-gradient-cta`), không còn nhấp nháy; click vào ô input xác nhận viền focus chuyển xanh bảng đen (không còn viền tím); hover link "Đăng nhập"/"Đăng ký" xác nhận đổi màu xanh bảng đen đậm hơn (không còn tím).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/index.css
git commit -m "fix: replace legacy purple background/auth-mark gradient with Chalkboard tokens, remove dead hero CSS"
```

---

### Task 2: Recolor `PublicLayout.css` (mini header/footer bọc `/login`, `/register`, `/maintenance`)

**Files:**
- Modify: `frontend/src/components/PublicLayout.css`

**Interfaces:**
- Không đổi `PublicLayout.tsx` — chỉ đổi giá trị CSS của class đã tồn tại.

- [ ] **Step 1: Đổi font-family gốc**

Thay:
```css
.pub-layout {
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: transparent;
  font-family: 'Inter', system-ui, sans-serif;
}
```
thành:
```css
.pub-layout {
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: transparent;
  font-family: var(--ez-font-sans);
}
```

- [ ] **Step 2: Recolor header + logo + nav**

Thay:
```css
.pub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 60px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(139, 124, 248, 0.10);
  position: sticky;
  top: 0;
  z-index: 100;
}
```
thành:
```css
.pub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 60px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--ez-border);
  position: sticky;
  top: 0;
  z-index: 100;
}
```

Thay:
```css
.pub-logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--ez-radius-md);
  background: linear-gradient(135deg, #8b7cf8 0%, #6c3fd1 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.5px;
  flex-shrink: 0;
}

.pub-logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #1e1b4b;
  letter-spacing: -0.3px;
}
```
thành:
```css
.pub-logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--ez-radius-md);
  background: var(--ez-gradient-cta);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.5px;
  flex-shrink: 0;
}

.pub-logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--ez-text);
  letter-spacing: -0.3px;
}
```

Thay:
```css
.pub-nav-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #4c4878;
  padding: 6px 14px;
  border-radius: var(--ez-radius-md);
  transition: background 0.15s, color 0.15s;
}

.pub-nav-link:hover {
  background: rgba(139, 124, 248, 0.08);
  color: #6c3fd1;
}

.pub-nav-cta {
  background: linear-gradient(135deg, #8b7cf8 0%, #6c3fd1 100%);
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  padding: 8px 18px;
  border-radius: var(--ez-radius-full);
  transition: opacity 0.15s, transform 0.15s;
}
```
thành:
```css
.pub-nav-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--ez-text-secondary);
  padding: 6px 14px;
  border-radius: var(--ez-radius-md);
  transition: background 0.15s, color 0.15s;
}

.pub-nav-link:hover {
  background: var(--ez-primary-subtle);
  color: var(--ez-primary-hover);
}

.pub-nav-cta {
  background: var(--ez-gradient-cta);
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  padding: 8px 18px;
  border-radius: var(--ez-radius-full);
  transition: opacity 0.15s, transform 0.15s;
}
```

- [ ] **Step 3: Recolor blob nền + bỏ animation lặp vô hạn**

Thay:
```css
.pub-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
  animation: pub-blob-float 16s ease-in-out infinite;
}

.pub-blob-1 {
  width: 420px;
  height: 380px;
  top: -100px;
  left: -140px;
  background: radial-gradient(circle, rgba(139, 124, 248, 0.30) 0%, transparent 70%);
  animation-delay: 0s;
}

.pub-blob-2 {
  width: 380px;
  height: 340px;
  bottom: -120px;
  right: -110px;
  background: radial-gradient(circle, rgba(247, 74, 138, 0.22) 0%, transparent 70%);
  animation-delay: 2.5s;
}

.pub-blob-3 {
  width: 300px;
  height: 280px;
  top: 40%;
  right: 8%;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.20) 0%, transparent 70%);
  animation-delay: 5s;
}

@keyframes pub-blob-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(18px, -14px) scale(1.05); }
  66% { transform: translate(-12px, 10px) scale(0.96); }
}
```
thành (recolor sang forest/coral, bỏ animation lặp vô hạn theo nguyên tắc motion tối giản — blob giữ nguyên vị trí/kích thước, chỉ còn tĩnh):
```css
.pub-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}

.pub-blob-1 {
  width: 420px;
  height: 380px;
  top: -100px;
  left: -140px;
  background: radial-gradient(circle, rgba(29, 59, 44, 0.22) 0%, transparent 70%);
}

.pub-blob-2 {
  width: 380px;
  height: 340px;
  bottom: -120px;
  right: -110px;
  background: radial-gradient(circle, rgba(214, 69, 69, 0.16) 0%, transparent 70%);
}

.pub-blob-3 {
  width: 300px;
  height: 280px;
  top: 40%;
  right: 8%;
  background: radial-gradient(circle, rgba(29, 59, 44, 0.14) 0%, transparent 70%);
}
```

(Xoá cả `@keyframes pub-blob-float` — không còn `animation:` nào gọi tới.)

Sau khi xoá, khối `@media (prefers-reduced-motion: reduce) { .pub-blob, .pub-sticker { animation: none; opacity: 1; transform: none; } }` (khoảng dòng 266-273) vẫn giữ nguyên — vô hại vì `.pub-sticker` vẫn còn animation riêng (`pub-sticker-enter`/`pub-sticker-float`, không đổi trong task này vì các class `.pub-sticker*` không được `PublicLayout.tsx` render — xác nhận qua đọc file, chỉ 3 `.pub-blob-N` được render — để nguyên CSS chết này, không nằm trong phạm vi "màu tím/hồng cũ" của task).

- [ ] **Step 4: Recolor footer**

Thay:
```css
.pub-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid rgba(139, 124, 248, 0.10);
  background: rgba(255, 255, 255, 0.70);
}

.pub-footer-copy {
  font-size: 12px;
  color: #8985a8;
  margin: 0;
}

.pub-footer-home {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: #8b7cf8;
  font-weight: 500;
  transition: color 0.15s;
  padding: 0;
}

.pub-footer-home:hover {
  color: #6c3fd1;
}
```
thành:
```css
.pub-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--ez-border);
  background: rgba(255, 255, 255, 0.70);
}

.pub-footer-copy {
  font-size: 12px;
  color: var(--ez-text-secondary);
  margin: 0;
}

.pub-footer-home {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--ez-text-link);
  font-weight: 500;
  transition: color 0.15s;
  padding: 0;
}

.pub-footer-home:hover {
  color: var(--ez-primary-hover);
}
```

- [ ] **Step 5: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Mở `/login`, `/register`, `/maintenance`, xác nhận: mini header/footer không còn màu tím (logo mark, nav CTA, hover link đều chuyển xanh bảng đen/gradient mới), 3 blob nền chuyển xanh bảng đen + đỏ san hô nhạt và đứng yên (không còn di chuyển).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PublicLayout.css
git commit -m "fix: recolor PublicLayout header/nav/footer/blobs to Chalkboard tokens, remove decorative blob-float loop"
```

---

### Task 3: Fix token cũ còn sót trong `public-page.css` (eyebrow trên nền tối)

**Files:**
- Modify: `frontend/src/components/public/public-page.css`

**Interfaces:**
- Không đổi gì khác — 1 dòng CSS duy nhất.

- [ ] **Step 1: Đổi `.ezp-section-dark .ezp-eyebrow`**

Dòng ~93, thay:
```css
.ezp-section-dark .ezp-eyebrow { color: var(--ez-indigo-300); }
```
thành:
```css
.ezp-section-dark .ezp-eyebrow { color: var(--ez-coral-300); }
```

(`--ez-indigo-300` là token màu của Cycle 1 — palette indigo/teal/amber cũ, đã bị thay bởi forest/coral ở Phase 1 nhưng dòng lẻ này bị bỏ sót vì nó tham chiếu thẳng primitive thay vì SEMANTIC. `--ez-coral-300` giữ đúng vai trò "điểm nhấn" của eyebrow, cùng họ màu với `--ez-accent`, khác với `.ezp-lede`/`.ezp-title` trên nền tối đang dùng `--ez-neutral-0`/`--ez-neutral-300` trung tính.)

- [ ] **Step 2: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Mở `/` (trang chủ), cuộn xuống section CTA cuối trang (nền tối, class `ezp-section-dark`), xác nhận chữ eyebrow phía trên tiêu đề CTA chuyển sang tông đỏ san hô nhạt thay vì tím nhạt cũ.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/public/public-page.css
git commit -m "fix: replace leftover Cycle-1 indigo token in dark CTA section eyebrow with coral"
```

---

### Task 4: Hero mới — mock "phiếu chấm bài" (`GradedPaperMockup`)

**Files:**
- Create: `frontend/src/components/public/GradedPaperMockup.tsx`
- Modify: `frontend/src/components/public/LandingSections.tsx` (dòng 1-95 — hàm `Hero`)
- Modify: `frontend/src/components/public/public-page.css` (thêm style `.ez-paper-mock*`)

**Interfaces:**
- Consumes: `RedCheckmark` (`frontend/src/components/ui/RedCheckmark.tsx`, props `{ size?: number; className?: string }`) và `GradeStamp` (`frontend/src/components/ui/GradeStamp.tsx`, props `{ value: string | number; label?: string; size?: 'sm' | 'md' | 'lg'; className?: string }`) — cả 2 đã có sẵn từ Phase 1, import qua `../ui`.
- Produces: `GradedPaperMockup` — component thuần hiển thị, không props, không gọi API. Chỉ dùng trong `Hero`, không export ra `components/ui/index.ts` (không phải signature component dùng lại toàn site như `ChalkUnderline`/`RedCheckmark`/`GradeStamp` — đây là bố cục ghép riêng cho hero, đặt trong `components/public/`).

- [ ] **Step 1: Tạo component**

Tạo `frontend/src/components/public/GradedPaperMockup.tsx`:

```tsx
import { RedCheckmark, GradeStamp } from '../ui';

const PAPER_ROWS = [
  'Câu 1. Parabol có bề lõm quay lên khi nào?',
  'Câu 2. Tính toạ độ đỉnh của (P): y = x² − 4x + 3',
  'Câu 3. Trục đối xứng của (P) là đường thẳng nào?',
  'Câu 4. Giá trị nhỏ nhất của hàm số trên là bao nhiêu?',
];

/**
 * Mock "phiếu chấm bài" cho hero trang chủ — minh hoạ trực tiếp trải nghiệm
 * chấm điểm bằng AI, dùng RedCheckmark + GradeStamp thật (không phải ảnh
 * tĩnh), nghiêng nhẹ 3° theo đúng spec redesign.
 */
export default function GradedPaperMockup() {
  return (
    <div className="ez-paper-mock" aria-hidden="true">
      <GradeStamp value="9/10" label="Điểm" size="lg" className="ez-paper-mock-stamp" />
      <p className="ez-paper-mock-title">Đề số 04 · Toán 10 · Hàm số bậc hai</p>
      <ul className="ez-paper-mock-rows">
        {PAPER_ROWS.map((row) => (
          <li key={row} className="ez-paper-mock-row">
            <RedCheckmark size={16} />
            <span>{row}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

(`aria-hidden="true"` vì đây thuần là minh hoạ trang trí cho hero, giống cách `SparkleStar`/`CharacterIllustration` đang được ẩn khỏi trình đọc màn hình trong cùng file `LandingSections.tsx` — nội dung thật của trang nằm ở cột chữ bên trái, không nằm trong mock này.)

- [ ] **Step 2: Style trong `public-page.css`**

Thêm ngay sau rule `.ezp-hero-character` (dòng ~247, trước dòng `@media (max-width: 640px) { .ezp-hero-sparkle { display: none; } }`):

```css
.ez-paper-mock {
  position: relative;
  width: 100%;
  max-width: 320px;
  padding: var(--ez-space-6);
  border-radius: var(--ez-radius-xl);
  background-color: var(--ez-surface);
  border: 1px solid var(--ez-border);
  box-shadow: var(--ez-shadow-xl);
  transform: rotate(3deg);
}

.ez-paper-mock-stamp {
  position: absolute;
  top: calc(-1 * var(--ez-space-5));
  right: calc(-1 * var(--ez-space-4));
}

.ez-paper-mock-title {
  margin: 0 0 var(--ez-space-4);
  padding-right: var(--ez-space-12);
  font-family: var(--ez-font-heading);
  font-size: var(--ez-text-caption);
  font-weight: var(--ez-weight-bold);
  color: var(--ez-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--ez-tracking-caps);
}

.ez-paper-mock-rows {
  display: grid;
  gap: var(--ez-space-3);
  list-style: none;
  margin: 0;
  padding: 0;
}

.ez-paper-mock-row {
  display: flex;
  align-items: flex-start;
  gap: var(--ez-space-2);
  padding-bottom: var(--ez-space-3);
  border-bottom: 1px dashed var(--ez-border);
  font-size: var(--ez-text-body-sm);
  color: var(--ez-text);
  line-height: var(--ez-leading-body);
}

.ez-paper-mock-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.ez-paper-mock-row svg {
  flex: none;
  margin-top: 2px;
}

@media (max-width: 640px) {
  .ez-paper-mock { transform: none; }
}
```

- [ ] **Step 3: Gắn vào `Hero`**

`frontend/src/components/public/LandingSections.tsx` — thêm import (đặt cạnh import `CharacterIllustration` dòng 26):

```typescript
import GradedPaperMockup from './GradedPaperMockup';
```

Sửa dòng 89-91 (giữ nguyên `CharacterIllustration` — vẫn dùng ở dòng 164/211 cho section khác, không xoá import):

```tsx
        <div className="ezp-hero-art-wrap">
          <CharacterIllustration variant="hero" className="ezp-hero-character" />
        </div>
```
thành:
```tsx
        <div className="ezp-hero-art-wrap">
          <GradedPaperMockup />
        </div>
```

- [ ] **Step 4: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Mở `/` ở 3 breakpoint (375px, 768px, 1440px) và dark mode: xác nhận hero hiển thị mock phiếu chấm bài nghiêng nhẹ bên phải (nghiêng thẳng ở mobile ≤640px), con dấu "9/10" đỏ ở góc trên phải, 4 dòng câu hỏi có dấu tích đỏ bên trái, không còn nhân vật minh hoạ cũ (`CharacterIllustration`) ở vị trí này.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/public/GradedPaperMockup.tsx frontend/src/components/public/LandingSections.tsx frontend/src/components/public/public-page.css
git commit -m "feat: replace hero character illustration with graded-paper mockup using RedCheckmark + GradeStamp"
```

---

### Task 5: `ChalkUnderline` cho 3 trang thông tin public (Features/How-it-works/FAQ)

**Files:**
- Modify: `frontend/src/pages/PublicInfoPages.tsx`

**Interfaces:**
- Consumes: `ChalkUnderline` (`frontend/src/components/ui/ChalkUnderline.tsx`, props `{ className?: string }`) — đã có sẵn từ Phase 1, import qua `../components/ui`.

- [ ] **Step 1: Thêm import**

`frontend/src/pages/PublicInfoPages.tsx` — thêm dòng import (đặt cạnh các import khác ở đầu file):

```typescript
import { ChalkUnderline } from '../components/ui';
```

- [ ] **Step 2: Gắn vào H1 của `PublicInfoShell`**

Sửa khối render tiêu đề (dòng 74-82):

```tsx
        <section className="ezp-container ezp-hero" style={{ paddingBottom: 'var(--ez-space-4)' }}>
          <div className="ezp-head">
            <span className="ezp-eyebrow">{eyebrow}</span>
            <h1 className="ezp-title" style={{ fontSize: 'var(--ez-text-h1)' }}>
              {title}
            </h1>
            <p className="ezp-lede">{description}</p>
          </div>
        </section>
```
thành:
```tsx
        <section className="ezp-container ezp-hero" style={{ paddingBottom: 'var(--ez-space-4)' }}>
          <div className="ezp-head">
            <span className="ezp-eyebrow">{eyebrow}</span>
            <h1 className="ezp-title" style={{ fontSize: 'var(--ez-text-h1)' }}>
              {title}
            </h1>
            <ChalkUnderline />
            <p className="ezp-lede">{description}</p>
          </div>
        </section>
```

(`.ezp-head` đã là `display: flex; flex-direction: column;` — xác nhận trong `public-page.css` dòng 57-61 — nên `ChalkUnderline` tự xếp thành 1 dòng riêng ngay dưới H1 mà không cần CSS mới, giống cách nó đã hoạt động trong `PageHeader` ở Phase 1.)

- [ ] **Step 3: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Mở `/features`, `/how-it-works`, `/faq`, xác nhận cả 3 trang đều có gạch chân đỏ san hô kiểu phấn ngay dưới tiêu đề H1, chạy hiệu ứng "vẽ" 1 lần lúc load.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PublicInfoPages.tsx
git commit -m "feat: add ChalkUnderline under H1 on Features/How-it-works/FAQ pages"
```

---

### Task 6: Verify toàn bộ 8 trang public

**Files:** Không sửa file nào — task thuần verify.

- [ ] **Step 1: Typecheck toàn bộ**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 2: Đo contrast WCAG AA cho cặp màu mới**

Dùng `javascript_tool`/DevTools đo contrast ratio thật (không đoán) cho:
- `--ez-coral-300` (`.ezp-section-dark .ezp-eyebrow`, Task 3) trên nền tối của `.ezp-section-dark` — phải ≥ 3:1 (chữ nhỏ/eyebrow tính theo ngưỡng UI component, không phải body text).
- `--ez-text-secondary` (`.ez-paper-mock-title`, Task 4) trên `--ez-surface` (nền mock) — phải ≥ 4.5:1.
- `--ez-text` (`.ez-paper-mock-row`, Task 4) trên `--ez-surface` — phải ≥ 4.5:1.

Nếu cặp nào không đạt, đổi sang bậc primitive đậm/nhạt hơn trong cùng họ token (ví dụ `--ez-coral-300` → `--ez-coral-200` nếu quá tối trên nền tối, hoặc ngược lại) rồi đo lại — không kết thúc task khi chưa đạt.

- [ ] **Step 3: Verify browser thật ở 3 breakpoint + dark mode, cả 8 route**

Lần lượt mở và chụp màn hình: `/`, `/features`, `/how-it-works`, `/faq`, `/login`, `/register`, `/maintenance`, và 1 route bất kỳ không tồn tại để xem `NotFoundPage` (bọc bởi `PublicLayout` — route `*`) — ở 375px, 768px, 1440px, cả light và dark mode. Xác nhận trên toàn bộ 8 trang:
- Không còn màu tím/hồng/xanh dương/vàng cũ (`#8b7cf8`, `#c084fc`, `#f74a8a`, `#6c3fd1`, `#1e1b4b`, `#4c4878`, `#8985a8`, hay các rgba tương ứng) ở bất kỳ đâu — nền, header, footer, mock hero, eyebrow.
- Hero trang chủ hiển thị đúng mock phiếu chấm bài mới, nghiêng 3°, không vỡ layout ở mobile.
- 3 trang thông tin có `ChalkUnderline` dưới H1.
- Không còn animation lặp vô hạn thuần trang trí nào chạy (blob nền `/login`/`/register`/`/maintenance` đứng yên, chấm lấp lánh nền `body` đứng yên) — animation 1 lần lúc load (`ChalkUnderline` vẽ, `pub-sticker-enter` nếu có phần tử nào render nó) vẫn được phép chạy.

- [ ] **Step 4: Grep xác nhận không còn sót hex/rgba cũ trong phạm vi đã sửa**

```bash
cd frontend/src
grep -n "8b7cf8\|c084fc\|f74a8a\|6c3fd1\|1e1b4b\|4c4878\|8985a8" index.css components/PublicLayout.css components/public/public-page.css
```
Expected: không có kết quả nào (0 dòng) trong 3 file này. Nếu còn dòng nào, quay lại task tương ứng để sửa nốt trước khi coi Phase 2 hoàn tất.

Không cần commit ở task này (không sửa file).

---

## Sau khi hoàn thành Phase 2

Chạy lại toàn bộ:

```bash
cd frontend && npx tsc -b --noEmit
```

Lướt qua cả 8 trang public 1 lượt cuối bằng browser thật, xác nhận đồng bộ với 6 trang app-shell đã xong ở Phase 1 (cùng font Lexend/Source Sans 3, cùng tông xanh bảng đen/đỏ san hô) — không còn "2 tông màu" lẫn lộn giữa phần public và phần đã đăng nhập.

Sau khi xong, dùng `superpowers:writing-plans` viết plan cho Phase 3 (component dùng chung: `Card`/`DataTable`/`Tabs`/`StatTile`/`Badge`) khi sẵn sàng — không viết trước trong file này.
