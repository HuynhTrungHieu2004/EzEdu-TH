# Hệ Thống Sinh Câu Hỏi Đánh Giá Năng Lực Tự Động Từ Học Liệu Điện Tử

Hệ thống hỗ trợ giáo dục sử dụng trí tuệ nhân tạo (Generative AI) để tự động đọc tài liệu (PDF, Word, PowerPoint), phân mảnh và lưu trữ ngữ cảnh RAG (Retrieval-Augmented Generation), hỏi đáp học tập trực tuyến, sinh các đề kiểm tra theo ma trận tùy chỉnh và xuất bản đề thi ra file Word (.docx) hoặc PDF.

## 🛠️ Công Nghệ Sử Dụng

### Backend:
* **FastAPI**: Web framework tốc độ cao, hỗ trợ tài liệu OpenAPI (Swagger) tự động.
* **MongoDB Atlas + Motor**: Cơ sở dữ liệu NoSQL lưu trữ thông tin người dùng, lịch sử chat và metadata tài liệu.
* **Google GenAI SDK (Gemini API)**:
  * Model `gemini-2.5-flash`: Đọc hiểu tài liệu, hỏi đáp thông minh và sinh câu hỏi trắc nghiệm/tự luận ngắn.
  * Model `text-embedding-004`: Sinh vector nhúng 768 chiều cho các đoạn tài liệu phục vụ RAG.
* **Cloudinary**: Lưu trữ đám mây các file tài liệu tải lên.
* **NumPy**: Tính toán độ tương đồng Cosine vector cho chức năng tìm kiếm ngữ cảnh.
* **PyMuPDF / python-docx / python-pptx**: Bộ ba thư viện phân tích cú pháp tệp tin mạnh mẽ.
* **ReportLab**: Sinh và định dạng xuất đề thi ra file PDF.

### Frontend:
* **ReactJS (Vite)**: Thư viện giao diện người dùng SPA hiện đại, xây dựng bằng **TypeScript**.
* **React Router Dom (v7)**: Quản lý định tuyến trang (Login, Register, Dashboard, Documents, Questions, Chat).
* **Axios**: Kết nối HTTP Client tự động đính kèm JWT Token qua Request Interceptor.
* **Vanilla CSS**: Hệ thống thiết kế tùy chỉnh mượt mà, hỗ trợ giao diện tối màu (Dark Mode).

---

## 🔑 Thiết Lập Biến Môi Trường (.env)

### 1. Backend: tạo tệp `backend/.env`
```env
PROJECT_NAME=FastAPI Backend
API_V1_STR=/api/v1
BACKEND_CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]

# MongoDB
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/dbname
MONGODB_DB_NAME=chuyende02

# JWT
JWT_SECRET_KEY=long_random_secure_key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

### 2. Frontend: tạo tệp `frontend/.env`
```env
VITE_API_BASE_URL=http://localhost:8000
```

---

## 🚀 Hướng Dẫn Chạy Local

### Bước 1: Khởi động Backend
1. Mở Terminal và truy cập thư mục `backend`:
   ```bash
   cd backend
   ```
2. Kích hoạt môi trường ảo Python:
   ```bash
   source .venv/bin/activate
   ```
3. Chạy server uvicorn:
   ```bash
   python3 -m uvicorn app.main:app --reload --port 8000
   ```
4. Truy cập tài liệu API Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)

### Bước 2: Khởi động Frontend
1. Mở một cửa sổ Terminal mới và truy cập thư mục `frontend`:
   ```bash
   cd frontend
   ```
2. Chạy môi trường phát triển:
   ```bash
   npm run dev
   ```
3. Truy cập giao diện trên trình duyệt tại: [http://localhost:5173/](http://localhost:5173/)

---

## 🧭 Luồng Demo Hệ Thống (Thuyết trình bảo vệ)

1. **Đăng Ký & Đăng Nhập**:
   * Truy cập `/register` để tạo tài khoản mới.
   * Truy cập `/login` để đăng nhập. Sau khi thành công, token lưu vào `localStorage` và chuyển tiếp đến `/dashboard`.
2. **Tải lên tài liệu**:
   * Vào mục **Quản lý học liệu** (`/documents`), tải lên file tài liệu học tập của bạn (`PDF`, `DOCX`, hoặc `PPTX`).
   * Hệ thống sẽ tự động tải file lên Cloudinary và trích xuất toàn bộ text thô (status: `processed`).
3. **Lập chỉ mục RAG (Indexing)**:
   * Bấm chọn tài liệu vừa tải lên để xem chi tiết.
   * Bấm nút **⚡ Lập Chỉ Mục Vector** để chia nhỏ văn bản và tạo cơ sở dữ liệu vector qua Gemini Embedding.
4. **Hỏi Đáp Tài Liệu & Tìm Kiếm Semantic**:
   * Sử dụng khung chat AI bên phải màn hình để đặt câu hỏi trực tiếp về tài liệu. Trợ lý AI sẽ chỉ trả lời dựa trên nội dung tệp và hiển thị chính xác các nguồn đoạn văn đã tham chiếu.
   * Sử dụng ô **Thử nghiệm Truy vấn** bên trái để kiểm tra khoảng cách vector tương đồng.
5. **Sinh Câu Hỏi Tự Động**:
   * Bấm nút **Sinh Câu Hỏi** tại trang chi tiết.
   * Cấu hình số lượng câu hỏi, cấp độ khó, và dạng đề thi mong muốn (trắc nghiệm 4 đáp án, Đúng/Sai, hay tự luận điền từ).
   * AI sẽ tự sinh đề thi chi tiết kèm đáp án đúng và lời giải thích khoa học.
6. **Tải Xuất Đề Thi**:
   * Bấm tải đề thi trực tiếp dưới dạng tệp **Microsoft Word (.docx)** hoặc tệp **Adobe PDF (.pdf)** có căn lề chuẩn hóa.
