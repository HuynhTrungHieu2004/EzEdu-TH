# HƯỚNG DẪN KỊCH BẢN DEMO BẢO VỆ TỐT NGHIỆP

Tài liệu này cung cấp kịch bản từng bước để bạn thực hiện buổi demo ứng dụng một cách trôi chảy và ấn tượng nhất trước Hội đồng chấm tốt nghiệp.

---

## Preparation (Chuẩn bị trước demo)
1. **Khởi động ứng dụng**:
   - Backend chạy tại [http://localhost:8000](http://localhost:8000) (kiểm tra `status: "healthy"`).
   - Frontend chạy tại [http://localhost:5173](http://localhost:5173).
2. **Chuẩn bị học liệu mẫu**:
   - File tài liệu văn bản: Chuẩn bị sẵn 1 file PDF hoặc DOCX ngắn gọn, súc tích (ví dụ về chủ đề "Quang hợp ở thực vật" hoặc "Lập trình hướng đối tượng").
   - File video bài giảng: Chuẩn bị 1 file video ngắn khoảng 1-2 phút (dung lượng dưới 50MB, định dạng `.mp4`) để demo tính năng Speech-to-Text trích xuất transcript.

---

## 🧭 Kịch Bản 8 Bước Demo Chi Tiết

### Bước 1: Đăng ký tài khoản mới (`/register`)
- **Hành động**: Truy cập ứng dụng tại trang chủ, bấm **Đăng ký**, điền các thông tin: Email mới, Họ và tên và Mật khẩu. Bấm Đăng ký.
- **Thuyết trình**: *"Hệ thống sử dụng cơ chế bảo mật JWT. Khi đăng ký, mật khẩu của người dùng được băm bảo mật bằng thuật toán bcrypt trước khi lưu trữ vào cơ sở dữ liệu MongoDB Atlas để đảm bảo an toàn thông tin."*

### Bước 2: Đăng nhập hệ thống (`/login`)
- **Hành động**: Điền email và mật khẩu vừa tạo, bấm **Đăng nhập**. Hệ thống chuyển hướng vào **Dashboard** chính.
- **Thuyết trình**: *"Sau khi đăng nhập thành công, máy chủ cấp phát một mã JWT Token có thời hạn sử dụng. Token này được lưu trữ an toàn ở LocalStorage và tự động đính kèm vào phần Header của mọi yêu cầu gửi lên API thông qua Axios Request Interceptors."*

### Bước 3: Tải lên học liệu (`/documents`)
- **Hành động**:
  - Chuyển sang tab **Học liệu**. Nhấn **Tải học liệu lên**.
  - Chọn tệp tài liệu mẫu (PDF/DOCX) kéo thả vào.
  - Tải lên thành công, hệ thống hiển thị tệp tin trong danh sách học liệu với trạng thái ban đầu.
- **Thuyết trình**: *"Học liệu tải lên sẽ được chuyển trực tiếp lên dịch vụ lưu trữ đám mây Cloudinary, đồng thời lưu trữ các thông tin mô tả (metadata) vào MongoDB để quản lý tập trung."*

### Bước 4: Trích xuất nội dung (Extract / Transcribe)
- **Hành động**: 
  - Nhấp chọn tài liệu vừa tải lên để vào trang chi tiết.
  - Bấm **Trích xuất nội dung** (đối với văn bản) hoặc **Trích xuất transcript video** (đối với video).
  - Trạng thái học liệu chuyển sang `processed` hoặc `transcribed`. Bạn sẽ thấy văn bản thô trích xuất hiển thị ở khung Preview.
- **Thuyết trình**: *"Đối với văn bản, hệ thống sử dụng các parser chuyên dụng (PyMuPDF cho PDF, python-docx cho Word) để bóc tách văn bản thô. Đối với video bài giảng, hệ thống gửi tệp tin sang API Gemini để chuyển giọng nói trong video thành văn bản (Speech-to-Text) tiếng Việt chuẩn xác mà không cần qua mô hình dịch bên thứ ba."*

### Bước 5: Lập chỉ mục Vector RAG (Indexing)
- **Hành động**:
  - Tại trang chi tiết học liệu, bấm **⚡ Lập Chỉ Mục Vector**.
  - Trạng thái chuyển sang `indexed`.
  - Thử nghiệm tìm kiếm: Nhập một từ khóa bất kỳ (ví dụ: "quang hợp") vào ô **Thử nghiệm Truy vấn** và nhấn Tìm kiếm. Giao diện sẽ hiển thị các đoạn văn có điểm tương đồng cao nhất.
- **Thuyết trình**: *"Sau khi trích xuất văn bản thô, hệ thống chia nhỏ văn bản thành các đoạn (chunks) có kích thước tối ưu. Các đoạn này được đưa qua mô hình `gemini-embedding-001` để tạo vector 3072 chiều và lưu trực tiếp vào database. Quá trình tìm kiếm ngữ nghĩa sau đó được tính toán khoảng cách cosine nhanh chóng bằng thư viện NumPy."*

### Bước 6: Hỏi đáp tương tác học liệu (RAG Chat)
- **Hành động**:
  - Tại khung Chat AI bên phải, nhập câu hỏi liên quan đến nội dung tài liệu (ví dụ: *"Quang hợp xảy ra chủ yếu ở bộ phận nào?"*). Nhấn Gửi.
  - Trợ lý AI phản hồi câu trả lời chính xác, kèm theo danh sách các nguồn đoạn văn được trích dẫn bên dưới.
- **Thuyết trình**: *"Hệ thống áp dụng kiến trúc RAG (Retrieval-Augmented Generation). Khi người dùng hỏi, hệ thống tìm kiếm các đoạn văn bản có sự liên quan cao nhất trong cơ sở dữ liệu để đưa làm ngữ cảnh đầu vào cho Gemini API. Điều này giúp LLM trả lời chính xác, trung thực, tránh hiện tượng ảo tưởng thông tin."*

### Bước 7: Tự động sinh câu hỏi đánh giá
- **Hành động**:
  - Nhấn nút **Sinh Đề Kiểm Tra** ở thanh điều hướng bên trái hoặc đầu trang.
  - Chọn cấu hình: Số lượng câu hỏi (10 câu), cấp độ khó (Trung bình), và loại câu hỏi (Trắc nghiệm). Nhấn **Bắt đầu sinh**.
  - Đợi vài giây, bộ câu hỏi sinh ra sẽ hiển thị trên màn hình.
  - Thực hiện làm thử:
    - Bấm chọn thử một đáp án đúng -> Nhãn chuyển màu xanh lá và hiển thị giải thích chi tiết.
    - Bấm chọn thử một đáp án sai -> Nhãn lựa chọn chuyển màu đỏ, đồng thời hiển thị đáp án đúng màu xanh và phần lý giải chi tiết của AI.
- **Thuyết trình**: *"Gemini phân tích cấu trúc tài liệu để sinh đề kiểm tra chuẩn hóa JSON. Các câu hỏi, đáp án lựa chọn và lời giải thích khoa học được render động. Ban đầu các đáp án được ẩn hoàn toàn để tạo tính khách quan, chỉ khi học viên click chọn mới đưa ra phản hồi đúng/sai trực quan để giúp củng cố kiến thức."*

### Bước 8: Tải đề thi ngoại tuyến (Export)
- **Hành động**: Nhấn nút **Tải file Word (.docx)** và **Tải file PDF (.pdf)** ở góc trên trang bộ câu hỏi. Mở file lên để hội đồng thấy định dạng bố cục đề kiểm tra rõ ràng, sạch đẹp.
- **Thuyết trình**: *"Để hỗ trợ giáo viên và học sinh ôn tập ngoại tuyến, hệ thống cung cấp tính năng xuất đề kiểm tra ra tệp Word (.docx) và PDF (.pdf) chuẩn hóa, có sẵn tiêu đề đề thi và phân loại câu hỏi rõ ràng."*
