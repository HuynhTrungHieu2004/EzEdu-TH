# EzEdu AI — Kiến trúc thông tin (bản hiện hành, đợt MagicSchool-inspired)

- **Ngày:** 2026-07-29
- **Thay thế:** phiên bản trước của tài liệu này (2026-07-28), vốn đề xuất đổi toàn bộ route sang tiền tố `/hs` và `/gv`. Kế hoạch đó **chưa từng được triển khai** — xem `00-progress-log.md`. Route thật vẫn giữ đường dẫn phẳng cũ (`/dashboard`, `/documents`, ...), chỉ có role guard được thêm. Tài liệu này mô tả **kiến trúc thật đang chạy**, không phải kế hoạch.
- **Xem thêm:** [01-interface-audit.md](01-interface-audit.md), [03-route-mapping.md](03-route-mapping.md).

---

## 1. Bốn khu vực (giữ nguyên từ thiết kế trước, đã đúng thực tế)

```
A. PUBLIC     Khách chưa đăng nhập — PublicLayout / LandingPage tự quản lý header-footer
B. HỌC SINH   role = student            — AppLayout(area=student)
C. GIÁO VIÊN  role = lecturer | user    — AppLayout(area=teacher)
D. ADMIN      role = admin | super_admin và các role permission khác — AdminRoute + AdminLayout
```

Ranh giới thực thi ở **tầng route** qua `RoleRoute`/`AdminRoute` trong `App.tsx`, không chỉ ẩn menu — đúng nguyên tắc đã đặt ra từ trước và vẫn giữ.

---

## 2. Sidebar — trạng thái thật sau khi sửa trong phiên này

### 2.1 Giáo viên (`AppLayout.tsx`, nhánh `area === 'teacher'`)

| # | Mục | Route | Nguồn |
|---|---|---|---|
| 1 | Tổng quan | `/dashboard` | Có sẵn |
| 2 | Công cụ AI | `/tools` | **Mới** — Thư viện công cụ |
| 3 | Học liệu | `/documents` | Có sẵn |
| 4 | Đề & câu hỏi | `/generate`, `/question-history` | Có sẵn |
| 5 | Ngân hàng câu hỏi | `/question-bank` | Có sẵn (Giai đoạn 3) |
| 6 | Ma trận đề | `/exam-blueprints` | Có sẵn (Giai đoạn 3) |
| 7 | Hỏi đáp AI | `/chat-advanced` | **Sửa lỗi** — route đã cho phép giáo viên từ trước nhưng sidebar thiếu link |
| 8 | Lớp học | `/classes` | Có sẵn |

**Bỏ khỏi sidebar cấp cao (không xoá route):** "Khám phá kiến thức" (`/web-knowledge`) và "Kho tri thức chuẩn" (`/curriculum-kb`) — hai mục này là công cụ, không phải phân hệ chính; nay chỉ vào qua `/tools`.

### 2.2 Học sinh (`AppLayout.tsx`, nhánh `area === 'student'`)

| # | Mục | Route | Nguồn |
|---|---|---|---|
| 1 | Tổng quan | `/dashboard` | Có sẵn |
| 2 | Công cụ AI | `/tools` | **Mới** |
| 3 | Bài luyện tập | `/published-questions` | Có sẵn |
| 4 | Hỏi đáp AI | `/chat-advanced` | Có sẵn |
| 5 | Tiến độ | `/learning-history` | Có sẵn |
| 6 | Lộ trình học `[flag: enable_personalization]` | `/personalization` | Có sẵn, đổi nhãn từ "Cá nhân hóa" cho khớp thuật ngữ người dùng dùng ở đặc tả dashboard |

**Bỏ khỏi sidebar cấp cao:** "Khám phá kiến thức", "Kho tri thức chuẩn" — cùng lý do như trên.

### 2.3 Admin

Không đổi trong phiên này — 7 nhóm đã đúng từ thiết kế trước (Tổng quan, Người dùng, Nội dung, AI, Website, Hệ thống, Báo cáo & log). Việc đối chiếu tên nhóm với đặc tả mới ("Học liệu hệ thống", "Nhật ký hệ thống" tách riêng khỏi "Báo cáo") **chưa thực hiện** — ghi vào phần còn lại của [07-final-handoff.md](07-final-handoff.md).

---

## 3. Vì sao không thêm nav item cho mọi mục trong đặc tả mẫu

Đặc tả người dùng đưa ra danh sách sidebar mẫu (tham khảo cấu trúc MagicSchool). Đối chiếu từng mục với backend thật:

| Mục trong mẫu | Có backend thật không | Quyết định |
|---|---|---|
| GV — Học sinh (trang danh sách học sinh xuyên lớp) | **Không** — quản lý học sinh chỉ tồn tại lồng trong từng lớp (`ClassDetailPage`), không có API liệt kê học sinh toàn giáo viên | Không thêm mục nav. Ghi vào roadmap |
| GV — Báo cáo | **Không** — không có endpoint tổng hợp kết quả theo lớp cho giáo viên (chỉ admin có `/admin/reports`) | Không thêm |
| GV — Cài đặt | **Không** có trang riêng | Không thêm; `/ho-so` là nơi gần nhất |
| HS — Học liệu của tôi | **Không áp dụng** — học sinh không sở hữu học liệu trong mô hình dữ liệu này | Không thêm |
| HS — Bài được giao (giao riêng từng học sinh) | **Không** — hệ thống ban hành theo lớp/toàn bộ, không có giao bài theo từng cá nhân tách biệt | Không thêm; `/published-questions` đã phủ đúng nghĩa "bài cần làm" |
| HS — Cài đặt | **Không** có trang riêng ngoài `/ho-so` | Không thêm |

Đây là áp dụng đúng nguyên tắc 9/10 của yêu cầu: không tạo nút giả, không dùng dữ liệu giả để che chức năng chưa có.

---

## 4. Đề xuất tương lai (chưa đủ backend, không hiện trên UI)

Kế thừa từ bản trước, vẫn đúng: báo cáo kết quả toàn lớp cho giáo viên, trang "Lớp của tôi" cho học sinh (thật ra `GET /classes/mine` đã có — vẫn chưa có UI, xếp P2 vì không nằm trong 12 giai đoạn lần này), duyệt knowledge graph, OAuth, xác thực email. Bổ sung từ khảo sát lần này:

| Đề xuất mới | Vì sao chưa làm |
|---|---|
| Trang "Học sinh" xuyên lớp cho giáo viên | Cần thêm endpoint liệt kê học sinh theo giáo viên — thay đổi backend, ngoài phạm vi "chỉ sửa giao diện" |
| Tab "Đã lưu" (favorite) trong Thư viện công cụ | Không có bookmark backend; "Gần đây" dùng `localStorage` thật (không phải dữ liệu giả) thay cho tính năng này |
| Trang duyệt danh sách đề thi công khai cho học sinh | `/take-exam/:examId` cần ID cụ thể, học sinh chưa có cách khám phá đề đang mở — Giai đoạn 4 đã ghi nhận khoảng trống này trước đó |
