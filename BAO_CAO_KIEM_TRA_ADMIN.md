# Báo cáo kiểm tra chức năng và quyền hạn Admin

Ngày kiểm tra: 21/07/2026  
Phạm vi: giao diện `AdminDashboardPage`, bảo vệ route, API `/api/v1/admin/dashboard/*`, luồng tạo/thăng quyền/đăng nhập admin và quyền trên các tài nguyên hiện có.

## 1. Kết luận

**Chức năng Admin hiện chưa đầy đủ để quản lý hoặc điều chỉnh website.** Phần đã có về bản chất là một **dashboard giám sát AI chỉ đọc**, không phải trang quản trị hệ thống hoàn chỉnh.

Backend đã chặn đúng người không phải admin ở các API thống kê. Tuy nhiên có lỗi P1 khiến admin được thăng quyền bằng công cụ chính thức không thể đăng nhập qua giao diện web thông thường.

Mức hoàn thiện ước tính:

- Giám sát/thống kê: **khá đầy đủ cho MVP**.
- Quản lý người dùng và phân quyền: **chưa có**.
- Quản trị nội dung toàn hệ thống: **chưa có**.
- Điều chỉnh cấu hình/vận hành website: **chưa có**.
- Bảo mật và vòng đời tài khoản admin: **chưa đủ để production**.

## 2. Những chức năng Admin đã có

| Chức năng | Trạng thái |
|---|---|
| Route riêng `/admin/dashboard` | Có |
| Frontend kiểm tra role admin trước khi hiển thị | Có |
| Backend bắt buộc `role == admin` | Có |
| Người thường gọi API admin bị trả 403 | Đã kiểm chứng thực tế |
| Tổng quan người dùng, hội thoại, tin nhắn, học liệu, verification, feedback | Có |
| Theo dõi token, model và retrieval mode | Có |
| Theo dõi chất lượng AI, phản hồi và thiếu bằng chứng | Có |
| Theo dõi tỷ lệ lỗi, latency trung bình, P50, P95 | Có |
| Xem kết quả RAG benchmark offline | Có |
| Bộ lọc hôm nay, 7 ngày, 30 ngày | Có |
| Timeout truy vấn, giới hạn khoảng ngày và rate limit | Có |
| Công cụ dòng lệnh thăng một tài khoản thành admin | Có |

Kiểm tra trực tiếp cả năm endpoint `overview`, `usage`, `quality`, `errors-latency`, `evaluation` bằng token admin đều trả 200. Tài khoản giảng viên gọi `overview` nhận 403 đúng thiết kế.

## 3. Lỗi và thiếu sót quan trọng

### P1 — Admin không thể đăng nhập qua giao diện chính

- Form đăng nhập và schema `UserLogin` chỉ chấp nhận `student` hoặc `lecturer`.
- Tài khoản sau khi chạy `bootstrap_admin.py` có role `admin`.
- Đăng nhập tài khoản này dưới lựa chọn Giảng viên trả 403: `Vai trò đăng nhập không khớp với tài khoản đã đăng ký.`
- Đã xác nhận thực tế bằng tài khoản kiểm thử `admin.audit.20260721@example.com`.
- Admin chỉ đăng nhập được qua endpoint Swagger `login-swagger`, vì endpoint này không kiểm tra role. Người dùng thông thường không thể sử dụng cách này để vào giao diện.

Đề xuất: thêm lựa chọn/luồng đăng nhập admin an toàn, hoặc bỏ role khỏi payload đăng nhập và để server trả role từ tài khoản. Phương án thứ hai đơn giản hơn và tránh để người dùng tự khai báo vai trò lúc đăng nhập.

### P1 — Chưa có quản lý người dùng và vai trò

Không có API hay giao diện để:

- xem/tìm kiếm/phân trang danh sách người dùng;
- khóa, mở khóa hoặc vô hiệu hóa tài khoản;
- đổi vai trò student/lecturer/admin;
- đặt lại mật khẩu hoặc buộc đăng xuất;
- xem hoạt động và lịch sử đăng nhập của một người dùng;
- thu hồi quyền admin.

Hiện việc cấp quyền chỉ thực hiện trực tiếp bằng script và MongoDB.

### P1 — Chưa có quản trị nội dung toàn hệ thống

Admin không có màn hình tổng hợp và quyền thao tác toàn cục với:

- tài liệu của người dùng khác;
- câu hỏi/bộ đề của giảng viên khác;
- bài thi đã xuất bản;
- hội thoại, phản hồi hoặc nội dung bị báo cáo;
- hàng đợi xử lý lỗi/transcript/index.

Các API tài liệu vẫn ràng buộc `document.user_id == current_user.id`. Nhiều API sửa/xóa/xuất bộ câu hỏi cũng yêu cầu chính chủ. Vì vậy role admin hiện không phải super-admin nội dung.

### P1 — Chưa có quyền điều chỉnh website

Không có chức năng thay đổi:

- tên website, logo, nội dung trang chủ và thông báo;
- chế độ bảo trì/đóng đăng ký;
- giới hạn upload, quota người dùng hoặc quota AI;
- model AI, prompt hệ thống, ngưỡng RAG/verification;
- loại file được phép, chính sách xuất bản và kiểm duyệt;
- feature flags hoặc cấu hình tích hợp Cloudinary/Gemini/Groq;
- email hệ thống, điều khoản sử dụng hoặc chính sách bảo mật.

Các cấu hình này vẫn phải sửa `.env` hoặc mã nguồn rồi khởi động lại dịch vụ.

### P2 — Công cụ bootstrap có guard production chưa đáng tin cậy

`bootstrap_admin.py` kiểm tra môi trường bằng `os.getenv("APP_ENV", "development")`, trong khi cấu hình ứng dụng được đọc qua đối tượng `settings`. Nếu `APP_ENV` chỉ nằm trong file `.env` mà không được export vào process, script có thể hiểu nhầm production là development và không yêu cầu `--confirm-production`.

Đề xuất: sử dụng `settings.APP_ENV`, thêm xác nhận tương tác/allowlist, ghi audit log và cung cấp thao tác thu hồi quyền.

### P2 — Thiếu audit log cho thao tác quản trị

Không có nhật ký bất biến ghi ai đã cấp quyền, đổi cấu hình, khóa user, xóa nội dung hoặc lúc nào thực hiện. Đây là yêu cầu quan trọng trước khi thêm quyền ghi/xóa cho admin.

### P2 — RBAC còn quá đơn giản

Chỉ có kiểm tra role bằng chuỗi `admin`. Chưa có permission chi tiết như `users.read`, `users.suspend`, `content.moderate`, `settings.write`, `analytics.read`. Không thể tạo các vai trò hỗ trợ, kiểm duyệt viên hoặc admin chỉ xem báo cáo.

### P3 — Rate limit chỉ lưu trong bộ nhớ

Rate limit admin bị xóa khi restart và không đồng bộ giữa nhiều worker/server. Khi production nhiều instance nên dùng Redis hoặc gateway rate limiting.

### P3 — Bộ lọc `custom` được khai báo nhưng chưa triển khai

Kiểu dữ liệu frontend có preset `custom`, nhưng giao diện chỉ cung cấp hôm nay, 7 ngày và 30 ngày.

## 4. Ma trận quyền Admin hiện tại

| Nhóm quyền | Xem | Tạo/Sửa/Xóa | Đánh giá |
|---|---:|---:|---|
| Analytics hệ thống | Có | Không áp dụng | Đạt |
| Chất lượng AI/RAG | Có | Không | Chỉ giám sát |
| Người dùng | Chỉ có tổng số | Không | Thiếu |
| Vai trò và admin | Không | Chỉ qua script | Thiếu nghiêm trọng |
| Tài liệu toàn hệ thống | Không | Không | Thiếu |
| Bộ đề/bài thi toàn hệ thống | Hạn chế | Hạn chế/theo chủ sở hữu | Thiếu |
| Hội thoại/phản hồi bị báo cáo | Chỉ số tổng hợp | Không | Thiếu |
| Cấu hình website | Không | Không | Thiếu |
| Cấu hình AI/quota | Chỉ xem usage | Không | Thiếu |
| Audit log | Không | Không | Thiếu |

## 5. Lộ trình đề xuất

### Giai đoạn 1 — Sửa khả năng truy cập và bảo mật

1. Sửa luồng đăng nhập admin.
2. Sửa production guard của bootstrap.
3. Thêm audit log cho mọi thao tác admin.
4. Thêm trạng thái tài khoản `active/suspended` và cơ chế thu hồi token.
5. Viết E2E cho admin và kiểm tra 401/403 ở tất cả endpoint.

### Giai đoạn 2 — Quản trị cốt lõi

1. Quản lý người dùng, phân quyền, khóa/mở khóa.
2. Quản lý tài liệu và bộ đề toàn hệ thống với soft-delete/khôi phục.
3. Hàng đợi lỗi xử lý, retry transcript/index và theo dõi job.
4. Kiểm duyệt nội dung và phản hồi người dùng.

### Giai đoạn 3 — Điều chỉnh website

1. Site settings có schema, validation và version history.
2. Feature flags, maintenance mode, đóng/mở đăng ký.
3. Quota theo vai trò/người dùng và giới hạn chi phí AI.
4. Quản lý model/prompt theo phiên bản, có thử nghiệm và rollback.
5. Xuất báo cáo CSV/PDF và cảnh báo khi error rate/latency/chi phí vượt ngưỡng.

## 6. Dữ liệu kiểm thử đã tạo

- `admin.audit.20260721@example.com`: được thăng thành admin để kiểm tra thực tế.
- `nonadmin.audit.20260721@example.com`: giảng viên dùng để xác nhận API admin trả 403.

Nên xóa hai tài khoản này sau khi đối chiếu báo cáo nếu đây là cơ sở dữ liệu production.
