# Hướng dẫn mở mô hình bằng CASE Studio 2

## 1. Thành phần bàn giao

- `ezedu_logical_model_mysql.sql`: DDL MySQL/InnoDB dùng để CASE Studio 2 reverse-engineer thành mô hình dữ liệu.
- `data_dictionary.csv`: từ điển đối chiếu các collection/bề mặt dữ liệu trong mã nguồn.
- `../diagrams/erd-diagram.png`: bản xem nhanh ERD.
- `../diagrams/source/erd-diagram.puml`: nguồn sơ đồ ERD có thể chỉnh sửa độc lập.

## 2. Lưu ý về kiến trúc thật

Ứng dụng EzEdu AI hiện chạy với MongoDB và ChromaDB. CASE Studio 2 là công cụ mô hình hóa cơ sở dữ liệu quan hệ, vì vậy DDL trong gói này là **mô hình logic quan hệ hóa**:

- MongoDB `ObjectId` được biểu diễn bằng `VARCHAR(24)`.
- Mảng và object lồng nhau quan trọng được tách thành bảng con/bảng liên kết.
- Dữ liệu vector thực tế nằm trong ChromaDB; mô hình chỉ lưu metadata và liên kết logic.
- Đây là tài liệu phân tích, **không phải migration để chạy trên cơ sở dữ liệu production**.

## 3. Tạo tệp `.dm2` trong CASE Studio 2

1. Mở CASE Studio 2 trên Windows.
2. Tạo một model mới, chọn MySQL làm target database.
3. Chọn chức năng reverse engineering/import từ SQL script.
4. Chọn tệp `ezedu_logical_model_mysql.sql`.
5. Bật import bảng, khóa chính, khóa ngoại, unique key và index.
6. Sau khi import, chạy tự động sắp xếp sơ đồ, rồi nhóm bảng theo các miền:
   - Người dùng và lớp học.
   - Tài liệu, RAG và xác minh.
   - Bộ câu hỏi luyện tập.
   - Ngân hàng câu hỏi và thi có thời gian.
   - Hội thoại và phản hồi AI.
   - Knowledge graph và cá nhân hóa.
   - Quản trị, vận hành và cấu hình.
7. Kiểm tra các quan hệ và lưu model bằng **Save As** dưới định dạng `.dm2`.

Tên tệp gợi ý: `EzEdu_AI_Logical_Model.dm2`.

## 4. Quy ước mô hình

- PK: khóa chính.
- FK: khóa ngoại.
- UK: ràng buộc duy nhất.
- Cardinality được suy ra từ FK và tính nullable của cột.
- Các bảng nối thể hiện quan hệ nhiều-nhiều.
- Các trường có hậu tố `_at` là thời điểm UTC.
- Các trạng thái được giữ ở kiểu `VARCHAR` để bám sát enum và feature flag trong ứng dụng.

## 5. Kiểm tra sau khi import

- Không có FK trỏ tới bảng chưa tồn tại.
- `users` là thực thể gốc của quyền sở hữu và audit.
- `documents` là gốc của miền nội dung/RAG.
- `question_sets` và `question_bank` là hai miền đánh giá khác nhau.
- `exam_attempts` không được trộn với `question_attempts`.
- Các bảng knowledge/personalization có thể tắt theo feature flag nhưng vẫn thuộc mô hình logic đầy đủ.

