# Chalkboard & Red Pen Redesign — Phase 7: Dọn nốt màu tím cũ còn sót Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa các chỗ màu tím/indigo cũ phát hiện được qua test chức năng thật (đăng ký, đăng nhập, dùng thử cả 3 vai trò) sau khi 6 phase redesign trước đã merge — những chỗ này lọt lưới vì nằm ở class/dòng chưa từng được audit (không phải do search theo danh sách hex cũ đã biết).

**Điều tra bổ sung quan trọng:** Trước khi lên task, đã xác nhận lại bằng grep thật trên `.tsx` — rất nhiều class nghi ngờ ban đầu hoá ra là **CSS chết, không component nào gọi tới**: `.sidebar`, `.sidebar-brand`, `.sidebar-brand-icon`, `.sidebar-brand-text`, `.sidebar-divider`, `.sidebar-label`, `.nav-item`, `.nav-item-active`, `.nav-item-primary`, `.nav-item-danger`, `.nav-icon`, `.feature-tile`, `.dashboard-card` — toàn bộ hệ thống sidebar/nav-item kiểu cũ này đã bị thay thế hoàn toàn bởi `.ez-nav-item`/`.ez-nav-icon` trong `app-layout.css` (Phase 1), nhưng CSS cũ chưa bao giờ bị xoá. **Không sửa các class chết này trong phase này** — sửa màu trên CSS không ai nhìn thấy là lãng phí, không có giá trị.

Cũng xác nhận: phần lớn ~70 chỗ `rgba(139,124,248,*)` tìm thấy bằng grep thô nằm trong khối định nghĩa biến gốc `:root`/`[data-theme="dark"]` ở đầu `index.css` (dòng 8-197, hệ "Crystal Luminous" cũ) — nhưng khối alias trong `tokens.css` (import SAU `index.css`, cùng độ đặc hiệu selector) đè lên hầu hết các biến này (`--border`, `--shadow*`, `--accent*`, `--surface`, `--ring`...) nên chúng **đã tự động đúng màu forest/coral, không cần sửa gì thêm** — xác nhận bằng cách so dòng import (`main.tsx`) và đọc trực tiếp `tokens.css:524-599`.

Việc thật còn lại, đã xác nhận **đang thực sự hiển thị sai màu** bằng test trực tiếp trên trình duyệt:
1. Khung tải học liệu lên (`FileUpload.tsx`, dùng ở trang Học liệu và mọi nơi khác gọi component này) — `.upload-panel`/`.upload-dropzone`/`.upload-icon` trong `index.css`.
2. Trang thiết lập học sinh (`StudentOnboardingPage.tsx`) — `.student-onboarding-section`/`.student-choice`/`.student-combination-choice` trong `index.css`.
3. Banner chào mừng dashboard (`.ez-dashboard-banner`, dùng chung học sinh + giáo viên) — override riêng cho dark mode trong `app-layout.css`, sót lại từ trước khi đổi màu ở Phase 1.
4. Nút "Ẩn/hiện lời giải" trong `QuestionCard.tsx` (dùng ở trang luyện tập và trình soạn câu hỏi).

## Global Constraints

- KHÔNG đổi logic/props/API/JSX của bất kỳ component nào — chỉ đổi giá trị màu.
- KHÔNG sửa các class đã xác nhận chết (`.sidebar*`, `.nav-item*`, `.nav-icon`, `.feature-tile`, `.dashboard-card`) — để nguyên, không xoá cũng không sửa màu.
- Sau mỗi task: `cd frontend && npx tsc -b --noEmit` phải sạch trước khi commit.
- Mọi màu mới phải là token SEMANTIC (`--ez-*`) đã tồn tại trong `tokens.css`, TRỪ trường hợp `.student-onboarding-*`/`.student-choice*` — khối này dùng nền kính trắng cố định (`rgba(255,255,255,*)`, không đổi theo dark mode, giống `.auth-card`), nên các màu nhấn bên trong nó phải dùng rgb literal khớp đúng forest/coral (không dùng `var(--ez-*)` vì các token đó đổi giá trị theo dark mode trong khi nền thẻ này thì không — dùng token sẽ ra sai màu ở dark mode).

---

### Task 1: Sửa `.upload-panel`/`.upload-dropzone`/`.upload-icon` + token `--input-bg`/`--input-bg-focus` (dark) + xoá `@keyframes crystalPulse`

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Không đổi tên class — `components/FileUpload.tsx` (không sửa trong task này) tiếp tục gọi đúng các class này, tự động nhận màu mới.

- [ ] **Step 1: Sửa token gốc `--input-bg`/`--input-bg-focus` (khối `[data-theme="dark"]`, dòng ~192-193)**

Thay:
```css
  --input-bg:           rgba(30, 27, 75, 0.60);
  --input-bg-focus:     rgba(40, 36, 90, 0.90);
```
thành:
```css
  --input-bg:           rgba(26, 30, 46, 0.60);
  --input-bg-focus:     rgba(38, 44, 64, 0.90);
```
(`26, 30, 46` = rgb của `--ez-neutral-900`, `38, 44, 64` = rgb của `--ez-neutral-800` — cùng công thức "đổi rgb giữ nguyên opacity" đã dùng ở Phase 2 cho `--glass-white`.)

- [ ] **Step 2: Sửa `.upload-panel` (dòng ~1633-1643)**

Thay:
```css
.upload-panel {
  margin-bottom: 24px;
  padding: 22px;
  border: 1px solid rgba(139,124,248,0.10);
  border-radius: var(--radius-xl);
  background:
    linear-gradient(140deg, rgba(255,255,255,0.8), rgba(255,255,255,0.5)),
    linear-gradient(135deg, rgba(139,124,248,0.06), rgba(247,74,138,0.04));
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
}
```
thành:
```css
.upload-panel {
  margin-bottom: 24px;
  padding: 22px;
  border: 1px solid var(--ez-border);
  border-radius: var(--radius-xl);
  background:
    linear-gradient(140deg, rgba(255,255,255,0.8), rgba(255,255,255,0.5)),
    linear-gradient(135deg, rgba(29,59,44,0.06), rgba(214,69,69,0.04));
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 3: Sửa `.upload-dropzone` + hover (dòng ~1645-1663)**

Thay:
```css
.upload-dropzone {
  position: relative;
  min-height: 190px;
  display: grid;
  place-items: center;
  padding: 28px 20px;
  border: 2px dashed rgba(139,124,248,0.3);
  border-radius: var(--radius-xl);
  background: var(--input-bg);
  cursor: pointer;
  transition: all 0.3s ease;
}

.upload-dropzone:hover {
  border-color: var(--crystal-400);
  background: rgba(139,124,248,0.04);
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(139,124,248,0.08);
}
```
thành:
```css
.upload-dropzone {
  position: relative;
  min-height: 190px;
  display: grid;
  place-items: center;
  padding: 28px 20px;
  border: 2px dashed var(--ez-border-strong);
  border-radius: var(--radius-xl);
  background: var(--input-bg);
  cursor: pointer;
  transition: all 0.3s ease;
}

.upload-dropzone:hover {
  border-color: var(--ez-border-focus);
  background: var(--ez-primary-subtle);
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(29,59,44,0.08);
}
```

- [ ] **Step 4: Sửa `.upload-icon` — recolor + bỏ animation (dòng ~1682-1694)**

Thay:
```css
.upload-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: var(--ez-radius-md);
  color: #fff;
  background: linear-gradient(135deg, #8b7cf8, #c084fc);
  box-shadow: 0 10px 28px rgba(139,124,248,0.3);
  font-size: 0;
  animation: crystalPulse 4s ease-in-out infinite;
}
```
thành:
```css
.upload-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: var(--ez-radius-md);
  color: #fff;
  background: var(--ez-gradient-cta);
  box-shadow: 0 10px 28px rgba(29,59,44,0.3);
  font-size: 0;
}
```
(Bỏ `animation: crystalPulse` — hiệu ứng nhấp nháy trang trí thuần, không mang ý nghĩa chức năng, đúng loại đã bị bỏ ở mọi nơi khác trong redesign này theo nguyên tắc "motion tối giản".)

- [ ] **Step 5: Xác nhận `crystalPulse` hết người dùng rồi xoá keyframe**

Chạy:
```bash
grep -n "crystalPulse" frontend/src/index.css
```
Expected: chỉ còn đúng 1 dòng `@keyframes crystalPulse { ... }` (không còn dòng `animation:` nào gọi tới — `.sidebar-brand-icon` dùng chung keyframe này đã xác nhận là CSS chết, không tính).

Nếu đúng như vậy, xoá khối (dòng ~1748-1751):
```css
@keyframes crystalPulse {
  0%, 100% { box-shadow: 0 6px 20px rgba(139,124,248,0.25), 0 0 0 2px rgba(255,255,255,0.5); }
  50% { box-shadow: 0 8px 28px rgba(139,124,248,0.35), 0 0 0 3px rgba(255,255,255,0.6), 0 0 16px rgba(192,132,252,0.15); }
}
```

Nếu grep ra kết quả khác (còn dòng `animation:` nào đó), DỪNG — không xoá, báo lại.

- [ ] **Step 6: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Đăng nhập vai trò giáo viên, mở `/documents`, xác nhận: khung kéo-thả không còn viền/nền tím, icon tải lên chuyển gradient xanh bảng đen, không còn nhấp nháy. Kiểm tra cả light và dark mode.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/index.css
git commit -m "fix: recolor upload panel/dropzone/icon to Chalkboard tokens, remove decorative crystalPulse animation"
```

---

### Task 2: Sửa `.student-onboarding-section`/`.student-choice`/`.student-combination-choice`

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Không đổi tên class — `StudentOnboardingPage.tsx` (không sửa trong task này) tiếp tục gọi đúng các class này.

- [ ] **Step 1: Sửa viền `.student-onboarding-section` (dòng ~1269-1276)**

Thay:
```css
.student-onboarding-section {
  min-width: 0;
  margin: 0 0 24px;
  padding: 22px;
  border: 1px solid rgba(139, 124, 248, 0.12);
  border-radius: var(--ez-radius-xl);
  background: rgba(255, 255, 255, 0.72);
}
```
thành:
```css
.student-onboarding-section {
  min-width: 0;
  margin: 0 0 24px;
  padding: 22px;
  border: 1px solid var(--ez-border);
  border-radius: var(--ez-radius-xl);
  background: rgba(255, 255, 255, 0.72);
}
```
(Giữ nguyên `background: rgba(255, 255, 255, 0.72)` — thẻ kính trắng cố định giống `.auth-card`, không đổi theo dark mode, cố ý.)

- [ ] **Step 2: Sửa `.student-choice`/`.student-combination-choice` + hover + input accent (dòng ~1320-1361)**

Thay:
```css
.student-choice,
.student-combination-choice {
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid rgba(139, 124, 248, 0.14);
  border-radius: var(--ez-radius-lg);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-h);
  font-weight: 750;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.student-combination-choice {
  align-items: flex-start;
}

.student-choice:hover,
.student-combination-choice:hover {
  transform: translateY(-1px);
  border-color: rgba(79, 70, 229, 0.34);
  box-shadow: 0 12px 28px rgba(79, 70, 229, 0.08);
}

.student-choice input,
.student-combination-choice input {
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  accent-color: #4f46e5;
  flex: 0 0 auto;
}

.student-choice-active {
  border-color: rgba(79, 70, 229, 0.45);
  background: linear-gradient(135deg, rgba(240, 238, 255, 0.96), rgba(240, 249, 255, 0.88));
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.08);
}
```
thành:
```css
.student-choice,
.student-combination-choice {
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--ez-border);
  border-radius: var(--ez-radius-lg);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-h);
  font-weight: 750;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.student-combination-choice {
  align-items: flex-start;
}

.student-choice:hover,
.student-combination-choice:hover {
  transform: translateY(-1px);
  border-color: rgba(29, 59, 44, 0.34);
  box-shadow: 0 12px 28px rgba(29, 59, 44, 0.08);
}

.student-choice input,
.student-combination-choice input {
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  accent-color: #1d3b2c;
  flex: 0 0 auto;
}

.student-choice-active {
  border-color: rgba(29, 59, 44, 0.45);
  background: linear-gradient(135deg, rgba(238, 245, 241, 0.96), rgba(253, 235, 234, 0.88));
  box-shadow: 0 0 0 3px rgba(29, 59, 44, 0.08);
}
```
(`rgba(255,255,255,0.72)` giữ nguyên — cùng lý do Step 1. `#1d3b2c` = forest-600 (giá trị `--ez-primary` chế độ sáng). Gradient active dùng `238,245,241` = forest-50 và `253,235,234` = coral-50, thay cho cặp tím/xanh dương nhạt cũ.)

- [ ] **Step 3: Typecheck + verify browser**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
Đăng ký tài khoản học sinh mới (hoặc dùng tài khoản test có sẵn), mở `/student-onboarding`. Xác nhận: viền các ô chọn lớp/môn không còn tím, hover chuyển viền xanh bảng đen nhạt, tick chọn (radio/checkbox) hiện màu xanh bảng đen thay vì tím, ô đang chọn có nền gradient xanh nhạt/đỏ nhạt thay vì tím/xanh dương nhạt.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "fix: replace old indigo accent colors in StudentOnboardingPage's choice/section styles with forest/coral"
```

---

### Task 3: Xoá override `[data-theme='dark'] .ez-dashboard-banner` lỗi thời trong `app-layout.css`

**Files:**
- Modify: `frontend/src/components/app-layout.css`

**Interfaces:**
- Không đổi cấu trúc/props component nào — `.ez-dashboard-banner` (dùng ở dashboard học sinh và giáo viên) tiếp tục nhận màu từ rule gốc `background: var(--ez-gradient-cta);` đã có sẵn (dòng 382), không cần rule mới.

- [ ] **Step 1: Xoá khối override dark mode (dòng ~388-393)**

Thay:
```css
/* Chế độ tối: --ez-gradient-cta mặc định (indigo-500 -> indigo-700) chỉ đạt
   3.02:1 với chữ gần đen ở điểm dừng indigo-700 — không đủ AA 4.5:1 cho chữ
   thường. Ghi đè riêng bằng indigo-400 -> indigo-500: 5.42:1 -> 4.67:1, luôn
   trên ngưỡng AA trong toàn dải gradient. */
[data-theme='dark'] .ez-dashboard-banner {
  background: linear-gradient(120deg, var(--ez-indigo-400) 0%, var(--ez-indigo-500) 100%);
}
```
thành (xoá hẳn, không thay thế):
```css
```

(Lý do xoá thay vì đổi màu: `--ez-gradient-cta` ở `tokens.css` đã có sẵn giá trị RIÊNG cho dark mode — `linear-gradient(120deg, var(--ez-forest-400) 0%, var(--ez-forest-600) 100%)` — dùng đúng 2 bậc forest NHẠT HƠN cho nền tối, chính xác cùng lý do contrast mà comment cũ giải thích cho indigo. Override này chỉ còn cần thiết khi `--ez-gradient-cta` là 1 giá trị DUY NHẤT cho cả 2 theme — nay nó đã tự đổi theo theme nên override thành thừa, và đang đè NHẦM màu indigo cũ lên trên.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.

- [ ] **Step 3: Verify browser + đo contrast**

Đăng nhập vai trò học sinh hoặc giáo viên, bật dark mode, mở `/dashboard`. Xác nhận: banner chào mừng chuyển gradient xanh bảng đen (forest-400 → forest-600), không còn tím. Dùng `javascript_tool` đo contrast thật giữa `--ez-text-on-brand` (dark mode) và điểm giữa gradient (forest-500-ish) — phải ≥ 4.5:1 cho chữ thường (tiêu đề "Xin chào, ...") và ≥ 3:1 cho chữ phụ. Nếu không đạt, không dùng lại override cũ — thay bằng cặp forest khác (ví dụ forest-300 → forest-500) rồi đo lại, không merge khi chưa đạt AA.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/app-layout.css
git commit -m "fix: remove obsolete dark-mode indigo override on dashboard banner, let it inherit forest gradient from --ez-gradient-cta"
```

---

### Task 4: Sửa màu hardcode trong `QuestionCard.tsx`

**Files:**
- Modify: `frontend/src/components/QuestionCard.tsx:179`

**Interfaces:**
- Không đổi field/props/logic — chỉ đổi 1 giá trị màu trong object `style` inline.

- [ ] **Step 1: Sửa dòng background**

Thay (dòng 179):
```tsx
                background: manualReveal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(139, 124, 248, 0.1)',
```
thành:
```tsx
                background: manualReveal ? 'rgba(16, 185, 129, 0.1)' : 'var(--accent-bg)',
```
(`var(--accent-bg)` đã trỏ đúng sang `--ez-primary-subtle` qua lớp alias trong `tokens.css` — nhất quán với `var(--accent)`/`var(--accent-border)` đã dùng đúng ngay cạnh đó trong cùng object style, dòng 180/182.)

- [ ] **Step 2: Typecheck + grep xác nhận**

Run: `cd frontend && npx tsc -b --noEmit` — không lỗi.
```bash
grep -n "139, 124, 248" frontend/src/components/QuestionCard.tsx
```
Expected: không có kết quả nào.

- [ ] **Step 3: Verify browser**

Đăng nhập vai trò học sinh, làm 1 bài luyện tập bất kỳ có câu hỏi, xác nhận nút "Ẩn/hiện lời giải" khi ở trạng thái chưa bấm hiển thị nền xanh bảng đen nhạt (không còn tím).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/QuestionCard.tsx
git commit -m "fix: replace hardcoded purple background in QuestionCard reveal-answer button with --accent-bg"
```

---

### Task 5: Verify toàn bộ

**Files:** Không sửa file nào — task thuần verify.

- [ ] **Step 1: Typecheck toàn bộ**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 2: Grep xác nhận không còn hex/rgba tím cũ trong 4 phạm vi đã sửa**

```bash
cd frontend/src
grep -n "8b7cf8\|c084fc\|rgba(139, *124, *248\|rgba(79, *70, *229\|#4f46e5\|rgba(240, *238, *255\|crystalPulse" index.css components/app-layout.css components/QuestionCard.tsx
```
Expected: không có kết quả nào (0 dòng).

- [ ] **Step 3: Verify browser thật, cả light/dark mode**

Test lại đúng luồng đã phát hiện lỗi ban đầu: đăng ký học sinh mới → `/student-onboarding` → `/dashboard` (banner) → đăng nhập giáo viên → `/documents` (upload) → `/dashboard` (banner) → làm 1 câu hỏi luyện tập (QuestionCard). Xác nhận cả 4 chỗ đã sửa đúng, không phát sinh lỗi console mới, không có gì vỡ layout.

Không cần commit ở task này (không sửa file).

---

## Sau khi hoàn thành Phase 7

Chạy lại toàn bộ:

```bash
cd frontend && npx tsc -b --noEmit
```

Ghi chú cho tương lai: `.sidebar`/`.sidebar-brand*`/`.nav-item*`/`.nav-icon`/`.feature-tile`/`.dashboard-card` trong `index.css` là CSS chết (không component nào gọi), có thể xoá hẳn trong 1 đợt dọn dẹp riêng sau này nếu muốn giảm kích thước file — không phải việc của redesign màu sắc, không đưa vào phase này.
