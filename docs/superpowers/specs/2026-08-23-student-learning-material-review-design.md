# Thiết kế ôn tập từ học liệu cá nhân cho học sinh

**Ngày:** 23/08/2026
**Trạng thái:** Đã duyệt về nghiệp vụ trong hội thoại; chờ duyệt tài liệu đặc tả
**Phạm vi:** Upload học liệu, phân loại tự động, AI sinh trắc nghiệm, làm lại và lịch sử ôn tập

## 1. Mục tiêu

Cho phép học sinh tải học liệu cá nhân, để hệ thống đọc và phân loại nội dung, dùng AI sinh bộ câu hỏi trắc nghiệm bám sát nguồn, làm bài nhiều lần và xem lại lịch sử tiến bộ.

Bộ câu hỏi là **bộ ôn tập cá nhân**, không phải đề thi chính thức, không được giao cho lớp và không tự động đưa vào ngân hàng câu hỏi chung.

## 2. Ngoài phạm vi

- Học sinh upload video.
- Học sinh xuất bản, chia sẻ hoặc giao bộ ôn tập cho lớp.
- Học sinh sửa, duyệt hoặc đưa câu hỏi vào ngân hàng chính thức.
- Sinh câu hỏi tự luận trong phiên bản đầu.
- Tạo taxonomy mới trực tiếp từ nhãn tự do do AI trả về.

## 3. Nguyên tắc kiến trúc

### 3.1 Tái sử dụng hệ thống hiện có

Tái sử dụng `documents`, `curriculum_taxonomy`, `question_sets`, `question_attempts`, `background_jobs` và dịch vụ sinh/kiểm chứng câu hỏi hiện có. Không tạo hệ thống chấm điểm hoặc ngân hàng câu hỏi song song.

### 3.2 Tách ôn tập khỏi đề thi chính thức

Mỗi `question_set` có trường `purpose`:

- `assessment`: hành vi hiện tại.
- `student_review`: bộ ôn tập riêng do học sinh tạo.

Dữ liệu cũ không có `purpose` được đọc như `assessment` để giữ tương thích ngược.

### 3.3 Ranh giới sử dụng AI

API AI được dùng để phân loại ngữ nghĩa, sinh câu hỏi/đáp án/lời giải, gắn dẫn chứng, phát hiện câu trùng hoặc không được nguồn hỗ trợ, và đề xuất độ khó/Bloom.

Mã xác định được dùng để kiểm tra file, phân quyền, lưu dữ liệu, chống tạo trùng, quản lý trạng thái, xáo trộn và chấm điểm trắc nghiệm.

Không lưu chuỗi suy nghĩ nội bộ của mô hình. Chỉ lưu JSON kết quả, độ tin cậy, phiên bản mô hình và dẫn chứng.

## 4. Luồng người dùng

```text
Upload học liệu
  → Trích xuất văn bản
  → Lập chỉ mục
  → Phân loại môn/chương/chủ đề
  → Học sinh xác nhận khi cần
  → Cấu hình bộ ôn tập
  → AI sinh và kiểm chứng câu hỏi
  → Lưu bộ ôn tập
  → Làm bài
  → Chấm điểm và lưu lượt làm
  → Xem lại hoặc làm lại
```

### 4.1 Upload và xử lý

- Định dạng: PDF, DOCX, PPTX.
- Dung lượng tối đa: 20 MB.
- Học sinh chỉ thấy tài liệu của chính mình.
- Trạng thái: `uploading`, `extracting`, `indexing`, `classifying`, `ready`, `failed`.
- Có thể chạy lại bước lỗi mà không upload lại.

### 4.2 Cấu hình bộ ôn tập

- Tên mặc định lấy từ tên file.
- Số câu: số nguyên từ 3 đến 50.
- Độ khó: dễ, trung bình hoặc khó.
- Dạng câu: trắc nghiệm bốn lựa chọn.
- Phạm vi phiên bản đầu: toàn bộ tài liệu.

Ruling MVP ngày 23/08/2026: kế hoạch triển khai được duyệt sau tài liệu nháp
này là nguồn quyết định cho cấu hình, nên phạm vi hiện tại giữ 3–50 câu và ba
mức `easy|medium|hard`; chưa có thuật toán `adaptive`. Nếu ruling này sai, sản
phẩm sẽ cần một thay đổi API/UI có khả năng breaking để chuyển sang preset
5/10/15/20 và định nghĩa hành vi thích ứng.

### 4.3 Sinh câu hỏi

- Yêu cầu sinh chạy qua hàng đợi nền và trả trạng thái `pending` ngay.
- Đóng trang không hủy công việc.
- Có ít nhất 3 câu đạt kiểm chứng thì lưu bộ; nếu thiếu số lượng, hiển thị cảnh báo `N/M câu đạt chất lượng`.
- Dưới 3 câu đạt kiểm chứng thì đánh dấu thất bại và cho phép thử lại.

### 4.4 Làm bài và làm lại

- Bộ câu hỏi cố định sau khi sinh.
- Mỗi lượt làm có thứ tự câu và đáp án riêng do server tạo.
- Làm lại không gọi AI.
- Server chấm theo thứ tự đã lưu.
- Kết quả gồm điểm, đáp án, lời giải và đoạn nguồn liên quan.

## 5. Thiết kế giao diện

### 5.1 Học liệu số — `/student/learning-materials`

- Kéo thả/chọn file.
- Danh sách tài liệu và trạng thái xử lý.
- Kết quả phân loại cùng độ tin cậy.
- Nút `Tạo bộ ôn tập` khi tài liệu `ready`.
- Nút thử lại cho bước xử lý thất bại.

### 5.2 Tạo bộ ôn tập — `/student/learning-materials/:documentId/reviews/new`

- Hiển thị nguồn và phân loại.
- Cho phép xác nhận/sửa phân loại khi cần.
- Cấu hình tên, số câu và độ khó.
- Hiển thị tiến trình sinh câu hỏi.

### 5.3 Lịch sử ôn tập — `/student/review-history`

Mỗi bộ hiển thị tên, học liệu nguồn, taxonomy, số câu, độ khó, ngày tạo, số lượt làm, điểm gần nhất và điểm cao nhất. Hành động gồm `Làm bài`, `Xem các lần làm`, `Xem học liệu`.

Bộ xuất hiện ở đây ngay cả khi chưa làm và không xuất hiện trong `Đề thi chính thức`.

### 5.4 Màn hình làm bài

Dùng giao diện làm bài hiện có, không hiển thị hành động sửa/duyệt/xuất bản. Sau khi nộp, hiển thị lời giải và căn cứ học liệu.

## 6. Phân loại tự động

### 6.1 Metadata tài liệu

```json
{
  "subject_id": "toan",
  "grade": 12,
  "curriculum_version": "2018",
  "chapter_id": "taxonomy-chapter-ham-so",
  "topic_ids": ["taxonomy-topic-cuc-tri", "taxonomy-topic-tiem-can"],
  "confidence": 0.94,
  "classification_status": "confirmed",
  "classification_method": "ai_taxonomy_v1",
  "classified_at": "2026-08-23T12:00:00Z",
  "model_version": "configured-provider-model"
}
```

AI đọc tên file, tiêu đề và các đoạn đại diện nhưng chỉ được chọn ID từ `curriculum_taxonomy`. Nhãn không khớp được lưu làm gợi ý, không tự tạo node.

### 6.2 Ngưỡng tin cậy

- `confidence >= 0.85`: tự động xác nhận.
- `0.60 <= confidence < 0.85`: học sinh xác nhận hoặc sửa.
- `confidence < 0.60`: bắt buộc chọn môn/chương trước khi sinh.

Khi học sinh sửa, lưu `classification_method = student_corrected`.

### 6.3 Metadata từng câu hỏi

```text
subject_id
grade
curriculum_version
chapter_id
topic_id
source_document_id
source_chunk_ids
grounding_excerpt
classification_confidence
```

Metadata cho phép truy vấn theo môn/khối/chương/chủ đề mà không biến câu hỏi riêng tư thành câu hỏi chính thức.

## 7. Mô hình dữ liệu

### 7.1 `documents`

Bổ sung `classification` và `classification_status` (`pending`, `running`, `confirmed`, `needs_review`, `failed`). Quyền sở hữu tiếp tục dùng `user_id`.

### 7.2 `question_sets`

Bổ sung:

```text
purpose: assessment | student_review
title: string
visibility: private
generation_config: object
generation_status: pending | running | completed | failed
generation_error: string | null
bank_status: private
promotion_status: not_submitted
client_request_id: string
```

Tiếp tục dùng các trường hiện có: `document_id`, `user_id`, `questions`, `difficulty`, `question_type`, `subject_id`, `grade`, `chapter_id`, `topic_id`.

Tạo partial unique index cho `(user_id, client_request_id)` khi `client_request_id` tồn tại, tránh xung đột với dữ liệu cũ chưa có trường này.

### 7.3 `question_attempts`

Bổ sung:

```text
status: in_progress | completed
attempt_number: integer
question_order: integer[]
option_orders: object
started_at: datetime
submitted_at: datetime | null
```

Lượt làm cũ thiếu `status` được đọc như `completed`.

## 8. API

### 8.1 Tài liệu

Tái sử dụng:

```text
POST /documents/upload
POST /documents/{document_id}/extract
POST /documents/{document_id}/index
```

Học sinh được gọi cho tài liệu của mình, không gồm video.

Phân loại:

```text
POST  /documents/{document_id}/classify
PATCH /documents/{document_id}/classification
```

Hệ thống tự phân loại sau khi index; endpoint `classify` phục vụ thử lại.

### 8.2 Bộ ôn tập

```text
POST /student-reviews
GET  /student-reviews
GET  /student-reviews/{review_id}
GET  /student-reviews/{review_id}/status
```

`POST /student-reviews` trả HTTP 202.

### 8.3 Lượt làm

```text
POST /student-reviews/{review_id}/attempts
GET  /student-reviews/{review_id}/attempts
GET  /student-reviews/{review_id}/attempts/{attempt_id}
POST /student-reviews/{review_id}/attempts/{attempt_id}/submit
```

Endpoint tạo lượt làm không trả đáp án đúng.

## 9. Quyền và riêng tư

- Chỉ học sinh tạo `student_review`.
- Mọi truy vấn lọc theo `user_id` từ token, không tin `user_id` từ client.
- Học sinh không được gọi API publish, workflow hoặc quản trị taxonomy.
- Bộ ôn tập không xuất hiện trong API đề thi/ngân hàng chung.
- Quyền giảng viên và admin giữ nguyên.

## 10. Kiểm chứng chất lượng

Mỗi câu phải có bốn lựa chọn, đúng một đáp án, lời giải, `source_chunk_ids`, `grounding_excerpt` hợp lệ và ngôn ngữ phù hợp.

Pipeline loại câu trùng ý, không có căn cứ, nhiều/không có đáp án đúng hoặc có đáp án mâu thuẫn với lời giải. Lưu kết quả kiểm chứng và phiên bản mô hình, không lưu chuỗi suy nghĩ.

## 11. Xử lý lỗi

- Sai định dạng/quá dung lượng: chặn ở client và backend.
- Không trích xuất được chữ: báo tài liệu rỗng hoặc có thể là bản scan.
- Index lỗi: cho phép chạy lại.
- Phân loại lỗi: cho phép chọn thủ công.
- Độ tin cậy thấp: yêu cầu xác nhận.
- AI lỗi/hết hạn mức: giữ tài liệu/cấu hình và cho thử lại.
- Bấm tạo nhiều lần: dùng `client_request_id` trả cùng kết quả.
- Xóa học liệu: giữ bộ ôn tập/lượt làm và ghi nguồn đã xóa.

## 12. Tương thích dữ liệu

- Không migration toàn bộ dữ liệu cũ.
- Thiếu `question_sets.purpose` được coi là `assessment`.
- Thiếu `question_attempts.status` được coi là `completed`.
- Index mới được tạo idempotent.
- Route/API giảng viên giữ nguyên.

## 13. Ngân hàng câu hỏi tương lai

Câu hỏi ôn tập lưu taxonomy nhưng giữ:

```text
bank_status: private
promotion_status: not_submitted
```

Tính năng tương lai có thể cho giảng viên kiểm duyệt và sao chép câu đạt chất lượng vào ngân hàng chính thức. Không tự động thực hiện trong phạm vi này.

## 14. Tiêu chí nghiệm thu

1. Học sinh upload được PDF, DOCX, PPTX tối đa 20 MB nhưng không upload video.
2. Học sinh không truy cập được tài liệu/bộ ôn tập/lượt làm của người khác.
3. Tài liệu được trích xuất, index và phân loại bằng taxonomy hiện có.
4. Kết quả độ tin cậy thấp yêu cầu xác nhận.
5. AI sinh bộ trắc nghiệm có căn cứ từ đúng học liệu.
6. Bộ có `purpose = student_review`, riêng tư và không thuộc đề thi chính thức.
7. Bộ xuất hiện trong lịch sử trước cả lần làm đầu.
8. Học sinh nhận điểm, đáp án, lời giải và dẫn chứng sau khi nộp.
9. Làm lại giữ câu hỏi nhưng đảo thứ tự, không gọi AI.
10. Lịch sử lưu từng lượt, điểm gần nhất và điểm cao nhất.
11. Xóa nguồn không xóa bộ ôn tập/lịch sử.
12. `client_request_id` ngăn bộ trùng.
13. Chức năng giảng viên và đề thi chính thức không thay đổi.

## 15. Kiểm thử bắt buộc

- Unit test ngưỡng phân loại và quyền sở hữu.
- Unit test tương thích dữ liệu cũ và chống tạo trùng.
- Unit test xáo trộn/chấm điểm theo thứ tự server lưu.
- Integration test upload → extract → index → classify → generate.
- Integration test tạo lượt → nộp → lịch sử → làm lại.
- Regression test luồng giảng viên hiện có.
- E2E bằng tài khoản học sinh với ba học liệu demo Toán 12.

## 16. Thứ tự triển khai

1. Mô hình dữ liệu, index và tương thích ngược.
2. Mở upload tài liệu có giới hạn cho học sinh.
3. Job phân loại taxonomy.
4. API và job sinh `student_review`.
5. API lượt làm có thứ tự do server quản lý.
6. Giao diện học liệu, cấu hình và tiến trình.
7. Lịch sử ôn tập và làm lại.
8. Kiểm thử tích hợp và E2E.
