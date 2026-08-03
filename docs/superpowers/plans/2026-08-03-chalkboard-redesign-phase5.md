# Chalkboard & Red Pen Redesign — Phase 5: Trang giáo viên Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Áp dụng redesign "Bảng đen & Bút đỏ" cho 12 trang chỉ giáo viên truy cập (route `TEACHER_ONLY` trong `App.tsx` — các trang dùng chung `STUDENT_AND_TEACHER` đã xử lý ở Phase 4, không lặp lại). Điều tra xác nhận: 8/12 trang đã sạch hoàn toàn (dùng `dashboard.css`/`question-set.css` đã token-hoá, hoặc không có màu hardcode). Việc thật nằm ở 2 nơi: (1) một cụm class dùng chung cũ trong `index.css` — `.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.btn-danger`/`.tag`/`.table-card`/`.table-card-header`/`.data-table`/`.document-link`/`.doc-kind`/`.empty-state`/`.spinner` — vẫn còn màu tím cũ hardcode, được 4 trong 12 trang gọi tới (`DocumentsPage`, `ClassDetailPage`, `ContentHistoryPage`, `ExamBlueprintDetailPage`); (2) `pages/QuestionHistoryPage.tsx` tự vẽ style bằng object `S` (~363 dòng) như 2 file đã sửa ở Phase 4, có màu hex/rgba hardcode thật.

**Architecture:** Task 1 sửa `index.css` — vì các class này định nghĩa TOÀN CỤC (không thuộc riêng trang nào), sửa 1 lần ở đây tự động lan ra cả 4 trang gọi chúng, đúng nguyên lý đã dùng ở Phase 1. Task 2 sửa riêng `QuestionHistoryPage.tsx` — chỉ đổi giá trị màu, không đổi field/logic. Không đổi cấu trúc token nào ngoài 2 file này.

**Tech Stack:** React + TypeScript + Vite, CSS thuần + inline style object (không Tailwind).

## Global Constraints

- KHÔNG đổi logic/props/API/JSX của bất kỳ component hay hàm React nào — chỉ đổi giá trị màu trong CSS đã tồn tại (Task 1) và trong object `S` đã tồn tại (Task 2, chỉ đổi giá trị, không đổi tên field).
- KHÔNG đổi test backend.
- Sau mỗi task: `cd frontend && npx tsc -b --noEmit` phải sạch trước khi commit.
- Mọi màu mới phải là token SEMANTIC (`--ez-*`) đã tồn tại trong `tokens.css` — không thêm hex mới.
- 8 trang còn lại trong danh sách 12 trang giáo viên (đã điều tra xác nhận sạch: `QuestionGeneratePage.tsx`, `QuickGeneratePage.tsx`, `ClassesPage.tsx`, `pages/teacher/QuestionBankPage.tsx`, `pages/teacher/ExamBlueprintListPage.tsx`, `pages/teacher/ExamGradingPage.tsx`, `pages/DocumentDetailPage.tsx` — chỉ 1 giá trị `#000` nền video, hợp lệ không phải màu thương hiệu, không sửa) KHÔNG cần sửa gì — không tạo task cho chúng.
- `pages/teacher/ExamBlueprintDetailPage.tsx` không cần sửa trực tiếp — trang này chỉ dùng class `.data-table` đã sửa ở Task 1, tự động lên màu đúng, không cần task riêng.

---

### Task 1: Sửa class dùng chung cũ trong `index.css`

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Không đổi tên class hay cấu trúc CSS nào — chỉ đổi giá trị màu của rule đã tồn tại. `DocumentsPage.tsx`, `ClassDetailPage.tsx`, `ContentHistoryPage.tsx`, `ExamBlueprintDetailPage.tsx` (đã có sẵn, không sửa trong task này) tự động nhận màu mới vì đang gọi đúng các class này.

- [ ] **Step 1: Sửa 3 token gốc dùng chung (dòng ~95-190)**

Thay:
```css
  --overlay-bg: rgba(0, 0, 0, 0.40);
  --modal-bg: #ffffff;
  --modal-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
```
(dòng 95-97, khối `:root` sáng) thành:
```css
  --overlay-bg: rgba(0, 0, 0, 0.40);
  --modal-bg: var(--ez-surface);
  --modal-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
```

Thay:
```css
  --glass-white: rgba(255, 255, 255, 0.65);
  --glass-white-strong: rgba(255, 255, 255, 0.82);
```
(dòng 102-103, khối `:root` sáng) — giữ nguyên, không đổi (đã trung tính đúng).

Thay:
```css
  --overlay-bg:         rgba(0, 0, 0, 0.65);
  --modal-bg:           #1e1b3a;
  --modal-shadow:       0 8px 32px rgba(0, 0, 0, 0.55);
```
(dòng 182-184, khối `[data-theme='dark']`) thành:
```css
  --overlay-bg:         rgba(0, 0, 0, 0.65);
  --modal-bg:           var(--ez-surface);
  --modal-shadow:       0 8px 32px rgba(0, 0, 0, 0.55);
```

Thay:
```css
  --glass-white:        rgba(30, 27, 75, 0.72);
  --glass-white-strong: rgba(30, 27, 75, 0.92);
```
(dòng 189-190, khối `[data-theme='dark']`) thành:
```css
  --glass-white:        rgba(26, 30, 46, 0.72);
  --glass-white-strong: rgba(26, 30, 46, 0.92);
```
(`26, 30, 46` là rgb của `--ez-neutral-900`/`--ez-surface` tối — cùng công thức "đổi rgb, giữ opacity" đã dùng ở Phase 2 cho blob nền `PublicLayout.css`.)

- [ ] **Step 2: Sửa `.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.btn-danger` (dòng ~567-627)**

Thay:
```css
.btn-primary {
  color: var(--ez-text-on-brand, #fff);
  background: var(--ez-primary, #3d52d5);
  border: none;
}

.btn-primary:hover {
  background: var(--ez-primary-hover, #3341ad);
}

.btn-primary:active {
  background: var(--ez-primary-active, #2b3688);
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-danger:disabled,
.btn-ghost:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none !important;
  box-shadow: none !important;
}

.btn-secondary {
  color: var(--text-h);
  background: var(--glass-white);
  border-color: rgba(139, 124, 248, 0.14);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-soft);
}

.btn-secondary:hover {
  background: var(--glass-white-strong);
  border-color: rgba(139, 124, 248, 0.24);
  box-shadow: var(--shadow-card);
  transform: translateY(-1px);
}

.btn-full { width: 100%; }

.btn-ghost {
  color: var(--text);
  background: transparent;
}

.btn-ghost:hover {
  color: var(--text-h);
  background: rgba(139, 124, 248, 0.06);
}

.btn-danger {
  color: var(--danger);
  background: var(--danger-bg);
  border-color: rgba(239, 68, 68, 0.12);
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.12);
  transform: translateY(-1px);
}
```
thành:
```css
.btn-primary {
  color: var(--ez-text-on-brand);
  background: var(--ez-primary);
  border: none;
}

.btn-primary:hover {
  background: var(--ez-primary-hover);
}

.btn-primary:active {
  background: var(--ez-primary-active);
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-danger:disabled,
.btn-ghost:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none !important;
  box-shadow: none !important;
}

.btn-secondary {
  color: var(--text-h);
  background: var(--glass-white);
  border-color: var(--ez-border);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-soft);
}

.btn-secondary:hover {
  background: var(--glass-white-strong);
  border-color: var(--ez-border-strong);
  box-shadow: var(--shadow-card);
  transform: translateY(-1px);
}

.btn-full { width: 100%; }

.btn-ghost {
  color: var(--text);
  background: transparent;
}

.btn-ghost:hover {
  color: var(--text-h);
  background: var(--ez-primary-subtle);
}

.btn-danger {
  color: var(--danger);
  background: var(--danger-bg);
  border-color: var(--ez-error-border);
}

.btn-danger:hover {
  background: var(--ez-error-subtle);
  transform: translateY(-1px);
}
```

(Bỏ luôn hex fallback `#fff`/`#3d52d5`/`#3341ad`/`#2b3688` trong `.btn-primary` — đây là fallback chết từ trước cả Cycle 1, `--ez-*` luôn được định nghĩa nên fallback không bao giờ chạy.)

- [ ] **Step 3: Sửa `.tag` (dòng ~660-670)**

Thay:
```css
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 4px 12px;
  border: 1px solid rgba(139, 124, 248, 0.12);
  border-radius: var(--ez-radius-full);
  background: rgba(139, 124, 248, 0.06);
  color: var(--crystal-600);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
```
thành:
```css
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 4px 12px;
  border: 1px solid var(--ez-primary-border);
  border-radius: var(--ez-radius-full);
  background: var(--ez-primary-subtle);
  color: var(--ez-primary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
```

- [ ] **Step 4: Sửa `.table-card`/`.table-card-header`/`.data-table`/`.document-link`/`.doc-kind`/`.empty-state` (dòng ~1495-1601)**

Thay:
```css
.table-card {
  overflow: hidden;
  border: 1px solid rgba(139,124,248,0.08);
  border-radius: var(--radius-xl);
  background: var(--glass-white);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
}

.table-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(139,124,248,0.08);
  background: linear-gradient(90deg, rgba(139,124,248,0.05), rgba(247,74,138,0.03));
}
```
thành:
```css
.table-card {
  overflow: hidden;
  border: 1px solid var(--ez-border);
  border-radius: var(--radius-xl);
  background: var(--glass-white);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
}

.table-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--ez-border);
  background: linear-gradient(90deg, rgba(29,59,44,0.05), rgba(214,69,69,0.03));
}
```

Thay:
```css
.data-table th {
  padding: 14px 16px;
  color: var(--muted);
  background: rgba(139,124,248,0.03);
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.data-table td {
  padding: 14px 16px;
  border-top: 1px solid rgba(139,124,248,0.06);
  color: var(--text);
  vertical-align: middle;
}

.data-table tbody tr {
  transition: background 0.2s;
}

.data-table tbody tr:hover {
  background: rgba(139,124,248,0.04);
}
```
thành:
```css
.data-table th {
  padding: 14px 16px;
  color: var(--muted);
  background: var(--ez-surface-muted);
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.data-table td {
  padding: 14px 16px;
  border-top: 1px solid var(--ez-border-subtle);
  color: var(--text);
  vertical-align: middle;
}

.data-table tbody tr {
  transition: background 0.2s;
}

.data-table tbody tr:hover {
  background: var(--ez-surface-hover);
}
```

Thay:
```css
.document-link:hover { color: var(--crystal-600); }

.doc-kind {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 28px;
  border-radius: var(--ez-radius-sm);
  background: linear-gradient(135deg, rgba(139,124,248,0.10), rgba(192,132,252,0.06));
  color: var(--crystal-500);
  font-size: 10px;
  font-weight: 800;
  flex: 0 0 auto;
}
```
thành:
```css
.document-link:hover { color: var(--ez-primary-hover); }

.doc-kind {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 28px;
  border-radius: var(--ez-radius-sm);
  background: linear-gradient(135deg, rgba(29,59,44,0.10), rgba(46,90,68,0.06));
  color: var(--ez-primary);
  font-size: 10px;
  font-weight: 800;
  flex: 0 0 auto;
}
```

Thay:
```css
.empty-state {
  padding: 42px 22px;
  color: var(--muted);
  background: rgba(139,124,248,0.03);
  text-align: center;
  font-size: 14px;
}
```
thành:
```css
.empty-state {
  padding: 42px 22px;
  color: var(--muted);
  background: var(--ez-surface-muted);
  text-align: center;
  font-size: 14px;
}
```

- [ ] **Step 5: Sửa `.spinner`/`.small-spinner` (dòng ~1470-1480)**

Thay:
```css
.spinner, .small-spinner {
  display: inline-block;
  border-radius: 50%;
  border-style: solid;
  border-color: rgba(139,124,248,0.15);
  border-top-color: var(--crystal-500);
  animation: spin 0.8s linear infinite;
}
```
thành:
```css
.spinner, .small-spinner {
  display: inline-block;
  border-radius: 50%;
  border-style: solid;
  border-color: var(--ez-border);
  border-top-color: var(--ez-primary);
  animation: spin 0.8s linear infinite;
}
```

(`animation: spin ... infinite` ở đây là spinner tải dữ liệu thật — có ý nghĩa chức năng, không phải trang trí, được miễn trừ khỏi nguyên tắc "motion tối giản", giữ nguyên.)

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 7: Verify browser**

Đăng nhập vai trò giáo viên, mở `/documents` (danh sách tài liệu), xác nhận: thẻ bảng (`.table-card`) hết viền/nền tím, tag loại tài liệu (`.doc-kind`) chuyển xanh bảng đen, nút "Sửa"/"Xóa" (`.btn-secondary`/`.btn-danger`) hết viền tím. Mở `/classes/:id` bất kỳ (`.table-card`/`.data-table` tương tự) và `/teacher/content-history` (dùng `.btn-secondary`/`.btn-danger`). Kiểm tra dark mode — mở popup xác nhận xóa bất kỳ (dùng `.modal-bg`/`.glass-white`) xác nhận nền modal không còn tím `#1e1b3a`, mà đúng màu nền tối trung tính.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/index.css
git commit -m "fix: replace legacy purple in shared button/table/tag/modal classes with Chalkboard tokens"
```

---

### Task 2: Sửa màu hardcode trong `QuestionHistoryPage.tsx`

**Files:**
- Modify: `frontend/src/pages/QuestionHistoryPage.tsx:49-54` (`BLOOM_CONFIG`)
- Modify: `frontend/src/pages/QuestionHistoryPage.tsx:401` (JSX inline style)
- Modify: `frontend/src/pages/QuestionHistoryPage.tsx:558,681,686,691,696,709,811` (object `S`)

**Interfaces:**
- Không đổi field nào của object `S` hay `BLOOM_CONFIG` — chỉ đổi giá trị màu bên trong.

- [ ] **Step 1: Sửa `BLOOM_CONFIG` (dòng 49-54)**

Thay:
```tsx
const BLOOM_CONFIG: Record<string, { label: string; color: string }> = {
  remember: { label: 'Nhận biết', color: '#22c55e' },
  understand: { label: 'Thông hiểu', color: '#3b82f6' },
  apply: { label: 'Vận dụng', color: '#f59e0b' },
  analyze: { label: 'VD cao', color: '#ef4444' },
};
```
thành:
```tsx
const BLOOM_CONFIG: Record<string, { label: string; color: string }> = {
  remember: { label: 'Nhận biết', color: 'var(--ez-success)' },
  understand: { label: 'Thông hiểu', color: 'var(--ez-info)' },
  apply: { label: 'Vận dụng', color: 'var(--ez-warning)' },
  analyze: { label: 'VD cao', color: 'var(--ez-error)' },
};
```

- [ ] **Step 2: Sửa màu chữ trên thanh Bloom (dòng ~401)**

Thay (trong JSX, khối render thanh `bloomBar`):
```tsx
                            style={{
                              width: `${pct}%`,
                              background: cfg.color,
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontSize: '9px',
                              fontWeight: 600,
                            }}
```
thành:
```tsx
                            style={{
                              width: `${pct}%`,
                              background: cfg.color,
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--ez-text-on-brand)',
                              fontSize: '9px',
                              fontWeight: 600,
                            }}
```

- [ ] **Step 3: Sửa border rgba trong object `S` — nhóm badge/errorBox (dòng 558, 681, 686, 691, 696)**

Thay dòng 558 (trong `errorBox`):
```tsx
    border: '1px solid rgba(239, 68, 68, 0.3)',
```
thành:
```tsx
    border: '1px solid var(--ez-error-border)',
```

Thay dòng 681 (trong `typeBadge`):
```tsx
    border: '1px solid rgba(14, 165, 233, 0.25)',
```
thành:
```tsx
    border: '1px solid var(--ez-secondary-border)',
```
(`typeBadge` dùng `backgroundColor: 'var(--accent-2-bg)'`/`color: 'var(--accent-2)'` — 2 alias này đã trỏ đúng `--ez-secondary`, nên viền cũng phải cùng họ `--ez-secondary-border`, không phải `--ez-info-border`.)

Thay dòng 686 (trong `diffEasy`):
```tsx
    border: '1px solid rgba(16, 185, 129, 0.25)',
```
thành:
```tsx
    border: '1px solid var(--ez-success-border)',
```

Thay dòng 691 (trong `diffMedium`):
```tsx
    border: '1px solid rgba(245, 158, 11, 0.25)',
```
thành:
```tsx
    border: '1px solid var(--ez-warning-border)',
```

Thay dòng 696 (trong `diffHard`):
```tsx
    border: '1px solid rgba(239, 68, 68, 0.25)',
```
thành:
```tsx
    border: '1px solid var(--ez-error-border)',
```

- [ ] **Step 4: Sửa chữ trắng trên nút màu (dòng 709, 811)**

Thay dòng 709 (trong `viewBtn`):
```tsx
    color: '#fff',
```
thành (chỉ dòng này trong field `viewBtn`, không phải dòng 401 hay 811):
```tsx
    color: 'var(--ez-text-on-brand)',
```

Thay dòng 811 (trong `btnDanger`):
```tsx
    color: '#fff',
```
thành:
```tsx
    color: 'var(--ez-text-on-brand)',
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Grep xác nhận**

```bash
grep -n "#22c55e\|#3b82f6\|#f59e0b\|#ef4444\|color: '#fff'\|rgba(239, 68, 68\|rgba(14, 165, 233\|rgba(16, 185, 129\|rgba(245, 158, 11" frontend/src/pages/QuestionHistoryPage.tsx
```
Expected: không có kết quả nào (0 dòng).

- [ ] **Step 7: Verify browser**

Đăng nhập vai trò giáo viên, mở `/question-history`. Xác nhận: thanh Bloom's Taxonomy trên mỗi thẻ câu hỏi hiển thị đúng 4 màu (xanh lá/xanh dương/vàng/đỏ theo token, không đổi tông so với trước vì màu gốc gần giống token — chỉ khác là giờ đổi được theo dark mode), badge loại câu hỏi/độ khó viền đúng màu tương ứng, nút "Xem"/nút xóa trong hộp thoại xác nhận chữ trắng rõ trên nền màu. Kiểm tra dark mode — mở hộp thoại xác nhận xóa, xác nhận nền hộp thoại đúng nền tối (nhờ Task 1 đã sửa `--modal-bg`), không còn tím.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/QuestionHistoryPage.tsx
git commit -m "fix: replace hardcoded colors in QuestionHistoryPage with semantic tokens"
```

---

### Task 3: Verify toàn bộ 12 trang giáo viên

**Files:** Không sửa file nào — task thuần verify.

- [ ] **Step 1: Typecheck toàn bộ**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 2: Grep xác nhận không còn hex/rgba tím cũ trong `index.css`**

```bash
cd frontend/src
grep -n "139,\s*124,\s*248\|139, 124, 248\|192,132,252\|192, 132, 252\|247,74,138\|247, 74, 138\|crystal-500\|crystal-600" index.css
```
Expected: 0 kết quả trong phạm vi các rule đã sửa ở Task 1 (`.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.tag`, `.table-card`, `.table-card-header`, `.data-table`, `.document-link`, `.doc-kind`, `.empty-state`, `.spinner`). Nếu grep vẫn ra kết quả ở những rule KHÁC không thuộc 12 trang giáo viên (ví dụ `.sidebar-brand-icon`, `.upload-icon`, `.nav-item-primary`, `.feature-tile` đã xác nhận ngoài phạm vi từ Phase 1-4), đó là bình thường, không phải lỗi của task này.

- [ ] **Step 3: Verify browser thật ở 4 trang vừa sửa (gián tiếp hoặc trực tiếp) + 2 trang tiêu biểu trong nhóm "đã sạch", cả light/dark mode**

Mở `/documents`, `/classes/:id` (bất kỳ lớp có sẵn), `/teacher/content-history`, `/question-history` (4 trang chịu ảnh hưởng của Task 1+2) và `/exam-blueprints`, `/question-bank` (2 trang tiêu biểu trong nhóm "đã sạch", xác nhận nhận định đó đúng thật ngoài đời) — cả 2 theme. Xác nhận không còn màu tím/hồng cũ ở bất kỳ đâu trên cả 6 trang.

Không cần commit ở task này (không sửa file).

---

## Sau khi hoàn thành Phase 5

Chạy lại toàn bộ:

```bash
cd frontend && npx tsc -b --noEmit
```

Sau khi xong, dùng `superpowers:writing-plans` viết plan cho Phase 6 (trang admin, ~16 trang) khi sẵn sàng — không viết trước trong file này. Lưu ý: Phase 6 nên tận dụng luôn các fix đã làm ở Task 1 của Phase 5 (`.table-card`/`.data-table`/`.btn-secondary`/`.btn-danger`/`.tag`/`.empty-state`/`.spinner` — các trang admin nhiều khả năng cũng dùng chung những class này), nên khối lượng việc thật của Phase 6 có thể nhỏ hơn ước tính ban đầu, giống các phase trước.
