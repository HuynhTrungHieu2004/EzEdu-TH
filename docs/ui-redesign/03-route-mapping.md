# EzEdu AI — Bảng ánh xạ route thật (nguồn: `frontend/src/App.tsx`)

- **Ngày:** 2026-07-29
- Trích trực tiếp từ cây route đang chạy, không phải kế hoạch. `TEACHER_ONLY = ['lecturer','user']`, `STUDENT_ONLY = ['student']`, `STUDENT_AND_TEACHER` = hợp của hai nhóm trên.

## Public (không sidebar)

| Route | Trang | Ghi chú |
|---|---|---|
| `/` | `LandingPage` | Nội dung CMS + fallback mặc định |
| `/how-it-works`, `/features`, `/faq` | Trang tĩnh | |
| `/login`, `/register` | `PublicLayout` | |
| `/student-onboarding` | `RoleRoute(STUDENT_ONLY)` | Có nút "Để sau" |
| `/maintenance` | `PublicLayout` | Chỉ tới qua interceptor 503 |
| `*` | `NotFoundPage` | |

## Có sidebar (`AppLayout`)

| Route | Trang | Vai trò cho phép | Trong sidebar? |
|---|---|---|---|
| `/dashboard` | `DashboardPage` (render theo `area`) | HS + GV | Có — "Tổng quan" |
| `/ho-so` | `ProfilePage` | HS + GV | Không (menu tài khoản) |
| `/tools` | `ToolLibraryPage` **(mới)** | HS + GV | Có — "Công cụ AI" |
| `/documents`, `/documents/:id`, `/documents/:id/questions` | Học liệu | GV | Có — "Học liệu" |
| `/generate` | Sinh đề nhanh | GV | Có — "Đề & câu hỏi" |
| `/question-history` | Lịch sử bộ đề | GV | Có — "Đề & câu hỏi" |
| `/question-sets/:id` | Chi tiết bộ đề (soạn hoặc làm bài, theo role) | HS + GV | Không (điều hướng từ trang khác) |
| `/question-bank` | Ngân hàng câu hỏi | GV | Có |
| `/exam-blueprints`, `/exam-blueprints/:id` | Ma trận đề + sinh đề CP-SAT | GV | Có — "Ma trận đề" |
| `/exams/:examId/grading` | Chấm bài AI + ghi đè điểm | GV | Không (điều hướng từ danh sách đề) |
| `/take-exam/:examId` | Làm bài giới hạn thời gian | HS | Không (cần ID cụ thể — khoảng trống đã ghi nhận) |
| `/classes`, `/classes/:id` | Lớp học | GV | Có |
| `/published-questions` | Bài luyện tập | HS | Có |
| `/learning-history` | Tiến độ | HS | Có |
| `/student-statistics` | → redirect `/learning-history` | HS | Route cũ giữ lại, không phá bookmark |
| `/personalization` | Lộ trình học `[flag: enable_personalization]` | HS | Có, có điều kiện |
| `/chat-advanced` | Hỏi đáp AI | HS + GV | Có — **sửa lỗi thiếu link phía giáo viên trong phiên này** |
| `/web-knowledge` | Khám phá kiến thức Internet có kiểm chứng | HS + GV | Không còn ở top-level — vào qua `/tools` |
| `/curriculum-kb` | Kho tri thức chuẩn | HS + GV | Không còn ở top-level — vào qua `/tools` |

## Admin (`AdminRoute`, layout riêng)

| Route | Trang |
|---|---|
| `/admin/dashboard`, `/admin/users(/:id)`, `/admin/documents(/:id)`, `/admin/questions(/:id)`, `/admin/exams`, `/admin/ai`, `/admin/website-content`, `/admin/settings`, `/admin/feature-flags`, `/admin/notifications`, `/admin/reports`, `/admin/activity-logs`, `/admin/audit-logs` | Không đổi trong phiên này |

## Đối chiếu "không nút giả" cho các route mới (Giai đoạn 3–8)

| Route | API thật đứng sau |
|---|---|
| `/question-bank` | `GET/POST /question-bank/*` |
| `/exam-blueprints*` | `GET/POST /exam-bank/blueprints/*`, sinh đề CP-SAT |
| `/exams/:id/grading` | `GET /exam-bank/attempts/*`, `POST .../override-score` |
| `/take-exam/:id` | `POST /exam-bank/attempts`, auto-submit 3 lớp |
| `/web-knowledge` | `POST /web-knowledge/explore` (có cache/quota/redaction) |
| `/curriculum-kb` | `GET /curriculum-kb/search`, `POST .../registry` (giáo viên) |
| `/tools` | Không gọi API riêng — điều hướng tĩnh tới các route trên, dữ liệu "gần đây" đọc `localStorage` thật |

Không phát hiện nút hoặc route gọi endpoint không tồn tại.
