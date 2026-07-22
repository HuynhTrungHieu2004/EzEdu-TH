# HƯỚNG DẪN DEMO & VẬN HÀNH HỆ THỐNG Q&A NÂNG CAO

Tài liệu này cung cấp hướng dẫn từng bước để chuẩn bị, kiểm tra và thực hiện demo hệ thống hỏi đáp AI nâng cao với học liệu và tìm kiếm Internet.

---

## I. CHUẨN BỊ TRƯỚC DEMO

### 1. Kiểm tra môi trường & Kết nối
Chạy script kiểm tra môi trường:
```bash
./scripts/check_environment.sh
```
Yêu cầu đầu ra báo tất cả trạng thái `✅` và kết thúc với dòng chữ `Môi trường cơ bản đã sẵn sàng!`.

### 2. Thiết lập Biến môi trường
Đảm bảo tệp `backend/.env` đã có đầy đủ cấu hình. Xem ví dụ mẫu tại [backend/.env.example](file:///Users/macos/Documents/Zalo%20Received%20Files/chuyende-thunghiem-1/backend/.env.example).
* Thiết lập `APP_ENV=development`
* Cấu hình `GEMINI_API_KEY` (và `GROQ_API_KEY` nếu muốn thử nghiệm thêm).

### 3. Chuẩn bị dữ liệu Demo
Để tạo sẵn tài khoản và tài liệu mẫu giúp tiết kiệm thời gian trong buổi trình bày, chạy lệnh sau:
```bash
source backend/.venv/bin/activate
python backend/scripts/prepare_demo_data.py
```
*Script này sẽ tạo một tài khoản demo: `demo@example.com` / `demopassword123` và tải lên 2 tài liệu mẫu: 1 chứa dữ kiện đúng về Địa lý Việt Nam, 1 chứa dữ kiện sai về Lịch sử thế giới.*

---

## II. QUY TRÌNH CHẠY DEMO CHI TIẾT

### Bước 1: Khởi động Dịch vụ
1. Mở terminal 1, khởi động Backend:
   ```bash
   ./scripts/start_backend.sh
   ```
2. Mở terminal 2, khởi động Frontend:
   ```bash
   ./scripts/start_frontend.sh
   ```

### Bước 2: Kiểm tra Sức khỏe Hệ thống (Health & Readiness Check)
Gọi endpoint kiểm tra trạng thái để chứng minh các kết nối MongoDB, ChromaDB và AI Provider đang hoạt động tốt:
* **Liveness check**: Mở trình duyệt truy cập `http://localhost:8000/health`. Kỳ vọng trả về:
  ```json
  {"status": "ok"}
  ```
* **Readiness check**: Truy cập `http://localhost:8000/health/ready`. Kỳ vọng trả về trạng thái của các dịch vụ:
  ```json
  {
    "status": "healthy",
    "services": {
      "mongodb": "healthy",
      "chromadb": "healthy",
      "mongodb_indexes": "healthy",
      "gemini": "healthy",
      "groq": "healthy"
    }
  }
  ```

### Bước 3: Đăng nhập Hệ thống
1. Truy cập giao diện ứng dụng tại `http://localhost:5173/login`.
2. Sử dụng thông tin tài khoản demo đã chuẩn bị:
   * **Email**: `demo@example.com`
   * **Password**: `demopassword123`
3. Nhấp **Đăng nhập** để vào Dashboard.

### Bước 4: Kiểm tra và Duyệt danh sách Học liệu
1. Đi tới trang **Tài liệu học tập**.
2. Kiểm tra trạng thái 2 tài liệu mẫu:
   - *Địa lý Việt Nam - Sự thật địa lý chính xác* (Trạng thái: **indexed**)
   - *Lịch sử thế giới - Dữ kiện cần kiểm chứng* (Trạng thái: **indexed**)
3. Nếu muốn demo upload: Chọn một file `.docx` hoặc `.pdf` nhỏ từ máy, tải lên và đợi trạng thái chuyển sang **indexed**.

### Bước 5: Hỏi đáp AI Nâng cao (Advanced Q&A)
Nhấp chọn mục **"Hỏi đáp AI"** trên menu sidebar.

1. **Hỏi đáp trong phạm vi Một Tài liệu**:
   * Ở panel cấu hình bên trái:
     * Chọn **Phạm vi nguồn**: "Một tài liệu"
     * Chọn tài liệu: "Địa lý Việt Nam - Sự thật địa lý chính xác"
     * Tắt **Tìm kiếm Internet (Google Search Grounding)**.
     * Nhấp chọn kiểu câu trả lời: **Ngắn gọn** hoặc **Đầy đủ**.
   * Nhập câu hỏi vào khung chat: *"Đỉnh núi cao nhất Đông Dương cao bao nhiêu mét?"*
   * Gửi và kiểm chứng: AI chỉ dùng RAG để lấy ngữ cảnh từ tài liệu vừa chọn và trả lời. Nhãn nguồn `[DOC_1]` sẽ xuất hiện trong câu trả lời.

2. **Kiểm chứng tính năng Citation & Source Panel**:
   * Nhấp trực tiếp vào nhãn `[DOC_1]` ở cuối câu trả lời AI vừa sinh ra.
   * Kỳ vọng: Panel trích dẫn bên phải tự động mở rộng và cuộn/highlight phần trích văn bản thô từ tài liệu gốc.

3. **Hỏi đáp kết hợp Internet Search (Hybrid Mode)**:
   * Chuyển cấu hình **Phạm vi nguồn** sang "Toàn bộ học liệu".
   * Bật tùy chọn **Tìm kiếm Internet (Google Search Grounding)**.
   * Nhập câu hỏi mang tính thời sự hoặc cần cập nhật: *"Ai là thủ tướng hiện tại của nước Anh và thủ đô của Việt Nam là gì?"*
   * Kỳ vọng trả về: AI kết hợp ngữ cảnh tài liệu nội bộ `[DOC_x]` về thủ đô Việt Nam và Grounding Search trực tiếp từ Google để trả lời về thủ tướng Anh kèm thẻ nguồn `[WEB_x]`. Click vào thẻ WEB để mở link nguồn trên tab mới.

4. **Kiểm tra cơ chế chặn Citation ảo**:
   * Trả lời có chứa các liên kết giả hoặc thẻ nguồn không tồn tại trong metadata thực tế trả về từ backend sẽ được hiển thị dưới dạng text thuần, không biến thành hyperlink có thể bấm được.

5. **Độ tin cậy & Trạng thái Bằng chứng**:
   * Quan sát thanh thông số ở đầu tin nhắn AI:
     * **Độ tin cậy**: Ví dụ `95%`
     * **Trạng thái bằng chứng**: `Có nguồn hỗ trợ tốt` hoặc `Được hỗ trợ một phần` tương ứng với phân tích của hệ thống.

6. **Tự động lưu lịch sử & Refresh**:
   * Nhấp chọn biểu tượng tạo chat mới.
   * Kiểm tra danh sách cuộc trò chuyện cũ ở cột trái. Nhấp lại cuộc trò chuyện cũ để xem toàn bộ lịch sử tin nhắn được khôi phục nguyên vẹn.

---

## III. PHƯƠNG ÁN DỰ PHÒNG KHI CÓ SỰ CỐ

1. **Sự cố cạn kiệt Quota API (429 Resource Exhausted)**:
   * Hệ thống sẽ hiển thị thông báo lỗi thân thiện trên khung chat: *"Tần suất yêu cầu quá giới hạn (Rate limit). Vui lòng đợi và thử lại sau."*
   * **Phương án**: Đổi API key trong tệp `backend/.env` hoặc chuyển sang tài khoản Gemini khác để demo tiếp tục.
2. **Không có kết nối Internet**:
   * Khi không có Internet, tính năng Google Search Grounding và Gemini API thật sẽ thất bại.
   * **Phương án**: Q&A trong tài liệu nội bộ vẫn có thể hoạt động nếu ChromaDB lưu trữ cục bộ, hoặc sử dụng dữ liệu offline được chuẩn bị trong môi trường mock cục bộ của hệ thống.
