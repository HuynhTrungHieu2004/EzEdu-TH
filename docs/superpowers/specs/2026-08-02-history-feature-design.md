# Thiết kế: Tính năng Lịch sử (Teacher content history + Student attempt history)

Ngày: 2026-08-02

## Bối cảnh

Hiện trạng trước khi có tính năng này:
- Học sinh đã có `/learning-history` (chỉ cho ôn tập/question-set, không có đề thi giảng viên giao)
- Giảng viên có `GET /documents` và `GET /exams` (list thô, owner-scoped) nhưng không có 1 trang lịch sử hợp nhất, không có action sửa/xóa/thống kê gộp
- Đề thi giảng viên giao: mỗi học sinh chỉ có 1 attempt/exam, không có cờ cho phép làm lại

## Yêu cầu

**Giảng viên**: sau khi tải học liệu (lưu Cloudinary) hoặc tạo đề thi (lưu MongoDB), xem được lịch sử — với mỗi mục: xem/tải file, sửa, xóa mềm, xem thống kê sử dụng (số lượt làm, điểm trung bình).

**Học sinh**: sau khi làm đề thi giảng viên giao hoặc ôn tập, xem lại lịch sử và làm lại:
- Ôn tập: luôn làm lại được, tạo lượt mới, giữ lịch sử các lần trước
- Đề thi giảng viên giao: chỉ làm lại được nếu giảng viên bật `allow_retake` cho đề đó (mặc định tắt)
- Nếu tài liệu/đề thi gốc đã bị giảng viên xóa mềm: lịch sử học sinh vẫn giữ nguyên, hiển thị "đã bị xóa", không cho làm lại

**Layout**: mỗi role gộp chung 1 trang (không tách riêng học liệu/đề thi hay riêng ôn tập/đề thi), filter theo loại trong cùng trang.

## Kiến trúc

API gộp server-side theo role (không dùng event-log tập trung, không merge ở frontend) — 2 endpoint mới, mỗi endpoint gọi song song các query đã có sẵn (documents, exams, exam attempts, question attempts), merge + sort + phân trang ngay trên server bằng skip/limit đơn giản (không cần cursor phức tạp như `questions.py` vì đây là trang cá nhân, dữ liệu không lớn).

Lý do không chọn event-log: audit mạnh hơn nhưng phải sửa logging ở rất nhiều nơi (documents.py, exam_service.py, questions.py, attempt_service.py) và không có dữ liệu lịch sử cũ (chỉ tính từ lúc triển khai) — over-engineering so với nhu cầu hiện tại.

Lý do không merge ở frontend: phân trang/scale kém khi dữ liệu lớn, trùng logic nghiệp vụ ở 2 nơi.

## 1. Data model

**Exam (exam_bank)** — thêm field:
- `allow_retake: bool`, default `false`

**Attempt (exam_bank)** — đổi logic `start_attempt`:
- Nếu chưa có attempt nào cho (exam, student) → tạo mới (như hiện tại)
- Nếu đã có attempt và `exam.allow_retake == true` → tạo attempt mới (KHÔNG reuse attempt cũ)
- Nếu đã có attempt và `exam.allow_retake == false` → trả lỗi 403

**Document, question_attempts/question_sets** — không đổi schema. Field `deleted_at`/`user_id`/`owner_id` hiện có được tận dụng.

Không cần migration dữ liệu cũ.

## 2. Backend API

### `GET /teacher/content-history` (mới)
- Params: `type: all|document|exam = all`, `search: str = None`, `skip: int = 0`, `limit: int = 50`
- Song song: query `documents` (`user_id=me, deleted_at=None`) + `exams` (`owner_id=me, deleted_at=None`)
- Gắn `item_type` (`document`|`exam`) vào mỗi item, merge list, sort `created_at desc`, áp filter `type`/`search`, rồi mới cắt `skip:skip+limit`
- Song song thêm 1 aggregation (`$group` theo `document_id`/`exam_id` trên collection attempt tương ứng) để lấy `attempt_count`, `avg_score`, `last_attempt_at` cho các item trong trang hiện tại (không N+1) — nếu aggregation lỗi/timeout, các field này trả `null`, không fail cả request
- Item đã xóa mềm không xuất hiện (đây là trang quản lý, xóa = biến mất khỏi list quản lý)
- Response item: `{id, item_type, title, created_at, cloudinary_url (document only), attempt_count, avg_score, last_attempt_at}`

### `GET /student/attempt-history` (mới)
- Params: `type: all|exam|practice = all`, `skip: int = 0`, `limit: int = 50`
- Song song: query exam_bank attempts (`student_id=me`) + question_attempts (`user_id=me`)
- Gắn `item_type` (`exam`|`practice`), join tên đề/tài liệu gốc, merge, sort `created_at desc`, filter, cắt trang
- Mỗi item kèm `source_deleted: bool` (true nếu document/exam gốc có `deleted_at != None`)
- Response item: `{id, item_type, title, score, max_score, status, created_at, source_deleted, can_retake}` — `can_retake` tính sẵn ở backend: `practice` luôn `true`; `exam` = `exam.allow_retake AND NOT source_deleted`

### Làm lại
- Ôn tập: giữ nguyên `POST /{question_set_id}/attempts` (đã tạo attempt mới mỗi lần, không đổi)
- Đề thi: sửa `POST /exams/{exam_id}/attempts/start` theo logic ở mục Data model

## 3. Frontend

### Giảng viên — trang mới `/teacher/content-history`
- Thêm mục menu trong sidebar GV
- Tab/filter: Tất cả / Học liệu / Đề thi, + ô search
- Bảng: tên, badge loại, ngày tạo, số lượt làm, điểm TB, cột action [Xem/Tải] [Sửa] [Xóa]
- Xem/Tải: document → mở `cloudinary_url` trực tiếp; exam → điều hướng trang chi tiết đề có sẵn
- Sửa: điều hướng route edit có sẵn theo loại
- Xóa: confirm dialog (dùng pattern confirm sẵn có) → gọi endpoint xóa mềm có sẵn tương ứng theo loại → xóa dòng khỏi bảng
- Table component: viết riêng cho trang này (không tạo generic library mới) trừ khi phát hiện đã có `DataTable` dùng chung — kiểm tra lúc viết plan/code

### Học sinh — sửa trang `/learning-history` hiện có
- Thêm tab/filter: Tất cả / Đề thi GV giao / Ôn tập
- Đổi nguồn data: gọi `GET /student/attempt-history` thay `GET /questions/my-history`
- Nút "Xem lại / Làm lại": disable + tooltip "tài liệu đã bị xóa" nếu `source_deleted`; nếu `item_type=exam` và `can_retake=false` → chỉ hiện "Xem lại" (ẩn nút Làm lại)
- Badge loại (Đề thi / Ôn tập) trên mỗi dòng

Không đổi `ProgressPage.tsx` (ngoài phạm vi).

## 4. Error handling

- Xóa học liệu/đề thi đang có học sinh làm: cho phép xóa mềm bình thường (lịch sử HS giữ nguyên, hiện "đã bị xóa")
- Start lại đề thi khi `allow_retake=false` và đã có attempt: backend 403 kèm message rõ; frontend đã ẩn nút nên đây là chặn phòng hờ gọi thẳng API
- Aggregation stats lỗi/timeout: API vẫn trả danh sách chính, field liên quan trả `null`, frontend hiện "—"
- Timestamp: dùng chung `datetime.utcnow()` như code hiện tại, không có rủi ro timezone mới
- Race xóa đúng lúc học sinh đang xem: không cần lock, load lại trang sẽ tự cập nhật `source_deleted`, chấp nhận độ trễ nhỏ

## 5. Testing

**Backend (pytest theo pattern `backend/tests/`)**
- `content-history`: merge đúng, không lẫn GV khác, filter `type` đúng, item xóa mềm không xuất hiện, stats tính đúng
- `attempt-history`: merge đúng theo đúng học sinh, `source_deleted=true` khi nguồn bị xóa mềm
- Retake: `allow_retake=false` + đã có attempt → 403; `allow_retake=true` → tạo attempt mới; default `allow_retake=false` khi tạo đề không truyền field

**Frontend**: verify tay qua browser preview (filter tab, xóa/sửa 1 item phía GV; nút Làm lại disable đúng lúc phía HS) — không thêm Playwright e2e mới, ngoài phạm vi.

## Ngoài phạm vi (không làm trong lần này)

- Xuất file PDF/docx cho đề thi lên Cloudinary (đề thi giữ nguyên lưu MongoDB, theo yêu cầu đã chốt)
- Cấu hình chi tiết hơn cho thống kê (per-student breakdown) — chỉ cần attempt_count + avg_score + last_attempt_at
- Sửa `ProgressPage.tsx`
