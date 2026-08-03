# Chalkboard & Red Pen Redesign — Phase 6: Trang admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Áp dụng redesign "Bảng đen & Bút đỏ" cho 16 trang admin (route `AdminRoute` trong `App.tsx`). Điều tra xác nhận: không trang admin nào dùng lại các class Phase 5 vừa sửa (`.table-card`/`.data-table`/`.btn-*`/`.tag`/... — hệ thống admin dùng bộ component `frontend/src/components/ui/` mới hơn, đã token-hoá sẵn từ Phase 3). 14/16 trang sạch hoàn toàn. Việc thật nằm ở đúng 2 file CSS: `AdminDashboardPage.css` (3 màu hardcode nhỏ + 1 bug thật — SVG donut chart tham chiếu `var(--text-primary)` không tồn tại ở bất kỳ đâu trong codebase, luôn render đen, vỡ tương phản dark mode) và `AdminContentPages.css` (dùng chung bởi 4 trang: `AdminWebsiteContentPage`, `AdminSettingsPage`, `AdminFeatureFlagsPage`, `AdminNotificationsPage` — toàn bộ file này chưa từng được token-hoá dù ở Cycle 1 hay Cycle 2, dùng `var(--text-primary, #hex)`/`var(--text-secondary, #hex)`/`var(--surface-primary, #hex)`/`var(--border-color, #hex)` — 4 custom property này không được định nghĩa ở bất kỳ đâu trong codebase nên luôn rơi về giá trị fallback hex, tức về bản chất 100% màu hardcode, không đổi được theo dark mode; cộng thêm 1 bảng màu xanh dương lạ (`#2563eb`/`#1d4ed8`/`#3538cd`...) hoàn toàn không thuộc cả bảng tím cũ lẫn bảng forest/coral mới).

**Architecture:** Task 1 sửa `AdminDashboardPage.css` (3 rule nhỏ) + `AdminDashboardPage.tsx` (1 dòng). Task 2 thay toàn bộ nội dung `AdminContentPages.css` bằng bản đã token-hoá — vì gần như mọi rule trong file đều cần sửa (bug nằm ở tầng custom-property chưa từng được định nghĩa, không phải 1-2 chỗ lẻ tẻ), thay nguyên file rõ ràng và ít rủi ro nhầm lẫn hơn là hàng chục edit rời rạc. Không đổi selector/cấu trúc/tên class nào ở cả 2 file — chỉ đổi giá trị màu.

**Tech Stack:** React + TypeScript + Vite, CSS thuần (không Tailwind).

## Global Constraints

- KHÔNG đổi logic/props/API/JSX của bất kỳ component hay hàm React nào — chỉ đổi giá trị màu trong CSS đã tồn tại (Task 1, Task 2) và 1 giá trị `fill` trong JSX (Task 1).
- KHÔNG đổi test backend.
- Sau mỗi task: `cd frontend && npx tsc -b --noEmit` phải sạch trước khi commit.
- Mọi màu mới phải là token SEMANTIC (`--ez-*`) đã tồn tại trong `tokens.css` — không thêm hex mới, không giữ lại bảng xanh dương lạ (`#2563eb` và họ hàng) hay tham chiếu custom property không tồn tại (`--text-primary`/`--text-secondary`/`--surface-primary`/`--border-color`).
- 14 trang còn lại trong danh sách 16 trang admin (đã điều tra xác nhận sạch: `AdminUsersPage.tsx`, `AdminUserDetailPage.tsx`, `AdminDocumentsPage.tsx`, `AdminDocumentDetailPage.tsx`, `AdminQuestionsPage.tsx`, `AdminQuestionDetailPage.tsx`, `AdminExamsPage.tsx`, `AdminAIPage.tsx`, `AdminReportsPage.tsx`, `AdminActivityLogsPage.tsx`, `AdminAuditLogsPage.tsx` — không có CSS riêng, không có màu hardcode; và `AdminWebsiteContentPage.tsx`/`AdminSettingsPage.tsx`/`AdminFeatureFlagsPage.tsx`/`AdminNotificationsPage.tsx` — không cần sửa trực tiếp, tự động nhận màu đúng sau khi Task 2 sửa `AdminContentPages.css` mà 4 trang này cùng import) KHÔNG cần task riêng.

---

### Task 1: Sửa `AdminDashboardPage.css` + `AdminDashboardPage.tsx`

**Files:**
- Modify: `frontend/src/pages/AdminDashboardPage.css`
- Modify: `frontend/src/pages/AdminDashboardPage.tsx:153`

**Interfaces:**
- Không đổi tên class/component/props nào — chỉ đổi giá trị màu.

- [ ] **Step 1: Sửa `.admin-log-item--error` (dòng ~409-411)**

Thay:
```css
.admin-log-item--error {
  border-color: rgba(239, 68, 68, 0.35);
}
```
thành:
```css
.admin-log-item--error {
  border-color: var(--ez-error-border);
}
```

- [ ] **Step 2: Sửa `.backend-health-dot` (dòng ~482-489)**

Thay:
```css
.backend-health-dot {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: var(--ez-radius-full);
  background: var(--muted);
  box-shadow: 0 0 0 5px rgba(100, 116, 139, 0.12);
  flex-shrink: 0;
}
```
thành:
```css
.backend-health-dot {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: var(--ez-radius-full);
  background: var(--muted);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--ez-text-muted) 12%, transparent);
  flex-shrink: 0;
}
```

- [ ] **Step 3: Sửa backdrop modal lỗi (dòng ~736-742)**

Thay dòng chứa `background: rgba(15, 23, 42, 0.48);` trong rule bọc `.admin-error-modal-backdrop` (rule có `inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 1rem;` ngay trước dòng background) thành `background: var(--ez-overlay);` — chỉ đổi đúng dòng `background`, giữ nguyên mọi thuộc tính khác trong rule.

- [ ] **Step 4: Sửa bug `var(--text-primary)` không tồn tại trong `DonutChart` (dòng 153)**

Thay:
```tsx
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fill="var(--text-primary)">
```
thành:
```tsx
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fill="var(--ez-text)">
```

(`--text-primary` không được định nghĩa ở bất kỳ đâu trong codebase — đã xác nhận bằng grep toàn bộ `frontend/src` — nên `fill` này luôn rơi về giá trị khởi tạo CSS (đen), khiến số phần trăm trong biểu đồ donut hiển thị chữ đen trên nền tối ở dark mode. Đây là lỗi thật, không phải màu tím cũ, nhưng đúng loại lỗi "custom property không tồn tại" mà redesign này đang dọn dẹp.)

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Verify browser**

Đăng nhập vai trò admin, mở `/admin/dashboard`. Xác nhận: biểu đồ donut hiển thị số phần trăm rõ ràng ở cả light và dark mode (không còn chữ đen chìm trên nền tối), chấm trạng thái backend có quầng sáng mờ đúng tông trung tính, modal lỗi (nếu trigger được) có backdrop đúng màu overlay chuẩn.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AdminDashboardPage.css frontend/src/pages/AdminDashboardPage.tsx
git commit -m "fix: replace hardcoded colors and undefined --text-primary reference in AdminDashboardPage"
```

---

### Task 2: Token hoá toàn bộ `AdminContentPages.css`

**Files:**
- Modify: `frontend/src/pages/AdminContentPages.css` (thay toàn bộ nội dung file)

**Interfaces:**
- Không đổi tên class nào — `AdminWebsiteContentPage.tsx`, `AdminSettingsPage.tsx`, `AdminFeatureFlagsPage.tsx`, `AdminNotificationsPage.tsx` (không sửa trong task này) tiếp tục gọi đúng các class cũ, tự động nhận màu mới.

- [ ] **Step 1: Thay toàn bộ nội dung file**

File hiện tại dùng 4 custom property không tồn tại ở bất kỳ đâu trong codebase (`--text-primary`, `--text-secondary`, `--surface-primary`, `--border-color`) nên mọi `var(..., fallback)` luôn rơi về fallback hex — về bản chất toàn bộ file là hardcode, không đổi được theo dark mode. Thay toàn bộ nội dung `frontend/src/pages/AdminContentPages.css` bằng:

```css
.admin-content-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  min-width: 0;
}

.admin-content-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.admin-content-header h1 {
  margin: 0;
  font-size: 28px;
  color: var(--ez-text);
}

.admin-content-header p {
  margin: 6px 0 0;
  color: var(--ez-text-muted);
}

.admin-content-toolbar,
.admin-content-detail,
.admin-content-panel {
  background: var(--ez-surface);
  border: 1px solid var(--ez-border);
  border-radius: var(--ez-radius-md);
  padding: 16px;
}

.admin-content-toolbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 12px;
}

.admin-content-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--ez-text-muted);
}

.admin-content-field input,
.admin-content-field select,
.admin-content-field textarea {
  border: 1px solid var(--ez-border-strong);
  border-radius: var(--ez-radius-md);
  padding: 10px 12px;
  font: inherit;
  color: var(--ez-text);
  background: var(--ez-surface);
}

.admin-content-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.admin-content-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--ez-border-strong);
  border-radius: var(--ez-radius-md);
  padding: 8px 11px;
  background: var(--ez-surface);
  color: var(--ez-text);
  cursor: pointer;
  font-weight: 600;
}

.admin-content-btn:hover {
  background: var(--ez-surface-muted);
}

.admin-content-btn--primary {
  border-color: var(--ez-primary);
  background: var(--ez-primary);
  color: var(--ez-text-on-brand);
}

.admin-content-btn--primary:hover {
  background: var(--ez-primary-hover);
}

.admin-content-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-content-btn--danger {
  border-color: var(--ez-error-border);
  color: var(--ez-error-text);
  background: var(--ez-error-subtle);
}

.admin-content-table-wrap {
  overflow-x: auto;
  max-width: 100%;
  background: var(--ez-surface);
  border: 1px solid var(--ez-border);
  border-radius: var(--ez-radius-md);
}

.admin-content-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.admin-content-table th,
.admin-content-table td {
  padding: 12px;
  border-bottom: 1px solid var(--ez-border-subtle);
  text-align: left;
  vertical-align: top;
  font-size: 14px;
}

.admin-content-table th {
  color: var(--ez-text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0;
  background: var(--ez-surface-muted);
}

.admin-content-title-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}

.admin-content-title-cell strong {
  color: var(--ez-text);
  overflow-wrap: anywhere;
}

.admin-content-muted {
  color: var(--ez-text-muted);
  font-size: 13px;
}

.admin-content-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: var(--ez-radius-full);
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 700;
  background: var(--ez-primary-subtle);
  color: var(--ez-primary-text);
}

.admin-content-badge--danger {
  background: var(--ez-error-subtle);
  color: var(--ez-error-text);
}

.admin-content-badge--ok {
  background: var(--ez-success-subtle);
  color: var(--ez-success-text);
}

.admin-content-state {
  background: var(--ez-surface);
  border: 1px dashed var(--ez-border-strong);
  border-radius: var(--ez-radius-md);
  padding: 28px;
  text-align: center;
  color: var(--ez-text-muted);
}

.admin-content-pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}

.admin-content-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(160px, 1fr));
  gap: 12px;
}

.admin-content-kv {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--ez-border-subtle);
  border-radius: var(--ez-radius-md);
}

.admin-content-kv span {
  color: var(--ez-text-muted);
  font-size: 12px;
}

.admin-content-kv strong {
  color: var(--ez-text);
  overflow-wrap: anywhere;
}

.admin-content-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--ez-overlay);
}

.admin-content-modal {
  width: min(620px, 100%);
  max-height: 86vh;
  overflow: auto;
  background: var(--ez-surface);
  border-radius: var(--ez-radius-md);
  padding: 20px;
  box-shadow: var(--ez-shadow-xl);
}

.admin-content-modal h3 {
  margin: 0 0 10px;
}

.admin-content-pretty {
  display: grid;
  gap: 8px;
}

.admin-content-pretty-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--ez-border-subtle);
  border-radius: var(--ez-radius-md);
}

.admin-content-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-content-tabs button {
  border: 1px solid var(--ez-border-strong);
  border-radius: var(--ez-radius-md);
  background: var(--ez-surface);
  color: var(--ez-text);
  padding: 9px 12px;
  font-weight: 700;
  cursor: pointer;
}

.admin-content-tabs button.active {
  border-color: var(--ez-primary);
  background: var(--ez-primary-subtle);
  color: var(--ez-primary-text);
}

.admin-content-cms-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  gap: 16px;
  align-items: start;
}

.admin-content-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.admin-content-editor-stack,
.admin-content-list-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-content-list-editor {
  padding-top: 12px;
}

.admin-content-row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.admin-content-row-head h2 {
  margin: 0;
  color: var(--ez-text);
}

.admin-content-row-head p {
  margin: 4px 0 0;
}

.admin-content-row-grid {
  display: grid;
  gap: 8px;
  align-items: center;
}

.admin-content-row-grid input,
.admin-content-section-row input,
.admin-content-section-row textarea,
.admin-content-row-head select {
  border: 1px solid var(--ez-border-strong);
  border-radius: var(--ez-radius-md);
  padding: 9px 10px;
  font: inherit;
  color: var(--ez-text);
  background: var(--ez-surface);
}

.admin-content-row-grid--menu {
  grid-template-columns: minmax(120px, 1fr) minmax(160px, 1fr) 90px 110px auto;
}

.admin-content-row-grid--simple {
  grid-template-columns: minmax(180px, 1fr) auto;
}

.admin-content-row-grid--section {
  grid-template-columns: minmax(130px, 0.8fr) minmax(130px, 1fr) 90px 110px;
}

.admin-content-row-grid--benefit {
  grid-template-columns: minmax(140px, 0.8fr) minmax(180px, 1.2fr) auto;
}

.admin-content-section-row {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--ez-border-subtle);
  border-radius: var(--ez-radius-md);
}

.admin-content-inline-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ez-text-muted);
  font-weight: 600;
}

.admin-content-preview {
  position: sticky;
  top: 18px;
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--ez-border);
  border-radius: var(--ez-radius-md);
  background: var(--ez-surface);
}

.admin-content-preview-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--ez-border-subtle);
  padding-bottom: 10px;
}

.admin-content-preview-header div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  color: var(--ez-text-muted);
  font-size: 12px;
}

.admin-content-preview-hero {
  display: grid;
  gap: 8px;
}

.admin-content-preview-hero span,
.admin-content-preview-sections span {
  color: var(--ez-primary);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.admin-content-preview-hero h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.18;
  color: var(--ez-text);
}

.admin-content-preview-hero em {
  color: var(--ez-success);
  font-style: normal;
}

.admin-content-preview-hero p,
.admin-content-preview-sections p,
.admin-content-preview footer {
  margin: 0;
  color: var(--ez-text-muted);
  line-height: 1.5;
}

.admin-content-preview-hero div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-content-preview-hero button {
  border: 1px solid var(--ez-border-strong);
  border-radius: var(--ez-radius-md);
  background: var(--ez-surface);
  padding: 8px 10px;
  font-weight: 700;
}

.admin-content-preview-sections {
  display: grid;
  gap: 8px;
}

.admin-content-preview-sections article {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--ez-border-subtle);
  border-radius: var(--ez-radius-md);
}

.admin-content-preview footer {
  border-top: 1px solid var(--ez-border-subtle);
  padding-top: 10px;
}

.admin-settings-list {
  display: grid;
  gap: 12px;
}

.admin-settings-row {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) minmax(180px, 0.7fr) minmax(180px, 0.8fr) auto;
  gap: 12px;
  align-items: end;
  padding: 12px;
  border: 1px solid var(--ez-border-subtle);
  border-radius: var(--ez-radius-md);
}

.admin-settings-row--flag {
  grid-template-columns: minmax(220px, 1.3fr) minmax(130px, 0.5fr) minmax(110px, 0.4fr) minmax(160px, 0.7fr) minmax(180px, 0.7fr) auto;
}

.admin-settings-row strong {
  display: block;
  color: var(--ez-text);
  overflow-wrap: anywhere;
}

.admin-settings-row p {
  margin: 4px 0 6px;
}

.admin-settings-row textarea {
  width: 100%;
  border: 1px solid var(--ez-border-strong);
  border-radius: var(--ez-radius-md);
  padding: 9px 10px;
  font: inherit;
  color: var(--ez-text);
  background: var(--ez-surface);
}

@media (max-width: 900px) {
  .admin-content-toolbar,
  .admin-content-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-content-cms-layout,
  .admin-content-form-grid {
    grid-template-columns: 1fr;
  }

  .admin-content-preview {
    position: static;
  }

  .admin-settings-row,
  .admin-settings-row--flag {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .admin-content-page {
    padding: 16px;
  }

  .admin-content-header {
    flex-direction: column;
  }

  .admin-content-toolbar,
  .admin-content-detail-grid {
    grid-template-columns: 1fr;
  }

  .admin-content-table {
    min-width: 0;
  }

  .admin-content-table thead {
    display: none;
  }

  .admin-content-table,
  .admin-content-table tbody,
  .admin-content-table tr,
  .admin-content-table td {
    display: block;
    width: 100%;
  }

  .admin-content-table tr {
    padding: 12px;
    border-bottom: 1px solid var(--ez-border-subtle);
  }

  .admin-content-table td {
    border-bottom: 0;
    padding: 7px 0;
  }

  .admin-content-table td::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 2px;
    font-size: 12px;
    font-weight: 700;
    color: var(--ez-text-muted);
  }

  .admin-content-pretty-row {
    grid-template-columns: 1fr;
  }

  .admin-content-row-grid--menu,
  .admin-content-row-grid--section,
  .admin-content-row-grid--benefit,
  .admin-content-row-grid--simple {
    grid-template-columns: 1fr;
  }

  .admin-settings-row,
  .admin-settings-row--flag {
    grid-template-columns: 1fr;
  }
}
```

(Mọi selector, media query, thứ tự rule giữ nguyên y hệt bản gốc — chỉ giá trị màu đổi. `--ez-border`/`--ez-border-strong`/`--ez-border-subtle` thay cho 3 bậc `#e5e7eb`/`#d0d5dd`/`#eef2f7` theo đúng thang độ đậm nhạt gốc. `.admin-content-tabs button.active` dùng đúng bộ 3 token `--ez-primary`/`--ez-primary-subtle`/`--ez-primary-text` — khớp với cách `.ez-tab[aria-selected='true']` trong `ui.css` đã làm.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 3: Grep xác nhận**

```bash
grep -n "text-primary\|text-secondary\|surface-primary\|border-color\|#2563eb\|#1d4ed8\|#3538cd\|#eef4ff\|#fecaca\|#b42318\|#fff7f7\|#fff1f3\|#c01048\|#ecfdf3\|#027a48\|#eff6ff\|#10b981\|#172033\|#667085\|#e5e7eb\|#d0d5dd\|#eef2f7\|rgba(15, 23, 42" frontend/src/pages/AdminContentPages.css
```
Expected: không có kết quả nào (0 dòng).

- [ ] **Step 4: Verify browser**

Đăng nhập vai trò admin, mở lần lượt `/admin/website-content`, `/admin/settings`, `/admin/feature-flags`, `/admin/notifications`. Xác nhận: nút "Lưu"/nút chính chuyển xanh bảng đen (không còn xanh dương lạ `#2563eb`), badge trạng thái đúng đỏ/xanh lá theo token, tab đang chọn viền + nền + chữ đúng theo token primary, modal xác nhận (nếu có) đúng backdrop tối chuẩn. Kiểm tra dark mode ở cả 4 trang — xác nhận nền/chữ/viền đổi theo theme (khác hẳn trước khi sửa, khi mọi màu đều hardcode không đổi được).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminContentPages.css
git commit -m "fix: tokenize AdminContentPages.css, remove undefined --text-primary/--surface-primary/--border-color fallback pattern and foreign blue palette"
```

---

### Task 3: Verify toàn bộ 16 trang admin

**Files:** Không sửa file nào — task thuần verify.

- [ ] **Step 1: Typecheck toàn bộ**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 2: Verify browser thật ở 6 trang (2 vừa sửa trực tiếp + 4 dùng chung `AdminContentPages.css`) + 2 trang tiêu biểu trong nhóm "đã sạch", cả light/dark mode**

Mở `/admin/dashboard`, `/admin/website-content`, `/admin/settings`, `/admin/feature-flags`, `/admin/notifications` (5 trang chịu ảnh hưởng của Task 1+2) và `/admin/users`, `/admin/reports` (2 trang tiêu biểu nhóm "đã sạch", xác nhận nhận định đúng thật ngoài đời) — cả 2 theme. Xác nhận không còn màu tím cũ hay bảng xanh dương lạ ở bất kỳ đâu trên cả 7 trang.

Không cần commit ở task này (không sửa file).

---

## Sau khi hoàn thành Phase 6

Chạy lại toàn bộ:

```bash
cd frontend && npx tsc -b --noEmit
```

Đây là phase cuối cùng của lộ trình 6 giai đoạn trong spec `docs/superpowers/specs/2026-08-03-chalkboard-redesign-design.md`. Sau khi merge, nên lướt lại toàn bộ site 1 lượt (public + học sinh + giáo viên + admin) để xác nhận đồng bộ hoàn toàn — không còn "2 tông màu" ở bất kỳ khu vực nào của sản phẩm.
