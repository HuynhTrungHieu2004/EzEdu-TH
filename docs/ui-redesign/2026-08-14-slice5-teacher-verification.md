# Lát 5 — Không gian làm việc của giáo viên (2026-08-14)

Bước 5 trong lộ trình `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10,
tiếp sau lát 4 (`2026-08-14-slice4-exam-verification.md`).

Vấn đề spec §3 nhắm tới ở lát này: "các trang giống nhau có filter, table, empty state và loading khác nhau".

## Đã làm

- **Kho học liệu dùng lại primitive dùng chung.** `DocumentsPage` trước đây tự dựng bảng bằng CSS legacy
  (`.table-card`, `.data-table`, `.tag`, `.btn-secondary`), tự map màu trạng thái bằng biến hệ cũ
  (`--accent-2-bg`, `--danger-bg`) và không có cách nào lọc. Nay dùng `PageHeader`, `FilterBar`, `DataTable`,
  `EmptyState`, `ErrorState`, `SkeletonText`, `Button` — cùng bộ với các trang admin và ngân hàng câu hỏi.
  Trạng thái xử lý dùng `ProcessingStatusBadge` chung nên không còn hiện mã kỹ thuật (`index_failed`).
- **Có lọc thật.** Tìm theo tên + lọc theo nhóm trạng thái (sẵn sàng / đang xử lý / không thành công),
  kèm dòng "n/m học liệu" (`aria-live`) và trạng thái rỗng riêng cho "không khớp bộ lọc" có nút xoá bộ lọc.
- **Bỏ nút "Quay lại Dashboard".** Điều hướng đã có ở sidebar; nút này là điều hướng trùng lặp.
- **Ngân hàng câu hỏi dùng `FilterBar`** thay cho grid inline riêng, và ba bộ lọc giờ có nhãn hiển thị
  (`FormField`) thay vì chỉ `aria-label`.
- **Dashboard giáo viên có chuyển động như dashboard học sinh**: hành động nhanh và stat tile vào theo
  stagger, số liệu đếm lên bằng `AnimatedCounter`.

Không thêm primitive mới: `DataTable`/`FilterBar`/`Pagination` đã có sẵn trong `components/ui/AdminPrimitives.tsx`
(trước đó chỉ khu admin dùng) nên lát này dùng lại đúng chúng.

## Sửa lỗi tương phản (do lát này phát hiện)

| Chỗ sửa | Trước | Sau | Lý do |
| --- | --- | --- | --- |
| `.ez-datatable th` | `--ez-text-muted` | `--ez-text-secondary` | 4.34:1 trên `--ez-surface-muted`, chưa đủ AA. Áp dụng cho **mọi** bảng gồm cả khu admin |

Thêm `.ez-filter-summary` vào `ui.css` để dòng "số kết quả sau khi lọc" dùng chung một kiểu.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run build` | PASS (vẫn cảnh báo chunk > 500 kB) |
| `npm run test:foundation` | PASS — 330/330 trên 6 project viewport (đã thêm `e2e/teacher-workspace.spec.ts`) |
| `npx playwright test e2e/authenticated-responsive.spec.ts` | PASS — 300/300 |
| `npm run test:chat` | PASS — 11/11 |

`e2e/teacher-workspace.spec.ts` khoá: bảng dùng chung render đủ dòng và trạng thái đọc được, trang không
tràn ngang; lọc theo tên và theo trạng thái; trạng thái rỗng khi chưa có học liệu và khi không khớp bộ lọc;
`ErrorState` có nút thử lại khi API lỗi; axe A/AA sạch; dashboard giáo viên đếm đúng số liệu và không giữ
transform sau khi chạy.

Một test cũ phải sửa mục tiêu: `design-foundation.spec.ts` → "reduced motion disables legacy page entrance"
trước đây trỏ vào `[data-page-entrance] .page` trên `/documents`; trang này đã bỏ wrapper legacy `.page`
nên bài kiểm chuyển sang `/teacher/content-history` (route còn dùng `.page`, nơi `animation: fadeSlideUp`
legacy vẫn tồn tại). Ý định của bài kiểm giữ nguyên.

## Nợ còn lại

- Các trang giáo viên chưa di trú: `QuestionHistoryPage` (819 dòng), `ExamBlueprintDetailPage` (829 dòng),
  `QuestionSetEditorPage` (757 dòng), `ClassesPage`/`ClassDetailPage`, `WebKnowledgePage`. Chúng vẫn dùng
  `.dash-row`/`.ez-list` hoặc markup riêng; nên đi từng trang một lát nhỏ thay vì gộp.
- `FileUpload` vẫn theo tạo hình cũ (khối kéo–thả lớn, nút chính nhìn như đang bị vô hiệu). Chưa sửa ở lát này.
- `CurriculumKbPage` bị bỏ ngoài phạm vi vì đang có thay đổi chưa commit của phần crawler chương trình học.
- Nợ từ các lát trước còn nguyên: `e2e/public-responsive.spec.ts` fail vì origin Google client ID,
  mật độ `KnowledgeScopeSelector` trên mobile, `ProcessTimeline`, `PathnameNavigationEpoch`.

## Hoãn sang lát sau

- Lát 6: khu quản trị.
- Lát 7: landing, login/register, onboarding.
- Lát 8: xoá CSS legacy trong `src/index.css` — lát này đã bớt được các consumer `.table-card`/`.data-table`
  của kho học liệu, cần rà tiếp trước khi xoá.
