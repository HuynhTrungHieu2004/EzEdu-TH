# QA với backend thật (2026-08-15)

Mọi lần kiểm thử trước đó đều chạy với API **giả lập** (`stubApi` của Playwright). Lần này chạy FastAPI thật
trên MongoDB thật để xem stub đang che giấu điều gì.

## Cách chạy

- Backend: `uvicorn app.main:app --port 8000` — `/health/ready` báo `mongodb`, `chromadb`, `gemini`, `groq`
  đều healthy.
- Frontend: dev server ở cổng **5173** (nằm trong `BACKEND_CORS_ORIGINS`; cổng khác sẽ bị CORS chặn),
  `VITE_API_BASE_URL=http://127.0.0.1:8000`.
- Tài khoản: `python scripts/qa_live_accounts.py --setup` tạo ba tài khoản `qa-live-lecturer` /
  `qa-live-student` / `qa-live-admin` (mật khẩu `QaLive#2026`). Tài khoản quản trị phải nâng quyền trực tiếp
  vì API đăng ký không cho chọn vai trò `admin`; dữ liệu cũ trong DB có admin nhưng không biết mật khẩu.
- Lệnh: `npm run test:live` (`playwright.live.config.ts` + `e2e/live-smoke.spec.ts`). Bộ này bị loại khỏi
  `npx playwright test` thường vì cần backend đang chạy.
- Dọn sau khi chạy: `python scripts/qa_live_accounts.py --cleanup` (xem trước bằng cách bỏ cờ). Xoá theo tiền
  tố `qa-live-` / `QA Live ` và các bản ghi tham chiếu id đó, không đụng dữ liệu thật.

Bài kiểm ghi lại mọi lỗi console, lỗi `pageerror`, mọi phản hồi API ≥ 400, tràn ngang và trang trắng trên
15 route giáo viên + 10 route học sinh + 6 trang công khai.

## Lỗi thật tìm được

**Giao diện nói dối khi phân hệ đang tắt.** `ENABLE_WEB_KNOWLEDGE` và `ENABLE_CURRICULUM_KB` mặc định `False`;
backend chặn mọi endpoint của hai phân hệ này bằng 403 "chưa được bật". Nhưng:

| Trang | Backend trả | Giao diện hiện trước khi sửa |
| --- | --- | --- |
| `/personalization` | 403 | "Cá nhân hóa đang tạm tắt" — **đúng** |
| `/web-knowledge` | 403 | "Chưa lưu học liệu nào" — **sai**, nói rỗng thay vì tắt |
| `/curriculum-kb` | 403 | Toàn bộ form thêm nguồn/crawl/tìm kiếm — **sai**, bấm gì cũng hỏng |

Thư viện công cụ (`/tools`) và ô tìm nhanh trên dashboard vẫn quảng cáo hai công cụ đó, nên người dùng bị dẫn
thẳng vào ngõ cụt.

Nguyên nhân gốc: hai cờ này **chỉ tồn tại trong biến môi trường**, chưa bao giờ xuất hiện trong
`GET /api/v1/runtime-config`, nên frontend không có cách nào biết. Stub trong bộ kiểm thử luôn trả 200 nên
lỗi này không thể lộ ra.

### Đã sửa

1. **Backend** (`system_settings_service.public_runtime_config`): công bố thêm `enable_web_knowledge` và
   `enable_curriculum_kb`, đọc thẳng từ biến môi trường tại thời điểm gọi — cùng một nguồn thật với chỗ
   `deps.py` chặn, không sinh ra nguồn thứ hai.
2. **Frontend**:
   - `WebKnowledgePage` và `CurriculumKbPage` hiện `FeatureDisabledState` ("… đang tắt" + lối đi tiếp) đúng
     như `PersonalizationPage` đã làm, và **không gọi API** khi cờ tắt.
   - `toolRegistry` có thêm trường `featureFlag`; `toolsEnabledBy()` lọc bỏ công cụ của phân hệ đang tắt ở
     thư viện công cụ và ô tìm nhanh của hai dashboard.
   - `PersonalizationPage` cũng đọc cờ trước, không còn bắn ba request chắc chắn 403 rồi mới hiện trạng thái
     tắt. Kèm sửa thứ tự render: khối "đang tắt" phải xét **trước** skeleton, nếu không trang kẹt ở skeleton
     vĩnh viễn khi không còn request nào để kết thúc `loading`.

### Đã khoá lại bằng test

`e2e/feature-flags.spec.ts` (chạy trong bộ thường, stub `runtime-config`): hai trang nói đúng "đang tắt" và
**không phát request nào** tới phân hệ đó; bật cờ lên thì trang chạy bình thường; `/tools` ẩn/hiện công cụ
theo cờ; `/personalization` tắt thì không gọi API cá nhân hoá.

## Những thứ chạy đúng với backend thật

- Đăng ký → đăng nhập → điều hướng theo vai trò: không lỗi.
- 15 route giáo viên, 10 route học sinh, 6 trang công khai: 0 lỗi console, 0 `pageerror`, 0 tràn ngang,
  0 trang trắng.
- Tạo lớp học thật (ghi vào MongoDB) và mở trang chi tiết lớp: chạy đúng.
- Sau khi sửa: chạy lại với cả hai trạng thái cờ (tắt và bật) — **0 phản hồi ≥ 400** ở cả hai.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:live` (backend thật, cờ tắt) | PASS — 0 lỗi |
| `npm run test:live` (backend thật, cờ bật) | PASS — 0 lỗi |
| `pytest` (backend) | PASS — 673 |
| `npm run lint` / `npm run build` | PASS |
| `npm run test:chat` | PASS — 11/11 |
| `npx playwright test` | PASS — **915/915** |

## Vòng hai: khu quản trị với backend thật

13 route quản trị (`/admin/dashboard`, `users`, `documents`, `questions`, `exams`, `ai`, `website-content`,
`settings`, `feature-flags`, `notifications`, `reports`, `activity-logs`, `audit-logs`) cùng ba trang chi
tiết, thêm một thao tác ghi thật: **khoá rồi mở khoá** tài khoản QA (chỉ thao tác trên tài khoản do bộ kiểm
tự tạo). Kết quả: 0 lỗi console, 0 `pageerror`, 0 phản hồi ≥ 400, 0 tràn ngang, 0 trang trắng; log của
FastAPI cũng không có 4xx/5xx nào trong suốt lượt chạy.

### Lỗi thật tìm được: cột "Hành động" trống cho tới khi tải xong từng dòng

`/admin/users` bắn thêm `GET /admin/users/{id}` cho **mỗi dòng** để lấy ba cột đếm (tài liệu, câu hỏi, AI
usage). Toàn bộ nút thao tác — Sửa, Khóa, Role, Quota, Reset MK, Logout, Xóa — chỉ render khi request đó về.
Stub trả tức thì nên bộ kiểm cũ không thấy; với backend thật quản trị viên nhìn thấy bảng có dữ liệu nhưng
không có nút nào trong khoảng thời gian đó.

Sửa: cột hành động dùng chính dòng danh sách (`rowDetails[item.id] ?? item`) — đúng cách các cột khác trong
file đã làm. `canTouch`/`dangerousSelf`/hộp thoại xác nhận/hộp thoại sửa chỉ đọc `role`, `id`, `status`,
`email`, `full_name`, `current_quota`, đều có sẵn trong `AdminUserSummary`; chỉ ba cột đếm mới cần
`AdminUserDetail` và chúng vẫn được phép hiện `...` trong lúc chờ. Khoá lại bằng bài kiểm trong
`admin-workspace.spec.ts` với route chi tiết **không bao giờ trả về**.

Bài kiểm này ban đầu viết bằng route **không bao giờ trả lời**; ba bài khác trong lượt chạy đầy đủ fail theo
vì request treo vẫn sống sau khi test kết thúc và làm nghẽn worker. Đổi sang `route.abort()`: trang gom chi
tiết bằng `Promise.allSettled` nên hỏng cũng chỉ khiến `rowDetails` rỗng — đúng tình huống cần kiểm — mà
không để lại kết nối treo. Thời gian bài kiểm: 48s xuống 4,5s.

### Bằng chứng bản sửa cờ tính năng ở vòng một có tác dụng

`system_error_logs` trong MongoDB có 48 bản ghi 403 gắn với tài khoản QA — tất cả thuộc lượt chạy **trước**
khi sửa (`/web-knowledge/sources`, `/curriculum-kb/sources`, `/curriculum-kb/crawl-items`, `/me`,
`/me/knowledge`, `/recommendations/me`). Lượt chạy sau khi sửa: **0 bản ghi**. Không chỉ trình duyệt không
thấy lỗi — backend không còn bị gọi.

### Đối chiếu fixture stub với schema thật

So khoá của các fixture trong `admin-workspace.spec.ts` với `model_fields` của Pydantic
(`AdminUserSummary`, `AdminDocumentSummary`, `AdminQuestionSummary`, `AdminExamSummary`,
`UserActivityLogItem`, `AdminAuditLogItem`): khớp hoàn toàn, không thiếu không thừa. Nghĩa là phần bảng có
dữ liệu mà bộ kiểm stub đang bảo vệ vẫn đúng với backend hiện tại.

### Bộ kiểm live trước đây không thể fail

`live-smoke.spec.ts` chỉ `console.log` danh sách vấn đề rồi kết thúc — nghĩa là `npm run test:live` vẫn xanh
kể cả khi có lỗi console hay phản hồi 500; phải đọc log bằng mắt mới biết. Nay `report()` in danh sách **và**
khẳng định nó rỗng; riêng loại `thiếu-dữ-liệu` (bảng rỗng vì DB chưa có gì) chỉ in ra, không làm fail.

## Vòng ba: CRUD xuyên ba lớp

Câu hỏi cần trả lời: dữ liệu có thực sự đi hết **giao diện → API → MongoDB** không, hay chỉ có giao diện và
API đồng ý với nhau?

`e2e/live-crud.spec.ts` chia ba pha `tạo` / `sửa` / `xoá`, chạy xen kẽ với `scripts/qa_crud_check.py` — script
này mở thẳng MongoDB đọc bản ghi sau mỗi pha:

| Pha | Giao diện làm | MongoDB xác nhận |
| --- | --- | --- |
| Tạo | tạo lớp học, ma trận đề (giáo viên), tạo người dùng (quản trị) | ba bản ghi tồn tại, mô tả lưu đúng, `subject_id`/`grade` đúng, **mật khẩu đã băm chứ không lưu thô** |
| Sửa | đổi tên lớp, sửa họ tên người dùng | tên mới có, tên cũ không còn, `full_name` đã đổi |
| Xoá | xoá lớp (gõ "XÓA" xác nhận), xoá người dùng (nhập lý do + email) | lớp biến mất; người dùng `status=deleted` kèm `deleted_at` |

Mỗi lượt chạy gắn một mã riêng (`QA_RUN_ID`) vào tên bản ghi. Không có nó thì lần chạy thứ hai hỏng: email đã
xoá mềm vẫn giữ chỗ trong chỉ mục duy nhất nên không tạo lại được — chính bộ kiểm đầu tiên vấp lỗi này.

Một điểm đáng ghi: xoá người dùng là **xoá mềm**. Bản ghi rời khỏi danh sách mặc định nhưng tra lại được bằng
bộ lọc trạng thái "Đã xóa" — đúng thiết kế để còn khôi phục. Bài kiểm khẳng định đúng hành vi đó thay vì đòi
bản ghi biến mất hẳn.

## Dọn dữ liệu kiểm thử

Đã xoá khỏi MongoDB: 3 tài khoản `qa-live-*`, 5 lớp `QA Live <timestamp>`, 38 `user_activity_logs`,
48 `system_error_logs`, 4 `admin_audit_logs` của thao tác khoá/mở khoá — tất cả đều do bộ kiểm sinh ra.
Chạy lại `--setup` rồi `npm run test:live` từ DB sạch: vẫn 5/5 PASS.

## Kiểm chứng vòng hai

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:live` (13 route quản trị + khoá/mở khoá thật) | PASS — 5/5 |
| `npx playwright test` | PASS — **921/921** |
| `pytest` (backend) | PASS — 673 |
| `npx tsc -b` / `npm run lint` / `npm run build` | PASS |
| `npm run test:chat` | PASS — 11/11 |

Ba bài kiểm cũ hay fail rải rác khi chạy song song sáu project đã được nới hạn chờ lên 15s (thống kê dashboard
quản trị, stagger bảng người dùng, `ErrorState` của audit-logs) — đều là khẳng định chờ dữ liệu bất đồng bộ
với hạn mặc định 5s, không phải lỗi ứng dụng.

## Còn lại

- Chưa chạy thử các luồng tốn hạn mức AI với backend thật: tải học liệu → trích xuất → sinh câu hỏi → chấm
  tự luận. Cần cân nhắc chi phí Gemini/Groq trước khi kiểm.
- `/admin/documents`, `/admin/questions`, `/admin/exams` mới kiểm ở trạng thái **rỗng** với backend thật: DB
  không có học liệu nào, mà tạo học liệu thật thì phải đẩy file lên Cloudinary. Trạng thái có dữ liệu hiện
  dựa vào bộ kiểm stub — đã đối chiếu khoá fixture với schema thật ở trên.
- `/admin/users` vẫn gọi một request chi tiết cho mỗi dòng (13 người dùng = 13 request, tối đa 20 theo trang).
  Bỏ hẳn phải để endpoint danh sách trả sẵn ba số đếm, tức là thêm aggregation ở backend — không làm trong
  đợt QA này.
