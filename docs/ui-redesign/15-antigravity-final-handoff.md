# EzEdu AI — Final QA và bàn giao Antigravity

- Ngày: 2026-07-29
- Workspace: `chuyende-thunghiem-1`
- Trạng thái: hoàn tất phạm vi refactor và QA có thể thực hiện an toàn tại local

## 1. Tổng quan

Đã tiếp quản trên worktree có sẵn, không làm lại từ đầu và không reset thay đổi của agent trước. Prompt Admin được xác minh mới hoàn thành nhóm Users, sau đó được hoàn tất cho toàn bộ 16 route Admin. Các giai đoạn ExamGrading, confirmation nguy hiểm, design consistency, Playwright responsive, accessibility và QA cuối đều có báo cáo riêng.

Không đổi route nghiệp vụ hiện có, không tạo trang/button giả, không dùng production database và không đẩy Git.

## 2. Trang hoàn thành

- 8 route public, 23 route Student/Teacher dùng chung hoặc riêng, 16 route Admin và fallback 404 đều render.
- Route tương thích `/student-statistics` redirect đúng sang `/learning-history`.
- 16/16 trang Admin có shared design system, loading/empty/error/permission state phù hợp và container responsive.
- Teacher ExamGrading dùng ID thật từ route/attempt, không còn ID thử hoặc raw student ID.

## 3. Trang mới áp dụng layout chung

Trong giai đoạn tiếp quản này, toàn bộ Admin được đưa về `AppLayout` và các primitive chung. Nhóm Users đã có nền tảng từ agent trước; các nhóm Dashboard, Content, AI, Website, Settings/Feature flags/Notifications, Reports và Activity/Audit logs được hoàn thiện tiếp.

Các trang Public, Teacher và Student đã nằm trong thay đổi lớn có sẵn của worktree; QA lần này xác minh route/layout của chúng thay vì viết lại.

## 4. Trang chưa hoàn thành

Không còn trang giả hoặc route chưa render trong inventory hiện tại. Phần chưa thể tuyên bố hoàn tất là happy-path browser E2E với backend thật cho upload, sinh câu hỏi, chat, làm/nộp bài, chấm bài và mutation Admin, vì workspace không cung cấp test account/seed data tích hợp.

Một số CSS legacy vẫn tồn tại ở trang Teacher/Student. Chúng đã dùng token alias và không phá build/responsive, nhưng chưa được di trú 100% sang primitive mới.

## 5. Component dùng chung

- Layout/guard: `AppLayout`, `PublicLayout`, `AuthProvider`, `RoleRoute`, `AdminRoute`.
- UI: `Button`, `Input`, `Textarea`, `FormField`, `Card`, `Badge`, `Alert`, `Tabs`, `Toast`.
- State: `Skeleton`, `SkeletonText`, `EmptyState`, `ErrorState`, `PermissionDeniedState`.
- Data/Admin: `DataTable`, `FilterBar`, `Pagination`, `PageHeader`, `SectionHeader`, `StatTile`.
- Overlay: `Dialog`, `ConfirmDialog`, `Drawer`, `Dropdown`.
- Domain: processing/status components và `AdminContentShared` adapter.

## 6. Design token

`frontend/src/styles/tokens.css` là nguồn sự thật. Semantic token gồm primary/hover/active, secondary, accent, background, surface/muted, border, text primary/secondary, success, warning, danger, info và focus ring. Cascade đã được sửa để token không bị legacy CSS ghi đè. Font, spacing 4px, radius, shadow, touch target, z-index, motion và dark theme dùng chung.

## 7. ExamGradingPage

- Route giữ nguyên `/exams/:examId/grading`.
- `examId` được validate trước request.
- Attempt được chọn bằng `attempt.id`; override dùng `attempt.id + question_id`.
- Backend xác minh teacher ownership/Admin role hiện có, student ownership và exam-attempt relationship.
- Điểm rỗng, âm, không phải số hoặc vượt điểm tối đa bị từ chối; backend tự tính tổng.
- 403/404/error là các state riêng; tên/email học sinh do backend lookup.
- Targeted backend: 26 test pass; full backend suite cũng pass.

## 8. Confirmation nguy hiểm

Đã bảo vệ xóa user/học liệu/câu hỏi/lớp, reset quota/config, đổi role, re-index, bulk/regenerate/archive và các action AI tốn quota. Dialog nêu đối tượng/phạm vi/hậu quả/khả năng hoàn tác, yêu cầu lý do hoặc cụm xác nhận ở action nghiêm trọng, khóa double-click và không đóng khi busy. Backend tiếp tục áp RBAC, ownership, validation, quota/batch limit; không tin trạng thái nút frontend.

## 9. Playwright

- `@playwright/test` và Chromium cục bộ.
- API fixture xác định chỉ dùng cho identity, route guard và unavailable state; không được tính là happy-path backend.
- Screenshot only-on-failure; video/trace retain-on-failure.
- Kiểm tra route, refresh/redirect, overflow, ảnh hỏng, console/page errors, dark theme, invalid ExamGrading ID và ConfirmDialog.
- Kết quả: 438/438 pass.

## 10. Sáu viewport

| Viewport | Kết quả |
|---:|---|
| 1440×900 | Pass |
| 1280×800 | Pass |
| 1024×768 | Pass |
| 768×1024 | Pass |
| 390×844 | Pass |
| 360×800 | Pass |

## 11. Accessibility

- 84 accessibility-spec executions và 78 lượt axe scan trên sáu viewport đều pass.
- Có skip link, semantic landmark, heading đầu trang, label, accessible name, focus visible, dialog focus trap/return focus, loading announcement và reduced motion.
- Keyboard tự động kiểm tra login, skip link và confirmation dialog.
- Chưa audit screen reader/happy-path keyboard toàn diện; không tuyên bố chứng nhận WCAG.

## 12. Build và test

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | Pass |
| `npm run build` | Pass |
| TypeScript qua `tsc -b` | Pass |
| `npm run test:chat` | 10/10 nhóm pass |
| `python -m pytest -q` | 409 passed, 13 subtests passed |
| `npm run test:e2e` | 438 passed |
| axe accessibility | 78 scan pass |
| `npm audit --omit=dev` | Còn 2 high từ một advisory React Router chỉ liên quan RSC/server-action mode |

Build còn cảnh báo main chunk khoảng 525 kB sau minify. Backend có 18 warning deprecation/third-party, không có test fail.

React Router đã được nâng trong major 7 lên 7.18.2. Advisory còn lại yêu cầu major 8.3; ứng dụng này là Vite SPA, không dùng React Server Components/server actions, nên không đổi major khi chưa có migration riêng.

Git hygiene:

- Không có `node_modules`, `dist`, `build`, coverage, cache, log, Playwright report/video/trace hoặc `.env` thật trong danh sách file tracked.
- Chỉ `backend/.env.example` và `frontend/.env.example` được tracked.
- `test-results/.last-run.json` là artifact cũ đang được loại khỏi tracking; report/artifact mới đã được ignore.
- `.claude/` local được ignore, không đưa launch config cá nhân vào diff.
- `git diff --check` chỉ báo một Markdown hard-break có hai space ở `BAO_CAO_KIEM_THU_CHROME.md:3`, thuộc thay đổi có sẵn trước giai đoạn QA; source code mới không có whitespace error.

## 13. Lỗi còn lại

- Main bundle vượt warning threshold 500 kB.
- Nợ CSS legacy ngoài phạm vi component đã chuẩn hóa.
- Pydantic v2/Starlette/httpx/sklearn/Swig warnings trong backend tests.
- Happy-path browser integration chưa có bằng chứng do thiếu tài khoản và seed data test.
- Cần audit thủ công screen reader, zoom/forced-colors và nội dung dữ liệu dài.

## 14. Blocker

Không có blocker đối với source, lint, build hoặc test local. Blocker duy nhất cho live integration QA là chưa có môi trường backend test cô lập kèm account/seed data; không được thay bằng production credentials.

Trong lần chạy pytest đầu tiên, pytest đã auto-collect `backend/scratch/test_algorithms.py`; script này gọi backend đang chạy ở localhost và tạo 2 user test cùng 4 activity log trong database local. Các bản ghi có prefix chính xác đó đã được xóa và xác minh còn 0. `backend/pytest.ini` đã giới hạn collection vào `backend/tests`, nên full suite sau đó không chạy scratch. Không có production database nào bị chạm.

## 15. Hướng dẫn chạy

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

Backend, dùng virtualenv local đã cấu hình:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload
```

Không đưa `.env`, token hoặc key vào command history/báo cáo. Chỉ dùng cấu hình local/test.

## 16. Hướng dẫn test

```bash
cd frontend
npm run lint
npm run build
npm run test:chat
npx playwright install chromium
npm run test:e2e
```

```bash
cd backend
.venv/bin/python -m pytest -q
```

HTML report chỉ mở khi cần chẩn đoán bằng `npm run test:e2e:report`; artifact được ignore.

## 17. Rollback thủ công

Worktree chứa thay đổi liên đới của nhiều agent và chưa có commit cô lập, nên không rollback toàn repository. Quy trình an toàn:

1. Sao lưu worktree hiện tại.
2. Dùng `git diff -- <đường-dẫn-cụ-thể>` để xác định đúng hunk.
3. Hoàn tác thủ công bằng patch cho đúng file/giai đoạn dựa trên báo cáo 09–15.
4. Với file mới, chỉ xóa đúng file sau khi xác minh không còn import/reference.
5. Chạy lại lint, build, backend tests và Playwright.

Không dùng reset/clean/restore toàn cục; không xóa source chỉ để làm diff nhỏ.

## 18. File thay đổi nhiều nhất

Tracked diff trước khi thêm báo cáo cuối khoảng 4.1k dòng thêm và 10.5k dòng xóa trên khoảng 100 file. Các contributor lớn:

| File | Thay đổi chính |
|---|---|
| `frontend/src/pages/landing/landing.css` | Xóa 2,211 dòng legacy khi landing được gom lại |
| `frontend/src/pages/QuickGeneratePage.tsx` | +256 / -1,543 |
| `frontend/src/pages/QuestionSetDetailPage.tsx` | phần cũ lớn được tách sang editor/page mới |
| `frontend/src/pages/DocumentDetailPage.tsx` | +397 / -763 |
| `frontend/src/components/AppLayout.tsx` | +426 / -368 |
| `frontend/src/pages/AdminUsersPage.tsx` | +386 / -367 |
| `frontend/src/pages/QuestionGeneratePage.tsx` | +238 / -390 |
| `frontend/src/pages/AdminDashboardPage.tsx` | +144 / -398 |

Các file mới lớn gồm `components/ui/ui.css` (~1,785 dòng), `ExamBlueprintDetailPage.tsx` (~795), `LandingSections.tsx` (~739), `public-page.css` (~738), `QuestionSetEditorPage.tsx` (~684) và `tokens.css` (~531).

Thư mục screenshot audit trong `docs/ui-redesign/screenshots` có các PNG 0.2–1.7 MB. Đây là bằng chứng thiết kế có chủ đích, không phải artifact Playwright tạm.

Diff lớn vì worktree đã chứa đồng thời redesign Public/Teacher/Student, feature expansion backend/exam bank và Admin refactor trước khi tiếp quản; không phải chỉ do lượt QA cuối. Các module landing cũ bị xóa vì implementation được hợp nhất, và build/router đã xác minh replacement hoạt động.

## 19. Đề xuất tiếp theo

1. Tạo test environment cô lập, test accounts theo ba role và seed exam/document/class nhỏ.
2. Thêm happy-path Playwright cho upload → extract/index → generate, làm/nộp bài, grading và Admin mutation.
3. Tách main bundle theo nhóm Teacher/Student còn lại.
4. Di trú CSS legacy theo từng page, kèm visual regression baseline.
5. Audit VoiceOver/NVDA, zoom 400% và forced-colors.
6. Lập kế hoạch React Router 8 riêng nếu ứng dụng thực sự cần RSC/server actions.

## Route inventory cuối

Quy ước: `✓` là route/guard/render/overflow/console đã kiểm trên sáu viewport; `503→UI` là API fixture trả lỗi có chủ đích và trang phải hiển thị state an toàn, không phải happy-path network.

| Route | Role | Mở được | Responsive | Console | Network | Trạng thái |
|---|---|---:|---:|---:|---|---|
| `/` | Public | ✓ | ✓ | ✓ | Config fixture | Ready |
| `/how-it-works` | Public | ✓ | ✓ | ✓ | Config fixture | Ready |
| `/features` | Public | ✓ | ✓ | ✓ | Config fixture | Ready |
| `/faq` | Public | ✓ | ✓ | ✓ | Config fixture | Ready |
| `/login` | Public | ✓ | ✓ | ✓ | Không submit | UI ready |
| `/register` | Public | ✓ | ✓ | ✓ | Không submit | UI ready |
| `/student-onboarding` | Student | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/maintenance` | Public | ✓ | ✓ | ✓ | Không gọi nghiệp vụ | Ready |
| `/dashboard` | Student, Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/ho-so` | Student, Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/documents` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/documents/:documentId` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/documents/:documentId/questions` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/generate` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/question-sets/:questionSetId` | Student, Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/question-history` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/classes` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/classes/:classId` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/published-questions` | Student | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/learning-history` | Student | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/student-statistics` | Student | ✓ redirect | ✓ | ✓ | Không gọi riêng | Compatibility redirect |
| `/personalization` | Student | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/chat-advanced` | Student, Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/web-knowledge` | Student, Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/curriculum-kb` | Student, Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/tools` | Student, Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/question-bank` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/exam-blueprints` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/exam-blueprints/:id` | Teacher | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/exams/:examId/grading` | Teacher | ✓ | ✓ | ✓ | 503→UI + invalid-ID guard | Guard/error verified |
| `/take-exam/:examId` | Student | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/dashboard` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/users` | Admin | ✓ | ✓ | ✓ | 503→UI | Error + dialog verified |
| `/admin/users/:userId` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/documents` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/documents/:documentId` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/questions` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/questions/:questionId` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/exams` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/ai` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/website-content` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/settings` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/feature-flags` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/notifications` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/reports` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/activity-logs` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `/admin/audit-logs` | Admin | ✓ | ✓ | ✓ | 503→UI | Error state verified |
| `*` | Public fallback | ✓ | ✓ | ✓ | Không gọi nghiệp vụ | 404 ready |
