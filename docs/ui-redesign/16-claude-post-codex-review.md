# EzEdu AI — Kiểm tra sau khi Codex/Antigravity tiếp quản (Claude review)

- **Ngày:** 2026-07-29
- **Người thực hiện:** Claude (phiên kiểm tra, không sửa hàng loạt)
- **Nguyên tắc:** không giả định Codex đã làm đúng; mọi kết luận trong báo cáo này đều dựa trên mã nguồn hiện tại, `git diff`, chạy lại lint/build/test thật, và kiểm tra trực tiếp qua trình duyệt — không dựa vào lời tự thuật trong docs 09–15.

---

## 1. Tóm tắt trạng thái project

Sau phiên Claude ban đầu (tài liệu 01–07), một agent khác (tự xưng "Antigravity", thực thi công việc được gọi là "Codex" trong yêu cầu) đã tiếp tục làm việc trên cùng worktree và để lại 7 báo cáo mới (09–15). File `08-antigravity-takeover.md` được nhắc trong yêu cầu kiểm tra **không tồn tại**.

Kết luận sau khi verify độc lập: **phần lớn các tuyên bố trong docs 09–15 là chính xác và có thể tái lập được** (đã tự chạy lại và ra đúng con số họ báo cáo — xem mục 13–17). Tuy nhiên phát hiện được **1 lỗi thật nghiêm trọng chưa được sửa** (quota người dùng không được validate ở endpoint mà UI thật sự gọi — mục 18, mã C1) và một số điểm hoàn thành một phần đã bị mô tả như đã xong hẳn (ví dụ "16/16 trang dùng chung design system" đúng ở tầng state/dialog/table nhưng chưa đúng ở tầng form-control cho mọi trang).

Không phát hiện Codex ghi đè hoặc phá vỡ bất kỳ thay đổi nào của Claude trong phiên trước — mọi fix của Claude (copy hero, `AdminReportsPage` timestamp, xoá field chết ở CMS Hero, xác nhận trước khi Nộp bài/Publish, v.v.) đều còn nguyên trong mã nguồn hiện tại, tích hợp đúng với phần Codex viết thêm xung quanh.

## 2. Báo cáo Git

- `git status --porcelain`: 161 dòng thay đổi (85 modified, 15 deleted trong tracked files, còn lại là file mới `??`).
- `git diff --stat` (tổng, so với baseline commit `b4e06d1`): **100 file, +4156/-10524 dòng** — khớp chính xác với con số Antigravity tự báo trong `15-antigravity-final-handoff.md` §18 ("khoảng 4.1k thêm và 10.5k xóa trên khoảng 100 file").
- File mới lớn xác nhận tồn tại thật: `frontend/playwright.config.ts`, `frontend/e2e/*.spec.ts` (4 file), `frontend/src/components/ui/AdminPrimitives.tsx` (222 dòng, đúng 4 export `DataTable/Pagination/FilterBar/ConfirmDialog` như báo cáo).
- File bị xoá: 15 file trong `frontend/src/pages/landing/` (CtaSection, DemoSection, DiagramSection, FormatsBar, HeroIllustration, HeroSection, LandingFooter, LandingHeader, StepsSection, UploadSection, UploadWidget, WhySection, landing.css, scroll.ts, shared.tsx) — đây là phần landing cũ đã được `LandingSections.tsx` hợp nhất thay thế, khớp với báo cáo. Không phát hiện xoá nhầm file nghiệp vụ.
- Không có file đổi tên phát hiện qua `--name-status` (chỉ M/D, không có R).
- **Dependency mới:** `@playwright/test`, `@axe-core/playwright` (frontend, devDependencies — hợp lý cho mục đích test, không phải runtime). Backend: không có dependency mới ngoài các gói đã khai báo từ trước (`ortools`, `pandas`, `scikit-learn` đã có tên trong `requirements.txt` nhưng **chưa được cài trong `.venv` hiện tại** — xem mục 16, mã C2).
- **API contract:** không phát hiện thay đổi field bắt buộc hoặc xoá endpoint. `AttemptResponse` được bổ sung 2 field optional (`student_name`, `student_email`) — bổ sung không phá vỡ client cũ, đúng như báo cáo.
- **Migration/DB schema:** không phát hiện file migration mới ngoài `backend/scripts/migrations/` đã có sẵn từ trước (không đổi trong diff này theo kiểm tra nhanh).
- **Git hygiene** — xác nhận qua `git ls-files`:
  - Không có `node_modules`, `dist`, `build`, `coverage`, `playwright-report`, `test-results` (trừ 1 dòng `D  test-results/.last-run.json` — deletion đã stage, đúng như báo cáo).
  - Chỉ `backend/.env.example` và `frontend/.env.example` được track — không có `.env` thật nào bị lộ.
  - Không phát hiện file cache/log/temp nào bị track nhầm.

## 3. Những phần Codex làm đúng (đã verify độc lập, không chỉ đọc báo cáo)

| Việc | Cách verify | Kết quả |
|---|---|---|
| `window.confirm`/`window.prompt` đã bị loại bỏ hoàn toàn | `grep -rn "window\.confirm\|window\.prompt"` trên toàn bộ `frontend/src` | 0 kết quả — đúng |
| `AdminPrimitives.tsx` tồn tại với `DataTable`/`Pagination`/`FilterBar`/`ConfirmDialog` | Đọc file trực tiếp | Đúng, 222 dòng, đủ 4 export |
| `DataTable` cuộn ngang trong wrapper riêng, không tràn `body` | Đọc component + xem trực tiếp `/admin/users` | Đúng — `.ez-datatable-wrap` bọc `<table style="min-width:980px">` |
| `AdminDashboardPage.tsx` chuyển từ 0 import `components/ui` sang dùng `Button/Dialog/ErrorState/PageHeader/SectionHeader/SkeletonText/StatTile/Tabs` | Đọc import block trước/sau | Đúng, thay đổi thật, không phải chỉ đổi tên biến |
| Reset quota AI (`AdminAIPage`) giờ có `ConfirmDialog` | Đọc code, xác nhận `import { ConfirmDialog }` + wiring | Đúng — trước đây bắn ngay không xác nhận |
| Feature flag nhạy cảm / setting nhạy cảm có `ConfirmDialog` thay `window.confirm` | Đọc `AdminFeatureFlagsPage.tsx`, `AdminSettingsPage.tsx` | Đúng |
| `ExamGradingPage` không còn raw `student_id`, dùng `attempt.student_name \|\| attempt.student_email` | Đọc code dòng 150 | Đúng |
| `examId` được validate bằng regex 24-hex trước khi gọi API | Đọc code dòng 38 | Đúng |
| Backend `_object_id_or_404` chặn ObjectId sai định dạng, trả 404 thay vì lỗi 500 | Đọc `attempt_service.py`, xác nhận helper được gọi ở mọi entry point (dòng 99,164,194,308,349) | Đúng |
| Backend chặn điểm ghi đè vượt điểm tối đa (422) | Đọc `override_score()` dòng 322-326 | Đúng |
| Backend chặn học sinh xem attempt người khác (`_load_own_attempt`, so `student_id`) | Đọc dòng 163-170 | Đúng |
| Backend chặn giáo viên chấm đề không thuộc sở hữu (403 nếu `exam.owner_id != actor_id` và không phải admin) | Đọc `list_attempts_for_exam`/`override_score` | Đúng |
| Không còn hex màu viết tay trong file `.tsx` (component UI, trang admin, teacher, student) | `grep -rE "#[0-9a-fA-F]{3,8}"` trên các thư mục đó | 0 kết quả — đúng |
| Playwright thật đã cài, có config 6 viewport, có 4 spec file thật | Đọc `playwright.config.ts`, `e2e/*.spec.ts`, `node_modules/@playwright`, cache Chromium | Đúng |
| Backend test: 409 passed, 13 subtests | **Tự chạy lại** `pytest -q` sau khi đồng bộ `.venv` với `requirements.txt` | Khớp chính xác |
| Backend targeted: 26 passed (exam attempt + role guard), 42 passed (+ admin AI + question bank) | Tự chạy lại 2 lệnh pytest có chọn file | Khớp chính xác cả hai con số |
| Playwright: 438 passed trên 6 viewport | **Tự chạy lại** `npm run test:e2e` (mất 7.4 phút) | Khớp chính xác `438 passed (7.4m)` |
| Fixture Playwright chỉ mock API bằng `page.route`, dùng email `*.test`, không chạm backend thật | Đọc `e2e/helpers.ts` | Đúng, minh bạch, tự nhận là "không phải happy-path" |
| Toàn bộ thay đổi của Claude phiên trước (hero copy, `AdminReportsPage` timestamp thật, xoá field chết CMS Hero, dialog xác nhận Nộp bài/Publish, localize log labels) còn nguyên | Grep lại từng đoạn code đã sửa trước đó | Còn nguyên, không bị ghi đè |

## 4. Những phần Codex làm chưa đầy đủ

- **"16/16 trang Admin dùng chung design system"** — đúng ở tầng `PageHeader`/`Dialog`/`ConfirmDialog`/`EmptyState`/`ErrorState`/`DataTable`/`Pagination`, nhưng **chưa đúng ở tầng form-control**: `AdminFeatureFlagsPage.tsx` vẫn dùng `<select>`, `<textarea>`, `<input>` và `<button className="admin-content-btn...">` thay vì `Select/Textarea/Input/Button` của `components/ui`. Tuyên bố trong `09-admin-refactor.md` mô tả đúng những gì đã đổi (không nói "100% mọi form field") nhưng `15-antigravity-final-handoff.md` §2 dùng câu "16/16 trang Admin có shared design system" dễ gây hiểu nhầm là đã đồng bộ hoàn toàn.
- **Danh sách hardcode phía client vẫn còn**: `DANGEROUS_FLAGS` (`AdminFeatureFlagsPage.tsx`) và `DANGEROUS_SETTINGS` (`AdminSettingsPage.tsx`) vẫn là `Set` tĩnh viết tay — cờ/cấu hình nhạy cảm mới thêm ở backend sẽ không tự động được bọc xác nhận cho tới khi ai đó cập nhật thủ công 2 danh sách này. Đây là finding Claude đã ghi ở vòng rà soát trước, chưa được Codex xử lý.
- **`AdminFeatureFlagsPage.tsx`**: trường `allowed_roles` vẫn dùng `<select multiple>` thay vì `ChipGroup` — finding cũ, chưa xử lý.
- **`AdminDashboardPage.tsx`** — 3 issue nhỏ Claude đã ghi ở vòng rà soát trước **vẫn còn nguyên** dù đã refactor cấu trúc lớn xung quanh:
  - Raw JSON dump: `<dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>` (dòng ~780).
  - Raw enum hiển thị thẳng: `<strong>{alert.severity}</strong>` (dòng ~272, ~870) dù file đã có label map cho các chỗ khác.
  - Không nhất quán: badge dùng label đã map cho `source_mode` (dòng 688-703) nhưng caption cùng khối lại in raw `data.meta?.source_mode` (dòng 739).
- **Màu hex trong CSS**: tuyên bố "0 kết quả" quét màu hex đúng cho file `.tsx` nhưng CSS vẫn còn hex — phần lớn là mẫu `var(--token, #hex-fallback)` (chấp nhận được, có ý đồ), nhưng `AdminDashboardPage.css` có 4 chỗ `color: #fff` viết thẳng không qua token (dòng 101, 200, 260, 264) — mức độ nhẹ nhưng là điểm chưa chuẩn hoá triệt để.

## 5. Những phần Codex làm sai hoặc gây regression

**Không phát hiện regression** (không có chức năng cũ nào bị hỏng, không route nào bị đổi/xoá, không API contract nào bị phá). Có **một lỗi thật** không phải regression mới nhưng bị báo cáo sai mức độ hoàn thành — xem mục 18, mã C1 (khoảng trống validate quota chưa từng được vá, không phải Codex làm hỏng cái đang chạy tốt).

## 6. Danh sách trang Admin còn thiếu

Không có trang Admin nào bị thiếu khỏi inventory — đủ 16 route thật trong `App.tsx` đều tồn tại và render (xác nhận qua Playwright + kiểm tra trực tiếp `/admin/dashboard`, `/admin/users`). "Còn thiếu" duy nhất là **chiều sâu hoàn thiện** ở một số trang (xem mục 4), không phải thiếu trang.

## 7. Trạng thái ExamGradingPage

**Hoàn thành và đã kiểm thử.** Toàn bộ chuỗi tuyên bố trong `10-exam-grading-fix.md` đã được verify trực tiếp trong mã nguồn (không chỉ đọc báo cáo):
- Route giữ nguyên `/exams/:examId/grading`, `/take-exam/:examId`.
- `examId` invalid bị chặn ở frontend (regex) **và** backend (`_object_id_or_404` → 404, không phải 500).
- Không còn `student_id` thô hiển thị cho giáo viên; tên/email lấy từ backend lookup thật.
- Ownership: giáo viên chỉ thấy/ghi đè được đề mình sở hữu (403 nếu không); học sinh chỉ xem được attempt của chính mình (403 nếu không).
- Điểm ghi đè bị chặn nếu âm, không phải số, hoặc vượt điểm tối đa của câu (422).
- Backend test targeted 26 passed — tái lập được.

## 8. Trạng thái ConfirmDialog

**Hoàn thành một phần.** Cơ chế xác nhận (`Dialog`/`ConfirmModal`/`ConfirmDialog`) đã thay thế toàn bộ `window.confirm` — xác nhận đúng. Yêu cầu gõ email/`XÓA` cho hành động không thể hoàn tác cũng có thật (`AdminUsersPage.tsx`, đã đọc code). Tuy nhiên:
- Reset quota AI và một số hành động khác giờ có `ConfirmDialog` — đúng.
- **Cập nhật quota người dùng qua `/admin/users/{id}/quota` (trang Người dùng, đường dẫn UI thật sự dùng) không có validate giá trị ở backend** — xem mã C1 mục 18. Có `ConfirmDialog` (lớp UI) nhưng lớp dữ liệu phía sau không chặn giá trị rác. Xác nhận UI không thay thế được validate backend.

## 9. Trạng thái design system

**Hoàn thành một phần.** Token semantic, cascade, spacing, typography, contrast được chuẩn hoá đúng như báo cáo (xác nhận qua đọc `tokens.css` cấu trúc và quét hex trong `.tsx`). Nợ còn lại: form-control ở một số trang Admin vẫn là HTML thuần thay vì primitive design system; vài hex CSS lẻ tẻ (mục 4).

## 10. Trạng thái Playwright

**Hoàn thành và đã kiểm thử — tự tái lập được.** `@playwright/test` + Chromium cài thật, 4 spec file thật (không rỗng), config đúng 6 project/viewport. Chạy `npm run test:e2e` cho kết quả `438 passed (7.4m)` — khớp 100% với báo cáo. Giới hạn tự báo cáo trong `13-playwright-responsive-report.md` là chính xác: bộ test dùng fixture mock 503 cho mọi API nghiệp vụ, không phải bằng chứng happy-path với backend thật.

## 11. Trạng thái sáu viewport

**Hoàn thành và đã kiểm thử.** Cả 6 project Playwright (1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800) đều nằm trong lần chạy 438 passed vừa tái lập.

## 12. Trạng thái accessibility

**Hoàn thành một phần — không tuyên bố đạt WCAG toàn bộ** (đúng theo cách chính báo cáo 14 tự giới hạn). Các assertion tự động (axe, skip link, dialog focus trap, heading) nằm trong 438 test đã pass. Audit thủ công bằng screen reader (VoiceOver/NVDA), zoom 200–400%, forced-colors **chưa được thực hiện** — đúng như tự nhận trong báo cáo, không phải điểm bị giấu.

## 13. Kết quả lint

```
cd frontend && npm run lint
```
**Pass** — không có output, không lỗi.

## 14. Kết quả TypeScript

```
cd frontend && npx tsc -b
```
**Pass** — không có output, không lỗi.

## 15. Kết quả build

```
cd frontend && npm run build
```
**Pass.** Chunk chính `index-*.js` 525.07 kB sau minify (khớp với con số "khoảng 525 kB" trong báo cáo 15). Cảnh báo chunk >500kB là cảnh báo tối ưu, không phải lỗi.

## 16. Kết quả backend test

```
cd backend && .venv/bin/python -m pytest -q
```

**Ban đầu FAIL do môi trường**, không phải do code: `.venv` hiện tại thiếu `pytest`, `ortools`, `pandas`, `scikit-learn` dù cả 4 gói đã có tên trong `requirements.txt`. Đây là dấu hiệu `.venv` chưa được đồng bộ lại sau khi các dependency đó được thêm (mã **C2**, mức Medium — không phải lỗi source, nhưng "hướng dẫn chạy" trong `15-antigravity-final-handoff.md` §16 không đề cập bước `pip install -r requirements.txt` trước khi chạy test, nên người tiếp theo có thể gặp đúng lỗi này).

Sau khi tự chạy `pip install -r requirements.txt` để đồng bộ: **`409 passed, 18 warnings, 13 subtests passed`** — khớp chính xác với con số báo cáo. Test dùng `AsyncMongoMockClient` (mongomock), không chạm database thật.

## 17. Kết quả E2E

`npm run test:e2e`: **`438 passed (7.4m)`** — tự tái lập, khớp chính xác với báo cáo. Không có test nào bị skip hoặc flaky trong lần chạy này.

## 18. Lỗi Critical

Không có lỗi Critical (làm sập app, lộ secret, hoặc phá được ranh giới role) được phát hiện.

## 19. Lỗi High

| Mã | Lỗi | File | Bằng chứng |
|---|---|---|---|
| **C1** | `PATCH /admin/users/{id}/quota` (endpoint mà `AdminUsersPage.tsx` thật sự gọi qua `adminUsersApi.updateQuota`) nhận `current_quota: dict[str, Any]` **không có validate** — không chặn key lạ, giá trị boolean, số âm, hay số khổng lồ. Điều này mâu thuẫn trực tiếp với tuyên bố "Payload quota từ chối key không hỗ trợ, boolean, số âm và giá trị vượt ngưỡng" trong `11-admin-dangerous-actions.md`. Validate `_validated_quota()` có tồn tại thật, nhưng chỉ được gắn vào **một endpoint song song khác** (`/admin/ai/quota/users/{id}`, dùng bởi `AdminAIPage.tsx`) mà trang Người dùng không gọi tới. | `backend/app/schemas/admin_users.py:78-80` (schema không validator) vs `backend/app/schemas/admin_ai.py:22-37,127-134` (có validator) · `frontend/src/api/adminUsersApi.ts:70-71` (endpoint thật được gọi) | Đọc trực tiếp 3 file, đối chiếu đường gọi |

## 20. Lỗi Medium

| Mã | Lỗi | File |
|---|---|---|
| C2 | `.venv` backend chưa đồng bộ với `requirements.txt` (thiếu pytest/ortools/pandas/scikit-learn) — hướng dẫn chạy test trong báo cáo 15 không nhắc bước cài lại | `backend/requirements.txt`, `backend/.venv` |
| C3 | `DANGEROUS_FLAGS`/`DANGEROUS_SETTINGS` là set tĩnh phía client — cờ/cấu hình nhạy cảm mới sẽ không tự có xác nhận | `frontend/src/pages/AdminFeatureFlagsPage.tsx:10-16`, `AdminSettingsPage.tsx:18-` |
| C4 | Raw JSON/enum hiển thị thẳng cho admin ở vài chỗ (JSON dump, `alert.severity`, `source_mode` không nhất quán với badge cùng trang) | `frontend/src/pages/AdminDashboardPage.tsx` dòng ~272, ~739, ~780, ~870 |
| C5 | `allowed_roles` dùng `<select multiple>` thay vì `ChipGroup` | `frontend/src/pages/AdminFeatureFlagsPage.tsx:116-118` |
| C6 | 4 giá trị `color: #fff` viết thẳng, không qua token | `frontend/src/pages/AdminDashboardPage.css:101,200,260,264` |
| C7 | 3 tài khoản `test_algo_*` còn tồn tại trong DB local (2 từ 10/07, 1 từ 28/07 21:21 — trước phiên Antigravity) — không phải do phiên này tạo ra nhưng "xác minh còn 0" trong báo cáo 15 chỉ đúng cho 2 bản ghi họ tự tạo, không đúng cho toàn bộ pattern | DB `users` collection, đã kiểm tra bằng script tạm, không sửa |

## 21. Blocker bên ngoài

- Không có tài khoản/seed data tích hợp cho happy-path E2E thật (upload → generate → grade → mutation Admin) — đúng như 2 báo cáo 13/15 tự nhận, không phải điều bị giấu.
- Audit thủ công screen reader (VoiceOver/NVDA) cần người vận hành thật, không tự động hoá được trong phiên này.

## 22. Danh sách file cần sửa tiếp

1. `backend/app/schemas/admin_users.py` — thêm `field_validator` cho `AdminUserQuotaUpdateRequest.current_quota` (tái dùng `_validated_quota` từ `admin_ai.py`, hoặc hợp nhất 2 endpoint quota thành 1). **Ưu tiên P0 — đây là lỗ hổng input validation thật trên một mutation admin đang hoạt động.**
2. `frontend/src/pages/AdminFeatureFlagsPage.tsx` — chuyển form field sang `Select/Textarea/Input/Button`, `allowed_roles` sang `ChipGroup`, và lấy "dangerous" flag từ metadata backend thay vì `Set` tĩnh.
3. `frontend/src/pages/AdminSettingsPage.tsx` — tương tự, bỏ `DANGEROUS_SETTINGS` tĩnh.
4. `frontend/src/pages/AdminDashboardPage.tsx` — sửa 3 chỗ raw JSON/enum (dòng ~272, ~739, ~780, ~870).
5. `frontend/src/pages/AdminDashboardPage.css` — đổi 4 chỗ `#fff` sang token màu chữ trên nền primary/tối.
6. `backend/requirements.txt` / tài liệu chạy — ghi rõ bước `pip install -r requirements.txt` trước khi chạy test, để tránh lặp lại lỗi môi trường đã gặp ở mục 16.
7. (Tuỳ chọn, không khẩn) dọn 3 tài khoản `test_algo_*` còn sót trong DB local.

## 23. Kế hoạch tiếp tục theo thứ tự ưu tiên

1. **P0 — vá lỗ hổng validate quota (C1)** trước khi tuyên bố khu vực Admin an toàn để dùng.
2. **P1 — hoàn thiện tầng form-control** cho `AdminFeatureFlagsPage`/`AdminSettingsPage` để tuyên bố "16/16 trang dùng chung design system" đúng nghĩa đen.
3. **P1 — dọn 4 finding nhỏ còn sót** ở `AdminDashboardPage` (mục C4, C6).
4. **P2 — driven-by-metadata cho danh sách "dangerous"** (C3) thay vì set tĩnh.
5. **P2 — happy-path E2E thật** với môi trường test cô lập + seed data (đã được đề xuất sẵn trong báo cáo 15 §19, vẫn còn giá trị).
6. **P3 — audit thủ công accessibility** (screen reader, zoom, forced-colors) khi có nhân lực.

---

## Bảng tổng hợp

| Mã | Hạng mục | Trạng thái | Bằng chứng | File liên quan | Việc cần làm |
|---|---|---|---|---|---|
| A1 | Admin — 16 route render | Hoàn thành và đã kiểm thử | Playwright 438 passed + kiểm tra trực tiếp `/admin/dashboard`, `/admin/users` | `App.tsx` | Không |
| A2 | Admin — dùng chung state/dialog/table component | Hoàn thành và đã kiểm thử | Đọc import + Playwright | `AdminDashboardPage.tsx`, `AdminPrimitives.tsx` | Không |
| A3 | Admin — dùng chung form-control (Input/Select/Textarea/Button) | Hoàn thành một phần | Đọc `AdminFeatureFlagsPage.tsx` còn HTML thuần | Nhiều trang Admin | Việc #2, #3 |
| B1 | ExamGradingPage — ID thật, không hard-code | Hoàn thành và đã kiểm thử | Đọc code + 26 test pass | `ExamGradingPage.tsx`, `attempt_service.py` | Không |
| B2 | ExamGradingPage — ownership/role guard | Hoàn thành và đã kiểm thử | Đọc code + test | `attempt_service.py` | Không |
| C1 | Quota — xác nhận UI | Hoàn thành và đã kiểm thử | Đọc `ConfirmDialog` wiring | `AdminAIPage.tsx` | Không |
| C2 | Quota — validate backend (đường UI Người dùng thật dùng) | **Đang lỗi** | Đọc schema, đối chiếu endpoint thật | `admin_users.py`, `adminUsersApi.ts` | Việc #1 (P0) |
| D1 | Design system — token/màu | Hoàn thành một phần | Grep hex `.tsx`=0, CSS còn vài chỗ | `tokens.css`, `AdminDashboardPage.css` | Việc #5 |
| E1 | Playwright — cài đặt và cấu hình | Hoàn thành và đã kiểm thử | Chạy lại, 438 passed | `playwright.config.ts`, `e2e/` | Không |
| E2 | Sáu viewport | Hoàn thành và đã kiểm thử | Nằm trong 438 passed | `playwright.config.ts` | Không |
| F1 | Accessibility tự động (axe) | Hoàn thành và đã kiểm thử | Trong 438 passed | `e2e/accessibility.spec.ts` | Không |
| F2 | Accessibility thủ công (screen reader) | Chưa thực hiện | Tự nhận trong báo cáo 14 | — | Việc P3 |
| G1 | Lint | Hoàn thành và đã kiểm thử | `npm run lint` sạch | — | Không |
| G2 | TypeScript | Hoàn thành và đã kiểm thử | `tsc -b` sạch | — | Không |
| G3 | Build | Hoàn thành và đã kiểm thử | `npm run build` pass, 525kB | — | Không |
| G4 | Backend test | Hoàn thành và đã kiểm thử (sau khi đồng bộ `.venv`) | 409 passed tái lập | `backend/tests/` | Việc #6 |
| G5 | E2E test | Hoàn thành và đã kiểm thử | 438 passed tái lập | `frontend/e2e/` | Không |
| H1 | Git hygiene | Hoàn thành và đã kiểm thử | `git ls-files` sạch | — | Không |
| H2 | Dữ liệu QA còn sót trong DB local | Hoàn thành một phần | 3 tài khoản `test_algo_*` còn tồn tại | DB `users` | Việc #7 (tuỳ chọn) |
