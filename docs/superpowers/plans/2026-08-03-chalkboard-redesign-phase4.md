# Chalkboard & Red Pen Redesign — Phase 4: Trang học sinh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Áp dụng redesign "Bảng đen & Bút đỏ" cho các trang học sinh chạm tới. Điều tra xác nhận: trong 12 trang/component học sinh dùng (`DashboardPage`/`StudentDashboardPage`, `ProfilePage`, `QuestionSetDetailPage`/`PracticeAttemptPage`, `StudentOnboardingPage`, `PublishedQuestionSetsPage`, `ProgressPage`, `PersonalizationPage`, `ExamAttemptPage`, `AdvancedChatPage`, `WebKnowledgePage`, `CurriculumKbPage`, `ToolLibraryPage`), **10/12 đã sạch hoàn toàn** — không có màu hardcode, chỉ dùng class dùng chung (`ui.css`) hoặc `dashboard.css`/`question-set.css` (2 file CSS này đã kiểm tra, 100% token, không cần sửa). Toàn bộ việc cần làm nằm trong đúng 2 file: `PublishedQuestionSetsPage.tsx` và `AdvancedChatPage.tsx` — cả 2 tự vẽ style bằng object JS nội tuyến (`const styles = {...}`) thay vì dùng token, nên có màu hardcode thật (đỏ/xanh lá dùng hex Tailwind cứng, không đổi theo dark mode) và tham chiếu tới lớp ALIAS cũ (`var(--muted)`, `var(--accent)`...) thay vì tên SEMANTIC hiện hành.

**Architecture:** Không đổi cấu trúc JSX, không đổi tên field nào trong 2 object `styles` (chỉ đổi giá trị màu bên trong từng field) — mọi chỗ gọi `styles.xxx` trong JSX giữ nguyên, không cần sửa. Test giá trị mới đều là token SEMANTIC (`--ez-*`) đã tồn tại sẵn trong `tokens.css`, xác nhận qua đọc trực tiếp file.

**Tech Stack:** React + TypeScript + Vite, CSS thuần + inline style object (không Tailwind).

## Global Constraints

- KHÔNG đổi logic/props/API của bất kỳ component hay hàm React nào — chỉ đổi giá trị màu bên trong 2 object `styles` đã có sẵn, không đổi tên field, không đổi JSX nào khác.
- KHÔNG đổi test backend (giai đoạn này không đụng backend).
- Sau mỗi task: `cd frontend && npx tsc -b --noEmit` phải sạch trước khi commit.
- Mọi màu mới phải là token SEMANTIC (`--ez-*`) đã tồn tại trong `tokens.css` — không thêm hex mới, không dùng lại tên ALIAS cũ (`--muted`, `--accent`, `--bg`, `--border`, `--text-h`, `--text`, `--surface`, `--surface-strong`, `--danger`, `--danger-bg`, `--shadow`) dù chúng vẫn còn hoạt động đúng — viết thẳng tên `--ez-*` vì đang sửa đúng những dòng này rồi, tiện thể dùng tên hiện hành luôn, không phải việc quét toàn bộ file tìm alias khác.
- 10 trang còn lại trong danh sách học sinh (đã điều tra xác nhận sạch) KHÔNG cần sửa gì — không tạo task cho chúng.

---

### Task 1: Sửa màu hardcode trong `PublishedQuestionSetsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/PublishedQuestionSetsPage.tsx:159-238` (object `styles`)

**Interfaces:**
- Không đổi field nào của object `styles` — chỉ đổi giá trị màu bên trong từng field đã tồn tại. Không có consumer nào khác cần biết gì mới.

- [ ] **Step 1: Thay toàn bộ object `styles`**

Hiện tại (dòng 143-239):

```tsx
const styles = {
  container: {
    padding: '40px',
    maxWidth: '980px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap' as const,
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    color: 'var(--text-h)',
    fontSize: '26px',
  },
  subtitle: {
    margin: '6px 0 0',
    color: 'var(--muted)',
    fontSize: '14px',
  },
  search: {
    minWidth: '260px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 12px',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
  },
  tabs: { display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap' as const },
  tab: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 16px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg)', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer' },
  activeTab: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' },
  redBadge: { minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: '#ef4444', color: '#fff', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  countBadge: { minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: 'rgba(255,255,255,0.2)', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  error: {
    padding: '12px 14px',
    borderRadius: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    color: '#ef4444',
    marginBottom: '16px',
  },
  muted: {
    color: 'var(--muted)',
  },
  empty: {
    padding: '28px',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    backgroundColor: 'var(--bg)',
    color: 'var(--muted)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
  },
  card: {
    padding: '18px',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    backgroundColor: 'var(--bg)',
    boxShadow: 'var(--shadow)',
  },
  cardStatus: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' },
  pendingPill: { color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 800 },
  completedPill: { color: '#16a34a', background: 'rgba(34,197,94,0.1)', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 800 },
  resultBox: { padding: '10px', marginBottom: '12px', borderRadius: '8px', background: 'var(--surface-muted)', color: 'var(--text-h)', fontSize: '13px' },
  cardTitle: {
    margin: '0 0 12px',
    color: 'var(--text-h)',
    fontSize: '17px',
  },
  meta: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    color: 'var(--muted)',
    fontSize: '12px',
    marginBottom: '16px',
  },
  button: {
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
```

Thay bằng (chỉ giá trị màu đổi, mọi field/giá trị không-màu giữ nguyên y hệt):

```tsx
const styles = {
  container: {
    padding: '40px',
    maxWidth: '980px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap' as const,
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    color: 'var(--ez-text)',
    fontSize: '26px',
  },
  subtitle: {
    margin: '6px 0 0',
    color: 'var(--ez-text-muted)',
    fontSize: '14px',
  },
  search: {
    minWidth: '260px',
    border: '1px solid var(--ez-border)',
    borderRadius: '8px',
    padding: '10px 12px',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text)',
  },
  tabs: { display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap' as const },
  tab: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 16px', border: '1px solid var(--ez-border)', borderRadius: '10px', background: 'var(--ez-bg)', color: 'var(--ez-text-muted)', fontWeight: 700, cursor: 'pointer' },
  activeTab: { background: 'var(--ez-primary)', color: 'var(--ez-text-on-brand)', borderColor: 'var(--ez-primary)' },
  redBadge: { minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: 'var(--ez-error)', color: 'var(--ez-text-on-brand)', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  countBadge: { minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: 'rgba(255,255,255,0.2)', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  error: {
    padding: '12px 14px',
    borderRadius: '8px',
    backgroundColor: 'var(--ez-error-subtle)',
    border: '1px solid var(--ez-error-border)',
    color: 'var(--ez-error-text)',
    marginBottom: '16px',
  },
  muted: {
    color: 'var(--ez-text-muted)',
  },
  empty: {
    padding: '28px',
    border: '1px solid var(--ez-border)',
    borderRadius: '12px',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text-muted)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
  },
  card: {
    padding: '18px',
    border: '1px solid var(--ez-border)',
    borderRadius: '12px',
    backgroundColor: 'var(--ez-bg)',
    boxShadow: 'var(--ez-shadow-lg)',
  },
  cardStatus: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' },
  pendingPill: { color: 'var(--ez-error-text)', background: 'var(--ez-error-subtle)', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 800 },
  completedPill: { color: 'var(--ez-success-text)', background: 'var(--ez-success-subtle)', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 800 },
  resultBox: { padding: '10px', marginBottom: '12px', borderRadius: '8px', background: 'var(--ez-surface-muted)', color: 'var(--ez-text)', fontSize: '13px' },
  cardTitle: {
    margin: '0 0 12px',
    color: 'var(--ez-text)',
    fontSize: '17px',
  },
  meta: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    color: 'var(--ez-text-muted)',
    fontSize: '12px',
    marginBottom: '16px',
  },
  button: {
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'var(--ez-primary)',
    color: 'var(--ez-text-on-brand)',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
```

(`countBadge`'s `rgba(255,255,255,0.2)` giữ nguyên — đây là lớp phủ trắng mờ trung tính đặt TRÊN nền `activeTab` đã có màu thương hiệu, không phải màu thương hiệu tự nó, giống các token `--glass-white-*` trung tính đã xác nhận ngoài phạm vi ở Phase 2.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 3: Verify browser**

Đăng nhập vai trò học sinh, mở `/published-questions`. Xác nhận: tab đang chọn chuyển nền xanh bảng đen (không còn xanh dương/tím cũ), badge đỏ số lượng đề vẫn đỏ nhưng đúng tông `--ez-error` (không phải `#ef4444` Tailwind cứng), pill "Đang chờ"/"Đã hoàn thành" đúng đỏ/xanh lá theo token, khối lỗi (nếu có) đúng nền đỏ nhạt viền đỏ. Kiểm tra cả dark mode — các màu phải đổi theo theme (khác với trước khi sửa, khi màu hex cứng không đổi theo theme).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PublishedQuestionSetsPage.tsx
git commit -m "fix: replace hardcoded/legacy-alias colors in PublishedQuestionSetsPage with semantic tokens"
```

---

### Task 2: Sửa màu hardcode trong `AdvancedChatPage.tsx`

**Files:**
- Modify: `frontend/src/pages/AdvancedChatPage.tsx:794-866` (object `styles`)

**Interfaces:**
- Không đổi field nào của object `styles` — chỉ đổi giá trị màu bên trong từng field đã tồn tại.

- [ ] **Step 1: Thay toàn bộ object `styles`**

Hiện tại (dòng 794-866):

```tsx
const styles = {
  page: {
    padding: 0,
    height: '100svh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  workspace: {
    display: 'flex',
    flexDirection: 'row' as const,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  chatArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    height: '100%',
    backgroundColor: 'var(--surface-strong)',
  },
  loadingHistory: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: 'var(--muted)',
  },
  errorAlert: {
    margin: '12px 20px 0',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--danger-bg)',
    color: 'var(--danger)',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  responseStyleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 20px',
    borderTop: '1px solid var(--border)',
    backgroundColor: 'var(--surface)',
  },
  styleLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--muted)',
    textTransform: 'uppercase' as const,
  },
  styleBtn: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  styleBtnActive: {
    backgroundColor: 'var(--accent)',
    color: '#fff',
    borderColor: 'var(--accent)',
  },
};
```

Thay bằng (chỉ giá trị màu đổi, mọi field/giá trị không-màu giữ nguyên y hệt):

```tsx
const styles = {
  page: {
    padding: 0,
    height: '100svh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  workspace: {
    display: 'flex',
    flexDirection: 'row' as const,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  chatArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    height: '100%',
    backgroundColor: 'var(--ez-surface)',
  },
  loadingHistory: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: 'var(--ez-text-muted)',
  },
  errorAlert: {
    margin: '12px 20px 0',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-error-subtle)',
    color: 'var(--ez-error)',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  responseStyleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 20px',
    borderTop: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-surface)',
  },
  styleLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--ez-text-muted)',
    textTransform: 'uppercase' as const,
  },
  styleBtn: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  styleBtnActive: {
    backgroundColor: 'var(--ez-primary)',
    color: 'var(--ez-text-on-brand)',
    borderColor: 'var(--ez-primary)',
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 3: Verify browser**

Đăng nhập vai trò học sinh hoặc giáo viên (route `/chat-advanced` dùng chung 2 vai trò), mở trang Hỏi đáp AI nâng cao. Xác nhận: khu vực chat nền đúng `--ez-surface`, thanh chọn kiểu trả lời — nút đang chọn (`styleBtnActive`) chuyển nền xanh bảng đen với chữ trắng (không còn tím/xanh dương cũ), khối báo lỗi (nếu trigger được, ví dụ ngắt mạng tạm để test) đúng nền đỏ nhạt/chữ đỏ theo token. Kiểm tra dark mode.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AdvancedChatPage.tsx
git commit -m "fix: replace hardcoded/legacy-alias colors in AdvancedChatPage with semantic tokens"
```

---

### Task 3: Verify toàn bộ 12 trang học sinh

**Files:** Không sửa file nào — task thuần verify.

- [ ] **Step 1: Typecheck toàn bộ**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: không lỗi.

- [ ] **Step 2: Grep xác nhận không còn hex/rgba cứng trong 2 file đã sửa**

```bash
cd frontend/src
grep -n "#ef4444\|#16a34a\|rgba(239\|rgba(34,197\|color: '#fff'\|backgroundColor: '#fff'" pages/PublishedQuestionSetsPage.tsx pages/AdvancedChatPage.tsx
```
Expected: không có kết quả nào (0 dòng) ngoại trừ dòng `rgba(255,255,255,0.2)` của `countBadge` (đã xác nhận cố ý giữ nguyên ở Task 1 — nếu grep pattern trên khớp trúng dòng đó thì đó không phải lỗi, chỉ cần xác nhận không có gì khác ngoài dòng này).

- [ ] **Step 3: Verify browser thật ở 2 trang vừa sửa + 3 trang tiêu biểu khác trong 10 trang "đã sạch", cả light/dark mode**

Mở `/published-questions`, `/chat-advanced` (2 trang vừa sửa) và `/dashboard`, `/learning-history`, `/personalization` (3 trang tiêu biểu trong nhóm đã xác nhận sạch, để chắc chắn kết luận "không cần sửa" là đúng thật ngoài đời chứ không chỉ đúng trên code) — cả 2 theme. Xác nhận không còn màu tím/hồng/xanh dương cũ ở bất kỳ đâu trên cả 5 trang, và 2 trang vừa sửa đổi màu đúng theo theme khi bật/tắt dark mode.

Không cần commit ở task này (không sửa file).

---

## Sau khi hoàn thành Phase 4

Chạy lại toàn bộ:

```bash
cd frontend && npx tsc -b --noEmit
```

Sau khi xong, dùng `superpowers:writing-plans` viết plan cho Phase 5 (trang giáo viên, ~15 trang — lưu ý `ContentHistoryPage.tsx` và các trang dùng chung `STUDENT_AND_TEACHER` đã được Phase 4 xử lý, Phase 5 chỉ cần điều tra thêm các trang `TEACHER_ONLY`) khi sẵn sàng — không viết trước trong file này.
