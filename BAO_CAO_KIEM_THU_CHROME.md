# Báo cáo kiểm thử website trên Google Chrome

**Ngày kiểm thử:** 28/07/2026  
**Môi trường:** macOS, Google Chrome (Playwright Chromium), frontend Vite tại `http://localhost:5173`, backend FastAPI tại `http://127.0.0.1:8000`, CSDL MongoDB local.

---

## 1. Kết luận chung

Hệ thống đã được kiểm thử toàn diện thông qua hai phương pháp:
1. **Kiểm thử tự động (Automated Test Suites):** Chạy thành công toàn bộ bộ test tĩnh và động (253 test backend, 10 nhóm test frontend, và kiểm tra ESLint).
2. **Kiểm thử E2E trên trình duyệt Chrome (Chrome E2E Browser Testing):** Đi qua luồng nghiệp vụ chính của Giảng viên bao gồm: Đăng nhập -> Kiểm tra Dashboard -> Xem Danh sách học liệu -> Kiểm tra trang đối chiếu/phát hiện sai sót kiến thức -> Hỏi đáp AI (RAG) nâng cao.

**Trạng thái sẵn sàng:** **SẴN SÀNG DEMO BẢO VỆ**. Các lỗi chặn (blocker) liên quan đến tiến trình AI (như lỗi kết nối cổng uvicorn 8000 bị chiếm dụng) đã được khắc phục hoàn toàn.

---

## 2. Kết quả kiểm thử chi tiết

| Thành phần / Chức năng | Trạng thái | Ghi chú & Kết quả chi tiết |
| :--- | :---: | :--- |
| **Unit Test Backend (FastAPI)** | ✅ ĐẠT | **253/253 tests** vượt qua thành công (bao gồm RBAC, personalization, học liệu, RAG pipeline, và các module đánh giá năng lực BKT/IRT). |
| **Assertion Test Frontend** | ✅ ĐẠT | **10/10 nhóm tests** vượt qua thành công (xác thực UI helpers, xử lý mã lỗi API, feedback, và hội thoại). |
| **Frontend ESLint Checks** | ✅ ĐẠT | Không phát hiện lỗi cú pháp hoặc cảnh báo linter nào. |
| **Trang chủ & Đăng nhập (Auth)** | ✅ ĐẠT | Giao diện đăng nhập Glassmorphism hiển thị chuẩn xác. Xác thực JWT hoạt động tốt, chuyển hướng sang `/dashboard`. |
| **Bảng điều khiển (Dashboard)** | ✅ ĐẠT | Hiển thị đúng thông tin chào mừng giảng viên ("Chào mừng trở lại, Học Viên Demo"), thống kê số lượng học liệu và các shortcut thao tác nhanh. |
| **Quản lý học liệu (Documents)** | ✅ ĐẠT | Trang danh sách học liệu tải nhanh, hiển thị đúng trạng thái của các tài liệu đã index ("Địa lý Việt Nam - Sự thật địa lý chính xác", "Lịch sử thế giới"). |
| **Đối chiếu & Phát hiện sai sót** | ✅ ĐẠT | Giao diện kiểm duyệt hiển thị chính xác các điểm sai lệch kiến thức được phát hiện chéo bởi 2 mô hình AI (Ví dụ: Phát hiện lỗi kiến thức *"Đỉnh Phan-xi-păng nằm ở tỉnh Cà Mau"* và gợi ý sửa thành *"Lào Cai"* kèm lý do chi tiết và nguồn đối chiếu uy tín như Wikipedia). |
| **Hỏi đáp AI Nâng cao (RAG)** | ✅ ĐẠT | Gửi câu hỏi RAG thành công qua API và giao diện. Với câu hỏi: *"Đỉnh núi cao nhất Đông Dương cao bao nhiêu mét và nằm ở nước nào?"*, AI phản hồi chính xác (Fansipan, 3.143m, Việt Nam) dưới cấu trúc chuẩn gồm Tóm tắt, Giải thích chi tiết, Các điểm mấu chốt, Ví dụ minh họa và Câu hỏi gợi ý thêm. |

---

## 3. Nhật ký sửa lỗi trong phiên kiểm thử này

### Khắc phục lỗi chiếm dụng cổng 8000 (Port 8000 in use)
* **Vấn đề:** Tiến trình backend cũ bị treo và chiếm dụng cổng 8000 (`Address already in use`), dẫn đến các yêu cầu AI chat hoặc tải danh sách học liệu từ giao diện Chrome báo lỗi kết nối hoặc trả về mã lỗi 500 do xung đột kết nối.
* **Xử lý:** Phát hiện và kết thúc (kill) tiến trình Python chạy ngầm cũ (PID 15925) đang lắng nghe cổng 8000. Khởi động lại dịch vụ backend FastAPI sạch sẽ bằng `./scripts/start_backend.sh`.
* **Kết quả:** Kết nối API phục hồi hoàn toàn. Lệnh gọi `/api/v1/chat/ask-advanced` phản hồi thành công với mã trạng thái `200 OK`.

---

## 4. Minh chứng hình ảnh kiểm thử (Screenshots)

Các màn hình giao diện chính hoạt động tốt trên Google Chrome đã được chụp lại để làm minh chứng:
1. **Trang Đăng nhập:** [login_page_1785222308725.png](file:///Users/macos/.gemini/antigravity-ide/brain/4a94d7bd-bdc8-4f7b-97f2-53f5e64b208a/login_page_1785222308725.png)
2. **Trang Dashboard:** [dashboard_view_1785222793930.png](file:///Users/macos/.gemini/antigravity-ide/brain/4a94d7bd-bdc8-4f7b-97f2-53f5e64b208a/dashboard_view_1785222793930.png)
3. **Danh sách học liệu:** [documents_page_view_1785222870686.png](file:///Users/macos/.gemini/antigravity-ide/brain/4a94d7bd-bdc8-4f7b-97f2-53f5e64b208a/documents_page_view_1785222870686.png)
4. **Đối chiếu và phát hiện sai sót tài liệu:** [document_detail_real_1785223562531.png](file:///Users/macos/.gemini/antigravity-ide/brain/4a94d7bd-bdc8-4f7b-97f2-53f5e64b208a/document_detail_real_1785223562531.png)

---

## 5. Khuyến nghị cho buổi Demo
1. Trình bày luồng upload file văn bản ngắn (như tệp `.docx` hoặc `.pdf` địa lý/lịch sử có sẵn lỗi sai nhỏ để AI phát hiện trực quan).
2. Khi demo tính năng Hỏi đáp RAG, nên bật/tắt linh hoạt tùy chọn **Tìm kiếm Internet (Google Search Grounding)** để thể hiện khả năng kết hợp nguồn học liệu nội bộ và tri thức trực tuyến thời gian thực.
