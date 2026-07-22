# HỆ THỐNG SINH CÂU HỎI ĐÁNH GIÁ NĂNG LỰC TỰ ĐỘNG TỪ HỌC LIỆU ĐIỆN TỬ BẰNG MÔ HÌNH NGÔN NGỮ LỚN (LLM)

Đề tài tốt nghiệp xây dựng giải pháp số hóa giáo dục thông minh. Hệ thống tự động phân tích học liệu điện tử (Tài liệu văn bản: PDF, DOCX, PPTX và Video bài giảng), trích xuất thông tin, lập chỉ mục vector (RAG), hỗ trợ hỏi đáp trực tuyến và tự động sinh đề kiểm tra đánh giá năng lực người học qua mô hình ngôn ngữ lớn Google Gemini.

---

## 🛠️ Công Nghệ Sử Dụng

### Backend (FastAPI):
* **FastAPI**: Web framework bất đồng bộ (async) hiệu năng cao, tự động sinh tài liệu Swagger UI.
* **MongoDB Atlas + Motor**: Cơ sở dữ liệu NoSQL lưu trữ thông tin người dùng, metadata học liệu, lịch sử chat và bộ câu hỏi.
* **Google GenAI SDK (Gemini API)**:
  * Model `gemini-2.5-flash`: Đọc hiểu tài liệu, phân tích video và sinh câu hỏi đánh giá kèm giải thích chi tiết.
  * Model `gemini-embedding-001`: Sinh vector nhúng 3072 chiều phục vụ tìm kiếm ngữ cảnh nâng cao.
* **Cloudinary**: Lưu trữ đám mây các file tài liệu và video được tải lên từ người dùng.
* **NumPy**: Tính toán độ tương đồng Cosine vector trực tiếp phục vụ tìm kiếm ngữ nghĩa (RAG) không phụ thuộc máy chủ ChromaDB ngoài.
* **PyMuPDF / python-docx / python-pptx**: Phân tích nội dung văn bản gốc từ file PDF, DOCX, PPTX.
* **ReportLab / python-docx**: Xuất bản bộ câu hỏi thành file PDF và Microsoft Word (.docx) chuyên nghiệp.

### Frontend (React Vite TypeScript):
* **ReactJS**: Thư viện SPA hiện đại xây dựng bằng **TypeScript**.
* **React Router Dom (v7)**: Quản lý định tuyến trang (Login, Register, Dashboard, Documents, Questions, Chat).
* **Axios**: Kết nối HTTP Client tự động đính kèm JWT Token qua Request Interceptor.
* **Vanilla CSS**: Hệ thống CSS tùy chỉnh giao diện tối màu (Dark Mode) mượt mà, trực quan với thiết kế Glassmorphic cao cấp.

---

## 📂 Cấu Trúc Thư Mục Dự Án

```text
chuyende02/
├── backend/                  # Mã nguồn dịch vụ Backend
│   ├── app/
│   │   ├── core/             # Cấu hình dự án & bảo mật
│   │   ├── database/         # Kết nối cơ sở dữ liệu MongoDB
│   │   ├── models/           # Các đối tượng dữ liệu (MongoDB schemas)
│   │   ├── routers/          # Các luồng API endpoints (auth, documents, questions, chat)
│   │   ├── schemas/          # Pydantic validation schemas
│   │   ├── services/         # Logic chính (llm, document_parser, rag, question_generation)
│   │   └── main.py           # File khởi chạy ứng dụng FastAPI
│   ├── uploads/              # Thư mục lưu tạm tài liệu
│   ├── .env.example          # Tệp mẫu cấu hình biến môi trường
│   ├── requirements.txt      # Danh sách thư viện Python phụ thuộc
│   └── run.sh                # Script khởi chạy nhanh backend
├── frontend/                 # Mã nguồn giao diện Frontend
│   ├── src/
│   │   ├── api/              # Axios client và các hàm gọi API
│   │   ├── components/       # Các components giao diện dùng chung (QuestionCard, FileUpload)
│   │   ├── pages/            # Các trang chính (Dashboard, Documents, DocumentDetail, QuestionGenerate)
│   │   ├── App.tsx           # Quản lý định tuyến và giao diện chính
│   │   ├── index.css         # Hệ thống style CSS tùy chỉnh toàn trang
│   │   └── main.tsx          # Điểm khởi đầu React client
│   ├── .env.example          # Tệp mẫu cấu hình frontend
│   ├── package.json          # Quản lý thư viện phụ thuộc npm
│   └── vite.config.ts        # Cấu hình Vite bundler
├── README.md                 # Tài liệu hướng dẫn này
└── .gitignore                # Quản lý loại trừ git
```

---

## 🔑 Cấu Hình Biến Môi Trường (.env)

### 1. Cấu hình Backend: Tạo tệp `backend/.env`
```env
PROJECT_NAME="FastAPI Learning Assessment System"
API_V1_STR="/api/v1"
BACKEND_CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]

# MongoDB Atlas (Thay bằng URI của bạn)
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/dbname"
MONGODB_DB_NAME="learning_assessment"

# JWT Auth
JWT_SECRET_KEY="khoa_bi_mat_an_toan_dai_tren_32_ky_tu"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Cloudinary Storage
CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
CLOUDINARY_API_KEY="your_cloudinary_api_key"
CLOUDINARY_API_SECRET="your_cloudinary_api_secret"

# Google Gemini API
GEMINI_API_KEY="your_gemini_api_key"
GEMINI_MODEL="gemini-2.5-flash"
```

### 2. Cấu hình Frontend: Tạo tệp `frontend/.env`
```env
VITE_API_BASE_URL="http://localhost:8000"
```

---

## 🚀 Hướng Dẫn Chạy Local

### Bước 1: Khởi động Backend
1. Di chuyển vào thư mục `backend`:
   ```bash
   cd backend
   ```
2. Tạo và kích hoạt môi trường ảo Python:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Cài đặt các thư viện cần thiết:
   ```bash
   pip install -r requirements.txt
   ```
4. Khởi chạy Server Uvicorn:
   ```bash
   python3 -m uvicorn app.main:app --reload --port 8000
   ```
5. Kiểm tra tài liệu API: [http://localhost:8000/docs](http://localhost:8000/docs)

### Bước 2: Khởi động Frontend
1. Mở terminal mới và chuyển đến thư mục `frontend`:
   ```bash
   cd frontend
   ```
2. Cài đặt các dependencies:
   ```bash
   npm install
   ```
3. Khởi chạy React App:
   ```bash
   npm run dev
   ```
4. Truy cập giao diện người dùng tại: [http://localhost:5173/](http://localhost:5173/)

---

## 🧪 Hướng Dẫn Kiểm Thử API

Hệ thống hỗ trợ kiểm thử API tự động hoặc thủ công rất dễ dàng:

### 1. Kiểm thử thủ công qua Swagger UI
Truy cập [http://localhost:8000/docs](http://localhost:8000/docs) sau khi khởi động Backend. Nhấp vào nút **Authorize** ở góc phải trên cùng và đăng nhập bằng thông tin tài khoản của bạn để tự động đính kèm Token JWT vào các yêu cầu kiểm thử tiếp theo.

### 2. Kiểm thử bằng lệnh `curl`
* **Đăng nhập lấy Token**:
  ```bash
  curl -X POST http://localhost:8000/api/v1/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"test@test.com","password":"123456"}'
  ```
* **Lấy thông tin tài khoản hiện tại**:
  ```bash
  curl http://localhost:8000/api/v1/auth/me \
       -H "Authorization: Bearer <ACCESS_TOKEN>"
  ```
* **Tải lên học liệu**:
  ```bash
  curl -X POST http://localhost:8000/api/v1/documents/upload \
       -H "Authorization: Bearer <ACCESS_TOKEN>" \
       -F "file=@/path/to/your/document.pdf"
  ```
* **Tìm kiếm ngữ nghĩa (RAG Vector Search)**:
  ```bash
  curl -X POST http://localhost:8000/api/v1/documents/<DOCUMENT_ID>/search \
       -H "Authorization: Bearer <ACCESS_TOKEN>" \
       -H "Content-Type: application/json" \
       -d '{"query":"quang hợp","n_results":3}'
  ```

---

## 🧭 Kịch Bản Luồng Demo Tốt Nghiệp

Hệ thống đã hoàn thiện luồng xử lý tự động hóa đầu cuối (end-to-end), các bước demo diễn ra như sau:

1. **Đăng Ký & Đăng Nhập (Auth)**:
   * Truy cập `/register` đăng ký tài khoản (hệ thống mã hóa mật khẩu bằng mật mã bcrypt và tạo tài khoản trên MongoDB Atlas).
   * Đăng nhập tại `/login` để nhận JWT Token (tự động đính kèm vào header qua Axios interceptors).
2. **Quản Lý Học Liệu (Documents)**:
   * Truy cập `/documents`, nhấn chọn tải lên học liệu PDF, Word (`.docx`), Slide (`.pptx`), hoặc Video bài giảng (`.mp4`, `.mov`, `.webm`).
   * Tệp tin tự động lưu trữ trên Cloudinary và tạo bản ghi metadata tương ứng trên database.
3. **Trích Xuất Nội Dung (Extract / Transcribe)**:
   * **Với Văn Bản**: Hệ thống tự động parse text thô lưu vào MongoDB (Trạng thái chuyển từ `uploaded` sang `processed`).
   * **Với Video**: Tại màn hình chi tiết học liệu, nhấn **"Trích xuất Transcript Video"** để gửi video trực tiếp sang Gemini API, sinh file hội thoại tiếng Việt chuẩn xác (Trạng thái chuyển sang `transcribed`).
4. **Lập Chỉ Mục Vector RAG (Indexing)**:
   * Nhấn **"Lập Chỉ Mục Vector"**, hệ thống cắt nhỏ văn bản thành các chunks có độ dài tối ưu, tạo vector embedding 3072 chiều bằng `gemini-embedding-001` và lưu trữ vào DB. (Trạng thái chuyển sang `indexed`).
   * Bạn có thể thử nghiệm nhập từ khóa tại ô **"Truy Vấn Thử Nghiệm"** để kiểm tra độ chính xác tìm kiếm ngữ nghĩa bằng NumPy cosine similarity.
5. **Hỏi Đáp Tương Tác Học Liệu (RAG Q&A)**:
   * Người học trao đổi trực tiếp với tài liệu hoặc video thông qua chatbox AI. Hệ thống sử dụng vector search để lấy ra những đoạn học liệu liên quan nhất làm ngữ cảnh đưa vào LLM để sinh câu trả lời, đảm bảo tính trung thực thông tin.
6. **Tự Động Sinh Câu Hỏi Đánh Giá**:
   * Nhấn **"Sinh Đề Kiểm Tra"**, lựa chọn cấu hình: Số lượng câu hỏi (ví dụ: 10 câu), cấp độ khó, và dạng câu hỏi (Trắc nghiệm, Đúng/Sai, Tự luận ngắn).
   * Gemini phân tích ngữ cảnh học liệu để sinh đề kiểm tra chuẩn hóa JSON.
7. **Luyện Tập & Đánh Giá Tương Tác**:
   * Người học làm bài trực tiếp trên giao diện:
     * Đáp án ban đầu được ẩn hoàn toàn để tạo điều kiện tự đánh giá.
     * Khi người học chọn đáp án: Nếu **đúng** sẽ đổi thành **màu xanh lá**, nếu **sai** sẽ đổi thành **màu đỏ** và hiển thị rõ ràng đáp án đúng cùng lời giải thích khoa học của AI.
8. **Tải Xuất Đề Thi (Export)**:
   * Xuất đề thi trực tiếp ra file **Word (.docx)** và **PDF (.pdf)** chất lượng cao để in ấn hoặc sử dụng ngoại tuyến.

---

## 📈 Tình Trạng Dự Án

### Các Chức Năng Đã Hoàn Thành:
* Tích hợp thành công pipeline trích xuất văn bản tự động từ PDF, DOCX, PPTX.
* Phát triển pipeline trích xuất transcript video tiếng Việt trực tiếp sử dụng Gemini API.
* Xây dựng bộ tìm kiếm ngữ nghĩa RAG tùy biến và lưu trữ vector trực tiếp vào MongoDB Atlas.
* Nâng cấp mô hình embedding sang dòng model mới nhất `gemini-embedding-001` (3072 chiều) thay cho model `text-embedding-004` đã bị đóng bởi Google.
* Sửa lỗi giao diện tương tác quiz giúp ẩn đáp án ban đầu và cung cấp phản hồi trực quan (Xanh/Đỏ) cùng giải thích chi tiết khi chọn.
* Hoàn thiện API và giao diện hỏi đáp học liệu, xuất bản đề thi ra file PDF và DOCX.

### Hạn Chế Hiện Tại:
* Việc xử lý video dài qua API có thể tốn nhiều thời gian hơn do giới hạn băng thông kết nối Cloudinary và Gemini.
* Chưa hỗ trợ xử lý hình ảnh phức tạp bên trong file PDF/PPTX thông qua OCR đa phương tiện.

### Hướng Phát Triển Tiếp Theo:
* Bổ sung tính năng OCR bằng Gemini Multimodal để đọc được cả sơ đồ, công thức toán học và hình ảnh trong học liệu văn bản.
* Hỗ trợ chia sẻ bộ câu hỏi giữa các tài khoản người dùng khác nhau trong cùng hệ thống.
* Bổ sung biểu đồ thống kê kết quả làm bài của học sinh để giáo viên dễ theo dõi tiến độ năng lực.

---

## 💾 Hướng Dẫn Sao Lưu (Backup) & Khôi Phục (Restore)

### 1. Sao lưu CSDL MongoDB
Sử dụng công cụ `mongodump` để sao lưu dữ liệu sang thư mục cục bộ:
```bash
mongodump --uri="MONGODB_URI_CUA_BAN" --out=./backup/mongodb/
```

### 2. Sao lưu Học Liệu (Tệp tải lên cục bộ)
Sao lưu thư mục chứa tài liệu/video tạm thời:
```bash
tar -czvf ./backup/uploads_backup.tar.gz ./backend/uploads/
```

### 3. Sao lưu Vector Storage (ChromaDB)
Nếu ChromaDB chạy cục bộ (nhập dữ liệu trực tiếp trong `CHROMA_PERSIST_DIR`):
```bash
tar -czvf ./backup/chroma_db_backup.tar.gz ./backend/chroma_db/
```

### 4. Khôi phục Dữ liệu (Restore)
* **Khôi phục MongoDB**:
  ```bash
  mongorestore --uri="MONGODB_URI_CUA_BAN" ./backup/mongodb/
  ```
* **Khôi phục File Uploads**:
  ```bash
  tar -xzvf ./backup/uploads_backup.tar.gz -C .
  ```
* **Khôi phục ChromaDB**:
  ```bash
  tar -xzvf ./backup/chroma_db_backup.tar.gz -C .
  ```
  *(Lưu ý: Nếu dữ liệu vector bị thiếu hoặc không đồng bộ với MongoDB sau khi restore, hãy chạy lại chức năng Lập Chỉ Mục Vector trên giao diện để re-index).*

---

## 🔄 Kế Hoạch Quay Lui (Rollback Plan)

Khi triển khai phiên bản mới gặp sự cố nghiêm trọng (lỗi crash server, rò rỉ bộ nhớ, lỗi logic nghiệp vụ):

1. **Xác định commit ổn định**: Xem nhật ký git để tìm commit hoạt động gần nhất:
   ```bash
   git log --oneline -n 10
   ```
2. **Thực hiện quay lui code**:
   ```bash
   git reset --hard <COMMIT_HASH_ON_DINH>
   ```
3. **Kiểm tra môi trường và cài đặt lại thư viện**:
   ```bash
   ./scripts/check_environment.sh
   cd backend && pip install -r requirements.txt
   cd ../frontend && npm install
   ```
4. **Khôi phục dữ liệu**: Nếu cơ sở dữ liệu bị hỏng trong phiên bản lỗi, hãy chạy lệnh restore MongoDB từ bản sao lưu gần nhất.
5. **Chạy lại toàn bộ kiểm thử**:
   ```bash
   ./scripts/run_all_tests.sh
   ```
6. **Khởi động lại các dịch vụ**:
   ```bash
   ./scripts/start_backend.sh
   ./scripts/start_frontend.sh
   ```

