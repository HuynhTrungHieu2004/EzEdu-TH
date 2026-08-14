# Lát 3 — Dashboard và chat ôn tập học sinh (2026-08-14)

Lát tiếp theo của `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10 bước 3,
làm trên nền foundation đã merge (`merge: nền tảng thị giác học thuật, motion GSAP và AppShell theo vai trò`).

## Đã làm

- **Banner dashboard theo hướng học thuật.** Thêm token `--ez-gradient-shell` (navy mực → teal khoáng, có
  biến thể dark) và cho `.ez-dashboard-banner` dùng token này thay `--ez-gradient-cta` (forest, hệ cũ).
  `--ez-gradient-hero`/`--ez-gradient-cta` giữ nguyên cho landing/auth vì các trang đó thuộc lát 7.
- **Trang chiếm hết khung (`.ez-page-fill`).** Trang chat trước đây tự đặt `height: 100svh`; cộng thêm
  padding của `.ez-main`, topbar và tab bar thì ô nhập câu hỏi bị đẩy xuống dưới màn hình (đo được
  854px trên viewport 844px). Nay shell khoá chiều cao khi có trang `.ez-page-fill`, danh sách tin nhắn
  là vùng cuộn duy nhất.
- **Chat có bố cục mobile thật.** Dưới 1024px, danh sách hội thoại và panel nguồn trích dẫn không còn bị
  bóp còn ~90px; chúng vào drawer, mở từ hai nút "Hội thoại"/"Nguồn trích dẫn". Bấm một trích dẫn trên
  mobile sẽ tự mở drawer nguồn.
- **Chuyển động dashboard học sinh.** Nhóm hành động nhanh và bốn stat tile vào theo stagger; số liệu dùng
  `AnimatedCounter`. Reduced motion hiển thị ngay giá trị cuối, không giữ transform.
- **Thẻ tạo đề ôn tập vào theo timeline.** `StudyExamCard` vào bằng `useGSAP` (thẻ trước, các trường chọn
  stagger sau), reduced motion hiện ngay. Sửa luôn vòng polling: phụ thuộc `request.id` thay vì cả object
  nên interval không còn bị hủy/tạo lại sau từng nhịp 1,5s.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run build` | PASS (vẫn cảnh báo chunk > 500 kB như trước, không đổi exit code) |
| `npm run test:foundation` | PASS — 258/258 trên 6 project viewport (đã thêm `e2e/student-dashboard-chat.spec.ts` vào gate) |
| `npx playwright test e2e/authenticated-responsive.spec.ts` | PASS — 300/300 |
| `npm run test:chat` | PASS — 11/11 |

Hợp đồng mới được test khoá lại trong `e2e/student-dashboard-chat.spec.ts`:

- ô nhập câu hỏi nằm trong viewport, không tràn dọc/ngang (desktop, tablet, mobile);
- 1024px là mốc chuyển ba cột ↔ drawer, drawer đóng được bằng Escape;
- banner dashboard dùng đúng navy `rgb(18, 50, 65)` và teal `rgb(15, 111, 104)`;
- stat tile đếm tới giá trị thật và không giữ transform sau khi chạy;
- reduced motion hiện ngay số liệu.

## Nợ còn lại

- `e2e/public-responsive.spec.ts` fail 18/… khi máy có `frontend/.env` chứa `VITE_GOOGLE_CLIENT_ID`:
  Google GSI log `The given origin is not allowed for the given client ID` vì test chạy trên
  `http://127.0.0.1:4173`. Không liên quan tới lát này — chạy lại với `VITE_GOOGLE_CLIENT_ID=""` thì
  10/10 PASS. Cách sửa thật: thêm `http://127.0.0.1:4173` vào Authorized JavaScript origins của client ID.
- `KnowledgeScopeSelector` + `DocumentSelector` chiếm ~280px chiều cao trên mobile trước khi tới hội thoại;
  cần rút gọn mật độ (chưa làm, không chặn).
- `ProcessTimeline` theo spec §7.4 chưa có: thẻ tạo đề vẫn dùng spinner cho trạng thái pending/running.
- `PathnameNavigationEpoch` (foundation) reset trạng thái thu gọn nhóm nav mỗi lần điều hướng bằng cách bọc
  `UNSAFE_NavigationContext` của React Router — 75 dòng cho một hành vi kế hoạch không yêu cầu, và người
  dùng mất lựa chọn thu gọn của mình. Nên xét lại khi làm lát quản trị.

## Hoãn sang lát sau

- Lát 4: luồng làm bài và kết quả.
- Lát 5/6: trang giáo viên và quản trị.
- Lát 7: landing, login/register, onboarding — vẫn dùng hệ thị giác cũ.
- Lát 8: xóa CSS legacy trong `src/index.css` (2905 dòng) sau khi rà hết consumer.
