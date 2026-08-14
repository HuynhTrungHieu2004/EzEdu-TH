# Lát 6 — Khu quản trị (2026-08-14)

Bước 6 trong lộ trình `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10,
tiếp sau lát 5 (`2026-08-14-slice5-teacher-verification.md`).

## Kết quả rà soát trước khi sửa

Rà toàn bộ 13 route quản trị bằng axe + đo tràn ngang, ở cả hai đường: khi API không khả dụng và khi có
dữ liệu thật (fixture dựng theo đúng type trong `src/types/`):

- Không route nào có vi phạm axe A/AA, không route nào tràn ngang.
- Tất cả đã dùng `PageHeader`, `FilterBar`, `DataTable`, `Pagination`, `EmptyState`/`ErrorState` dùng chung —
  đợt refactor quản trị trước (`09-admin-refactor.md`) đã làm phần này.

Nói cách khác, khu quản trị **không** còn nợ hình thức như lát 5. Vấn đề tìm được là ở độ bền.

## Lỗi thật tìm được và đã sửa

**Một lỗi render làm trắng toàn bộ ứng dụng.** App không có error boundary nào. Khi backend trả thiếu field
(`by_action`/`by_target_type` trong thống kê nhật ký quản trị), `Object.keys(undefined)` ném lỗi và React gỡ
bỏ toàn bộ cây: `#main` rỗng, mất luôn sidebar, người dùng không còn đường nào ngoài bấm tải lại trình duyệt.
Đo được bằng probe: `{"h1": null, "mainEmpty": true, "errors": ["Cannot convert undefined or null to object"]}`.

Đã sửa hai tầng:

1. `src/components/RouteErrorBoundary.tsx` bọc nội dung route trong `AppLayout`. Lỗi render của một trang giờ
   chỉ thay phần nội dung bằng `ErrorState`; sidebar, topbar và điều hướng vẫn dùng được, và `resetKey` theo
   `location.pathname` nên chuyển sang trang khác là render lại bình thường.
2. Vá các chỗ đọc map có thể thiếu: `stats.by_action ?? {}`, `stats.by_target_type ?? {}`
   (`AdminAuditLogsPage`), `data.negative_reasons ?? {}`, `data.errors ?? {}` (`AdminDashboardPage`),
   `roleDefaults ?? {}` (`AdminAIPage`) — để trang vẫn đọc được chứ không chỉ "không trắng màn hình".

## Đã làm thêm

- **Dashboard quản trị có chuyển động như hai dashboard kia**: một `StaggerGroup` đặt trong `Panel` phủ mọi
  panel (selector `.stat-card`), và các ô đếm số nguyên dùng `AnimatedCounter` với định dạng `vi-VN`.
- **Bộ kiểm thử quản trị đầu tiên có dữ liệu.** Trước đây chỉ có một bài axe cho `/admin/users` ở trạng thái
  API không khả dụng.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run build` | PASS (vẫn cảnh báo chunk > 500 kB) |
| `npm run test:foundation` | PASS — 396/396 trên 6 project viewport (đã thêm `e2e/admin-workspace.spec.ts`) |
| `npx playwright test e2e/authenticated-responsive.spec.ts` | PASS — 300/300 |
| `npm run test:chat` | PASS — 11/11 |

`e2e/admin-workspace.spec.ts` khoá: sáu trang danh sách (`users`, `documents`, `questions`, `exams`,
`activity-logs`, `audit-logs`) render bảng + thanh lọc + phân trang dùng chung, có dữ liệu thật và không tràn
ngang; axe A/AA sạch trên `/admin/users` và `/admin/audit-logs` khi **có dữ liệu**; backend trả thiếu field
thống kê thì trang vẫn đọc được; lỗi render một trang không làm trắng khung và vẫn điều hướng sang trang khác
được; dashboard quản trị đếm đúng số liệu và không giữ transform.

## Ghi chú khi viết fixture

- Playwright ưu tiên route đăng ký **sau**, nên `**/admin/audit-logs/statistics**` phải đăng ký sau
  `**/admin/audit-logs**`, nếu không route bao trùm nuốt mất request thống kê.
- `_safe_ratio` của backend trả phần trăm 0–100 (không phải tỉ lệ 0–1); fixture dùng sai đơn vị sẽ ra
  "0.9%" thay vì "91.7%".

## Nợ còn lại

- `RouteErrorBoundary` mới chỉ bọc khung sau đăng nhập. Trang công khai (landing, login, register) chưa có —
  thuộc lát 7.
- Các trang giáo viên chưa di trú (`QuestionHistoryPage`, `ExamBlueprintDetailPage`, `QuestionSetEditorPage`,
  `ClassesPage`/`ClassDetailPage`, `WebKnowledgePage`) và `FileUpload` vẫn theo tạo hình cũ.
- Nợ từ các lát trước: `e2e/public-responsive.spec.ts` fail vì origin Google client ID, mật độ
  `KnowledgeScopeSelector` trên mobile, `ProcessTimeline`, `PathnameNavigationEpoch`.

## Hoãn sang lát sau

- Lát 7: landing, login/register, onboarding.
- Lát 8: xoá CSS legacy trong `src/index.css`.
