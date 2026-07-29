# EzEdu AI — Báo cáo Playwright và responsive

- Ngày: 2026-07-29
- Framework: Playwright, Chromium cài cục bộ trong `frontend`

## Cấu hình

- Base URL: `http://127.0.0.1:4173`.
- Playwright tự chạy Vite development server với API base trỏ về server fixture cục bộ.
- Screenshot chỉ tạo khi lỗi; video và trace chỉ giữ khi lỗi.
- `playwright-report`, `test-results`, `blob-report`, video và trace không được Git theo dõi.
- Mỗi route chạy trong browser context riêng để lỗi console hoặc trạng thái đăng nhập không rò sang ca khác.

## Sáu viewport bắt buộc

| Project | Kích thước | Kết quả |
|---|---:|---|
| `desktop-1440` | 1440×900 | Pass |
| `laptop-1280` | 1280×800 | Pass |
| `tablet-landscape-1024` | 1024×768 | Pass |
| `tablet-portrait-768` | 768×1024 | Pass |
| `mobile-390` | 390×844 | Pass |
| `mobile-360` | 360×800 | Pass |

## Phạm vi route

- Public: landing, cách hoạt động, tính năng, FAQ, login, register, maintenance và fallback 404.
- Teacher: toàn bộ 18 route thật, gồm dashboard, hồ sơ, học liệu, sinh câu hỏi, lịch sử, lớp, chat, knowledge, tools, ngân hàng câu hỏi, ma trận đề và chấm bài.
- Student: toàn bộ 12 route thật, gồm onboarding, dashboard, hồ sơ, bộ câu hỏi, bài luyện tập, tiến độ, cá nhân hóa, chat, knowledge, tools và làm bài.
- Admin: toàn bộ 16 route thật, gồm cả hai route chi tiết.
- Route tương thích `/student-statistics` được kiểm tra redirect sang `/learning-history`.
- Route bảo vệ được kiểm tra redirect về login và vẫn đúng sau refresh.

## Assertion

- Route mở đúng hoặc redirect đúng theo guard.
- Landmark nội dung chính hiển thị và không rỗng.
- `documentElement` và `body` không tràn ngang quá viewport.
- Public page không có ảnh hỏng.
- Không có `pageerror`, unhandled rejection hoặc `console.error` từ ứng dụng.
- Lỗi tải resource 503 dự kiến của fixture được tách khỏi lỗi JavaScript; UI vẫn phải render error/unavailable state.
- Dark theme có đủ semantic token và không tràn ngang.
- ID ExamGrading sai bị chặn trước request và không lộ raw ID.
- Dialog xóa user không xác nhận được khi thiếu lý do/email, giữ focus trap và trả focus về nút mở.

## Kết quả

Lệnh cuối:

```bash
cd frontend
npm run test:e2e
```

Kết quả: `438 passed`, gồm 73 ca trên mỗi viewport × 6 viewport.

## Lỗi phát hiện và đã sửa

- Hai request lỗi có xử lý trong `AdvancedChatPage` vẫn ghi `console.error`; chuyển sang thông báo lỗi nhìn thấy được.
- Preview nội dung học liệu thất bại không có feedback; bổ sung alert riêng.
- Trang maintenance dùng `h2` làm heading đầu tiên; đổi thành `h1`.
- Route chi tiết user Admin, maintenance, redirect cũ và fallback 404 được bổ sung vào inventory.
- Test ban đầu gom 18 route Teacher trong một ca nên timeout khi chạy song song; tách thành test độc lập theo route, không tăng timeout toàn cục.

## Giới hạn và cách hiểu kết quả

API fixture chỉ cung cấp identity/route guard và chủ động trả 503 cho API nghiệp vụ. Vì vậy bộ test chứng minh route, responsive, guard, loading/error state, console hygiene và accessibility trong môi trường xác định; không phải bằng chứng happy-path end-to-end với backend thật.

Không có tài khoản test hoặc seed data được cấp, nên các mutation như upload, sinh câu hỏi, nộp bài, chấm điểm và reset quota không được gửi tới backend sống. Logic backend và contract được kiểm bằng pytest; click-through happy path với dữ liệu test tích hợp vẫn là bước tiếp theo.

---

## Xác nhận độc lập của Claude (2026-07-29)

Tự chạy lại `npm run test:e2e` hai lần trong quá trình rà soát và sửa lỗi (không chỉ đọc báo cáo):

1. **Trước khi sửa gì:** `438 passed (7.4m)` — khớp chính xác con số báo cáo ở trên.
2. **Sau khi sửa C1 (quota validate), migrate `AdminFeatureFlagsPage`/`AdminSettingsPage` sang design system, và sửa 3 chỗ raw JSON/enum ở `AdminDashboardPage`:** chạy lại toàn bộ 6 viewport một lần nữa để xác nhận không có regression từ các thay đổi trên (kết quả ghi ở `17-claude-final-completion.md`).

Không phát hiện gì cần sửa thêm trong phạm vi Playwright/responsive — cấu hình, fixture, và scope route đã đúng như mô tả ở trên.
