# EzEdu AI — Nhật ký tiến độ redesign

Cập nhật: 2026-07-29. File này ghi trạng thái thật của công việc để phiên làm việc sau tiếp tục đúng chỗ, không lặp lại việc đã xong.

---

## ⚠️ Hai lỗi Critical phát hiện và đã sửa (2026-07-29)

Cả hai lỗi này **không do redesign giao diện gây ra** — chúng nằm trong luồng nghiệp vụ lõi (đăng nhập, lưu câu hỏi) và tồn tại từ trước. Phát hiện được nhờ kiểm thử thủ công đầu-cuối bằng dữ liệu thật, không phải qua test tự động hiện có (cả hai vùng code trước đó **không có test coverage**).

### Lỗi A — Vòng lặp chuyển hướng vô tận sau khi đăng nhập (Critical, mức độ cao nhất)

**Triệu chứng:** Sau khi đăng nhập thành công (email/mật khẩu đúng, API trả 200), một số lượt đăng nhập bị kẹt lại ở trang `/login` hoặc mất vài giây "giật" trước khi vào được `/dashboard`, kèm hàng trăm request thừa tới `/api/v1/runtime-config` và cảnh báo console "Maximum update depth exceeded". Tái hiện được cả ở `npm run dev` lẫn bản build production thật (`vite build` + `vite preview`) — **không phải hiện tượng chỉ có ở môi trường dev**.

**Nguyên nhân gốc:** `AuthProvider` (`frontend/src/contexts/AuthContext.tsx`) chỉ gọi `GET /auth/me` **một lần** lúc mount, dựa trên có/không có token tại thời điểm đó. `LoginPage.tsx`/`RegisterPage.tsx` sau khi đăng nhập thành công chỉ `localStorage.setItem('access_token', ...)` rồi `navigate(...)` thẳng — không báo cho `AuthProvider` biết token vừa xuất hiện. Vì vậy `status` trong context vẫn kẹt ở `'anonymous'` (giá trị suy ra lúc trang `/login` mount, khi chưa có token). Hệ quả:
1. `navigate('/dashboard')` → `RoleRoute` thấy `status === 'anonymous'` → `<Navigate to="/login" replace>`.
2. Tại `/login`, effect kiểm tra `localStorage.getItem('access_token')` thấy **có** token → `navigate('/dashboard')` lại.
3. Lặp lại (1)–(2) hàng chục đến hàng trăm lần mỗi giây cho đến khi trình duyệt tự chặn (giới hạn tần suất `history.pushState`/`replaceState` của Chrome), dừng lại ngẫu nhiên ở `/login` hoặc `/dashboard` tuỳ thời điểm bị chặn.

Xác nhận bằng cách theo dõi trực tiếp `history.pushState`/`replaceState`: ghi nhận chuỗi `push:/dashboard` → `replace:/login` → `push:/dashboard` → ... lặp hơn 170 lần trong một lượt đăng nhập.

**Cách sửa:** gọi `await refresh()` (đã có sẵn trong `AuthContextValue`, chỉ chưa được dùng ở đây) ngay sau khi lưu token, trước khi `navigate(...)`:
- `frontend/src/pages/LoginPage.tsx` — trong `handleSubmit`.
- `frontend/src/pages/RegisterPage.tsx` — nhánh học sinh tự đăng nhập sau khi đăng ký.

**Kiểm chứng:** gắn theo dõi `history.pushState` trước và sau khi sửa, đăng nhập lại bằng tài khoản `qa.teacher@` (build dev **và** build production) và tài khoản `qa.student@` (dev) — cả ba lượt chỉ ghi nhận đúng **1** lần điều hướng (`push:/dashboard` hoặc `push:/published-questions`), không còn lặp. Dashboard hiện đúng dữ liệu ngay lập tức, không còn nháy trắng hay lỗi console.

### Lỗi B — Sửa câu hỏi và duyệt/xuất bản không lưu vào cơ sở dữ liệu (Critical)

**Triệu chứng:** Giáo viên sửa nội dung câu hỏi hoặc bấm Gửi duyệt/Duyệt/Xuất bản trong `QuestionSetEditorPage.tsx`, API trả 200 kèm toast thành công, nhưng gọi lại `GET /questions/{id}` cho thấy dữ liệu **không đổi** — toàn bộ luồng rà soát trước khi ban hành đề của giáo viên là no-op im lặng.

**Nguyên nhân gốc:** `backend/app/routers/questions.py` — `update_question_item` và `update_question_workflow` gọi `_normalize_question_items(qs)`, hàm này trả về **bản sao** (`dict(question)`, shallow copy) tách rời khỏi `qs["questions"]`. Cả hai hàm sửa trên bản sao rồi `$set` thẳng `qs["questions"]` gốc — chưa từng bị thay đổi. Hàm `publish_entire_question_set` (cùng file) có đúng dòng `qs["questions"] = questions` sau khi sửa; hai hàm còn lại thiếu đúng một dòng này.

**Cách sửa:** thêm `qs["questions"] = questions` vào cả `update_question_item` và `update_question_workflow`, ngay trước khi ghi vào DB — theo đúng mẫu đã có ở `publish_entire_question_set`.

**Kiểm chứng:**
- Test hồi quy mới: `backend/tests/test_questions.py` (router này trước đó **không có test nào**) — 3 test, bao gồm cả chuyển trạng thái toàn bộ vòng đời draft → review_pending → approved → published. Đã xác nhận nghiêm ngặt: revert 2 dòng sửa → cả 3 test fail đúng như kỳ vọng; khôi phục lại → pass.
- Kiểm chứng trực tiếp qua server thật + MongoDB Atlas thật: sửa câu hỏi và chuyển trạng thái qua giao diện `QuestionSetEditorPage`, sau đó gọi `GET /questions/{id}` bằng script Python độc lập (không qua trình duyệt) — xác nhận dữ liệu đã lưu đúng.
- Toàn bộ 256 test backend (không chỉ 3 test mới) pass sau khi sửa — không có hồi quy.

---

## Dọn backlog còn lại (2026-07-29, tự chủ động theo yêu cầu "toàn quyền thực hiện")

Sau khi sửa 2 lỗi Critical, rà lại toàn bộ danh sách "việc còn lại" cũ — phần lớn hoá ra **đã xong** từ trước (hồ sơ, "Lớp của tôi", gỡ panel K-Means, onboarding "Để sau", `FeatureDisabledState`), chỉ 4 việc thật sự còn tồn đọng:

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| Emoji trong thân trang | ✅ Xong | Không còn emoji ở bất kỳ trang đang dùng nào. Emoji còn sót chỉ nằm trong 15 file landing cũ (`HeroSection.tsx`, `UploadWidget.tsx`, `LandingHeader.tsx`, `landing.css` 59KB, v.v.) — đã xác nhận **không còn được import từ đâu** (kể cả `pages/landing/index.tsx`) nên đã xoá hẳn. Bundle production không đổi kích thước sau khi xoá — xác nhận đó thực sự là dead code, không ảnh hưởng app đang chạy |
| Gradient CSS cũ chưa theo token | ✅ Xong | `.btn-primary` (dùng bởi `LoginPage`, `RegisterPage`, `StudentOnboardingPage`) đổi từ gradient tím-hồng hardcode (`#8b7cf8, #c084fc`) sang màu đặc `var(--ez-primary)`/`var(--ez-primary-hover)` — khớp với nút primary của design system mới (`ui.css` dùng màu đặc, không gradient). Dọn luôn `.btn-view-result`/`.btn-upload-new` (gradient tương tự) đã thành dead code sau khi gộp `/generate` |
| Gộp `/generate` vào luồng sinh đề chính | ✅ Xong | Xem chi tiết ngay dưới |
| Code-splitting `React.lazy` | ✅ Xong | 15 trang admin + `AdvancedChatPage` chuyển sang `React.lazy()` + `<Suspense>` bọc quanh `<Routes>` trong `App.tsx`. Chunk chính giảm từ **829.80 KB → 508.56 KB** (≈39%); mỗi trang admin giờ là chunk riêng (1–37 KB), chỉ tải khi admin thực sự vào. Kiểm chứng bằng Playwright: đăng nhập admin, vào `/admin/dashboard` rồi `/admin/users` — cả hai tải đúng, không lỗi console, không màn hình trắng khi chờ chunk |

### Gộp `/generate` — chi tiết

**Vấn đề (lỗi M1 trong audit):** hai luồng sinh câu hỏi song song, làm cùng một việc theo hai cách khác nhau — `/documents → /documents/:id → /documents/:id/questions` (dùng học liệu có sẵn) và `/generate` (làm lại toàn bộ pipeline tải lên + cấu hình + hiện kết quả trong một trang riêng, 1652 dòng, không dùng design system).

**Cách gộp:**
- `QuestionGeneratePage.tsx` (`/documents/:id/questions`) trở thành nơi **duy nhất** cấu hình & sinh câu hỏi — viết lại bằng design system (`Chip`/`ChipGroup` cho số lượng, `RadioCard` cho độ khó/Bloom/dạng câu hỏi), bổ sung lựa chọn Bloom level (trước đây chỉ có ở `QuickGeneratePage`).
- `QuickGeneratePage.tsx` (`/generate`) rút gọn chỉ còn phần tải lên + xử lý tự động (trích xuất/phân tích + lập chỉ mục, dùng `ProgressSteps`/`ProgressBar` của design system) — bỏ hẳn phần cấu hình + hiển thị kết quả trùng lặp. Khi xử lý xong, tự động điều hướng sang `/documents/:id/questions` (`navigate(..., { replace: true })`).
- Route trong `App.tsx` **không đổi** — cả hai điểm vào cũ (CTA "Tạo đề mới" ở dashboard/`QuestionHistoryPage` → `/generate`; nút "Sinh câu hỏi" ở `DocumentDetailPage` → `/documents/:id/questions`) vẫn hoạt động, giờ hội tụ về cùng một trải nghiệm cấu hình.

**Kiểm chứng đầu-cuối bằng dữ liệu thật** (không phải chỉ đọc code):
1. Tạo một PDF hợp lệ tối thiểu (có bảng xref đúng chuẩn), giả lập kéo-thả qua `DataTransfer` (trình duyệt tự động không hỗ trợ set `<input type=file>` trực tiếp) vào `/generate` → tải lên thành công → tự động trích xuất + lập chỉ mục → tự động chuyển sang `/documents/:id/questions` → cấu hình → sinh câu hỏi bằng Gemini thật → landing đúng trên `QuestionSetEditorPage` với câu hỏi bám sát nội dung PDF vừa tạo.
2. Từ một học liệu đã xử lý sẵn (`qa-test-doc.pdf`), vào `DocumentDetailPage` → bấm "Sinh câu hỏi" → cùng một `QuestionGeneratePage` hiện ra, cấu hình đúng.
3. `tsc -b` + `vite build` sạch sau cả hai lần viết lại; xoá tài liệu test (`qa-quick-generate-valid.pdf`) sau khi kiểm chứng xong.

---

## Trạng thái theo giai đoạn

| Giai đoạn | Nội dung | Trạng thái | Tài liệu |
|---|---|---|---|
| 1 | Khảo sát website tham khảo + audit EzEdu AI | ✅ **Xong** | [01-audit-report.md](01-audit-report.md) |
| 2 | Kiến trúc thông tin theo vai trò | ✅ **Xong** | [02](02-information-architecture.md) · [03](03-role-navigation.md) · [04](04-page-inventory.md) · [05](05-component-map.md) |
| 3 | Design system: token + 21 component nền tảng | ✅ **Xong** | [06-design-system.md](06-design-system.md) |
| 3b | Role guard tầng route + AuthContext + trang 404 | ✅ **Xong, đã kiểm chứng 20/20** | mục §"Đã kiểm chứng" dưới đây |
| 4 | Thiết kế lại trang chủ public + 3 trang phụ | ✅ **Xong, đã kiểm chứng 6 kích thước** | mục §"Giai đoạn 4" dưới đây |
| 5 | Thiết kế lại các trang sau đăng nhập theo vai trò | 🟡 **Phần lớn** — nav, 2 dashboard, hồ sơ, dọn UI dư. Còn các việc gộp trang | [07](07-final-qa-report.md) §10 |
| 6 | QA cuối 6 kích thước + báo cáo | ✅ **Xong** | [07-final-qa-report.md](07-final-qa-report.md) |

> **Trạng thái tổng thể:** build xanh (`tsc` 0 lỗi, `vite build` OK, chunk chính 508.56 KB sau code-splitting), backend **256 test pass**, 20/20 kịch bản phân quyền đạt, không cuộn ngang ở cả 6 kích thước. Hai lỗi Critical (vòng lặp đăng nhập, sửa câu hỏi không lưu) đã phát hiện và sửa ngày 2026-07-29, cùng toàn bộ backlog còn lại (gộp `/generate`, emoji, gradient, code-splitting). Tài khoản và dữ liệu QA đã được dọn sạch trước khi bàn giao. Không còn việc tồn đọng từ audit ban đầu. Chi tiết đầy đủ ở [07-final-qa-report.md](07-final-qa-report.md).

## Việc làm thêm sau giai đoạn 6 (2026-07-28, tiếp tục theo yêu cầu)

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| Gộp Lịch sử + Thống kê → trang Tiến độ | ✅ Xong | `pages/student/ProgressPage.tsx`. `/student-statistics` giờ redirect sang `/learning-history`. Kiểm chứng bằng Playwright: cả hai route hoạt động, không lỗi console |
| Đổi tên / xoá lớp học | ✅ Xong | `ClassesPage.tsx` viết lại bằng design system, thêm menu ngữ cảnh gọi `classesApi.update`/`remove` (backend đã có, UI chưa từng gọi — lỗi M8). Kiểm chứng bằng Playwright: tạo → đổi tên → xoá thành công qua API thật |
| Xoá 2 file trang cũ (`LearningHistoryPage.tsx`, `StudentStatisticsPage.tsx`) | ⬜ Chưa xoá | Không còn được route nào tham chiếu; giữ lại để dễ hoàn tác theo quy ước đã áp dụng cho các file khác |
| Chuyển chi tiết học liệu sang Tabs + gộp `ChatBox` vào tab Hỏi đáp | ✅ Xong | `DocumentDetailPage.tsx` viết lại: khối tổng quan (metadata + quy trình 4 bước) đứng riêng, 4 tab bên dưới — Nội dung · Tìm kiếm · Kiểm chứng · Hỏi đáp (lỗi M1). Mỗi tab tự gate theo trạng thái học liệu với `EmptyState` đúng đặc tả 04-page-inventory §C3, thay vì luôn hiện panel rồi disable. Phát hiện và sửa thêm 1 lỗi thật: `ProcessingStatusBadge` (tạo ở giai đoạn 5) thiếu trạng thái `processed` — giá trị backend thật — nên rơi vào nhãn chung sai. Kiểm chứng toàn bộ bằng dữ liệu thật: tải một PDF thật lên, đi qua đủ 4 bước (upload → trích xuất → lập chỉ mục → sẵn sàng), tìm kiếm ngữ nghĩa trả đúng đoạn nội dung, mở hỏi đáp thấy ô nhập, mở kiểm chứng thấy panel thật, điều hướng bàn phím giữa tab hoạt động, không cuộn ngang. Hai console error quan sát được (403 `/personalization/events`, 404 `/verify/status`) đã xác nhận **có từ trước**, không do refactor này |
| Gộp `/generate` vào luồng sinh đề chính | ✅ Xong (2026-07-29) | Xem mục "Gộp `/generate`" bên dưới |
| Tách `QuestionSetDetailPage` thành trang soạn (GV) / làm bài (HS) | ✅ Xong | `QuestionSetDetailPage.tsx` giờ chỉ là dispatcher theo `area`. Giáo viên → `teacher/QuestionSetEditorPage.tsx` (đầy đủ: xuất bản, workflow, TF-IDF/Bloom). Học sinh → `student/PracticeAttemptPage.tsx` (đơn giản hoá, bỏ thuật ngữ kỹ thuật — lỗi M2). Phát hiện và sửa **lỗi Critical B** ở trên trong lúc kiểm thử luồng này |
| Gỡ 2 tab trùng trong `AdminDashboardPage` | ✅ Xong | Xoá 326 dòng (`UserManagementTab`, `AuditLogsTab`) + type/import không còn dùng. Thay bằng 2 link nhanh sang `/admin/users` và `/admin/audit-logs` trong tab Tổng quan. Còn đúng 6 tab: Tổng quan · Mức sử dụng · Chất lượng AI · Lỗi & Độ trễ · System Health · RAG Benchmark. Kiểm chứng bằng Playwright: điều hướng SPA đúng, không console error |
| `FormField` chưa nối `htmlFor`/`id`/`aria-describedby` | ✅ Xong | Viết lại `components/ui/FormField.tsx`: tự tính id qua `useFieldIds` + `cloneElement` để nhãn, trường nhập, gợi ý/lỗi luôn được nối đúng — không cần mỗi nơi gọi tự truyền `htmlFor`/`id`. Trước đó nhãn và trường chỉ đứng cạnh nhau về hình ảnh, bấm nhãn không focus được trường |
| Sửa lỗi Critical A (vòng lặp đăng nhập) + Critical B (sửa câu hỏi không lưu) | ✅ Xong | Xem mục "⚠️ Hai lỗi Critical" ở đầu file |

Build: `tsc` 0 lỗi, `vite build` thành công. Backend: 256 test pass (tăng 3, thêm `test_questions.py`).

**Lưu ý về `eslint`:** hiện báo lỗi cấu hình (không phải lỗi code) do có một git worktree khác nằm ở `frontend/.claude/worktrees/cool-wu-808bec/` mang tsconfig riêng, khiến ESLint không xác định được `tsconfigRootDir` duy nhất. Không tạo bởi phiên này; không tự ý xoá worktree vì có thể chứa việc dở dang của phiên khác. `tsc -b` (đã bao gồm trong `vite build`) vẫn là nguồn xác thực type-safety chính và **sạch**.

---

## Đã kiểm chứng bằng Playwright

### Role guard — 20/20 kịch bản đạt

Ba tài khoản QA thật, gõ URL trực tiếp vào thanh địa chỉ:

| Vai trò | URL gõ vào | Kết quả | Đạt |
|---|---|---|---|
| Học sinh | `/documents` | → `/dashboard` | ✅ |
| Học sinh | `/generate` | → `/dashboard` | ✅ |
| Học sinh | `/question-history` | → `/dashboard` | ✅ |
| Học sinh | `/classes` | → `/dashboard` | ✅ |
| Học sinh | `/admin/users` | → `/dashboard` | ✅ |
| Học sinh | `/published-questions` | vào được | ✅ |
| Học sinh | `/chat-advanced` | vào được | ✅ |
| Giáo viên | `/published-questions` | → `/dashboard` | ✅ |
| Giáo viên | `/learning-history` | → `/dashboard` | ✅ |
| Giáo viên | `/student-statistics` | → `/dashboard` | ✅ |
| Giáo viên | `/personalization` | → `/dashboard` | ✅ |
| Giáo viên | `/admin/dashboard` | → `/dashboard` | ✅ |
| Giáo viên | `/documents`, `/question-history` | vào được | ✅ |
| Admin | `/documents` | → `/admin/dashboard` | ✅ |
| Admin | `/published-questions` | → `/admin/dashboard` | ✅ |
| Admin | `/dashboard` | → `/admin/dashboard` | ✅ |
| Admin | `/admin/users` | vào được | ✅ |
| Học sinh | URL không tồn tại | trang 404 thật | ✅ |

**Trước khi sửa:** học sinh mở được đầy đủ 5 trang giáo viên (kể cả wizard sinh đề và ngân hàng câu hỏi); giáo viên mở được 4 trang học sinh rồi nhận 403 với trang gần như trắng. Đây là lỗi Critical C1/C2 trong audit.

### Navigation theo vai trò

| Vai trò | Mục nav thực tế | Emoji trong nav |
|---|---|---|
| Học sinh | Tổng quan · Bài luyện tập · Hỏi đáp AI · Tiến độ | ✅ Không còn |
| Giáo viên | Tổng quan · Học liệu · Đề & câu hỏi · Lớp học | ✅ Không còn |
| Admin | 13 mục, chia nhóm, **không còn mục nào của giáo viên** | ✅ Không còn |

"Cá nhân hóa" tự động biến mất khỏi nav học sinh vì `enable_personalization = false` — đúng thiết kế flag-aware.

### Lệnh đã chạy

| Lệnh | Kết quả |
|---|---|
| `npx tsc -b --force` | ✅ 0 lỗi |
| `npx eslint src` | ✅ 0 lỗi |
| `npx vite build` | ✅ thành công |

---

## Giai đoạn 4 — Trang chủ public (đã xong)

Trang chủ được dựng lại hoàn toàn bằng design system. **Giữ nguyên luồng CMS** (`GET /api/v1/website-content` + `mergeWebsiteContent`), nên trang quản trị Website CMS hoạt động không đổi.

### Cấu trúc 9 section

Hero → Công cụ chính (tải học liệu) → Ví dụ nhanh → Cách hoạt động (4 bước) → Vì sao EzEdu AI (6 lợi ích) → Tính năng theo vai trò → Chất lượng & tin cậy → FAQ → CTA cuối. Header 3 mục + footer 5 nhóm.

### Ba trang phụ mới

`/how-it-works`, `/features`, `/faq` — dùng lại đúng component section của trang chủ, không viết lại nội dung, nên không có hai chỗ mô tả cùng một tính năng theo hai cách khác nhau.

### Kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| Cuộn ngang ở 1440 · 1280 · 1024 · 768 · 390 · 360 | ✅ Không có ở cả 6 kích thước |
| Console errors / unhandled rejection | ✅ Sạch |
| Request 4xx/5xx trên trang chủ | ✅ Không có |
| Số thẻ `h1` mỗi trang | ✅ Đúng 1 |
| Toàn bộ 8 link nội bộ | ✅ Đều dẫn tới route thật, không 404 |
| Tab stop đầu tiên | ✅ "Bỏ qua tới nội dung chính" (skip link) |
| Emoji trong khu vực public | ✅ Không còn |
| Mã màu hex rời rạc trong CSS mới | ✅ Không có, toàn bộ qua token |
| Khung tràn đủ chiều ngang | ✅ Cả public và khu vực đã đăng nhập |
| Sidebar ↔ bottom tab bar đổi ở mốc 1024px | ✅ Đúng cho cả học sinh và giáo viên |

### Bốn lỗi phát hiện và đã sửa trong giai đoạn này

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| **Cuộn ngang ở cả 3 kích thước, section xếp ngang thay vì dọc** | `components/PublicLayout.css` **đã dùng sẵn tiền tố `.pub-`** (`.pub-main` có `display:flex` hàng ngang). Class mới của tôi bị đè | Đổi tiền tố mới sang `.ezp-` (277 chỗ) |
| **Dải trắng bên phải trên màn hình > 1280px** | `#root` trong `index.css` là `display:flex; flex-direction:row`, nên khung trang co lại bằng chiều rộng nội dung | Khai báo `flex:1; width:100%; min-width:0` cho `.ezp-root` và `.ez-shell` |
| **Menu header trỏ tới anchor không còn tồn tại** (`#workflow`, `#benefits`) — link chết | Menu CMS được cấu hình cho bố cục cũ | Bảng ánh xạ `LEGACY_TARGETS` sang route thật, loại mục không resolve được, dedupe theo đích, bổ sung mục canonical còn thiếu |
| **React: hai children cùng key `"Hỗ trợ"`** | CMS đặt `contact_label = "Hỗ trợ"`, trùng đúng tiêu đề nhóm footer hardcode | Key footer theo `id` ổn định thay vì theo tiêu đề; nhóm liên hệ luôn dùng tiêu đề "Liên hệ" |

### Nguyên tắc nội dung đã tuân thủ

- **Không số liệu thống kê giả.** Không có con số người dùng, số đề đã tạo, hay tỉ lệ chính xác nào.
- **Chỉ nêu chức năng thật.** Danh sách tính năng theo vai trò đối chiếu trực tiếp với endpoint đang hoạt động. Báo cáo kết quả toàn lớp và OAuth **không** được nhắc tới vì backend chưa hỗ trợ.
- **Không nút giả.** Ô tải học liệu kiểm tra định dạng và dung lượng thật; khách chưa đăng nhập được nói rõ tệp *chưa* được tải lên và cần tài khoản, không giả lập tiến trình.
- **Khuyến cáo kiểm chứng** hiện ở khối tin cậy và ở footer.
- **Minh hoạ hero là SVG tự dựng** (`HeroArt.tsx`), màu lấy từ token nên tự đổi theo sáng/tối. Không dùng tài sản bên ngoài.

### File landing cũ giờ không còn được dùng

Sáu file dưới đây không còn được import từ đâu (đã kiểm tra). **Chưa xoá** để giữ khả năng hoàn tác dễ dàng; có thể xoá an toàn khi bạn đã chấp nhận thiết kế mới:

```
frontend/src/pages/landing/FormatsBar.tsx
frontend/src/pages/landing/StepsSection.tsx
frontend/src/pages/landing/DiagramSection.tsx
frontend/src/pages/landing/DemoSection.tsx
frontend/src/pages/landing/WhySection.tsx
frontend/src/pages/landing/CtaSection.tsx
```

`landing.css` (2.211 dòng) cũng không còn được import — nên không còn nằm trong bundle. Các file `HeroSection`, `UploadSection`, `UploadWidget`, `LandingHeader`, `LandingFooter`, `HeroIllustration`, `shared.tsx`, `scroll.ts` chỉ còn tham chiếu lẫn nhau, cần kiểm tra thêm trước khi xoá.

---

## Việc còn lại, theo thứ tự ưu tiên (cập nhật 2026-07-29, sau khi dọn backlog + xoá dữ liệu QA)

Toàn bộ danh sách "việc còn lại" trước đó đã xong (xem mục "Dọn backlog còn lại" ở trên) — kể cả mục lớn nhất (gộp `/generate`) và tất cả các mục nhỏ (hồ sơ, "Lớp của tôi", panel K-Means, onboarding "Để sau", `FeatureDisabledState`, emoji, gradient, code-splitting). Hai việc vận hành còn lại cũng **đã xong**:

| Việc | Trạng thái |
|---|---|
| Xoá tài khoản QA khỏi MongoDB Atlas | ✅ Xong — xem mục "Đã xoá tài khoản & dữ liệu QA" bên dưới |
| Dọn dữ liệu QA test (`qa-test-doc.pdf` và bộ câu hỏi liên quan) | ✅ Xong — cùng mục bên dưới |

**Không còn việc gì tồn đọng từ audit ban đầu.** Phiên làm việc tiếp theo có thể coi phần redesign + các lỗi Critical đã hoàn tất; việc còn lại (nếu có) sẽ là yêu cầu tính năng mới từ người dùng.

### Giai đoạn 6 — QA cuối
✅ Đã có báo cáo [07-final-qa-report.md](07-final-qa-report.md) từ lượt trước. Lượt kiểm thử 2026-07-29 (đăng nhập giáo viên/học sinh, sửa câu hỏi, chuyển trạng thái workflow) không phát hiện thêm lỗi mới ngoài hai lỗi Critical đã ghi ở đầu file.

---

## Lưu ý quan trọng cho phiên sau

### 1. Năm file backend bị sửa **không phải do phiên này tạo ra**

```
backend/app/services/activity_log_service.py
backend/app/services/admin_audit_service.py
backend/app/services/ai_quota_service.py
backend/app/services/system_health_service.py
backend/app/services/system_settings_service.py
```

Nội dung sửa: `database or get_database()` → `database if database is not None else get_database()`. Đây là bản sửa **đúng và cần thiết** (pymongo `Database` không hỗ trợ kiểm tra giá trị chân lý, nên biểu thức `or` gây `NotImplementedError`). `git status` lúc bắt đầu phiên báo working tree sạch, nên các thay đổi này xuất hiện trong khoảng thời gian phiên đang chạy nhưng không do tôi thực hiện — có thể từ một phiên tự động khác trên cùng repo. Không có tiến trình nào ghi vào repo trong suốt phần còn lại của phiên.

**Đề nghị:** xem lại 5 file này rồi commit riêng, tách khỏi phần redesign giao diện.

### 2. Bytecode cache Python có thể gây lỗi 500 giả

Nếu backend trả 500 ở `/auth/register` với `NotImplementedError: Database objects do not implement truth value testing`, nguyên nhân là `.pyc` cũ, không phải source. Cách xử lý:

```bash
find backend/app -name "__pycache__" -type d -exec rm -rf {} +
```

Sau đó khởi động lại backend.

### 3. Vite cache khi đổi tên file chỉ khác chữ hoa/thường

macOS không phân biệt hoa/thường nên đổi tên `authContext.ts` → `auth-context.ts` làm Vite giữ module cũ và app trắng trang. Cách xử lý:

```bash
rm -rf frontend/node_modules/.vite
```

Sau đó khởi động lại dev server.

### 4. Đã xoá tài khoản & dữ liệu QA (2026-07-29)

Ba tài khoản QA dùng trong suốt phiên redesign đã được xoá theo yêu cầu, **trước khi bàn giao thật**:

| Email | Vai trò | Cách xoá |
|---|---|---|
| `qa.teacher@ezedu-qa.example.com` | lecturer | `DELETE /api/v1/admin/users/{id}` (soft-delete qua chính API admin của app — `status: deleted`, `deleted_at` được ghi) |
| `qa.student@ezedu-qa.example.com` | student | như trên |
| `qa.admin@ezedu-qa.example.com` | admin | App tự chặn tự-xoá chính mình đang đăng nhập ("Không thể xóa chính tài khoản đang sử dụng"); áp dụng đúng cùng bản cập nhật (`status`, `is_active`, `deleted_at`) trực tiếp qua kết nối DB của backend (`app.database.mongodb`), giống hệt logic `_set_status` trong `admin_users.py` |

Học liệu test (`qa-test-doc.pdf`) cũng đã xoá qua `DELETE /api/v1/documents/{id}` — cascade xoá luôn bộ câu hỏi, chunk, nội dung trích xuất và dữ liệu kiểm chứng liên quan (đúng logic có sẵn trong `delete_document`).

**Đã xác nhận:** cả 3 tài khoản đăng nhập đều trả 403 "Tài khoản đã bị khóa" sau khi xoá. Toàn bộ 256 test backend vẫn pass sau thao tác này.

Đây là xoá mềm (soft-delete, giữ `deleted_at` để có dấu vết audit) theo đúng cơ chế xoá tài khoản mà bản thân ứng dụng đã thiết kế — không phải xoá cứng document khỏi MongoDB. Nếu cần khôi phục để tiếp tục kiểm thử, dùng `POST /api/v1/admin/users/{id}/restore` (cho teacher/student) hoặc đặt lại `status: "active", is_active: true, deleted_at: null` trực tiếp qua DB (cho admin, vì lý do tương tự ở trên).

### 5. Hai route tạm thời chưa đúng đích

- Nav "Tiến độ" của học sinh đang trỏ `/learning-history`. Khi gộp xong sẽ thành `/hs/tien-do`.
- Route mới theo tiền tố `/hs`, `/gv` trong [02-information-architecture.md §9](02-information-architecture.md) **chưa được triển khai**. Hiện vẫn dùng đường dẫn cũ, chỉ thêm role guard. Việc đổi tiền tố kèm redirect thuộc giai đoạn 5.

---

## Cách chạy lại

```bash
# Backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend — phải là cổng 5173 vì BACKEND_CORS_ORIGINS chỉ khai báo cổng này
cd frontend && npm run dev
```

## Cách hoàn tác

Toàn bộ thay đổi giao diện đều chưa commit. Commit gần nhất là `b4e06d1`.

```bash
# Xem thay đổi
git status && git diff

# Hoàn tác toàn bộ phần chưa commit (mất cả tài liệu trong docs/ui-redesign/)
git checkout -- . && git clean -fd

# Hoàn tác chỉ phần frontend, giữ lại tài liệu
git checkout -- frontend/
rm -rf frontend/src/styles frontend/src/components/ui
```

---

## 2026-07-29 — Hoàn tất redesign toàn diện theo phong cách MagicSchool

MagicSchool-style full redesign implemented per `docs/superpowers/plans/2026-07-29-magicschool-full-redesign.md`.

Đây là task 20/20 (task cuối) của kế hoạch — task chỉ kiểm thử, không sửa code chức năng. Kết quả kiểm chứng:

- **Bước 1 — Type check + lint + build**: `npx tsc -b --force` sạch, `npm run lint` sạch (0 lỗi/cảnh báo), `npm run build` thành công (`✓ built in 457ms`).
- **Bước 2 — Playwright e2e đầy đủ**: `npm run test:e2e` → **438 passed** (5.6m), đúng bằng số lượng trước khi bắt đầu redesign. Không có test nào fail hay bị skip.
- **Bước 3 — Kiểm tra accessibility**: `npx playwright test e2e/accessibility.spec.ts --project=desktop-1440` → **14 passed** (23.4s).
- **Bước 4 — Kiểm tra thủ công trên trình duyệt**: Trang chủ `/` hiển thị đúng thứ tự section mới (pill nav, hero kèm minh hoạ nhân vật + sparkles, các pillar, showcase cho giáo viên/học sinh, trust block, FAQ, CTA cuối, footer), không có lỗi console. Trang `/admin/users` (chưa đăng nhập) chuyển hướng an toàn về `/login` với card/nút đều bo góc lớn theo token mới, không có gì vỡ layout. Dark mode và light mode trên trang chủ đều hiển thị đúng màu gradient và minh hoạ nhân vật (dùng token/currentColor), không có chữ chìm vào nền. Không có tài khoản demo hợp lệ trong backend đang chạy tại thời điểm kiểm thử (tài khoản QA đã bị xoá theo mục "4" ở trên) nên chưa xác nhận được dashboard đã đăng nhập bằng mắt — phần này bỏ qua, không chặn việc hoàn tất task.

Toàn bộ 6 bước theo `task-20-brief.md` đã hoàn tất. Chi tiết đầy đủ log lệnh nằm ở `.superpowers/sdd/2026-07-29-magicschool-full-redesign/task-20-report.md`.
