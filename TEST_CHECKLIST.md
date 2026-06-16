# BẢNG KIỂM THỬ HỆ THỐNG (TEST CHECKLIST) & CHẨN ĐOÁN LỖI

Tài liệu này cung cấp danh sách kiểm tra (checklist) toàn bộ các thành phần hệ thống và phương pháp xử lý các lỗi thường gặp trước khi bắt đầu demo bảo vệ tốt nghiệp.

---

## 1. Backend API Endpoints Checklist
Đảm bảo tất cả các endpoint sau đều hoạt động tốt khi gọi qua Swagger UI ([http://localhost:8000/docs](http://localhost:8000/docs)) hoặc lệnh `curl`:

- [ ] **Hệ thống chung**:
  - [ ] `GET /health`: Trả về `{"status": "ok"}`
  - [ ] `GET /api/v1/db/ping`: Trả về `{"status": "ok", "message": "MongoDB connected..."}`
- [ ] **Xác thực người dùng (Auth)**:
  - [ ] `POST /api/v1/auth/register`: Đăng ký tài khoản mới thành công (trả về status 201)
  - [ ] `POST /api/v1/auth/login`: Trả về JWT Access Token và token_type
  - [ ] `GET /api/v1/auth/me`: Trả về thông tin chi tiết của user tương ứng với token JWT truyền lên
- [ ] **Quản lý học liệu (Documents)**:
  - [ ] `POST /api/v1/documents/upload`: Tải lên thành công các file `.pdf`, `.docx`, `.pptx`, `.mp4`
  - [ ] `GET /api/v1/documents`: Trả về danh sách học liệu của user hiện tại
  - [ ] `POST /api/v1/documents/{id}/extract`: Trích xuất text văn bản thô
  - [ ] `GET /api/v1/documents/{id}/content`: Trả về nội dung đã trích xuất kèm preview
  - [ ] `POST /api/v1/documents/{id}/index`: Lập chỉ mục chia chunk và sinh vector embedding lưu DB
  - [ ] `POST /api/v1/documents/{id}/search`: Thực hiện tìm kiếm ngữ nghĩa trả về các chunk liên quan nhất
  - [ ] `POST /api/v1/documents/{id}/transcribe`: Bắt đầu tiến trình trích xuất transcript video qua Gemini
  - [ ] `GET /api/v1/documents/{id}/transcript`: Xem kết quả transcript hội thoại của video
- [ ] **Sinh câu hỏi & Hỏi đáp**:
  - [ ] `POST /api/v1/questions/generate`: Sinh đề thi tự động chuẩn hóa định dạng JSON
  - [ ] `GET /api/v1/questions/document/{id}`: Liệt kê các bộ đề thi liên kết với học liệu
  - [ ] `GET /api/v1/questions/{set_id}`: Trả về chi tiết các câu hỏi trong bộ đề
  - [ ] `POST /api/v1/chat/ask`: Hỏi đáp AI RAG theo ngữ cảnh tài liệu
  - [ ] `GET /api/v1/chat/history/{id}`: Xem lại lịch sử trò chuyện
- [ ] **Xuất bản đề thi (Export)**:
  - [ ] `GET /api/v1/questions/{set_id}/export/docx`: Tải xuống tệp tin Microsoft Word (`.docx`)
  - [ ] `GET /api/v1/questions/{set_id}/export/pdf`: Tải xuống tệp tin Adobe PDF (`.pdf`)

---

## 2. Frontend Routes Checklist
Đảm bảo các đường dẫn trang hoạt động đúng cấu hình chuyển trang và hiển thị giao diện:

- [ ] **Định tuyến cơ bản**:
  - [ ] `/`: Màn hình giới thiệu Welcome Screen
  - [ ] `/register`: Trang đăng ký tài khoản
  - [ ] `/login`: Trang đăng nhập
- [ ] **Khu vực bảo vệ (yêu cầu Login)**:
  - [ ] `/dashboard`: Trang tổng quan hiển thị thống kê học liệu và bộ câu hỏi gần đây
  - [ ] `/documents`: Trang danh sách học liệu và khung kéo thả tải tệp tin lên
  - [ ] `/documents/:documentId`: Trang chi tiết học liệu (chứa thanh tiến trình pipeline, tìm kiếm thử nghiệm, bảng preview văn bản/transcript và khung chat RAG)
  - [ ] `/documents/:documentId/questions`: Giao diện cấu hình và sinh câu hỏi tự động
  - [ ] `/question-sets/:questionSetId`: Giao diện luyện tập tương tác (quiz) và nút tải đề Word/PDF

---

## 3. Kiểm Tra Kết Nối Dịch Vụ Ngoài (Integrations)

- [ ] **MongoDB Atlas**:
  - [ ] Kiểm tra IP của máy chạy local đã được Whitelist trên MongoDB Atlas (Network Access -> Allow access from anywhere `0.0.0.0/0` để test nhanh).
- [ ] **Cloudinary Storage**:
  - [ ] Đảm bảo điền đúng các thông tin Cloud Name, API Key, API Secret trong tệp `.env`.
- [ ] **Google Gemini API**:
  - [ ] Kiểm tra API key có hiệu lực và kết nối được mạng internet toàn cầu để gọi API.

---

## 4. Kiểm Tra Bảo Mật Trước Khi Demo

- [ ] **Không hardcode key**: Chắc chắn không có API key hay URI database nào nằm trong mã nguồn.
- [ ] **Chặn rò rỉ Token**: Không in JWT token hoặc thông tin nhạy cảm ra log console trình duyệt hoặc log server production.
- [ ] **Chặn truy cập trái phép**: Đảm bảo người dùng này không thể truy cập, xem transcript hoặc chỉnh sửa học liệu của người dùng khác bằng cách sửa đổi `documentId` trên thanh URL (xác thực `user_id` sở hữu ở tầng API backend).

---

## 5. Chẩn Đoán Lỗi Thường Gặp & Cách Khắc Phục

### Lỗi 1: `404 NOT_FOUND` hoặc lỗi khi Lập Chỉ Mục (Indexing)
* **Nguyên nhân**: Model nhúng `text-embedding-004` đã bị Google khai tử vào ngày 14/01/2026.
* **Cách sửa**: Hệ thống đã được nâng cấp sang model thay thế là `gemini-embedding-001`. Đảm bảo biến `GEMINI_API_KEY` của bạn hợp lệ.

### Lỗi 2: Trình duyệt báo lỗi kết nối `Network Error` khi gọi API từ Frontend
* **Nguyên nhân**: Lỗi cấu hình CORS ở Backend hoặc chưa điền đúng `VITE_API_BASE_URL` ở Frontend.
* **Cách sửa**:
  1. Kiểm tra file `frontend/.env` đã cấu hình `VITE_API_BASE_URL=http://localhost:8000` (không có dấu gạch chéo `/` ở cuối).
  2. Kiểm tra file `backend/.env` đã có cấu hình `BACKEND_CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]`.

### Lỗi 3: Lỗi `Cloudinary Connection Error` khi tải lên tệp tin
* **Nguyên nhân**: Key Cloudinary bị sai hoặc máy chủ local bị chặn mạng kết nối đến API Cloudinary.
* **Cách sửa**: Kiểm tra lại thông số Cloudinary trong `backend/.env` khớp với thông tin trên Cloudinary Dashboard của bạn.

### Lỗi 4: Lập chỉ mục Vector ChromaDB bị xóa sau khi restart container trên Cloud
* **Nguyên nhân**: ChromaDB lưu trữ SQLite cục bộ trên phân vùng tạm (ephemeral storage) của container.
* **Cách sửa**: Cấu hình volume lưu trữ liên tục (Persistent Disk) và gán đường dẫn vào biến `CHROMA_PERSIST_DIR` trên ứng dụng hosting.
