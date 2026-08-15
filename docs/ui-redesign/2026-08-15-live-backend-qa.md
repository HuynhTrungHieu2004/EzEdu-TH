# QA với backend thật (2026-08-15)

Mọi lần kiểm thử trước đó đều chạy với API **giả lập** (`stubApi` của Playwright). Lần này chạy FastAPI thật
trên MongoDB thật để xem stub đang che giấu điều gì.

## Cách chạy

- Backend: `uvicorn app.main:app --port 8000` — `/health/ready` báo `mongodb`, `chromadb`, `gemini`, `groq`
  đều healthy.
- Frontend: dev server ở cổng **5173** (nằm trong `BACKEND_CORS_ORIGINS`; cổng khác sẽ bị CORS chặn),
  `VITE_API_BASE_URL=http://127.0.0.1:8000`.
- Tài khoản: đăng ký mới `qa-live-lecturer@example.com` / `qa-live-student@example.com` qua chính API đăng ký
  (mật khẩu `QaLive#2026`) — dữ liệu cũ trong DB không có mật khẩu đã biết.
- Lệnh: `npm run test:live` (`playwright.live.config.ts` + `e2e/live-smoke.spec.ts`). Bộ này bị loại khỏi
  `npx playwright test` thường vì cần backend đang chạy.

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

## Còn lại

- Chưa chạy thử các luồng tốn hạn mức AI với backend thật: tải học liệu → trích xuất → sinh câu hỏi → chấm
  tự luận. Cần cân nhắc chi phí Gemini/Groq trước khi kiểm.
- Khu quản trị chưa kiểm bằng backend thật: DB có tài khoản admin nhưng không biết mật khẩu, và tự nâng
  quyền một tài khoản là thao tác ghi vào dữ liệu thật nên không tự làm.
- Hai tài khoản `qa-live-*@example.com` vẫn còn trong DB (đã dùng để kiểm). Xoá lúc nào cũng được.
