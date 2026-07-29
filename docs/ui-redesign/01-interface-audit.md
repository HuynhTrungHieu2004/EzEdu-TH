# EzEdu AI — Khảo sát giao diện trước khi thiết kế lại (đợt MagicSchool-inspired)

- **Ngày:** 2026-07-29
- **Phạm vi:** Toàn bộ frontend, đối chiếu với 18 nguyên tắc thực thi và 12 giai đoạn do người dùng yêu cầu trong phiên làm việc này.
- **Trạng thái:** Khảo sát trước khi sửa. Các mục "Đã sửa trong phiên này" được đối chiếu lại ở [06-test-report.md](06-test-report.md).

---

## 0. Về `docs/project-audit/`

Yêu cầu gốc trỏ tới `docs/project-audit/` để đọc báo cáo trước khi bắt đầu. Thư mục này **không tồn tại** trong repo (đã xác nhận bằng `ls`/`find`). Tài liệu gần nhất cùng mục đích là `docs/ui-redesign/00-progress-log.md` cùng `01-audit-report.md` → `07-final-qa-report.md` — sản phẩm của một phiên thiết kế lại trước đó, đã hoàn thành: design system, layout theo vai trò, dashboard thật, homepage mới. Tài liệu này dùng bộ đó làm nền, không lặp lại nội dung đã có, chỉ khảo sát phần **mới phát sinh sau đó** (Giai đoạn 3–8: ngân hàng câu hỏi, ma trận đề, làm bài giới hạn thời gian, Cloudinary, web-knowledge, kho tri thức chuẩn) và phần lệch so với 18 nguyên tắc lần này.

---

## 1. Những gì phiên trước đã làm đúng (không cần làm lại)

Đọc `00-progress-log.md` xác nhận đã có sẵn:

- Bộ token 3 tầng (`tokens.css`) — primitive → semantic → alias, dark mode qua `[data-theme]`.
- Thư viện `components/ui/` với 21+ component (Button, Card, FormField, Dialog, Toast, EmptyState/ErrorState, Skeleton, DataTable-tương-đương, v.v).
- Layout theo vai trò: `AppLayout` (sidebar theo `area`), `RoleRoute`/`AdminRoute` chặn ở tầng route (không chỉ ẩn menu).
- Dashboard học sinh/giáo viên đã là dashboard thật (dữ liệu thật, không phải 4 thẻ trỏ lại sidebar).
- Trang chủ public đã dựng lại bằng design system, có hero SVG tự vẽ (không dùng ảnh ngoài).
- Hai lỗi nghiêm trọng ngoài phạm vi UI đã được vá: vòng lặp redirect đăng nhập, và bug không lưu được chỉnh sửa câu hỏi.

Kết luận: **không thiết kế lại từ đầu.** Việc trong phiên này là khảo sát khoảng trống rồi vá đúng chỗ.

---

## 2. Khoảng trống phát hiện, đối chiếu 18 nguyên tắc MagicSchool-inspired

| # | Nguyên tắc yêu cầu | Hiện trạng trước khi sửa | Mức ưu tiên |
|---|---|---|---|
| 1 | Dashboard có ô tìm kiếm lớn | **Không có** ở cả hai dashboard | P0 |
| 2 | Công cụ AI trình bày dạng thẻ, phân loại trong thư viện riêng | **Không có** trang thư viện; các công cụ nằm rải trong sidebar | P0 |
| 3 | Sidebar chỉ chứa phân hệ chính | Sidebar học sinh/giáo viên đã phình thêm "Khám phá kiến thức", "Kho tri thức chuẩn" sau Giai đoạn 6–7 — hai mục này là công cụ, không phải phân hệ chính | P0 |
| 4 | Người dùng bắt đầu việc chính trong 1–3 thao tác | Giáo viên phải vào đúng sidebar item rồi mới thấy hành động — không có quick action ngay ở dashboard | P0 |
| 5 | UI khác nhau theo vai trò | Đã có (RoleRoute + AppLayout theo `area`) | Đạt |
| 6 | Vùng chỉnh sửa/xem trước rõ ràng cho nội dung AI sinh ra | Đã có ở luồng sinh câu hỏi (Giai đoạn 1-2); **chưa rà soát** cho luồng chấm bài AI (Giai đoạn 4) và web-knowledge (Giai đoạn 6) | P1 — xem §4 |
| 7 | Có khoảng trắng, hiện đại, không đơn điệu AI-generic | Đạt phần lớn theo QA trước; chưa kiểm tra riêng các trang mới (ma trận đề, làm bài, Cloudinary retry) | P1 |

### 2.1 Lỗi cụ thể phát hiện và đã sửa trong phiên này

| Vấn đề | Vị trí | Sửa |
|---|---|---|
| "Hỏi đáp AI" đã được route cho phép (`STUDENT_AND_TEACHER`) nhưng **thiếu link trong sidebar giáo viên** — bug điều hướng thật, không phải thiếu tính năng | `AppLayout.tsx` nhánh `teacher` | Thêm lại link `/chat-advanced` vào nav giáo viên |
| Không có nơi duyệt toàn bộ công cụ AI theo nhóm | Toàn app | Thêm `ToolLibraryPage` (`/tools`) + `toolRegistry.ts` (nguồn dữ liệu dùng chung cho cả trang và ô tìm kiếm dashboard) |
| Dashboard không có ô tìm kiếm | `TeacherDashboardPage.tsx`, `StudentDashboardPage.tsx` | Thêm `SearchCommand` + hàng quick action, cập nhật câu chào đúng bản mẫu người dùng yêu cầu |
| Sidebar giáo viên/học sinh có 8–9 mục (vượt ngưỡng 5–7 mà chính tài liệu IA trước đó đặt ra) | `AppLayout.tsx` | Chuyển "Khám phá kiến thức" và "Kho tri thức chuẩn" ra khỏi sidebar, gộp vào Thư viện công cụ (route không đổi, chỉ đổi lối vào) |
| Hero trang chủ dùng câu chữ khác với bản mẫu chính xác người dùng cung cấp ở Giai đoạn 5 | `LandingSections.tsx`, CMS `website_content` | Cập nhật tiêu đề, mô tả, hai CTA đúng nguyên văn (xem [05-pages-redesigned.md](05-pages-redesigned.md)) |

---

## 3. Kiểm tra "không tạo nút giả" cho từng route mới (Giai đoạn 3–8)

Đối chiếu từng trang mới với API thật đang gọi — không phát hiện nút gọi API không tồn tại. Bảng chi tiết ở [03-route-mapping.md](03-route-mapping.md).

---

## 4. Việc **chưa** làm trong phiên này (để không tuyên bố quá mức)

- **Chưa** rà soát riêng UI của: `ExamAttemptPage` (làm bài giới hạn thời gian), `ExamGradingPage` (chấm AI + ghi đè điểm), trang retry Cloudinary, `WebKnowledgePage`, `CurriculumKbPage` — các trang này **đã hoạt động đúng nghiệp vụ** (405 test backend qua ở phiên trước) nhưng chưa được đối chiếu pixel-level với 18 nguyên tắc lần này. Xếp P1, ghi vào [07-final-handoff.md](07-final-handoff.md) mục "còn lại".
- **Chưa** kiểm tra Playwright cho bất kỳ route nào — công cụ không tồn tại trong repo (xem §6).
- **Chưa** đổi màu chủ đạo sang mã màu người dùng đề xuất (`#6D5DFB`) — quyết định và lý do ở [04-design-system.md](04-design-system.md).

---

## 5. Playwright

Xác nhận bằng khảo sát: không có `playwright.config.*`, không có thư mục `frontend/tests/` hay `e2e/`, không có `@playwright/test` trong `package.json`. Việc "dùng Playwright kiểm tra từng route" trong yêu cầu **không thể thực hiện với công cụ có sẵn trong repo**. Đã dùng trình duyệt thật (Browser pane) để kiểm tra thủ công thay thế — xem kết quả ở [06-test-report.md](06-test-report.md). Việc thêm Playwright là một thay đổi hạ tầng test (cài dependency mới, viết spec mới) — vượt phạm vi "thiết kế lại giao diện" và cần xác nhận riêng trước khi làm.
