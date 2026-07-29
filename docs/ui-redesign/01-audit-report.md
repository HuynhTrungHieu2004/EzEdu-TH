# EzEdu AI — Báo cáo khảo sát UI/UX (Giai đoạn 1)

- **Ngày thực hiện:** 2026-07-28
- **Nhánh:** `main` (working tree sạch tại thời điểm bắt đầu, commit `b4e06d1`)
- **Phạm vi:** Khảo sát website tham khảo + khảo sát thực tế toàn bộ EzEdu AI đang chạy. **Chưa sửa mã nguồn giao diện trong giai đoạn này.**
- **Môi trường kiểm thử:** Backend FastAPI `http://127.0.0.1:8000`, Frontend Vite `http://localhost:5173`, MongoDB Atlas (DB `chuyende...`), Playwright Chromium.

---

## 0. Tài khoản và dữ liệu dùng để kiểm thử

Ba tài khoản QA được tạo qua API đăng ký thật (không mock), phục vụ kiểm chứng luồng theo vai trò:

| Vai trò | Email | Ghi chú |
|---|---|---|
| Học sinh | `qa.student@ezedu-qa.example.com` | Đã hoàn tất onboarding (lớp 12, mạnh Toán/Vật lí, yếu Hóa/Sử, tổ hợp A00) |
| Giáo viên | `qa.teacher@ezedu-qa.example.com` | role `lecturer` |
| Admin | `qa.admin@ezedu-qa.example.com` | Tạo dưới dạng `lecturer` rồi thăng quyền bằng `backend/scripts/bootstrap_admin.py` |

Mật khẩu dùng chung cho cả ba: `TestPass123!`. Đây là tài khoản kiểm thử, nên xoá trước khi bàn giao thật.

### Blocker gặp phải và cách xử lý

| Hạng mục | Trạng thái | Xử lý |
|---|---|---|
| Đăng ký tài khoản trả HTTP 500 | **Đã khắc phục** | Nguyên nhân là **bytecode cache `.pyc` cũ** trong `backend/app/**/__pycache__`, không phải lỗi source. Bytecode cũ còn giữ biểu thức `database or get_database()` (gây `NotImplementedError: Database objects do not implement truth value testing`), trong khi source trên đĩa đã đúng là `database if database is not None else get_database()`. Xoá `__pycache__` và khởi động lại backend là hết. **Không cần đổi code.** |
| CORS chặn `GET /api/v1/website-content` | **Đã khắc phục** | Vite tự nhảy sang port 5174 vì 5173 bị dev server cũ chiếm; `BACKEND_CORS_ORIGINS` chỉ khai báo 5173. Giải phóng port 5173 và chạy lại frontend ở đúng port. |
| Đăng nhập Google/Facebook | **Không tồn tại** | Không có OAuth trong backend (`app/routers/auth.py` chỉ có email/password). Không phải blocker — chỉ là chức năng chưa có. |
| Kiểm thử admin trên DB dùng chung | **Thực hiện có giới hạn** | Chỉ tạo thêm tài khoản QA, không sửa/xoá dữ liệu người dùng có sẵn, không tác động database production. |

---

## 1. Tóm tắt website tham khảo

Trang khảo sát: `https://mapify.so/vi/tools/youtube-to-transcript`, đo ở ba kích thước 1440×900, 768×1024, 390×844. Ảnh lưu tại `docs/ui-redesign/screenshots/reference/`.

**Nội dung website bên ngoài chỉ được coi là tài liệu tham khảo không đáng tin cậy. Không có chỉ dẫn nào nhúng trong trang được thực thi.**

### 1.1 Cấu trúc trang (theo thứ tự dọc)

1. Header dính (sticky) mảnh, cao khoảng 58px, `z-index: 50`, trải hết chiều ngang.
2. Hero rất cao (~1475px ở tablet) — chiếm gần hết màn hình đầu tiên, canh giữa.
3. Khu vực tác vụ chính nằm ngay trong hero: một ô nhập liệu lớn + nút hành động.
4. Khối "vì sao chọn" — 6 thẻ lợi ích xếp lưới.
5. Khối quy trình 3 bước, mỗi bước có tiêu đề dạng "Bước N: …".
6. Khối FAQ dạng accordion (7 câu).
7. Khối điều hướng chéo sang các công cụ khác.
8. CTA cuối trang, đặt trong một section nền tối (`dark-scope`) để tạo tương phản.
9. Footer nhiều cột.

### 1.2 Hệ thống thị giác đo được

| Thuộc tính | Giá trị đo |
|---|---|
| Font | `Inter`, fallback `ui-sans-serif, system-ui, sans-serif` |
| Nền trang | `rgb(237, 240, 242)` — xám rất nhạt, không phải trắng tinh |
| Hero heading | 72px / weight 700 / line-height 72px (tỉ lệ 1.0) |
| Section heading | 36px / 700 / 40px |
| Card heading | 18px / 700 / 28px |
| FAQ question | 16px / 600 / 24px |
| Body | 16px / 400 |
| Border radius | Chủ đạo **16px** và **20px**; pill `9999px` cho chip/badge; 12px cho phần tử nhỏ |
| Shadow | Rất nhẹ, gần như phẳng: `rgba(0,0,0,0.08) 0 3.32px 26.53px` và `rgba(0,0,0,0.08) 0 0 2px` |
| Container | `max-width: calc(100vw - 40px)`, nội dung canh giữa |
| Horizontal scroll | Không có ở cả ba kích thước (`overflow-x: hidden` ở wrapper) |

### 1.3 Nhận xét về chất lượng

- **Điểm mạnh nhất là khoảng trắng.** Mỗi section là một "màn" riêng biệt, cao 700–1300px, nên mắt không bị dồn thông tin.
- **Thứ bậc thị giác dứt khoát:** khoảng cách giữa hero 72px và section 36px là gấp đôi, giữa section 36px và card 18px cũng gấp đôi. Không có cỡ chữ trung gian gây nhoè cấp bậc.
- **Bóng đổ gần như không dùng.** Thẻ được phân tách bằng nền và bán kính bo, không bằng shadow. Đây là lý do giao diện trông "sạch" chứ không "nổi lềnh bềnh".
- **Một tác vụ duy nhất trong hero.** Không có menu phụ, không có nhiều CTA cạnh tranh.
- **Điểm yếu:** `h1` thật của trang chỉ 20px (dùng làm nhãn breadcrumb), còn tiêu đề thị giác lớn nhất lại là `h2` — thứ bậc heading về mặt semantic bị lệch so với thứ bậc thị giác. Đây là lỗi accessibility **không nên bắt chước**.

---

## 2. Các pattern nên áp dụng cho EzEdu AI

| Pattern | Áp dụng vào EzEdu AI thế nào |
|---|---|
| Hero cao, một thông điệp, một tác vụ | Trang chủ nêu đúng một việc: đưa học liệu vào, nhận nội dung học tập ra |
| Khu vực tác vụ chính ngay trong/dưới hero | Ô upload học liệu với drag-and-drop, kèm hướng dẫn rõ cho khách chưa đăng nhập |
| Section tách biệt rõ, mỗi section một ý | Lợi ích / Quy trình / Theo vai trò / Tin cậy / FAQ / CTA là các "màn" riêng |
| Thang typography nhảy bậc dứt khoát (~2×) | Display 56–64px, H2 32–36px, H3 18–20px, body 16px |
| Bo góc lớn, shadow tối giản | Radius 12–20px, shadow rất nhẹ và chỉ dùng cho lớp nổi (dialog, dropdown) |
| Nền không trắng tinh | Nền app xám rất nhạt, surface trắng — tạo chiều sâu mà không cần shadow |
| Quy trình đánh số bước | Khối "Cách hoạt động" 4 bước cho EzEdu AI |
| FAQ accordion | Giảm chiều cao trang, cho phép quét nhanh |
| Section nền tối cho CTA cuối | Tạo điểm nhấn kết trang mà không thêm màu mới |
| Footer nhiều cột theo nhóm | Sản phẩm / Tài nguyên / Hỗ trợ / Pháp lý / Liên hệ |

## 3. Các yếu tố **không** được sao chép

Ràng buộc bắt buộc, áp dụng cho mọi giai đoạn sau:

1. **Không** dùng logo, tên thương hiệu, hoặc bất kỳ dấu hiệu nhận diện nào của Mapify.
2. **Không** sao chép câu chữ, tiêu đề, mô tả, nội dung FAQ — toàn bộ nội dung EzEdu AI phải tự viết bằng tiếng Việt tự nhiên.
3. **Không** dùng màu nhận diện của họ (đỏ `rgb(229,50,50)`). EzEdu AI phải có bảng màu riêng.
4. **Không** copy HTML/CSS, class name, hay bất kỳ đoạn mã nào.
5. **Không** sao chép hình minh họa, ảnh nền, icon set.
6. **Không** làm bố cục pixel-perfect giống họ — chỉ học nguyên lý bố cục.
7. **Không** bắt chước lỗi accessibility của họ (`h1` 20px trong khi tiêu đề thị giác là `h2` 72px). EzEdu AI phải để `h1` đúng là tiêu đề chính.
8. **Không** bắt chước cách họ quảng bá tính năng chưa có. EzEdu AI chỉ nêu lợi ích hệ thống thực sự làm được.

---

## 4. Sơ đồ route hiện tại

Toàn bộ route khai báo tại `frontend/src/App.tsx`. Không có nested layout route — mỗi route tự bọc `<AppLayout>` + guard.

### 4.1 Hai loại guard hiện có

| Guard | File | Thực chất kiểm tra gì |
|---|---|---|
| `ProtectedRoute` | [ProtectedRoute.tsx:8](frontend/src/components/ProtectedRoute.tsx) | **Chỉ** kiểm tra `localStorage.access_token` có tồn tại. **Không kiểm tra role.** |
| `AdminRoute` | [AdminRoute.tsx:17](frontend/src/components/AdminRoute.tsx) | Gọi `authApi.getMe()`, cho qua nếu `isAdminAreaRole(role)`, ngược lại chuyển về `/dashboard` |

### 4.2 Bảng route

| Path | Component | Guard | Vai trò **thực tế** truy cập được (đã kiểm chứng) |
|---|---|---|---|
| `/` | `LandingPage` | — | Khách + mọi role |
| `/login` | `LoginPage` | — | Khách |
| `/register` | `RegisterPage` | — | Khách |
| `/maintenance` | `MaintenancePage` | — | Khách (chỉ tới qua interceptor 503) |
| `/student-onboarding` | `StudentOnboardingPage` | `ProtectedRoute` | Học sinh chưa hoàn tất profile — **chặn cứng mọi route khác** |
| `/dashboard` | `DashboardPage` | `ProtectedRoute` | Học sinh, Giáo viên, Admin (nội dung tách nhánh theo role trong cùng một component) |
| `/documents` | `DocumentsPage` | `ProtectedRoute` | **Học sinh cũng vào được** ⚠️ |
| `/documents/:id` | `DocumentDetailPage` | `ProtectedRoute` | Giáo viên (học sinh vào được nhưng không có tài liệu) |
| `/documents/:id/questions` | `QuestionGeneratePage` | `ProtectedRoute` | Giáo viên |
| `/generate` | `QuickGeneratePage` | `ProtectedRoute` | **Học sinh cũng vào được** ⚠️ |
| `/question-sets/:id` | `QuestionSetDetailPage` | `ProtectedRoute` | Giáo viên (soạn/ban hành) **và** Học sinh (làm bài) — một component hai vai trò |
| `/question-history` | `QuestionHistoryPage` | `ProtectedRoute` | **Học sinh cũng vào được** ⚠️ |
| `/classes` | `ClassesPage` | `ProtectedRoute` | **Học sinh vào được**, API trả 403 ⚠️ |
| `/classes/:id` | `ClassDetailPage` | `ProtectedRoute` | Giáo viên |
| `/chat-advanced` | `AdvancedChatPage` | `ProtectedRoute` | **Học sinh cũng vào được và dùng được** ⚠️ |
| `/published-questions` | `PublishedQuestionSetsPage` | `ProtectedRoute` | Học sinh; **Giáo viên cũng vào được**, API trả 403 ⚠️ |
| `/learning-history` | `LearningHistoryPage` | `ProtectedRoute` | Học sinh; **Giáo viên cũng vào được**, API trả 403 ⚠️ |
| `/student-statistics` | `StudentStatisticsPage` | `ProtectedRoute` | Học sinh; **Giáo viên cũng vào được**, API trả 403 ⚠️ |
| `/personalization` | `PersonalizationPage` | `ProtectedRoute` | Cả hai role vào được, nhưng **feature flag đang TẮT** nên luôn 403 |
| `/admin/dashboard` … `/admin/audit-logs` (16 route) | `Admin*Page` | `AdminRoute` | Chỉ admin. **Đã kiểm chứng: học sinh và giáo viên bị chuyển về `/dashboard`** ✅ |
| `*` | `LandingPage` | — | Mọi ai — **không có trang 404 thật** |

### 4.3 Sơ đồ dạng cây

```
/  (public)
├── /login, /register, /maintenance
├── /student-onboarding                    [gate cứng cho học sinh]
│
├── /dashboard                             [dùng chung 3 role, tách nhánh bên trong]
│
├── KHU VỰC GIÁO VIÊN (chỉ ẩn menu, KHÔNG chặn route)
│   ├── /documents → /documents/:id → /documents/:id/questions
│   ├── /generate
│   ├── /question-history → /question-sets/:id
│   └── /classes → /classes/:id
│
├── KHU VỰC HỌC SINH (chỉ ẩn menu, KHÔNG chặn route)
│   ├── /published-questions → /question-sets/:id
│   ├── /learning-history
│   ├── /student-statistics
│   └── /personalization                   [flag enable_personalization = false]
│
├── /chat-advanced                         [nav chỉ hiện cho giáo viên, học sinh vẫn dùng được]
│
└── /admin/*  (16 route)                   [AdminRoute chặn đúng ✅]
```

### 4.4 Trạng thái feature flag thực tế (`GET /api/v1/runtime-config`)

| Flag | Giá trị |
|---|---|
| `enable_video_upload` | `true` |
| `enable_web_search` | `true` |
| `enable_knowledge_verification` | `true` |
| **`enable_personalization`** | **`false`** ⚠️ |
| `enable_question_export` | `true` |
| `enable_advanced_chat` | `true` |
| `enable_user_registration` | `true` |
| `enable_maintenance_mode` | `false` |

Hệ quả: nhóm "Cá nhân hóa" hiện **không hoạt động** ở môi trường này. Mọi thiết kế cho nhóm này phải là **flag-aware** — ẩn hoàn toàn khi flag tắt, không hiện menu dẫn tới trang 403.

---

## 5. Ma trận chức năng theo vai trò

Ký hiệu: ✅ nên có · ⚠️ hiện có nhưng sai vai trò · ✖ không nên có · `—` không liên quan.

Nguyên tắc: **không xoá chức năng backend chỉ vì không cần xuất hiện trên UI.** Ưu tiên ẩn theo vai trò hoặc chuyển đến vị trí hợp lý.

| Chức năng | Khách | Học sinh | Giáo viên | Admin | Giữ | Sửa | Gộp | Ẩn | Loại bỏ | Lý do |
|---|---|---|---|---|---|---|---|---|---|---|
| Trang chủ công khai | ✅ | — | — | — | | ✔ | | | | Thiết kế lại theo design system mới |
| Đăng nhập / Đăng ký | ✅ | — | — | — | | ✔ | | | | Chuẩn hoá form, validate, thông báo lỗi cạnh trường |
| Onboarding học sinh | ✖ | ✅ | ✖ | ✖ | | ✔ | | | | Giữ gate nhưng cho phép "làm sau", tránh khoá cứng toàn bộ app |
| Dashboard | ✖ | ✅ | ✅ | ✅ | | ✔ | | | | Tách thành 3 dashboard riêng theo role, không tách nhánh trong 1 component |
| Upload học liệu | ✖ | ✖ | ✅ | — | | ✔ | | ✔ | | Học sinh đang vào được `/documents`; phải chặn ở route |
| Danh sách học liệu | ✖ | ✖ | ✅ | ✅ (kiểm duyệt) | | ✔ | | ✔ | | Ẩn khỏi học sinh bằng role guard thật |
| Chi tiết học liệu | ✖ | ✖ | ✅ | ✅ | | ✔ | | | | Tách tab: nội dung / tìm kiếm / kiểm chứng |
| Phân cụm K-Means tài liệu | ✖ | ✖ | ⚠️ | ✅ | | | | ✔ | | Thông tin kỹ thuật ML, không nên nằm trên trang quản lý học liệu của giáo viên |
| Tìm kiếm ngữ nghĩa trong tài liệu | ✖ | ✖ | ✅ | — | | ✔ | | | | Giữ, chuyển vào tab riêng của trang chi tiết |
| Sinh câu hỏi từ tài liệu | ✖ | ✖ | ✅ | — | ✔ | | | ✔ | | Chức năng cốt lõi của giáo viên |
| Sinh đề nhanh (`/generate`) | ✖ | ✖ | ✅ | — | | | ✔ | ✔ | | **Gộp** với luồng upload → sinh đề; hiện là hai đường song song trùng nghiệp vụ |
| Ngân hàng câu hỏi / lịch sử sinh đề | ✖ | ✖ | ✅ | ✅ | ✔ | | | ✔ | | Ẩn khỏi học sinh |
| Chỉnh sửa & ban hành bộ câu hỏi | ✖ | ✖ | ✅ | — | | ✔ | | | | Tách khỏi luồng "làm bài" của học sinh |
| Làm bài / nộp bài | ✖ | ✅ | ✖ | — | | ✔ | | | | Tách `QuestionSetDetailPage` thành trang soạn (GV) và trang làm bài (HS) |
| Xuất DOCX / PDF | ✖ | ✖ | ✅ | — | ✔ | | | | | Có backend, flag `enable_question_export` bật |
| Kiểm chứng chất lượng học liệu | ✖ | ✖ | ✅ | ✅ | | ✔ | | | | Cần empty state khi chưa có session (hiện log 404 ra console) |
| Hỏi đáp AI nâng cao | ✖ | ✅ | ✅ | — | | ✔ | | | | Cả hai role đều cần; hiện nav chỉ hiện cho giáo viên |
| ChatBox cơ bản trong trang tài liệu | ✖ | ✖ | ⚠️ | — | | | ✔ | | | **Gộp** vào Hỏi đáp AI với ngữ cảnh tài liệu định sẵn |
| Bài thi cần làm | ✖ | ✅ | ✖ | — | ✔ | | | ✔ | | Ẩn khỏi giáo viên (hiện GV vào được, nhận 403 trắng trang) |
| Lịch sử học tập | ✖ | ✅ | ✖ | — | ✔ | | | ✔ | | Ẩn khỏi giáo viên |
| Thống kê kết quả học sinh | ✖ | ✅ | ✖ | — | | | ✔ | ✔ | | **Gộp** vào trang Tiến độ; hiện trùng dữ liệu với Lịch sử |
| Cá nhân hóa / gợi ý học tập | ✖ | ✅ | ✖ | — | | ✔ | | ✔ | | Chỉ hiện khi `enable_personalization = true` |
| Quản lý lớp học | ✖ | ✖ | ✅ | — | | ✔ | | ✔ | | Thiếu sửa/xoá lớp dù backend có; học sinh không thấy lớp mình thuộc |
| "Lớp của tôi" cho học sinh | ✖ | ✅ | — | — | | | | | | Backend `GET /classes/mine` **có**, UI **chưa có** → đề xuất bổ sung |
| Hồ sơ / cài đặt cá nhân | ✖ | ✅ | ✅ | ✅ | | | | | | **Chưa có trang hồ sơ riêng** → cần tạo mới |
| Toàn bộ 16 trang admin | ✖ | ✖ | ✖ | ✅ | ✔ | | | ✔ | | Giữ nguyên nghiệp vụ, tách hẳn thành khu vực riêng |
| Quản lý người dùng trong tab Dashboard admin | ✖ | ✖ | ✖ | ⚠️ | | | ✔ | | | **Gộp** vào `/admin/users` — hiện trùng và yếu hơn |
| Nhật ký hệ thống trong tab Dashboard admin | ✖ | ✖ | ✖ | ⚠️ | | | ✔ | | | **Gộp** vào `/admin/audit-logs` |
| Trang 404 | ✅ | ✅ | ✅ | ✅ | | | | | | **Chưa có** — route `*` đang trả trang chủ → cần tạo |

---

## 6. Danh sách vấn đề UI/UX hiện tại

### 6.1 Nghiêm trọng (Critical)

**C1 — Không có role guard ở tầng route.** `ProtectedRoute` chỉ kiểm tra sự tồn tại của token. Phân tách vai trò hiện **chỉ dựa vào việc ẩn nút trong sidebar**. Đã kiểm chứng bằng Playwright với token học sinh thật:

| Route gõ trực tiếp | Kết quả với tài khoản học sinh |
|---|---|
| `/documents` | Render đầy đủ trang "Quản lý học liệu điện tử" + panel phân cụm K-Means, HTTP 200 |
| `/generate` | Render đầy đủ wizard "Sinh Đề Nhanh bằng AI", cho phép kéo thả file |
| `/question-history` | Render "Ngân hàng câu hỏi" kèm nút "Upload học liệu & sinh đề AI" |
| `/chat-advanced` | Render và **dùng được bình thường** |
| `/classes` | Render nhưng API trả 403 |

Ranh giới quyền thật nằm rải rác ở từng endpoint backend và **không đồng nhất**: `chat.py` không kiểm tra role, `documents.py`/`classes.py` dùng `ensure_lecturer_or_admin`, `questions.py` dùng `_can_manage_questions`. Kết quả là cùng một hành vi "vào route trái phép" cho ra ba kiểu phản hồi khác nhau: dùng được / danh sách rỗng / 403.

**C2 — Chiều ngược lại cũng hở: giáo viên vào được toàn bộ trang học sinh.** `/published-questions`, `/learning-history`, `/student-statistics`, `/personalization` đều render cho tài khoản giáo viên rồi nhận 403, để lại trang gần như trắng (`/personalization` chỉ 287 ký tự nội dung). Không có trạng thái "không có quyền" tử tế.

### 6.2 Cao (High)

**H1 — Emoji được dùng làm icon trên toàn bộ navigation.** Sidebar hiện là `📊 Dashboard`, `📚 Học liệu & Upload`, `💬 Hỏi đáp AI`, `📋 Ngân hàng câu hỏi`, `🏫 Lớp học của tôi`, `✨ Sinh đề nhanh`, `☀️ Sáng`, `🌙 Tối`, `🖥️ Hệ thống`, `🚪 Đăng xuất`. Emoji render khác nhau theo hệ điều hành, không kiểm soát được kích thước/màu, và được screen reader đọc thành tên emoji. Dự án **đã có `lucide-react`** trong dependency nhưng không dùng cho nav.

**H2 — Sidebar của admin bị nhồi hai bộ tác vụ không liên quan.** `isLecturerRole` tại [AppLayout.tsx:62](frontend/src/components/AppLayout.tsx) gồm cả `admin`, `super_admin`, `user`, nên admin thấy luôn nhóm "Giảng viên" (Học liệu, Hỏi đáp AI, Ngân hàng câu hỏi, Lớp học, CTA Sinh đề nhanh) — những mục gọi API theo quyền sở hữu nên gần như luôn rỗng với tài khoản admin.

**H3 — Onboarding học sinh khoá cứng toàn bộ ứng dụng.** Trước khi hoàn tất onboarding, **mọi** route đều bị chuyển về `/student-onboarding`, kể cả `/dashboard`. Trang này còn render không có header/sidebar. Người dùng mới không có đường thoát, không có "để sau".

**H4 — Không có trang 404.** Route `*` render `LandingPage`, nên URL sai hiển thị trang marketing thay vì báo lỗi.

**H5 — Không có trang hồ sơ / cài đặt cá nhân** cho bất kỳ vai trò nào, dù `/auth/me` đã có dữ liệu.

**H6 — Dashboard là bảng liệt kê tính năng.** Dashboard học sinh hiện là 4 thẻ đánh số 01–04 trỏ tới đúng 4 mục đã có trong sidebar. Không có "tiếp tục học", không có nội dung gần đây, không có việc đang dang dở. Đây là điều hướng trùng lặp, không phải dashboard.

### 6.3 Trung bình (Medium)

**M1 — Ba luồng trùng nghiệp vụ song song:**
- Hỏi đáp: `ChatBox` trong trang chi tiết tài liệu (`POST /chat/ask`) vs `AdvancedChatPage` (`POST /chat/ask-advanced`). Hai trải nghiệm khác nhau cho cùng một việc, không liên kết với nhau.
- Sinh đề: `/documents → /documents/:id → /documents/:id/questions` vs `/generate` làm lại toàn bộ pipeline trong một trang.
- Admin: tab "Quản lý người dùng" + "Nhật ký hệ thống" trong `AdminDashboardPage` (gọi router cũ `/admin/dashboard/users*`) trùng với `/admin/users` và `/admin/audit-logs` nhưng ít năng lực hơn.

**M2 — Thông tin kỹ thuật lộ ra cho người dùng cuối.** Panel "🔬 Phân cụm tài liệu (K-Means) — Tự động nhóm tài liệu theo chủ đề dựa trên vector embeddings" nằm ngay trên trang quản lý học liệu của giáo viên. Thuật ngữ K-Means và vector embeddings không phải ngôn ngữ của giáo viên.

**M3 — `GET /documents/{id}/verify/status` trả 404 khi chưa có session kiểm chứng**, log lỗi ra console (ghi nhận lại từ `BAO_CAO_KIEM_THU_CHROME.md`, vẫn còn). Trường hợp "chưa từng kiểm chứng" cần là empty state, không phải lỗi.

**M4 — Trùng lặp dữ liệu giữa các trang học sinh.** `PublishedQuestionSetsPage`, `LearningHistoryPage`, `StudentStatisticsPage` cùng gọi `listMyLearningHistory()` + `listPublished()` rồi tự tính toán lại, không dùng hook chung. Ba trang cho ba góc nhìn của cùng một tập dữ liệu.

**M5 — Bundle 521.51 kB một chunk duy nhất** (145.94 kB gzip), không code-split. `AdvancedChatPage`, `QuickGeneratePage`, `AdminDashboardPage` là ứng viên rõ ràng cho `React.lazy`.

**M6 — Không có hệ thống token màu.** 9.092 dòng CSS rải trong 10 file, màu hex viết trực tiếp trong từng file page (`AdminUsersPage.css`, `AdminContentPages.css`, `landing.css`, …). Không có nguồn duy nhất cho màu, spacing, radius.

**M7 — Trạng thái rỗng nghèo.** Nhiều trang chỉ có một dòng chữ (`/learning-history`: 357 ký tự tổng nội dung, `/student-statistics`: 536). Không có minh hoạ, không có hành động gợi ý rõ ràng cho người mới.

**M8 — Chức năng backend đã có nhưng UI không có nút:**
- `PATCH /classes/{id}`, `DELETE /classes/{id}` — không thể đổi tên hay xoá lớp.
- `GET /classes/mine` — học sinh không thấy lớp mình thuộc.
- `POST /admin/website-content/sections/reorder` — không có client method.

### 6.4 Thấp (Low)

**L1 —** Gọi API trùng trong dev do React Strict Mode (`auth/me`, document list, verify/status gọi hai lần).
**L2 —** `AppLayout` gọi `authApi.getMe()` lại mỗi lần đổi route thay vì dùng context dùng chung.
**L3 —** `LoginPage` chỉ so `role === 'admin'`, nên `super_admin`/`moderator`/`support`/`analyst` đăng nhập xong về `/dashboard` chứ không về khu vực admin.
**L4 —** Đăng ký học sinh thì tự đăng nhập luôn, đăng ký giáo viên lại bị đẩy về `/login` — luồng không đối xứng, không giải thích lý do.
**L5 —** `/health/ready` vẫn kiểm tra ChromaDB dù RAG đã chuyển sang cosine similarity bằng NumPy.

---

## 7. Danh sách thành phần dư thừa

### 7.1 Trùng lặp trên UI — nên gộp

| Thành phần | Trùng với | Đề xuất |
|---|---|---|
| Tab "Quản lý người dùng" trong `AdminDashboardPage` | `/admin/users` (đầy đủ hơn) | Gỡ tab, để dashboard chỉ còn số liệu tổng quan + link |
| Tab "Nhật ký hệ thống" trong `AdminDashboardPage` | `/admin/audit-logs` | Gỡ tab, giữ link |
| `ChatBox` trong `DocumentDetailPage` | `AdvancedChatPage` | Gộp: nút "Hỏi về tài liệu này" mở Hỏi đáp AI với scope tài liệu |
| `QuickGeneratePage` (`/generate`) | `DocumentsPage` → `QuestionGeneratePage` | Gộp thành một luồng có bước rõ ràng |
| `StudentStatisticsPage` | `LearningHistoryPage` | Gộp thành một trang "Tiến độ" có phần tổng quan + phần chi tiết |
| 4 thẻ 01–04 trên dashboard học sinh | Sidebar học sinh | Bỏ thẻ điều hướng, thay bằng nội dung thật |

### 7.2 Nút / menu dư trên UI

- CTA "✨ Sinh đề nhanh" trong sidebar giáo viên trùng đích với luồng upload ở "Học liệu & Upload".
- Nhóm nav "Giảng viên" hiển thị cho admin (H2).
- Ba nút chọn theme (`☀️ Sáng` / `🌙 Tối` / `🖥️ Hệ thống`) chiếm chỗ cố định trong sidebar — nên chuyển vào trang Cài đặt hoặc menu người dùng.
- Panel K-Means trên trang học liệu (M2) — chuyển sang khu vực admin.

### 7.3 Backend đã có, UI chưa dùng — **giữ backend, không xoá**

| Endpoint | Trạng thái |
|---|---|
| `/personalization/learner/profile\|mastery\|summary\|strengths\|weaknesses` | Không có frontend gọi |
| `/personalization/recommendations/candidates` | Không có frontend gọi |
| `/personalization/documents/{id}/knowledge-graph/*` | Toàn bộ pipeline knowledge graph không có UI |
| `/personalization/me/progress` | Không dùng |
| `/personalization/recommendations/me/history` | Không dùng |
| `/personalization/events/admin/users/{id}` | Không có UI admin |
| `/admin/website-content/sections/reorder` | Không có client method |
| `/admin/notifications/{id}` | Không dùng (chỉ dùng list) |
| `GET /classes/mine`, `PATCH/DELETE /classes/{id}` | Có API client nhưng không component nào gọi |

Đây là các ứng viên cho mục **"đề xuất tương lai"**, không được hiện giả trên UI ở giai đoạn này.

### 7.4 Tài liệu lỗi thời trong repo

| File | Vấn đề |
|---|---|
| `TEST_CHECKLIST.md` | Chỉ liệt kê 8 route, thiếu khoảng 2/3 route hiện có |
| `BAO_CAO_KIEM_TRA_ADMIN.md` | Kết luận "admin chỉ đọc, không có quản lý người dùng" **đã sai** — hiện đã có đầy đủ |
| `README.md` | Sơ đồ thư mục thiếu `admin_*`, `personalization/`, `classes`, `website_content`, `system_settings` |
| `DEMO_GUIDE.md` | Chỉ mô tả demo hỏi đáp, có trước admin/personalization/classes |

---

## 8. Đề xuất sitemap mới

Bốn khu vực tách biệt. Một tác vụ chỉ có **một** vị trí chính trong navigation.

```
A. PUBLIC (khách)
   /                       Trang chủ
   /how-it-works           Cách hoạt động
   /features               Tính năng chính
   /faq                    Câu hỏi thường gặp
   /login  /register
   /404                    Trang không tìm thấy

B. HỌC SINH  (prefix /hs, tối đa 6 nhóm nav)
   /hs                     Tổng quan học tập
   /hs/bai-tap             Bài luyện tập  (gộp: bài cần làm + làm bài)
   /hs/hoi-dap             Hỏi đáp AI
   /hs/tien-do             Tiến độ  (gộp: lịch sử + thống kê)
   /hs/ca-nhan-hoa         Cá nhân hóa   [chỉ khi flag bật]
   /hs/ho-so               Hồ sơ & cài đặt

C. GIÁO VIÊN  (prefix /gv, tối đa 6 nhóm nav)
   /gv                     Tổng quan
   /gv/hoc-lieu            Học liệu   (gộp: danh sách + upload)
   /gv/hoc-lieu/:id        Chi tiết  (tab: Nội dung · Tìm kiếm · Kiểm chứng · Hỏi đáp)
   /gv/de-thi              Đề & câu hỏi  (gộp: sinh đề + ngân hàng câu hỏi)
   /gv/de-thi/:id          Soạn & ban hành
   /gv/lop-hoc             Lớp học
   /gv/ho-so               Hồ sơ & cài đặt

D. ADMIN  (prefix /admin, khu vực riêng biệt, layout riêng)
   Giữ nguyên 16 route hiện có, gộp 2 tab trùng vào trang chuyên biệt.
   Không xuất hiện trong navigation của học sinh/giáo viên.
```

Route cũ được **giữ lại dưới dạng redirect** để không phá link đã chia sẻ và không phá test hiện có.

---

## 9. Đề xuất thứ tự triển khai

| Bước | Nội dung | Vì sao đặt ở đây |
|---|---|---|
| 1 | Tài liệu kiến trúc IA (02→05) | Chốt cấu trúc trước khi viết CSS |
| 2 | Design system: token + component nền tảng (06) | Mọi trang sau đều dựa vào đây |
| 3 | **Role guard thật ở tầng route** + `AuthContext` dùng chung | Đây là lỗi Critical, phải sửa trước khi bố trí lại nav |
| 4 | `AppLayout` mới: nav theo role, thay emoji bằng `lucide-react` | Khung chứa mọi trang |
| 5 | Trang chủ public + 404 | Ít rủi ro nghiệp vụ nhất, dễ kiểm chứng |
| 6 | Dashboard 3 role + trang hồ sơ | Điểm vào của người dùng |
| 7 | Trang chức năng giáo viên (học liệu, đề thi, lớp) | Nghiệp vụ phức tạp nhất |
| 8 | Trang chức năng học sinh (bài tập, tiến độ, hỏi đáp) | |
| 9 | Gộp các thành phần trùng (chat, sinh đề, thống kê, tab admin) | Làm sau khi trang đích đã tồn tại |
| 10 | QA cuối: 6 kích thước, accessibility, lint/build/test (07) | |

## 10. Danh sách file dự kiến sẽ sửa

### Tạo mới
```
frontend/src/styles/tokens.css              Token màu/typography/spacing/radius/shadow/z-index
frontend/src/styles/base.css                Reset + semantic base
frontend/src/components/ui/                 Button, Input, Textarea, Select, Checkbox, Radio,
                                            Dialog, Drawer, Dropdown, Tabs, Card, Badge, Alert,
                                            Toast, Skeleton, EmptyState, ErrorState,
                                            PageHeader, SectionHeader
frontend/src/components/RoleRoute.tsx       Guard theo role ở tầng route
frontend/src/context/AuthContext.tsx        Thay việc gọi getMe() mỗi lần đổi route
frontend/src/pages/NotFoundPage.tsx         Trang 404
frontend/src/pages/ProfilePage.tsx          Hồ sơ & cài đặt
frontend/src/pages/student/                 Dashboard, Bài tập, Tiến độ
frontend/src/pages/teacher/                 Dashboard, Học liệu, Đề thi
```

### Sửa
```
frontend/src/App.tsx                        Cấu trúc route mới + role guard + redirect route cũ
frontend/src/components/AppLayout.tsx       Nav theo role, bỏ emoji, bỏ nhóm sai vai trò
frontend/src/components/ProtectedRoute.tsx  Bổ sung kiểm tra role
frontend/src/components/PublicLayout.tsx    Header/footer public mới
frontend/src/index.css, App.css             Nạp token, dọn màu hex rời rạc
frontend/src/pages/landing/*                Thiết kế lại toàn bộ trang chủ
frontend/src/pages/DashboardPage.tsx        Tách theo role
frontend/src/pages/DocumentsPage.tsx        Bỏ panel K-Means, chuẩn hoá empty state
frontend/src/pages/DocumentDetailPage.tsx   Chuyển sang tab, gộp ChatBox
frontend/src/pages/QuestionHistoryPage.tsx  Gộp với luồng sinh đề
frontend/src/pages/QuickGeneratePage.tsx    Gộp vào luồng chính
frontend/src/pages/QuestionSetDetailPage.tsx Tách vai trò soạn / làm bài
frontend/src/pages/LearningHistoryPage.tsx  Gộp vào Tiến độ
frontend/src/pages/StudentStatisticsPage.tsx Gộp vào Tiến độ
frontend/src/pages/PersonalizationPage.tsx  Flag-aware, có permission-denied state
frontend/src/pages/ClassesPage.tsx          Bổ sung sửa/xoá lớp
frontend/src/pages/StudentOnboardingPage.tsx Cho phép "làm sau", có chrome
frontend/src/pages/AdminDashboardPage.tsx   Gỡ 2 tab trùng
frontend/src/pages/LoginPage.tsx            Sửa điều hướng cho các role admin khác
frontend/src/pages/RegisterPage.tsx         Đồng nhất luồng sau đăng ký
```

### Không sửa
```
backend/**                                  Giữ nguyên API contract và toàn bộ nghiệp vụ.
                                            Ngoại lệ duy nhất đã xử lý: xoá __pycache__ cũ
                                            (không phải sửa code).
```

---

## 11. Kết luận giai đoạn 1

Nghiệp vụ backend của EzEdu AI rộng hơn nhiều so với phần được phơi ra trên giao diện — có cả một pipeline personalization/ML với 16 tài liệu thiết kế nhưng chỉ một trang UI, và trang đó hiện đang bị tắt bằng feature flag. Ngược lại, giao diện lại phơi ra những thứ không nên phơi: thuật ngữ K-Means cho giáo viên, và toàn bộ công cụ giáo viên cho học sinh.

Vấn đề cần sửa trước tiên không phải màu sắc hay khoảng trắng, mà là **ranh giới vai trò**: hiện tại việc phân quyền trên giao diện chỉ là ẩn nút, còn route thì mở. Mọi việc bố trí lại navigation ở các giai đoạn sau sẽ vô nghĩa nếu không đóng lỗ hổng này trước.

**Chưa có dòng mã giao diện nào bị sửa trong giai đoạn này.**
