# Thiết kế bộ hồ sơ phân tích nghiệp vụ và mô hình hệ thống EzEdu AI

## 1. Mục tiêu

Tạo một bộ hồ sơ phân tích có thể dùng trực tiếp trong báo cáo học phần/đồ án, phản ánh đúng mã nguồn EzEdu AI tại ngày 29/07/2026. Hồ sơ phải mô tả hiện trạng, yêu cầu chức năng, yêu cầu phi chức năng, quy tắc nghiệp vụ, dữ liệu, rủi ro và năm góc nhìn mô hình: Use Case, Activity, Sequence, Class và ERD.

## 2. Phạm vi hệ thống

Phạm vi khảo sát là toàn bộ repository hiện tại:

- Frontend React/Vite/TypeScript và hệ thống route theo vai trò.
- Backend FastAPI, middleware, RBAC, API và worker.
- MongoDB, ChromaDB và lưu trữ Cloudinary/local.
- Gemini, Groq, embedding, RAG, grounding và các cơ chế quota.
- Phân hệ học liệu, kiểm chứng, sinh câu hỏi, luyện tập, lớp học.
- Phân hệ ngân hàng câu hỏi, ma trận đề, đề thi có giờ và chấm điểm.
- Phân hệ chat nâng cao, tri thức Internet, kho tri thức chương trình.
- Phân hệ cá nhân hóa, mô hình người học, khuyến nghị và learning events.
- Phân hệ quản trị người dùng, nội dung, AI, CMS, cấu hình, thông báo, báo cáo, nhật ký và sức khỏe hệ thống.

Không coi tài liệu kế hoạch cũ là nguồn sự thật nếu mâu thuẫn với code hiện tại. Mọi kết luận quan trọng phải đối chiếu với router, schema, service, cấu hình hoặc kiểm thử đang tồn tại.

## 3. Bộ bàn giao

Thư mục bàn giao: `artifacts/system-analysis/`.

1. `Bao_cao_phan_tich_nghiep_vu_EzEdu_AI.docx`
   - Báo cáo Word hoàn chỉnh, có mục lục, bảng biểu, sơ đồ và phụ lục truy vết.
2. `Bao_cao_phan_tich_nghiep_vu_EzEdu_AI.md`
   - Nguồn nội dung dạng văn bản để tra cứu và chỉnh sửa.
3. `diagrams/*.svg` và `diagrams/*.png`
   - Ảnh vector và ảnh raster của năm sơ đồ.
4. `diagrams/source/*.puml`
   - Nguồn UML/ERD có thể chỉnh sửa và tái tạo bằng PlantUML.
5. `case-studio2/ezedu_logical_model_mysql.sql`
   - Mô hình quan hệ logic dùng kiểu dữ liệu MySQL phổ thông để CASE Studio 2 reverse-engineer.
6. `case-studio2/README_CASE_STUDIO_2.md`
   - Hướng dẫn nhập DDL vào CASE Studio 2 và giải thích ánh xạ MongoDB → mô hình quan hệ.

Không tạo tệp `.dm2` giả. `.dm2` là định dạng model riêng của CASE Studio 2; môi trường macOS hiện tại không có CASE Studio 2/Toad Data Modeler để tạo và xác minh tệp đó.

## 4. Cấu trúc báo cáo

1. Trang bìa và thông tin phiên bản khảo sát.
2. Tóm tắt điều hành.
3. Mục tiêu, phạm vi và phương pháp khảo sát.
4. Khảo sát hiện trạng:
   - Bài toán hiện tại.
   - Bên liên quan và vai trò.
   - Kiến trúc, công nghệ, triển khai.
   - Danh mục phân hệ.
   - Luồng nghiệp vụ đang vận hành.
   - Dữ liệu và tích hợp ngoài.
   - Kiểm thử, giám sát và mức độ sẵn sàng.
   - Hạn chế và nợ kỹ thuật.
5. Phân tích yêu cầu:
   - Yêu cầu chức năng theo mã FR và nhóm phân hệ.
   - Yêu cầu phi chức năng theo mã NFR.
   - Quy tắc nghiệp vụ theo mã BR.
   - Yêu cầu dữ liệu và tích hợp.
   - Ràng buộc, giả định và tiêu chí nghiệm thu.
6. Đặc tả tác nhân và use case chính.
7. Năm sơ đồ phân tích.
8. Ma trận truy vết Actor ↔ FR ↔ Use Case ↔ Entity/API.
9. Rủi ro và kiến nghị ưu tiên.
10. Phụ lục: danh mục API, collection, trạng thái, thuật ngữ và nguồn code đã khảo sát.

## 5. Thiết kế sơ đồ

### 5.1 Use Case Diagram

Tác nhân:

- Khách.
- Học sinh.
- Giảng viên.
- Quản trị hệ thống.
- Quản trị nội dung/Moderator.
- Hỗ trợ/Support.
- Chuyên viên phân tích/Analyst.
- Gemini/Groq.
- Cloudinary.

Các use case được chia thành năm vùng: tài khoản; học tập; học liệu và đánh giá; tri thức/AI; quản trị. Quan hệ `include` dùng cho xác thực, kiểm tra quyền, kiểm tra quota, ghi nhật ký; `extend` dùng cho tìm kiếm web, kiểm chứng, xuất file, teacher override và cá nhân hóa.

### 5.2 Activity Diagram

Mô tả quy trình đầu-cuối cốt lõi:

Giảng viên tải học liệu → hệ thống kiểm tra/deduplicate → trích xuất hoặc phiên âm → kiểm chứng và duyệt lỗi → chunk/embed/index → sinh/duyệt/publish câu hỏi hoặc sinh đề theo blueprint → học sinh làm bài → chấm tự động/AI/giảng viên → ghi learning event → cập nhật mô hình người học và khuyến nghị.

Sơ đồ có swimlane Giảng viên, EzEdu AI, Dịch vụ ngoài và Học sinh; có nhánh tài liệu/video, lỗi xử lý, kiểm chứng tùy chọn và bài luyện tập/thi có giờ.

### 5.3 Sequence Diagram

Mô tả phiên thành công chính của quy trình đánh giá từ học liệu:

Giảng viên → React UI → FastAPI → MongoDB → Cloudinary → Parser/Transcriber → Gemini/Groq → ChromaDB → Question/Exam service → Học sinh → Grading/Worker → Personalization service.

Sử dụng `alt` cho tài liệu/video, `opt` cho kiểm chứng và `alt` cho trắc nghiệm/tự luận.

### 5.4 Class Diagram

Là mô hình lớp nghiệp vụ khái niệm, không sao chép từng class kỹ thuật. Các package:

- Identity & Access.
- Learning Content.
- Assessment.
- Conversation & Knowledge.
- Personalization.
- Administration & Operations.

Thể hiện thuộc tính cốt lõi, trạng thái và quan hệ kết hợp/kế thừa/phụ thuộc. Các mảng nhúng MongoDB như `QuestionSet.questions[]` và `ExamAttempt.results[]` được thể hiện bằng composition.

### 5.5 ERD

Là ERD logic của dữ liệu MongoDB, được biểu diễn theo mô hình quan hệ để dùng với CASE Studio 2. Mảng nhúng có nghiệp vụ độc lập được tách thành bảng con; map/JSON ít quan trọng được ánh xạ sang `TEXT`. Khóa MongoDB ObjectId được ánh xạ sang `VARCHAR(24)`.

ERD chia theo miền nhưng vẫn giữ một sơ đồ tổng thể:

- Identity/Class.
- Document/RAG/Verification.
- Question/Exam.
- Chat/Knowledge.
- Personalization.
- Admin/Operations.

## 6. Nguyên tắc trình bày

- Báo cáo dùng preset `standard_business_brief`, trang Letter dọc; sơ đồ lớn đặt ở trang Letter ngang.
- Font Calibri; Heading 1: 16 pt `#2E74B5`; Heading 2: 13 pt `#2E74B5`; Heading 3: 12 pt `#1F4D78`.
- Thân bài 11 pt, giãn dòng 1.10, cách đoạn 6 pt.
- Bảng có geometry cố định, header `#F2F4F7`, lề ô rõ ràng.
- Sơ đồ dùng cùng palette: xanh đậm `#163B65`, xanh `#2E74B5`, nền `#F4F7FB`, cảnh báo `#B7791F`, lỗi `#B42318`.
- Mỗi sơ đồ có chú thích phạm vi và lưu ý về mức trừu tượng.

## 7. Tiêu chí hoàn thành

- Không có placeholder `TBD`, `TODO` hoặc nội dung suy đoán không được gắn nhãn.
- Chức năng trong báo cáo khớp route/backend và route/frontend hiện tại.
- Vai trò quản trị chi tiết không bị gộp sai thành một vai trò duy nhất trong phần RBAC.
- Phân biệt rõ `question_sets/question_attempts` (luyện tập cũ) với `questions/exams/exam_attempts` (ngân hàng và thi có giờ).
- Phân biệt rõ MongoDB vật lý với ERD quan hệ logic dùng cho CASE Studio 2.
- Năm sơ đồ có bản SVG, PNG và nguồn chỉnh sửa.
- DOCX render được, toàn bộ trang được kiểm tra trực quan, không có chữ bị cắt, bảng tràn hoặc sơ đồ mờ.
- Chạy kiểm tra cấu trúc tệp, XML DOCX và ít nhất lint/build/test khả dụng của repository để ghi nhận trạng thái hiện tại.
