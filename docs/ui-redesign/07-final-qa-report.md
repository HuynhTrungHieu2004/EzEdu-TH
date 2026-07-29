# EzEdu AI — Báo cáo QA cuối (Giai đoạn 6)

- **Ngày:** 2026-07-28
- **Phạm vi:** Kiểm thử toàn bộ giao diện sau redesign, sửa lỗi phát hiện được, và ghi nhận phần còn lại.
- **Môi trường:** Backend FastAPI `127.0.0.1:8000`, Frontend Vite `localhost:5173`, MongoDB Atlas, Playwright Chromium.

---

## 1. Tóm tắt redesign

Redesign được thực hiện theo sáu giai đoạn, mỗi giai đoạn có tài liệu riêng trong `docs/ui-redesign/`.

| Giai đoạn | Nội dung | Tài liệu |
|---|---|---|
| 1 | Khảo sát trang tham khảo + audit thực tế EzEdu AI theo 3 vai trò | [01](01-audit-report.md) |
| 2 | Kiến trúc thông tin, navigation theo vai trò, đặc tả 40 trang | [02](02-information-architecture.md) · [03](03-role-navigation.md) · [04](04-page-inventory.md) · [05](05-component-map.md) |
| 3 | Design system: token + 22 component nền tảng | [06](06-design-system.md) |
| 3b | Role guard tầng route, `AuthContext`, trang 404 | báo cáo này |
| 4 | Trang chủ public + 3 trang thông tin | [00-progress-log.md](00-progress-log.md) |
| 5 | Dashboard theo vai trò, trang hồ sơ, dọn giao diện dư | báo cáo này |
| 6 | QA cuối, sửa lỗi, báo cáo | báo cáo này |

### Ba thay đổi có ảnh hưởng lớn nhất

**Đóng lỗ hổng phân quyền.** Trước đây phân tách vai trò trên giao diện chỉ là ẩn nút trong sidebar; route thì mở. Học sinh gõ URL vào được đầy đủ 5 trang giáo viên, kể cả wizard sinh đề và ngân hàng câu hỏi. Giờ có `RoleRoute` chặn ở tầng route và **không render** nội dung trái phép.

**Dashboard thành dashboard thật.** Cả hai vai trò trước đây chỉ thấy bốn thẻ đánh số 01–04 trỏ đúng về bốn mục đã có trong sidebar. Giờ dashboard trả lời "giờ tôi nên làm gì" bằng dữ liệu thật, và người mới thấy hướng dẫn từng bước thay vì lưới thẻ trống.

**Một hệ thống thị giác duy nhất.** Token tập trung với alias cho tên biến cũ, nên đổi được toàn bộ nhận diện mà không phải sửa 5.850 dòng CSS cũ. Bỏ glassmorphism và gradient chữ — hai dấu hiệu "template AI" rõ nhất.

---

## 2. Route đã kiểm thử

### 2.1 Khu vực khách — 7 route × 3 kích thước = 21 lượt kiểm tra

| Route | Kết quả |
|---|---|
| `/` | ✅ |
| `/how-it-works` | ✅ (mới) |
| `/features` | ✅ (mới) |
| `/faq` | ✅ (mới) |
| `/login` | ✅ |
| `/register` | ✅ |
| URL không tồn tại | ✅ trả trang 404 thật (mới) |

### 2.2 Khu vực học sinh & giáo viên — 11 route × 3 kích thước = 33 lượt kiểm tra

| Học sinh | Giáo viên |
|---|---|
| `/dashboard` ✅ | `/dashboard` ✅ |
| `/published-questions` ✅ | `/documents` ✅ |
| `/chat-advanced` ✅ | `/question-history` ✅ |
| `/learning-history` ✅ | `/classes` ✅ |
| `/student-statistics` ✅ | `/ho-so` ✅ (mới) |
| `/ho-so` ✅ (mới) | |
| `/personalization` ✅ (trạng thái tính năng tắt) | |
| `/student-onboarding` ✅ | |

### 2.3 Khu vực admin — kiểm tra không bị ảnh hưởng bởi redesign

`/admin/dashboard`, `/admin/users`, `/admin/documents`, `/admin/questions`, `/admin/settings` — vào được bình thường với tài khoản admin, nghiệp vụ không thay đổi. Sidebar admin giờ gom 7 nhóm và **không còn 5 mục của giáo viên**.

### 2.4 Kiểm tra phân quyền route — 20/20 kịch bản đạt

| Vai trò | URL gõ trực tiếp | Kết quả |
|---|---|---|
| Học sinh | `/documents`, `/generate`, `/question-history`, `/classes`, `/admin/users` | → `/dashboard`, không render nội dung |
| Giáo viên | `/published-questions`, `/learning-history`, `/student-statistics`, `/personalization`, `/admin/dashboard` | → `/dashboard` |
| Admin | `/documents`, `/published-questions`, `/dashboard` | → `/admin/dashboard` |
| Khách | mọi route cần đăng nhập | → `/login` |

---

## 3. Chức năng đã kiểm thử

| Nhóm | Hạng mục | Kết quả |
|---|---|---|
| **Public** | Header 3 mục, footer 5 nhóm, 8 link nội bộ | ✅ Mọi link dẫn tới route thật |
| | Ô tải học liệu: kéo thả, chọn tệp, kiểm tra định dạng và dung lượng | ✅ Phản hồi thật, không giả lập |
| | FAQ accordion, CTA | ✅ |
| | Đăng nhập / đăng ký | ✅ Điều hướng theo vai trò |
| | Google / Facebook login | ⛔ **Không tồn tại** trong backend — xem §10 |
| **Học sinh** | Dashboard: bài cần làm, lần làm gần nhất, số liệu tiến độ | ✅ Dữ liệu thật |
| | Danh sách bài luyện tập, lịch sử, thống kê | ✅ |
| | Hỏi đáp AI | ✅ Vào được, giao diện hoạt động |
| | Hồ sơ: thông tin, thiết lập học tập, **lớp của tôi** | ✅ Kích hoạt endpoint chưa từng dùng |
| | Onboarding có nút "Để sau" | ✅ Bấm → về `/dashboard` |
| | Cá nhân hóa khi flag tắt | ✅ Trạng thái tử tế, không lộ chi tiết kỹ thuật |
| **Giáo viên** | Dashboard: học liệu gần đây kèm trạng thái, bộ đề gần đây | ✅ Dữ liệu thật |
| | Quản lý học liệu, ngân hàng câu hỏi, lớp học | ✅ |
| | Hồ sơ và cài đặt | ✅ |
| **Admin** | 5 trang tiêu biểu, sidebar 7 nhóm | ✅ Không bị redesign làm hỏng |
| **Kỹ thuật** | Console errors / unhandled rejection | ✅ Không có |
| | Request 4xx/5xx ngoài dự kiến | ✅ Không có |
| | Loading vô hạn | ✅ Không gặp |
| | Trang trắng | ✅ Không gặp |
| | Cuộn ngang ở 1440/1280/1024/768/390/360 | ✅ Không có |
| | Số thẻ `h1` mỗi trang | ✅ Đúng 1 sau khi sửa |
| | Focus visible, keyboard, skip link | ✅ Skip link là tab stop đầu tiên |
| | Reduced motion | ✅ Tôn trọng `prefers-reduced-motion` |
| | Dark mode | ✅ Toàn bộ token có bản tối |

---

## 4. Thành phần đã gộp hoặc loại khỏi UI

### 4.1 Đã loại khỏi UI, **giữ nguyên backend**

| Thành phần | Endpoint vẫn còn | Lý do loại |
|---|---|---|
| Panel "Phân cụm tài liệu (K-Means)" trên trang học liệu | `GET /documents/analysis/clusters` | Thuật ngữ ML ("K-Means", "vector embeddings") không thuộc giao diện giáo viên |

**Không endpoint backend nào bị xoá trong toàn bộ redesign.**

### 4.2 Đã gộp hoặc thay thế

| Trước | Sau |
|---|---|
| 4 thẻ điều hướng 01–04 trên dashboard học sinh | Nội dung thật: bài cần làm, lần làm gần nhất, số liệu |
| 4 thẻ điều hướng 01–04 trên dashboard giáo viên | Học liệu gần đây, bộ đề gần đây, một hành động chính |
| `DashboardPage` tự tách nhánh theo role trong một cây JSX | 3 file: điều phối + dashboard học sinh + dashboard giáo viên |
| Emoji làm icon trong navigation | `lucide-react` |
| 3 nút theme + nút đăng xuất chiếm chỗ cố định trong sidebar | Menu người dùng ở chân sidebar |
| CTA "Sinh đề nhanh" trong sidebar (trùng đích với luồng upload) | Nút "Tạo đề mới" trong dashboard |
| Nhóm nav "Giảng viên" hiện với admin (5 mục) | Đã gỡ khỏi khu vực admin |
| 11 mục admin phẳng | 7 nhóm |
| Route `*` render trang chủ | `NotFoundPage` |
| Trạng thái pipeline dạng mã kỹ thuật (`indexing`, `extracting`) | Nhãn tiếng Việt: "Đang chuẩn bị để hỏi đáp", "Sẵn sàng dùng" |
| 6 file section trang chủ cũ + `landing.css` (2.211 dòng) | Không còn được import; đã ra khỏi bundle |

### 4.3 Đã kích hoạt (backend có, UI chưa từng dùng)

| Chức năng | Endpoint |
|---|---|
| Học sinh xem lớp mình thuộc | `GET /classes/mine` |

---

## 5. File đã thay đổi

### 5.1 Tạo mới — frontend

```
src/styles/tokens.css                      token màu/chữ/spacing/radius/shadow/z-index/motion
src/styles/base.css                        reset, typography semantic, focus, reduced motion
src/components/ui/                         22 component nền tảng + ui.css + barrel
src/components/domain/                     ProcessingStatusBadge, documentStatus
src/components/public/                     PublicHeader, PublicFooter, HeroArt,
                                           LandingSections, public-page.css
src/components/RoleRoute.tsx               guard theo vai trò ở tầng route
src/components/app-layout.css              khung app: sidebar + bottom tab bar
src/contexts/AuthContext.tsx               provider
src/contexts/auth-context.ts               context + helper (tách để Fast Refresh chạy đúng)
src/hooks/useAuth.ts                       hook truy cập người dùng
src/hooks/useFeatureFlags.ts               đọc feature flag công khai
src/pages/NotFoundPage.tsx                 trang 404
src/pages/ProfilePage.tsx                  hồ sơ & cài đặt
src/pages/PublicInfoPages.tsx              /how-it-works, /features, /faq
src/pages/dashboard.css
src/pages/student/StudentDashboardPage.tsx
src/pages/teacher/TeacherDashboardPage.tsx
```

### 5.2 Sửa — frontend

```
src/App.tsx                                cây route mới + RoleRoute + 4 route mới
src/main.tsx                               nạp tokens.css, base.css
src/index.css                              gỡ 2 chỗ gradient text
src/components/AppLayout.tsx               nav theo vai trò, icon lucide, menu người dùng, tab bar
src/components/ProtectedRoute.tsx          dùng AuthContext
src/components/AdminRoute.tsx              dùng AuthContext, chuyển hướng khi render
src/pages/DashboardPage.tsx                điều phối theo vai trò
src/pages/DocumentsPage.tsx                gỡ panel K-Means, tiêu đề thành h1
src/pages/PersonalizationPage.tsx          FeatureDisabledState
src/pages/StudentOnboardingPage.tsx        nút "Để sau"
src/pages/LoginPage.tsx                    tiêu đề thành h1
src/pages/RegisterPage.tsx                 tiêu đề thành h1
src/pages/ClassesPage.tsx                  tiêu đề thành h1
src/pages/LearningHistoryPage.tsx          tiêu đề thành h1
src/pages/PublishedQuestionSetsPage.tsx    tiêu đề thành h1
src/pages/StudentStatisticsPage.tsx        tiêu đề thành h1
src/pages/QuestionHistoryPage.tsx          emoji -> icon lucide
src/pages/AdvancedChatPage.tsx             emoji -> icon lucide
src/components/chat-advanced/ (8 file)     emoji -> icon lucide
src/components/VerificationPanel.tsx       emoji -> icon lucide
src/components/IssueCard.tsx               emoji -> icon lucide
src/components/QuestionCard.tsx            emoji -> icon lucide
src/components/ThemeToggle.tsx             emoji -> icon lucide
src/components/PublicLayout.tsx            emoji -> icon lucide
src/pages/DocumentDetailPage.tsx           emoji -> icon lucide
src/pages/QuestionSetDetailPage.tsx        emoji -> icon lucide
src/pages/AdminDashboardPage.tsx           emoji -> icon lucide
src/pages/AdminWebsiteContentPage.tsx      emoji -> icon lucide
src/pages/QuickGeneratePage.tsx            emoji -> icon lucide
src/pages/QuestionGeneratePage.tsx         emoji -> icon lucide
src/styles/tokens.css                      sửa tương phản nhãn trên nền thương hiệu (chế độ tối)
src/pages/landing/index.tsx                thiết kế lại toàn bộ trang chủ
src/utils/personalizationUi.ts             sửa nhận diện tính năng bị tắt
src/components/ui/StatTile.tsx             StatGrid nhận thuộc tính div
```

### 5.3 Không sửa

```
backend/**                                 API contract và nghiệp vụ giữ nguyên
src/api/**                                 client giữ nguyên
src/utils/adminPermissions.ts              RBAC phía client giữ nguyên
src/pages/Admin*.tsx                       nghiệp vụ admin giữ nguyên
```

### 5.4 ⚠️ Năm file backend bị sửa **không do redesign này**

```
backend/app/services/activity_log_service.py
backend/app/services/admin_audit_service.py
backend/app/services/ai_quota_service.py
backend/app/services/system_health_service.py
backend/app/services/system_settings_service.py
```

Nội dung: `database or get_database()` → `database if database is not None else get_database()`. Đây là bản sửa **đúng và cần thiết** (pymongo `Database` không hỗ trợ kiểm tra giá trị chân lý nên biểu thức `or` gây `NotImplementedError`). `git status` lúc bắt đầu phiên báo working tree sạch, nên các thay đổi này xuất hiện trong khoảng thời gian phiên đang chạy nhưng **không do tôi thực hiện** — có thể từ một phiên tự động khác trên cùng repo.

**Đề nghị:** xem lại và commit riêng, tách khỏi phần giao diện. Toàn bộ 253 test backend pass với các thay đổi này.

---

## 6. Lệnh đã chạy

| Lệnh | Kết quả |
|---|---|
| `npx tsc -b --force` | ✅ 0 lỗi |
| `npx eslint src` | ✅ 0 lỗi |
| `npx vite build` | ✅ thành công |
| `python -m pytest tests -q` (backend) | ✅ **253 passed**, 13 subtests passed, 21s |
| Playwright: quét route theo vai trò | ✅ 20/20 kịch bản phân quyền đạt |
| Playwright: quét responsive 6 kích thước | ✅ 54 lượt kiểm tra |

### Ghi chú về test

- **Backend test:** `pytest` không có trong `backend/.venv`; phải dùng venv gốc của repo (`source ../.venv/bin/activate`). Đây là điểm cần lưu ý khi chạy lại.
- **Integration test riêng:** không có bộ integration test tách biệt trong project. `backend/tests/` (253 test) đã bao gồm test qua ASGI client cho admin, RBAC, settings, content, personalization.
- **Playwright test suite:** project không có bộ test Playwright sẵn (`frontend/test-results/` chỉ là thư mục rỗng do lần chạy trước). Việc kiểm thử được thực hiện bằng script Playwright ad-hoc, kết quả ghi trong báo cáo này.
- `frontend/src/tests/test_chat.py` là file Python nằm trong thư mục frontend, không thuộc luồng test nào; đã có từ trước phiên này.

---

## 7. Kết quả test

```
Backend:   253 passed, 13 subtests passed, 16 warnings          21.15s
TypeScript: 0 lỗi
ESLint:     0 lỗi
Build:      dist/assets/index.css  ~160 kB (gzip ~27.5 kB)
            dist/assets/index.js   ~825 kB (gzip ~210 kB)
```

Cảnh báo `chunk > 500 kB` vẫn còn — đây là vấn đề đã ghi nhận từ audit (M5), cần `React.lazy`, không phải hệ quả của redesign. Xem §10.

---

## 8. Screenshot trước / sau

Toàn bộ ảnh nằm trong `docs/ui-redesign/screenshots/`.

| Thư mục | Nội dung |
|---|---|
| `reference/` | Trang tham khảo ở 1440 · 768 · 390 (chỉ để đối chiếu nguyên lý bố cục) |
| `before/` | Trang chủ, đăng nhập, dashboard học sinh/giáo viên, học liệu, ngân hàng câu hỏi, hỏi đáp, sinh đề |
| `after/` | Trang chủ (1440/768/390 + full page), nav 3 vai trò (desktop + mobile), dashboard học sinh/giáo viên, hồ sơ, học liệu, 404, trạng thái cá nhân hóa tắt |

Các cặp đối chiếu đáng xem nhất:

| Trước | Sau | Điểm khác |
|---|---|---|
| `before/before-landing-desktop.png` | `after/landing-1440.png` | Hero, khoảng trắng, nhận diện indigo, minh hoạ riêng |
| `before/teacher-dashboard-desktop.png` | `after/teacher-dashboard-desktop.png` | Bỏ 4 thẻ 01–04, bỏ gradient tím, nav 4 mục có icon |
| `before/student-dashboard-desktop.png` | `after/student-dashboard-desktop.png` | Nội dung thật thay cho mục lục tính năng |
| `before/teacher-documents-desktop.png` | `after/teacher-documents-desktop.png` | Không còn panel K-Means |

---

## 9. Lỗi đã sửa

### Critical

| # | Lỗi | Cách sửa | Kiểm chứng |
|---|---|---|---|
| C1 | Học sinh gõ URL vào được đầy đủ trang giáo viên (`/documents`, `/generate`, `/question-history`, `/chat-advanced`, `/classes`) | Thêm `RoleRoute` chặn ở tầng route, không render children khi vai trò không khớp | 20/20 kịch bản Playwright |
| C2 | Giáo viên vào được trang học sinh rồi nhận 403 với trang gần như trắng | `RoleRoute` cho nhóm học sinh | như trên |
| C3 | Đăng ký tài khoản lỗi HTTP 500 hoàn toàn | Nguyên nhân là **bytecode `.pyc` cũ**, không phải lỗi source. Xoá `__pycache__` | Đăng ký trả 201 |

### High

| # | Lỗi | Cách sửa |
|---|---|---|
| H1 | Emoji dùng làm icon trên toàn bộ navigation | Thay bằng `lucide-react` |
| H2 | Sidebar admin có thêm 5 mục của giáo viên, gần như luôn rỗng | Nav dựng theo `area`, admin chỉ nhận nhóm admin |
| H3 | Onboarding khoá cứng mọi route, không có đường thoát | Thêm nút "Để sau"; bỏ redirect cưỡng chế trong layout |
| H4 | Không có trang 404, URL sai hiện trang marketing | `NotFoundPage` |
| H5 | Không có trang hồ sơ ở bất kỳ vai trò nào | `ProfilePage` cho học sinh và giáo viên |
| H6 | Dashboard chỉ là 4 thẻ trỏ lại sidebar | Hai dashboard riêng với dữ liệu thật + hướng dẫn cho người mới |

### Medium

| # | Lỗi | Cách sửa |
|---|---|---|
| M1 | Thuật ngữ K-Means / vector embeddings lộ ra UI giáo viên | Gỡ panel khỏi UI, giữ endpoint backend |
| M2 | Trạng thái pipeline hiện mã kỹ thuật | `ProcessingStatusBadge` với nhãn tiếng Việt |
| M3 | Nhận diện "tính năng bị tắt" là **code chết**: helper kiểm tra 404 + chữ "disabled", backend trả **403** + tiếng Việt | Sửa helper nhận cả 403/404 và cả hai ngôn ngữ; thêm `FeatureDisabledState` |
| M4 | Trạng thái tính năng tắt lộ câu "Backend trả về trạng thái disabled" cho người học | Viết lại bằng ngôn ngữ người dùng, kèm 2 hành động thay thế |
| M5 | Xung đột tiền tố CSS: `PublicLayout.css` đã dùng `.pub-`, `.pub-main` có `display:flex` hàng ngang → section xếp ngang, trang cuộn ngang 2202px | Đổi tiền tố mới sang `.ezp-` (277 chỗ) |
| M6 | Dải trắng bên phải trên màn hình > 1280px (`#root` là flex row nên khung co theo nội dung) | Khai báo `flex:1; width:100%; min-width:0` cho `.ezp-root` và `.ez-shell` |
| M7 | Menu header CMS trỏ tới anchor không còn tồn tại (`#workflow`, `#benefits`) — **link chết** | Bảng ánh xạ sang route thật, loại mục không resolve được, dedupe, bổ sung mục canonical |
| M8 | React: hai children cùng key `"Hỗ trợ"` (CMS đặt `contact_label` trùng tiêu đề nhóm footer) | Key theo `id` ổn định thay vì theo tiêu đề |
| M9 | 8 trang thiếu thẻ `h1` (`/login`, `/register`, `/published-questions`, `/learning-history`, `/student-statistics`, `/documents`, `/classes`, `/chat-advanced`) | Nâng tiêu đề chính từ `h2` lên `h1` |
| M10 | Gradient text ở `.sidebar-brand-text h1` và `.eyebrow` | Chuyển sang màu đặc |
| M11 | Vùng bấm link footer trên mobile thấp hơn ngưỡng khuyến nghị | `min-height: 32px` dưới 640px |
| M12 | `Button` không mặc định `type` → nút trong `<form>` submit ngoài ý muốn | Mặc định `type="button"` |
| M13 | `AppLayout` và `AdminRoute` mỗi cái tự gọi `/auth/me` lại mỗi lần đổi route | `AuthContext` dùng chung, gọi một lần |
| M14 | `setState` đồng bộ trong effect (3 chỗ) gây render dây chuyền | Suy ra giá trị lúc render, chỉ setState trong callback của promise |
| M15 | `useFieldIds` / `isDocumentReady` export cùng file component → phá Fast Refresh | Tách sang file riêng |
| M16 | **Nút primary ở chế độ tối chỉ đạt 3.63:1** — dưới ngưỡng AA 4.5:1 cho chữ thường. Nguyên nhân: chế độ tối nâng màu thương hiệu sáng lên (indigo-400) nhưng nhãn vẫn để trắng | Đổi `--ez-text-on-brand` ở chế độ tối sang màu gần đen. Kết quả: primary **5.09:1**, secondary 9.21:1, error 6.57:1 |
| M17 | Emoji dùng làm icon trong **20 file** thân trang (không chỉ navigation) — 155 ký tự | Thay toàn bộ bằng `lucide-react`, icon cạnh chữ có `aria-hidden`, nút chỉ có icon có `aria-label` + `title` |

### Ghi chú về đo tương phản

Lần đo đầu báo mục navigation ở chế độ tối chỉ đạt 2.2:1. **Đây là lỗi của phép đo, không phải lỗi giao diện**: hàm đo lấy nền bán trong suốt `rgba(107,125,237,0.14)` như thể là nền đục, thay vì tổng hợp nó lên nền sidebar. Sau khi sửa hàm đo để xếp lớp đúng, giá trị thật là **8.33:1**. Con số 3.63:1 của nút primary thì đúng và đã được sửa (M16).

Bảng đo cuối, tính theo ngưỡng WCAG tương ứng cỡ chữ và độ đậm:

| Thành phần | Sáng | Tối | Ngưỡng | Kết quả |
|---|---|---|---|---|
| `h1` (30px, bold) | 15.46 | 15.69 | 3.0 | ✅ |
| Mô tả dưới tiêu đề (15px) | 6.29 | 9.14 | 4.5 | ✅ |
| Mục nav thường | 7.46 | 8.33 | 4.5 | ✅ |
| Mục nav đang mở | 7.46 | 8.33 | 4.5 | ✅ |
| Nhãn nút primary | 6.24 | 5.09 | 4.5 | ✅ |

**0 lỗi tương phản** ở cả hai chế độ.

### Lỗi môi trường đã xử lý

| Lỗi | Cách xử lý |
|---|---|
| CORS chặn `/api/v1/website-content` | Vite nhảy sang port 5174 vì 5173 bị chiếm; `BACKEND_CORS_ORIGINS` chỉ khai báo 5173. Giải phóng 5173 |
| App trắng trang sau khi đổi tên file chỉ khác chữ hoa/thường | macOS không phân biệt hoa/thường → Vite giữ module cũ. `rm -rf node_modules/.vite` |
| Bytecode `.pyc` cũ gây 500 | `find backend/app -name "__pycache__" -type d -exec rm -rf {} +` |

---

## 10. Lỗi còn lại

### Chưa làm — không phải lỗi, là phạm vi chưa triển khai

| Hạng mục | Ghi chú |
|---|---|
| Gộp `/generate` vào `/gv/de-thi` | Hai luồng sinh đề song song vẫn còn. Đã có role guard nên không còn rủi ro phân quyền |
| Gộp `ChatBox` vào tab "Hỏi đáp" của trang chi tiết học liệu | Hai giao diện hỏi đáp vẫn còn |
| Gộp Lịch sử + Thống kê → một trang Tiến độ | Hai trang vẫn tách; nav "Tiến độ" tạm trỏ `/learning-history` |
| Chi tiết học liệu chuyển sang Tabs | Vẫn xếp mọi panel dọc |
| Tách `QuestionSetDetailPage` thành trang soạn (GV) và trang làm bài (HS) | Vẫn dùng chung một component |
| Bổ sung đổi tên / xoá lớp | Backend đã có `PATCH`/`DELETE /classes/{id}`, UI chưa gọi |
| Gỡ 2 tab trùng trong `AdminDashboardPage` | Quản lý người dùng và nhật ký vẫn có hai nơi |
| Đổi tiền tố route sang `/hs`, `/gv` kèm redirect | Vẫn dùng đường dẫn cũ; role guard đã áp dụng đầy đủ |
| Rút alias tên biến CSS cũ | Còn dùng để các trang chưa thiết kế lại không vỡ |

### Lỗi Low còn lại — cố ý không sửa

| # | Lỗi | Vì sao để lại |
|---|---|---|
| L1 | Bundle JS ~825 kB một chunk | Cần `React.lazy` cho `AdvancedChatPage`, `QuickGeneratePage`, `AdminDashboardPage`. Đây là thay đổi cấu trúc import có rủi ro, nên tách thành việc riêng |
| L2 | `GET /documents/{id}/verify/status` trả 404 khi chưa có phiên kiểm chứng, log ra console | Sửa đúng cần đổi hành vi backend hoặc bọc lại lớp API; nằm ngoài phạm vi "không đổi API contract" |
| L3 | Gọi API trùng trong dev do React Strict Mode | Chỉ xảy ra ở môi trường dev |
| L4 | `LoginPage` chỉ so `role === 'admin'` nên `super_admin`/`moderator`/`support`/`analyst` đăng nhập xong về `/dashboard` | `RoleRoute` sẽ chuyển họ tiếp về `/admin/dashboard`, nên không còn kẹt. Sửa gốc cần dùng `areaForRole` trong LoginPage |
| L5 | `/health/ready` vẫn kiểm tra ChromaDB dù RAG đã chuyển sang NumPy | Thuộc backend, ngoài phạm vi |
| L6 | Sáu file section trang chủ cũ và `landing.css` không còn được dùng | Giữ lại để hoàn tác dễ; xoá được an toàn khi đã chấp nhận thiết kế mới |
| L7 | Emoji còn trong các file landing chết (`DemoSection`, `UploadSection`, `HeroIllustration`, `HeroSection`, `LandingHeader`, `DiagramSection`, `UploadWidget`, `landing.css`) và trong `src/tests/runChatTests.tsx` | Không file nào trong số này được import hay hiển thị cho người dùng; `runChatTests.tsx` là script test, bị `tsconfig` loại trừ. Sửa chúng là công vô ích khi các file landing chết sẽ bị xoá |

### Blocker — không thể kiểm thử

| Hạng mục | Lý do |
|---|---|
| Đăng nhập Google / Facebook | **Không tồn tại** trong backend (`app/routers/auth.py` chỉ có email/password). Không phải lỗi, là chức năng chưa có |
| Xác thực email | `email_verification_required = false`, không có luồng gửi/xác nhận |
| Báo cáo kết quả toàn lớp cho giáo viên | Không có endpoint tổng hợp theo lớp. Cố ý **không** đưa lên UI để tránh nút giả |
| Sinh câu hỏi / hỏi đáp bằng AI thật đầu-cuối | Cần gọi Gemini/Groq thật, tốn quota và có thể tính phí. Đã kiểm thử giao diện và luồng, không kiểm thử tạo nội dung thật |
| Kiểm thử với dữ liệu học liệu thật | Tài khoản QA không có học liệu; các trang được kiểm thử ở trạng thái rỗng và trạng thái người mới |

---

## 11. Hướng dẫn chạy project

```bash
# 1. Backend — cổng 8000
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
# 2. Frontend — BẮT BUỘC cổng 5173 vì BACKEND_CORS_ORIGINS chỉ khai báo cổng này
cd frontend
npm run dev
```

```bash
# 3. Kiểm tra chất lượng
cd frontend && npx tsc -b --force && npx eslint src && npx vite build
```

```bash
# 4. Test backend — dùng venv GỐC của repo, không phải backend/.venv
cd backend && source ../.venv/bin/activate && python -m pytest tests -q
```

### Khi gặp sự cố

```bash
# Lỗi 500 lạ ở backend sau khi sửa code Python
find backend/app -name "__pycache__" -type d -exec rm -rf {} +
```

```bash
# Frontend trắng trang sau khi đổi tên file
rm -rf frontend/node_modules/.vite
```

### Tài khoản kiểm thử — **xoá trước khi bàn giao**

| Email | Vai trò |
|---|---|
| `qa.student@ezedu-qa.example.com` | student, đã hoàn tất onboarding |
| `qa.teacher@ezedu-qa.example.com` | lecturer |
| `qa.admin@ezedu-qa.example.com` | admin (thăng quyền bằng `backend/scripts/bootstrap_admin.py`) |

Mật khẩu chung: `TestPass123!`. Cả ba nằm trên MongoDB Atlas dùng chung.

---

## 12. Cách hoàn tác

Toàn bộ thay đổi **chưa được commit**. Commit gần nhất là `b4e06d1`.

```bash
# Xem toàn bộ thay đổi
git status && git diff
```

```bash
# Hoàn tác chỉ phần frontend, giữ lại tài liệu redesign
git checkout -- frontend/
rm -rf frontend/src/styles frontend/src/components/ui frontend/src/components/public
rm -rf frontend/src/components/domain frontend/src/hooks frontend/src/pages/student frontend/src/pages/teacher
rm -f frontend/src/components/RoleRoute.tsx frontend/src/components/app-layout.css
rm -f frontend/src/contexts/AuthContext.tsx frontend/src/contexts/auth-context.ts
rm -f frontend/src/pages/NotFoundPage.tsx frontend/src/pages/ProfilePage.tsx
rm -f frontend/src/pages/PublicInfoPages.tsx frontend/src/pages/dashboard.css
rm -rf frontend/node_modules/.vite
```

```bash
# Hoàn tác toàn bộ, kể cả tài liệu
git checkout -- . && git clean -fd
```

**Lưu ý:** năm file trong `backend/app/services/` không do redesign này tạo ra (§5.4). Nếu hoàn tác toàn bộ, các bản sửa `or` → `is not None` đó cũng mất, và lỗi `NotImplementedError` sẽ quay lại.

---

## 13. Điều kiện hoàn tất

| Điều kiện | Trạng thái |
|---|---|
| Build thành công | ✅ `tsc` 0 lỗi, `eslint` 0 lỗi, `vite build` thành công |
| Không còn lỗi Console nghiêm trọng | ✅ Không có console error hay unhandled rejection trên mọi route đã kiểm |
| Các tác vụ cốt lõi hoạt động | ✅ Đăng ký, đăng nhập, dashboard, danh sách học liệu, ngân hàng câu hỏi, bài luyện tập, hỏi đáp, hồ sơ |
| UI responsive | ✅ Không cuộn ngang ở 1440 · 1280 · 1024 · 768 · 390 · 360 |
| Role navigation đúng | ✅ 20/20 kịch bản phân quyền đạt; nav mỗi vai trò chỉ chứa mục của vai trò đó |
| Backend không bị ảnh hưởng | ✅ 253 test pass, không endpoint nào bị xoá |

Sáu điều kiện đều đạt. Phần chưa triển khai ở §10 là **phạm vi còn lại**, không phải lỗi tồn đọng — mỗi hạng mục đều có đặc tả sẵn trong [04-page-inventory.md](04-page-inventory.md) và [05-component-map.md](05-component-map.md).
