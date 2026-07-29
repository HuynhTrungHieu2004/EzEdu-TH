# EzEdu AI — Hoàn thiện sau kiểm tra Codex (Claude, vòng sửa lỗi)

- **Ngày:** 2026-07-29
- **Dựa trên:** `16-claude-post-codex-review.md`
- **Nguyên tắc:** chỉ sửa đúng phạm vi báo cáo 16 đã liệt kê; không viết lại giao diện, không thay thế phần Codex đã làm đúng, không mở rộng chức năng, không sửa backend không liên quan.

---

## 1. Những lỗi Codex để lại đã sửa

| Mã | Lỗi | Sửa |
|---|---|---|
| **C1 (High)** | `PATCH /admin/users/{id}/quota` — endpoint mà `AdminUsersPage.tsx` thật sự gọi — không validate `current_quota` (chấp nhận key lạ, boolean, âm, vượt ngưỡng), trái với tuyên bố đã validate | Thêm `field_validator` tái dùng `validated_quota()` (đổi tên public từ `_validated_quota` trong `admin_ai.py`) vào `AdminUserQuotaUpdateRequest`. Thêm 2 test hồi quy |
| **C4 (Medium)** | `AdminDashboardPage.tsx`: raw `alert.severity` hiển thị thẳng (2 chỗ), raw `source_mode` không khớp badge cùng trang, JSON lồng nhau in ra một chuỗi không format | Dùng lại `ERROR_SEVERITY_LABELS` cho severity; đồng bộ label "Live"/"Mock" giữa badge và caption; JSON hiển thị qua `<pre>` có format, cuộn riêng |
| **C6 (Medium)** | 4 chỗ `color: #fff` viết tay trong `AdminDashboardPage.css`, không qua token | Đổi sang `var(--ez-text-on-brand)` — đúng token dự án đã dùng cho text trên nút nền màu bão hoà (primary/danger) ở `components/ui/ui.css` |
| **C3 (Medium, một phần)** | `AdminFeatureFlagsPage.tsx`/`AdminSettingsPage.tsx` chưa dùng form-control của design system (`<select>`/`<textarea>`/`<input>`/`<button>` thuần) | Chuyển sang `Card`/`FormField`/`Select`/`Textarea`/`Input`/`Button`; `allowed_roles` đổi từ `<select multiple>` sang `ChipGroup`/`Chip` |
| **C7 (Low, tuỳ chọn)** | 3 tài khoản `test_algo_*` còn sót trong DB dev local (từ 10/07 và 28/07, trước phiên Codex) | Đã xoá bằng script tạm, xác nhận còn 0 |
| **C2 (Low, môi trường)** | `.venv` backend thiếu `pytest`/`ortools`/`pandas`/`scikit-learn` dù đã khai trong `requirements.txt` | Đã `pip install -r requirements.txt` để đồng bộ; ghi rõ bước này vào mục 20 bên dưới để không lặp lại |

**Không sửa** (nằm ngoài phạm vi một lượt vá lỗi, đã ghi rõ trong báo cáo 16 và giữ nguyên):
- `DANGEROUS_FLAGS`/`DANGEROUS_SETTINGS` vẫn là set tĩnh phía client (cần đổi thiết kế dữ liệu backend để làm đúng — vượt phạm vi "sửa lỗi UI").
- Việc đồng bộ 100% form-control cho các trang Admin còn lại ngoài 2 trang trên (không nằm trong danh sách lỗi cụ thể của báo cáo 16).

## 2. Những phần giữ nguyên vì Codex làm đúng

Không đổi (đã verify lại, vẫn đúng): 16 route Admin render qua `AppLayout`/`AdminRoute`; `AdminPrimitives.tsx` (`DataTable`/`Pagination`/`FilterBar`/`ConfirmDialog`); toàn bộ luồng `ExamGradingPage` (ID thật, ownership, validate điểm); `window.confirm`/`window.prompt` đã loại bỏ; Playwright + 6 viewport; cấu hình accessibility tự động; toàn bộ 409 backend test gốc; các fix của Claude ở phiên trước (hero copy, `AdminReportsPage` timestamp thật, xoá field chết CMS Hero, dialog xác nhận Nộp bài/Publish).

## 3. Trang đã hoàn thành

Toàn bộ route Public/Teacher/Student/Admin (đủ danh sách trong `15-antigravity-final-handoff.md` §"Route inventory cuối") vẫn render đúng sau các fix này — xác nhận qua Playwright 438 passed chạy lại lần 2.

## 4. Trang chưa hoàn thành

Không có trang nào "chưa hoàn thành" theo nghĩa route/chức năng. Còn "chưa tối ưu hoàn toàn": các trang Admin khác ngoài `AdminFeatureFlagsPage`/`AdminSettingsPage` vẫn có CSS riêng (`admin-content-*`) thay vì 100% component `components/ui/` — đây là nợ kỹ thuật đã ghi nhận từ báo cáo 16, không phải lỗi chức năng, không nằm trong phạm vi lỗi cụ thể được yêu cầu sửa lần này.

## 5. ExamGradingPage

Không có gì để sửa — báo cáo 16 đã xác nhận toàn bộ đạt yêu cầu (ID thật từ route/attempt, validate ObjectId, ownership 2 chiều, chặn điểm vượt ngưỡng, 403/404/error tách biệt). Đã re-verify lần nữa trong lượt này (không đổi code), xem cập nhật ở `10-exam-grading-fix.md`.

## 6. Confirmation

Cơ chế `Dialog`/`ConfirmDialog`/`ConfirmModal` giữ nguyên như Codex đã làm — xác nhận có mô tả hậu quả, gõ email/"XÓA" cho hành động không thể hoàn tác, khoá nút khi đang xử lý, không đóng khi busy. Lỗ hổng thật sự nằm ở **tầng validate dữ liệu phía sau xác nhận** (C1), không phải ở bản thân dialog — đã vá.

## 7. Admin UI

`AdminFeatureFlagsPage.tsx` và `AdminSettingsPage.tsx` nay dùng cùng bộ component với các trang Admin khác (`Card`, `FormField`, `Select`, `Input`, `Textarea`, `Button`, `ChipGroup`/`Chip`, `SectionHeader`). Không đổi API, không đổi endpoint gọi, không đổi hành vi nghiệp vụ (feature flag/setting vẫn lưu đúng field, vẫn yêu cầu lý do, vẫn qua `ConfirmDialog` cho mục nhạy cảm).

## 8. Design system

`AdminDashboardPage.tsx`/`.css`: hết raw JSON/enum ở 3 vị trí đã biết, hết hex viết tay. Toàn bộ `.tsx` trong `components/ui/`, trang Admin, teacher, student vẫn 0 kết quả khi grep hex trực tiếp.

## 9. Playwright

Chạy lại `npm run test:e2e` sau khi sửa xong toàn bộ: **`438 passed (7.1m)`** — không có test nào fail hoặc mới xuất hiện, không có regression từ các thay đổi.

## 10. Sáu viewport

Cả 6 viewport (1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800) nằm trong lần chạy 438 passed vừa nêu. Ngoài ra tự kiểm tra bằng tay `AdminFeatureFlagsPage`/`AdminSettingsPage` ở viewport mobile 375×812 — không tràn ngang, bottom nav hiển thị đúng.

## 11. Accessibility

Thành phần mới dùng trong 2 trang migrate (`ChipGroup`/`Chip`) đã có `aria-pressed` và render bằng `<button>` thật, tương thích bàn phím sẵn — không cần thêm ARIA thủ công. Không có thay đổi accessibility nào khác. Audit thủ công screen reader vẫn **chưa thực hiện** (không nằm trong phạm vi lỗi cụ thể của báo cáo 16).

## 12. Lint

```
cd frontend && npm run lint
```
**Pass** — chạy sau mỗi nhóm sửa (3 lần), luôn sạch.

## 13. TypeScript

```
cd frontend && npx tsc -b
```
**Pass** — chạy sau mỗi nhóm sửa, luôn sạch.

## 14. Build

```
cd frontend && npm run build
```
**Pass.** Chunk chính vẫn 525.07 kB — không đổi so với trước khi sửa (các thay đổi không ảnh hưởng kích thước bundle đáng kể).

## 15. Backend test

```
cd backend && .venv/bin/python -m pytest -q
```
**411 passed, 18 warnings, 13 subtests passed** (409 gốc + 2 test hồi quy mới cho C1). Chạy riêng `test_admin_users.py` (12 passed) và `test_admin_ai.py` (5 passed) để xác nhận việc đổi tên `_validated_quota` → `validated_quota` không phá endpoint AI.

## 16. E2E

`npm run test:e2e`: **438 passed** — chạy lại 2 lần (trước và sau khi sửa toàn bộ), cùng kết quả, không regression.

## 17. Lỗi còn lại

- `DANGEROUS_FLAGS`/`DANGEROUS_SETTINGS` vẫn là set tĩnh phía client (C3, phần chưa xử lý — cần backend cấp metadata "nhạy cảm" cho từng flag/setting để làm đúng, ngoài phạm vi vá lỗi UI).
- Các trang Admin khác (Users/Documents/Questions/Exams/AI/WebsiteContent/Reports/ActivityLogs/AuditLogs) vẫn dùng CSS riêng thay vì 100% component `components/ui/` — nợ kỹ thuật đã ghi nhận, không phải lỗi chức năng.
- Audit accessibility thủ công (VoiceOver/NVDA, zoom, forced-colors) chưa thực hiện.
- Happy-path E2E với backend thật (không phải fixture mock) chưa có — cần môi trường test cô lập + seed data.

## 18. Blocker bên ngoài

Không có blocker mới. Blocker cũ (thiếu môi trường test tích hợp cho happy-path E2E, thiếu audit screen reader thủ công) vẫn còn, không phải do phiên này gây ra hay có thể giải quyết trong phạm vi vá lỗi.

## 19. File thay đổi nhiều nhất (trong lượt sửa lỗi này)

```
frontend/src/pages/AdminFeatureFlagsPage.tsx    (sửa — form-control → design system, ChipGroup cho roles)
frontend/src/pages/AdminSettingsPage.tsx        (sửa — form-control → design system)
frontend/src/pages/AdminDashboardPage.tsx       (sửa — 3 chỗ raw JSON/enum)
frontend/src/pages/AdminDashboardPage.css       (sửa — 4 chỗ hex → token, thêm .health-detail-json)
backend/app/schemas/admin_ai.py                 (sửa — đổi tên _validated_quota → validated_quota, public)
backend/app/schemas/admin_users.py              (sửa — thêm field_validator cho current_quota)
backend/tests/test_admin_users.py               (sửa — thêm 2 test hồi quy quota)
docs/ui-redesign/09-admin-refactor.md           (cập nhật)
docs/ui-redesign/10-exam-grading-fix.md         (cập nhật)
docs/ui-redesign/11-admin-dangerous-actions.md  (cập nhật)
docs/ui-redesign/13-playwright-responsive-report.md (cập nhật)
docs/ui-redesign/14-accessibility-report.md     (cập nhật)
docs/ui-redesign/16-claude-post-codex-review.md (đã có từ trước, không đổi)
docs/ui-redesign/17-claude-final-completion.md  (mới, file này)
```

Không có file source bị xoá để giảm diff. Không có file mới ngoài báo cáo 17.

## 20. Hướng dẫn chạy

Frontend:
```bash
cd frontend
npm ci
npm run dev
```

Backend — **quan trọng: đồng bộ `.venv` trước khi chạy**, vì `requirements.txt` có vài gói (`ortools`, `pandas`, `scikit-learn`, và `pytest` cho test) có thể chưa được cài trong virtualenv có sẵn:
```bash
cd backend
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload
```

## 21. Hướng dẫn test

```bash
cd frontend
npm run lint
npx tsc -b
npm run build
npx playwright install chromium   # nếu chưa cài
npm run test:e2e
```

```bash
cd backend
.venv/bin/pip install -r requirements.txt   # bắt buộc nếu chưa đồng bộ — xem mục 20
.venv/bin/python -m pytest -q
```

Không dùng `.env` thật, token, hoặc API key thật trong bất kỳ lệnh nào ở trên.

## 22. Hướng dẫn rollback thủ công

Không dùng `git reset`/`git clean`/`git checkout .` (worktree có thay đổi của nhiều phiên, chưa tách commit riêng). Nếu cần hoàn tác riêng lượt sửa lỗi này:

1. Xác định đúng hunk bằng `git diff -- <đường dẫn cụ thể>` cho từng file trong mục 19.
2. Hoàn tác thủ công từng thay đổi theo mô tả ở mục 1 (ví dụ: bỏ `field_validator` mới thêm ở `admin_users.py` để quay lại hành vi không validate — **không khuyến khích**, vì đó chính là lỗ hổng C1 vừa vá).
3. Chạy lại lint/build/test sau khi hoàn tác để xác nhận trạng thái mong muốn.

## 23. Đề xuất bước tiếp theo

1. Nếu muốn đóng nốt C3: thiết kế trường "nhạy cảm" ở backend cho feature flag/setting (ví dụ thêm `is_sensitive: bool` vào `FeatureFlagItem`/`SystemSettingItem`), thay cho set tĩnh phía client — đây là thay đổi contract nhỏ, cần xác nhận riêng trước khi làm vì báo cáo lần này giới hạn "không đổi API contract".
2. Đồng bộ nốt các trang Admin còn lại sang 100% component `components/ui/` nếu muốn "16/16 trang dùng chung design system" đúng nghĩa đen ở mọi tầng.
3. Dựng môi trường test tích hợp (tài khoản + seed data cô lập) để chạy happy-path E2E thật, thay vì chỉ dùng fixture mock 503.
4. Audit accessibility thủ công (VoiceOver/NVDA, zoom 200–400%, forced-colors) khi có nhân lực.

---

## Điều kiện tuyên bố hoàn thành — đối chiếu

| Điều kiện | Đạt? |
|---|---|
| TypeScript check pass | ✅ |
| Build pass | ✅ |
| Không còn lỗi Critical | ✅ (không có từ đầu) |
| Không còn lỗi High ảnh hưởng luồng chính | ✅ (C1 đã vá) |
| Route chính mở được | ✅ (438 Playwright pass) |
| Không còn ID thử | ✅ (đã đúng từ trước, re-verify) |
| Không có secret trong Git | ✅ (chỉ `.env.example` tracked) |
| Không có file sinh tự động bị tracking | ✅ (`git ls-files` sạch) |
| Báo cáo 17 đã tạo | ✅ (file này) |
