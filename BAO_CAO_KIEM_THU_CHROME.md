# Báo cáo kiểm thử website trên Google Chrome

Ngày kiểm thử: 21/07/2026  
Môi trường: macOS, Google Chrome 149, frontend Vite tại `http://localhost:5173`, backend FastAPI tại `http://127.0.0.1:8000`.

## 1. Kết luận

Hệ thống hoạt động tốt ở luồng chính dành cho giảng viên. Kiểm thử E2E trên Chrome đã đi qua đăng ký, đăng nhập, phân quyền giao diện, điều hướng, tải DOCX thật, mở chi tiết tài liệu, đăng xuất và bảo vệ route. Backend, MongoDB, Cloudinary và endpoint nội dung tài liệu đều phản hồi thành công.

Mức sẵn sàng đề xuất: **Có thể demo**, nhưng nên xử lý lỗi 404 của trạng thái kiểm duyệt và tối ưu kích thước JavaScript trước khi triển khai production.

## 2. Kết quả theo nhóm chức năng

| Nhóm | Kết quả | Bằng chứng / ghi chú |
|---|---|---|
| Trang chủ và kết nối backend | Đạt | `/health` trả `200 {"status":"ok"}`; Chrome hiển thị trạng thái kết nối thành công |
| MongoDB | Đạt | `/api/v1/db/ping` trả 200, kết nối MongoDB thành công |
| Đăng ký giảng viên | Đạt | API trả 201, giao diện chuyển về đăng nhập và hiện thông báo thành công |
| Đăng nhập và JWT | Đạt | API trả 200, chuyển đúng sang Dashboard |
| Phân quyền menu giảng viên | Đạt | Hiện Tài liệu, Hỏi đáp AI, Quản lý lịch sử, Sinh đề nhanh |
| Dashboard | Đạt | Hiển thị đúng tên người dùng và các thao tác chính |
| Điều hướng route chính | Đạt | `/documents`, `/chat-advanced`, `/question-history`, `/generate` đều tải được |
| Tải học liệu DOCX | Đạt | Upload `test.docx` lên Cloudinary/API trả 201 và danh sách được cập nhật |
| Chi tiết và nội dung tài liệu | Đạt | API metadata và `content?full_text=true` đều trả 200; trang chi tiết hiển thị được |
| Đăng xuất | Đạt | Token bị xóa và chuyển về `/login` |
| Bảo vệ route | Đạt | Truy cập `/dashboard` sau đăng xuất bị chuyển về `/login` |
| Unit test backend | Đạt | 81/81 test đạt |
| Assertion test frontend | Đạt | 8/8 nhóm test đạt, gồm citation/XSS, lỗi API, feedback, hội thoại |
| ESLint | Đạt | Không có lỗi lint |
| Production build | Đạt có cảnh báo | TypeScript và Vite build thành công; bundle JS 521,51 kB |
| Sinh câu hỏi/RAG/video/export | Đạt ở test tự động cấp service/API | Các nhánh có unit/integration test đạt; chưa chạy trọn live E2E bằng video dài và tải file xuất qua Chrome trong phiên này |

## 3. Vấn đề phát hiện

### P2 — Endpoint trạng thái kiểm duyệt trả 404 sau khi upload

- Request: `GET /api/v1/documents/{id}/verify/status`
- Hiện tượng: Chrome ghi hai lỗi `Failed to load resource: 404` do React development mode gọi lặp effect.
- Ảnh hưởng: không chặn trang chi tiết, nhưng làm bẩn console, gây khó giám sát và có thể khiến người dùng không thấy trạng thái kiểm duyệt ban đầu.
- Đề xuất: backend nên trả `200` với trạng thái mặc định như `not_started` khi chưa có phiên kiểm duyệt; hoặc frontend chỉ gọi endpoint khi tài liệu đã đủ điều kiện và coi 404 là trạng thái rỗng có chủ đích.

### P3 — Bundle JavaScript lớn

- Vite cảnh báo chunk chính 521,51 kB sau minify (145,94 kB gzip).
- Ảnh hưởng: thời gian tải lần đầu và parse JavaScript có thể chậm trên thiết bị yếu/mạng di động.
- Đề xuất: lazy-load các trang nặng (`AdvancedChatPage`, `QuickGeneratePage`, `AdminDashboardPage`) bằng `React.lazy`, chia vendor chunk và đo lại Lighthouse.

### P3 — Gọi API lặp trong môi trường development

- Log cho thấy nhiều request `auth/me`, danh sách tài liệu, nội dung và verify/status được gọi hai lần do React Strict Mode.
- Ảnh hưởng: tăng log và tải dịch vụ khi demo; production thường không lặp theo cơ chế này.
- Đề xuất: giữ Strict Mode nhưng bảo đảm effect idempotent/có hủy request; khi chẩn đoán cần phân biệt log development với production.

### Rủi ro còn lại

- Chưa đo responsive trên điện thoại, accessibility bằng axe, hiệu năng Lighthouse và tải đồng thời.
- Chưa thực hiện E2E live toàn bộ cho video dài, transcript, sinh câu hỏi bằng LLM, làm bài bằng tài khoản sinh viên và tải DOCX/PDF. Đây là các luồng phụ thuộc thời gian xử lý/dịch vụ ngoài, nên cần một vòng kiểm thử nghiệm thu riêng với dữ liệu mẫu cố định.

## 4. Đề xuất ưu tiên

1. Sửa hợp đồng API `verify/status` để trạng thái chưa tồn tại không tạo 404 trên luồng bình thường.
2. Bổ sung bộ Playwright E2E chính thức cho hai vai trò giảng viên/sinh viên và chạy trong CI.
3. Tạo fixture tài liệu nhỏ đã biết trước kết quả để kiểm tra extract → index → search → generate → publish → take exam → export.
4. Dùng mock LLM trong CI, đồng thời chạy một smoke test live Gemini/Groq theo lịch để kiểm soát chi phí và độ ổn định.
5. Code-splitting các trang lớn; đặt ngưỡng bundle trong CI.
6. Bổ sung kiểm thử responsive, accessibility, upload sai định dạng/quá dung lượng, quyền sở hữu chéo và token hết hạn.

## 5. Dữ liệu kiểm thử

Kiểm thử Chrome đã tạo một số tài khoản có tên `E2E Chrome Audit` và tải các bản sao `test.docx` lên môi trường đang cấu hình. Nên xóa các bản ghi này sau khi đối chiếu báo cáo nếu môi trường được dùng cho dữ liệu thật.
