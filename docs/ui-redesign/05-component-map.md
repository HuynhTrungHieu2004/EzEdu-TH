# EzEdu AI — Bản đồ thành phần (Giai đoạn 2)

- **Ngày:** 2026-07-28
- **Dựa trên:** [01-audit-report.md](01-audit-report.md) → [04-page-inventory.md](04-page-inventory.md)
- **Trạng thái:** Tài liệu thiết kế. Chưa triển khai giao diện.

---

## 1. Kiến trúc thành phần theo ba tầng

```
Tầng 1 — PRIMITIVE  (frontend/src/components/ui/)
   Không biết gì về nghiệp vụ EzEdu AI. Không gọi API.
   Button · Input · Textarea · Select · Checkbox · Radio · RadioCard
   Dialog · Drawer · Dropdown · Tabs · Card · Badge · Alert · Toast
   Skeleton · EmptyState · ErrorState · PageHeader · SectionHeader
   ChipGroup · ProgressBar · ProgressSteps · Tooltip · StatTile

Tầng 2 — DOMAIN  (frontend/src/components/domain/)
   Biết nghiệp vụ, nhận dữ liệu qua props, không tự gọi API.
   DocumentListItem · ProcessingStatusBadge · QuestionSetListItem
   QuestionCard · QuestionEditorCard · PracticeListItem · AttemptListItem
   ClassListItem · StudentListItem · RecommendationCard
   KnowledgeSignalList · ResultSummary · ContinueLearningCard
   FeatureDisabledState · PermissionDeniedState · ThemeSelector

Tầng 3 — FEATURE  (frontend/src/components/<feature>/ và pages/)
   Gọi API, quản lý state. Trang thuộc tầng này.
   chat-advanced/* (giữ nguyên phần lớn) · VerificationPanel
   SemanticSearchPanel · UploadDropzone · DocumentContentViewer
   GenerateWizard · ConversationSidebar · CitationPanel
```

Nguyên tắc: tầng dưới không được import tầng trên. Primitive không được chứa chuỗi tiếng Việt về nghiệp vụ — chuỗi truyền vào qua props.

---

## 2. Component nền tảng — đặc tả trạng thái

Mọi primitive phải hiện thực đủ các trạng thái áp dụng được. Bảng này là hợp đồng cho giai đoạn 3.

| Component | Default | Hover | Focus | Active | Disabled | Loading | Success | Error |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `Button` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (spinner, giữ chiều rộng) | — | — |
| `Input` | ✓ | ✓ | ✓ | — | ✓ | ✓ (readonly + spinner) | ✓ (viền success) | ✓ (viền + text lỗi dưới) |
| `Textarea` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `Select` | ✓ | ✓ | ✓ | ✓ (đang mở) | ✓ | ✓ | — | ✓ |
| `Checkbox` | ✓ | ✓ | ✓ | ✓ (checked/indeterminate) | ✓ | — | — | ✓ |
| `Radio` / `RadioCard` | ✓ | ✓ | ✓ | ✓ (selected) | ✓ | — | — | ✓ |
| `Dialog` | ✓ | — | ✓ (focus trap) | — | — | ✓ (nút xác nhận) | — | ✓ (Alert bên trong) |
| `Drawer` | ✓ | — | ✓ (focus trap) | — | — | — | — | — |
| `Dropdown` | ✓ | ✓ | ✓ (mũi tên di chuyển) | ✓ | ✓ (từng mục) | — | — | — |
| `Tabs` | ✓ | ✓ | ✓ | ✓ (`aria-selected`) | ✓ | — | — | — |
| `Card` | ✓ | ✓ (chỉ khi clickable) | ✓ (chỉ khi clickable) | — | — | — | — | — |
| `Badge` | ✓ | — | — | — | — | — | ✓ | ✓ |
| `Alert` | ✓ (info) | — | — | — | — | — | ✓ | ✓ (+ warning) |
| `Toast` | ✓ | ✓ (giữ khi hover) | ✓ | — | — | — | ✓ | ✓ |
| `Skeleton` | ✓ | — | — | — | — | ✓ (bản chất) | — | — |
| `EmptyState` | ✓ | — | — | — | — | — | — | — |
| `ErrorState` | ✓ | — | — | — | — | ✓ (nút thử lại) | — | ✓ (bản chất) |
| `PageHeader` | ✓ | — | — | — | — | ✓ (skeleton tiêu đề) | — | — |
| `SectionHeader` | ✓ | — | — | — | — | — | — | — |

---

## 3. Component tái sử dụng theo trang

Bảng đối chiếu: trang nào dùng component nào. Dùng để kiểm tra không có component chỉ dùng một lần mà đáng ra nên gộp, và không có trang tự viết lại thứ đã có.

| Component | Số trang dùng | Trang tiêu biểu |
|---|---|---|
| `Button` | 40 | Tất cả |
| `Card` | 32 | Tất cả trừ trang lỗi |
| `PageHeader` | 30 | Mọi trang trong app (không dùng ở public) |
| `Skeleton` | 30 | Mọi trang có gọi API |
| `EmptyState` | 24 | Mọi trang có danh sách |
| `ErrorState` | 30 | Mọi trang có gọi API |
| `Badge` | 20 | Danh sách học liệu, bộ đề, bài tập, admin |
| `Input` | 18 | Form, tìm kiếm |
| `Dialog` | 16 | Xác nhận xoá/ban hành/nộp bài |
| `Dropdown` | 14 | Menu ngữ cảnh, menu người dùng |
| `Toast` | 14 | Phản hồi sau hành động |
| `Alert` | 12 | Lỗi trong form, thông báo hệ thống |
| `Select` | 12 | Bộ lọc |
| `Tabs` | 8 | Chi tiết học liệu, bài tập, admin dashboard |
| `StatTile` | 6 | Tổng quan HS/GV, tiến độ, admin |
| `Drawer` | 6 | Nav mobile, bộ lọc mobile, wizard mobile |
| `ProgressBar` | 4 | Làm bài, upload, sinh đề |
| `Checkbox` / `Radio` | 6 | Form, làm bài, onboarding |
| `Textarea` | 5 | Hỏi đáp, sửa câu hỏi, mục tiêu học tập |
| `ChipGroup` | 3 | Onboarding, bộ lọc |
| `ProgressSteps` | 2 | Wizard sinh đề, upload |
| `Tooltip` | nhiều | Mọi icon-only button |

Component xuất hiện dưới 3 lần được xem lại: `ProgressSteps` (2) giữ vì wizard là luồng quan trọng; `ChipGroup` (3) giữ.

---

## 4. Bảng quyết định: thành phần hiện tại → thành phần mới

Đây là bảng bắt buộc theo yêu cầu. Bảy loại quyết định: **Giữ nguyên · Thiết kế lại · Gộp · Di chuyển · Ẩn theo role · Loại khỏi UI nhưng giữ backend · Loại hoàn toàn**.

### 4.1 Layout và điều hướng

| Thành phần hiện tại | Quyết định | Thành phần mới | Lý do |
|---|---|---|---|
| `AppLayout.tsx` (sidebar dùng chung 3 role) | Thiết kế lại | `AppLayout` + `AppSidebar` + `UserMenu` + `MobileTabBar` | Nav phải theo role; hiện admin thấy cả nhóm giảng viên (lỗi H2) |
| Emoji trong nav (`📊 📚 💬 📋 🏫 ✨`) | Loại hoàn toàn | Icon `lucide-react` | Emoji render khác nhau theo OS, screen reader đọc sai, không đổi được màu (lỗi H1) |
| 3 nút theme trong sidebar | Di chuyển | `ThemeSelector` trong `UserMenu` + trang Hồ sơ | Tác vụ ít dùng chiếm chỗ cố định trong nav |
| Nút "🚪 Đăng xuất" trong sidebar | Di chuyển | Mục trong `UserMenu` | Cùng lý do |
| CTA "✨ Sinh đề nhanh" trong sidebar | Gộp | Nút "Tạo đề mới" trong `PageHeader` của `/gv/de-thi` | Một tác vụ không được có hai vị trí trong navigation |
| `PublicLayout.tsx` | Thiết kế lại | `PublicLayout` + `PublicHeader` + `PublicFooter` + `MobileNavDrawer` | Cần header/footer đúng chuẩn cho khu vực public |
| `ProtectedRoute.tsx` | Thiết kế lại | `ProtectedRoute` (chỉ auth) + **`RoleRoute`** (mới) | Hiện chỉ kiểm tra token, không kiểm tra role (lỗi Critical C1/C2) |
| `AdminRoute.tsx` | Giữ nguyên | `AdminRoute` | Đã hoạt động đúng — kiểm chứng: học sinh và giáo viên đều bị chuyển về `/dashboard` |
| *(chưa có)* | Tạo mới | `AdminLayout` | Admin phải là khu vực riêng biệt về thị giác |
| *(chưa có)* | Tạo mới | `AuthContext` | `AppLayout` hiện gọi `getMe()` lại mỗi lần đổi route (lỗi L2) |
| Route `*` → `LandingPage` | Thiết kế lại | `NotFoundPage` | URL sai đang hiện trang marketing (lỗi H4) |

### 4.2 Trang chủ và public

| Thành phần hiện tại | Quyết định | Thành phần mới | Lý do |
|---|---|---|---|
| `landing/HeroSection` | Thiết kế lại | `Hero` | Áp dụng thang typography và khoảng trắng mới |
| `landing/UploadSection` + `UploadWidget` | Thiết kế lại | `UploadDropzone` (dùng chung với khu vực GV) | Hiện chỉ chuyển hướng sang `/register` khi chưa đăng nhập mà không nói rõ; cần hướng dẫn minh bạch |
| `landing/FormatsBar` | Gộp | Phần "Định dạng hỗ trợ" bên trong `UploadDropzone` | Thông tin định dạng thuộc về ô upload, không phải một dải riêng |
| `landing/StepsSection` | Thiết kế lại | `StepItem` × 4 | Quy trình 4 bước rõ ràng |
| `landing/DiagramSection` | Gộp | Hình minh hoạ trong `Hero` | Hai khối cùng giải thích một ý |
| `landing/DemoSection` | Thiết kế lại | `ExampleCard` × 5 | Đổi thành ví dụ theo môn học thật (lịch sử, địa lí, ôn tập…) |
| `landing/WhySection` | Thiết kế lại | `BenefitCard` × 6 | Chỉ nêu lợi ích hệ thống thực sự làm được |
| `landing/CtaSection` | Thiết kế lại | `CtaBanner` | |
| `landing/LandingHeader` | Thiết kế lại | `PublicHeader` | Dùng chung cho cả 4 trang public |
| `landing/LandingFooter` | Thiết kế lại | `PublicFooter` | 5 nhóm theo yêu cầu |
| *(chưa có)* | Tạo mới | `RoleFeatureBlock` | Tách rõ tính năng học sinh / giáo viên |
| *(chưa có)* | Tạo mới | `TrustBlock` | Minh bạch nguồn, kiểm chứng, quyền riêng tư |
| *(chưa có)* | Tạo mới | `FaqAccordion` | Trang chủ hiện không có FAQ |
| `LandingPage.css` + `landing/landing.css` | Gộp | Một file CSS dùng token | Hai file CSS cho cùng một trang |

### 4.3 Trang học sinh

| Thành phần hiện tại | Quyết định | Thành phần mới | Lý do |
|---|---|---|---|
| `DashboardPage` nhánh student (4 thẻ 01–04) | Thiết kế lại | `StudentDashboardPage` | 4 thẻ hiện chỉ trỏ lại đúng 4 mục sidebar — điều hướng trùng lặp (lỗi H6) |
| `PublishedQuestionSetsPage` | Thiết kế lại | `PracticeListPage` (`/hs/bai-tap`) | Đổi tên theo ngôn ngữ người học, giữ nguyên logic tab |
| `QuestionSetDetailPage` nhánh học sinh | Gộp + tách | `PracticeAttemptPage` (`/hs/bai-tap/:setId`) | Một component đang phục vụ hai vai trò khác nhau |
| `LearningHistoryPage` | Gộp | `ProgressPage` (`/hs/tien-do`) phần chi tiết | Cùng dữ liệu với trang thống kê (lỗi M4) |
| `StudentStatisticsPage` | Gộp | `ProgressPage` phần tổng quan | Cùng lý do |
| `PersonalizationPage` | Thiết kế lại | `PersonalizationPage` + `FeatureDisabledState` | Flag đang tắt → hiện trang trắng kèm 403; cần trạng thái tử tế |
| `StudentOnboardingPage` | Thiết kế lại | `OnboardingPage` có chrome + nút "Để sau" | Hiện khoá cứng mọi route và render không có header (lỗi H3) |
| *(chưa có)* | Tạo mới | `ProfilePage` (`/hs/ho-so`) | Không có trang hồ sơ nào (lỗi H5) |
| *(chưa có)* | Tạo mới | Khối "Lớp của tôi" trong `ProfilePage` | `GET /classes/mine` đã có backend, chưa từng dùng (lỗi M8) |
| *(chưa có)* | Tạo mới | `ContinueLearningCard` | Dashboard cần trả lời "giờ tôi nên làm gì" |

### 4.4 Trang giáo viên

| Thành phần hiện tại | Quyết định | Thành phần mới | Lý do |
|---|---|---|---|
| `DashboardPage` nhánh lecturer | Thiết kế lại | `TeacherDashboardPage` | Tách khỏi dashboard học sinh, thêm việc đang dở |
| `DocumentsPage` | Thiết kế lại | `DocumentsPage` (`/gv/hoc-lieu`) | Gộp upload vào cùng trang, chuẩn hoá empty state |
| Panel "🔬 Phân cụm (K-Means)" | Loại khỏi UI, **giữ backend** | — | `GET /documents/analysis/clusters` vẫn còn; thuật ngữ ML không thuộc UI giáo viên (lỗi M2) |
| `DocumentDetailPage` (mọi panel xếp dọc) | Thiết kế lại | `DocumentDetailPage` + `Tabs` 4 tab | Trang quá dài, mọi panel tải cùng lúc |
| `ChatBox.tsx` (chat cơ bản) | Gộp | Tab "Hỏi đáp" dùng `chat-advanced` với scope tài liệu | Hai giao diện hỏi đáp cho cùng một việc (lỗi M1) |
| `VerificationPanel` + `IssueCard` | Giữ nguyên | Đặt trong tab "Kiểm chứng" | Logic đúng, chỉ đổi vị trí; thêm empty state cho trường hợp chưa có phiên (lỗi M3) |
| Khối tìm kiếm ngữ nghĩa | Di chuyển | `SemanticSearchPanel` trong tab "Tìm kiếm" | Tác vụ phụ, không cần luôn hiện |
| `QuestionGeneratePage` | Gộp | `GenerateWizard` trong `/gv/de-thi` | Ba đường vào cùng một nghiệp vụ |
| `QuickGeneratePage` | Gộp | `GenerateWizard` (giữ tốc độ một trang) | Trùng toàn bộ pipeline với luồng nhiều bước (lỗi M1) |
| `QuestionHistoryPage` | Thiết kế lại | `QuestionSetsPage` (`/gv/de-thi`) | Trở thành trang chủ của nhóm "Đề & câu hỏi" |
| `QuestionSetDetailPage` nhánh giáo viên | Tách | `QuestionSetEditorPage` (`/gv/de-thi/:setId`) | Bỏ nhánh làm bài |
| `QuestionCard.tsx` | Thiết kế lại | `QuestionCard` (chỉ đọc) + `QuestionEditorCard` (sửa) | Hai ngữ cảnh dùng khác nhau |
| Nút xuất DOCX/PDF trên trang | Di chuyển | Mục trong `Dropdown` menu ngữ cảnh | Tác vụ ít dùng |
| `ClassesPage` | Thiết kế lại | `ClassesPage` + menu ngữ cảnh | Bổ sung đổi tên/xoá lớp (backend đã có) |
| `ClassDetailPage` | Thiết kế lại | `ClassDetailPage` | Chuẩn hoá empty state và trạng thái tìm kiếm |
| *(chưa có)* | Tạo mới | `ProfilePage` (`/gv/ho-so`) | Không có trang hồ sơ |
| *(chưa có)* | Tạo mới | `ProcessingStatusBadge` | Trạng thái pipeline cần ngôn ngữ người dùng, không phải tên bước kỹ thuật |

### 4.5 Trang admin

| Thành phần hiện tại | Quyết định | Thành phần mới | Lý do |
|---|---|---|---|
| Tab "👥 Quản lý người dùng" trong `AdminDashboardPage` | Gộp | Thẻ số liệu + link tới `/admin/users` | Trùng với `AdminUsersPage` nhưng ít năng lực hơn (chỉ đổi role + bật/tắt) |
| Tab "🧾 Nhật ký hệ thống" trong `AdminDashboardPage` | Gộp | Thẻ số liệu + link tới `/admin/audit-logs` | Trùng với `AdminAuditLogsPage` |
| `AdminDashboardPage` các tab còn lại | Giữ nguyên | Áp dụng primitive mới | Overview/Usage/Quality/Errors/Evaluation/Health không trùng gì |
| `AdminUsersPage`, `AdminUserDetailPage` | Giữ nguyên | Áp dụng primitive mới | Nghiệp vụ đầy đủ, không sửa |
| `AdminDocumentsPage`, `AdminQuestionsPage`, `AdminExamsPage` + chi tiết | Giữ nguyên | Gom vào nhóm nav "Nội dung" | |
| `AdminAIPage`, `AdminWebsiteContentPage` | Giữ nguyên | | |
| `AdminSettingsPage`, `AdminFeatureFlagsPage`, `AdminNotificationsPage` | Giữ nguyên | Gom vào nhóm "Hệ thống" | |
| `AdminReportsPage`, `AdminActivityLogsPage`, `AdminAuditLogsPage` | Giữ nguyên | Gom vào nhóm "Báo cáo & log" | |
| `AdminContentShared.tsx` | Giữ nguyên | | Helper dùng chung, hoạt động tốt |
| 5 file CSS admin riêng | Gộp | Một file dùng token + primitive | Màu hex rải rác trong từng file (lỗi M6) |

### 4.6 Chức năng backend không lên UI — **giữ nguyên backend**

Không xoá bất kỳ endpoint nào trong bảng này. Chúng thuộc mục "đề xuất tương lai" trong [02-information-architecture.md §7](02-information-architecture.md).

| Endpoint | Quyết định | Lý do |
|---|---|---|
| `GET /documents/analysis/clusters` | Loại khỏi UI, giữ backend | Thuật ngữ ML không phù hợp UI giáo viên |
| `GET /documents/{id}/similar` | Loại khỏi UI, giữ backend | Chưa có ngữ cảnh dùng rõ ràng |
| `POST /chat/ask` (chat cơ bản) | Loại khỏi UI, giữ backend | Đã có `ask-advanced` bao trùm |
| `/personalization/learner/*` (5 endpoint) | Loại khỏi UI, giữ backend | Chưa có màn hình; phụ thuộc flag đang tắt |
| `/personalization/recommendations/candidates` | Loại khỏi UI, giữ backend | Là bước trung gian của pipeline, không phải màn hình |
| `/personalization/documents/{id}/knowledge-graph/*` | Loại khỏi UI, giữ backend | Cần thiết kế màn duyệt riêng cho admin — việc tương lai |
| `GET /personalization/me/progress` | Loại khỏi UI, giữ backend | Dữ liệu tương đương đã có trong `/personalization/me` |
| `GET /personalization/recommendations/me/history` | Loại khỏi UI, giữ backend | Chưa có nhu cầu rõ |
| `POST /personalization/events/admin/users/{id}` | Loại khỏi UI, giữ backend | Chưa có màn hình admin tương ứng |
| `POST /admin/website-content/sections/reorder` | Loại khỏi UI, giữ backend | Chưa có client method; sắp xếp hiện làm trong local state |
| `GET /admin/notifications/{id}` | Loại khỏi UI, giữ backend | Trang chỉ cần danh sách |
| `POST /auth/login-swagger` | Giữ nguyên | Dành cho Swagger UI, không phải giao diện người dùng |

### 4.7 Loại hoàn toàn

Chỉ những thứ **không** còn được dùng và **không** phải nghiệp vụ backend.

| Thành phần | Lý do loại |
|---|---|
| Emoji làm icon trong toàn bộ nav | Thay bằng `lucide-react` |
| 4 thẻ điều hướng 01–04 trên dashboard học sinh | Trùng hoàn toàn với sidebar |
| Nhóm nav "Giảng viên" hiển thị cho admin | Sai vai trò |
| Route `*` render `LandingPage` | Thay bằng `NotFoundPage` |
| `classesApi.listMine` là dead code | Không loại — **kích hoạt** trong `/hs/ho-so` |

---

## 5. Ánh xạ file dự kiến

### 5.1 Tạo mới

```
frontend/src/styles/tokens.css
frontend/src/styles/base.css
frontend/src/context/AuthContext.tsx
frontend/src/components/RoleRoute.tsx
frontend/src/components/AdminLayout.tsx
frontend/src/components/ui/                    (18+ primitive + CSS)
frontend/src/components/domain/                (domain component)
frontend/src/components/public/                PublicHeader, PublicFooter, Hero,
                                               BenefitCard, StepItem, ExampleCard,
                                               RoleFeatureBlock, TrustBlock,
                                               FaqAccordion, CtaBanner
frontend/src/pages/NotFoundPage.tsx
frontend/src/pages/HowItWorksPage.tsx
frontend/src/pages/FeaturesPage.tsx
frontend/src/pages/FaqPage.tsx
frontend/src/pages/ProfilePage.tsx
frontend/src/pages/student/StudentDashboardPage.tsx
frontend/src/pages/student/PracticeListPage.tsx
frontend/src/pages/student/PracticeAttemptPage.tsx
frontend/src/pages/student/ProgressPage.tsx
frontend/src/pages/teacher/TeacherDashboardPage.tsx
frontend/src/pages/teacher/QuestionSetsPage.tsx
frontend/src/pages/teacher/QuestionSetEditorPage.tsx
frontend/src/components/teacher/GenerateWizard.tsx
```

### 5.2 Sửa

```
frontend/src/App.tsx                    cây route mới + RoleRoute + redirect route cũ
frontend/src/main.tsx                   nạp tokens.css, base.css, AuthProvider
frontend/src/index.css, App.css         chuyển sang token
frontend/src/components/AppLayout.tsx   nav theo role, bỏ emoji
frontend/src/components/ProtectedRoute.tsx
frontend/src/components/PublicLayout.tsx
frontend/src/components/ThemeToggle.tsx → ThemeSelector
frontend/src/components/FileUpload.tsx  → UploadDropzone
frontend/src/components/QuestionCard.tsx
frontend/src/components/VerificationPanel.tsx
frontend/src/pages/landing/*            thiết kế lại toàn bộ
frontend/src/pages/LoginPage.tsx        sửa điều hướng cho các role admin
frontend/src/pages/RegisterPage.tsx     đồng nhất luồng sau đăng ký
frontend/src/pages/DocumentsPage.tsx    bỏ panel K-Means
frontend/src/pages/DocumentDetailPage.tsx  chuyển sang Tabs
frontend/src/pages/ClassesPage.tsx      thêm đổi tên/xoá
frontend/src/pages/ClassDetailPage.tsx
frontend/src/pages/PersonalizationPage.tsx  flag-aware
frontend/src/pages/StudentOnboardingPage.tsx
frontend/src/pages/AdminDashboardPage.tsx   gỡ 2 tab trùng
frontend/src/pages/Admin*.css           gộp, dùng token
```

### 5.3 Xoá khỏi cây route (file vẫn giữ đến khi luồng mới chạy ổn)

```
frontend/src/pages/QuickGeneratePage.tsx      → gộp vào GenerateWizard
frontend/src/pages/QuestionGeneratePage.tsx   → gộp vào GenerateWizard
frontend/src/pages/QuestionHistoryPage.tsx    → thay bởi QuestionSetsPage
frontend/src/pages/LearningHistoryPage.tsx    → gộp vào ProgressPage
frontend/src/pages/StudentStatisticsPage.tsx  → gộp vào ProgressPage
frontend/src/pages/PublishedQuestionSetsPage.tsx → thay bởi PracticeListPage
frontend/src/pages/QuestionSetDetailPage.tsx  → tách thành 2 trang
frontend/src/components/ChatBox.tsx           → gộp vào tab Hỏi đáp
```

### 5.4 Không sửa

```
backend/**                          Giữ nguyên API contract và toàn bộ nghiệp vụ
frontend/src/api/**                 Giữ nguyên client, trừ việc kích hoạt
                                    classesApi.listMine/update/remove đang là dead code
frontend/src/utils/adminPermissions.ts   RBAC phía client giữ nguyên
```

---

## 6. Thứ tự triển khai của giai đoạn sau

| Bước | Nội dung | Phụ thuộc |
|---|---|---|
| 1 | `tokens.css`, `base.css` | — |
| 2 | 18 primitive trong `ui/` | Bước 1 |
| 3 | `AuthContext`, `RoleRoute`, `NotFoundPage` | Bước 2 |
| 4 | `AppLayout` mới + `AdminLayout` + nav theo role | Bước 3 |
| 5 | Cây route mới trong `App.tsx` + redirect | Bước 4 |
| 6 | Trang public (trang chủ + 3 trang phụ) | Bước 2 |
| 7 | Dashboard 3 role + `ProfilePage` | Bước 5 |
| 8 | Trang giáo viên | Bước 7 |
| 9 | Trang học sinh | Bước 7 |
| 10 | Gộp thành phần trùng + gỡ 2 tab admin | Bước 8, 9 |

## 7. Kiểm tra trước khi coi là xong

| Hạng mục | Tiêu chí |
|---|---|
| Token | Không còn màu hex viết trực tiếp trong file component |
| Icon | Không còn emoji nào trong navigation hay nút hành động |
| Role guard | 9 kịch bản trong [03-role-navigation.md §7.4](03-role-navigation.md) đều đúng |
| Trạng thái | Mọi trang trong bảng [04-page-inventory.md §E](04-page-inventory.md) có đủ trạng thái |
| API | Không có nút nào không gọi được API thật |
| Backend | Không endpoint nào bị xoá |
| Responsive | Không có cuộn ngang ở 360px |
| Accessibility | Mọi icon-only button có `aria-label`; focus visible ở mọi nơi |
