# Lát 7 — Trang công khai, đăng nhập/đăng ký, onboarding (2026-08-14)

Bước 7 trong lộ trình `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10,
tiếp sau lát 6 (`2026-08-14-slice6-admin-verification.md`). Đây là lát cuối trước khi xoá CSS legacy.

## Đã làm

- **Trang công khai về cùng hướng thị giác với app.** `--ez-gradient-hero` và `--ez-gradient-cta` trước đây
  còn neo vào thang forest/coral của hệ cũ nên landing và login nhìn lệch hẳn với khung sau đăng nhập. Nay
  hai token này là navy mực → teal khoáng (có biến thể dark). `.ezp-section-dark` cũng bỏ `--ez-neutral-900`
  (tím) và eyebrow bỏ `--ez-coral-300`, chuyển sang `--ez-nav-bg` + `--ez-accent`.
- **Đăng nhập/đăng ký dựng lại theo spec §6.2.** Bố cục hai vùng: vùng thương hiệu navy (ẩn dưới 900px, chỉ
  là trang trí nên `aria-hidden`) và vùng form dùng `Card`/`FormField`/`Input`/`Select`/`Alert`/`Button` —
  bỏ hết `.auth-page`, `.auth-card`, `.form-input`, `.alert alert-error` của CSS legacy.
- **Lỗi hiện cạnh từng trường.** Trước đây mọi lỗi nhập liệu gộp thành một dòng đỏ trên đầu form
  ("Mật khẩu phải chứa ít nhất 6 ký tự", "Mật khẩu xác nhận không khớp"). Nay mỗi lỗi nằm cạnh đúng trường
  gây ra nó, kèm `aria-invalid` và `aria-describedby` do `FormField` nối sẵn. Lỗi từ server vẫn là `Alert`
  trên đầu form vì nó không thuộc riêng trường nào.
- **Narrative motion theo cuộn (spec §7.2).** Thêm `src/motion/ScrollReveal.tsx` — đăng ký `ScrollTrigger`
  một lần, mọi tween nằm trong scope nên rời trang là `useGSAP` revert cả trigger. Landing dùng nó cho từng
  khối dưới hero, và stagger theo `.ezp-step`/`.ezp-card`/`.ezp-stat` ở các khối nhiều mục. Reduced motion
  không tạo trigger nào: nội dung hiện sẵn, không phải cuộn mới thấy.
- **Error boundary cho trang công khai** (nợ từ lát 6): `PublicLayout` và landing đều được bọc, nên nội dung
  CMS lỗi định dạng không làm trắng trang chủ.
- **Onboarding học sinh** đổi nút và thông báo sang `Button`/`Alert` dùng chung. Đường thoát "Để sau" giữ
  nguyên và có test khoá lại.

## Sửa thêm một lỗi legibility

`.ezp-header` dính trên cùng với nền `color-mix(... 92%, transparent)` không có backdrop blur, nên khi cuộn,
chữ của section bên dưới hằn qua thanh header (thấy rõ trong ảnh chụp trước khi sửa). Đổi thành nền đục hẳn.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run build` | PASS (vẫn cảnh báo chunk > 500 kB) |
| `npm run test:foundation` | PASS — 438/438 trên 6 project viewport (đã thêm `e2e/public-experience.spec.ts`) |
| `npx playwright test e2e/authenticated-responsive.spec.ts` | PASS — 300/300 |
| `npx playwright test e2e/public-responsive.spec.ts` | PASS — 60/60 (chạy với `VITE_GOOGLE_CLIENT_ID=""`, xem nợ) |
| `npm run test:chat` | PASS — 11/11 |

`e2e/public-experience.spec.ts` khoá: landing dùng navy `rgb(18, 50, 65)` + teal `rgb(15, 111, 104)` và
không còn forest `rgb(29, 59, 44)`; khối reveal xong thì `opacity: 1` và không giữ transform; reduced motion
hiện sẵn khối cuối trang mà không cần cuộn; đăng nhập/đăng ký báo lỗi cạnh từng trường (và **không** báo lỗi
cho trường đã hợp lệ); axe A/AA sạch trên `/`, `/login`, `/register`; onboarding còn nút "Để sau".

Một test cũ phải sửa kỳ vọng: `public-responsive.spec.ts` chờ h1 "Đăng nhập EzEdu AI"/"Đăng ký EzEdu AI".
Tiêu đề mới là "Đăng nhập"/"Đăng ký" — tên sản phẩm đã có ở header và vùng thương hiệu, không lặp lại trong
tiêu đề form.

## Nợ còn lại

- **Onboarding chưa phải stepper.** Spec §6.3 muốn stepper có quay lại và lưu theo từng bước; hiện vẫn là một
  form dài, chỉ lưu một lần khi bấm "Lưu và bắt đầu học". Cần một lát riêng vì phải thêm API lưu từng bước.
- `e2e/public-responsive.spec.ts` vẫn fail 18 test khi máy có `frontend/.env` chứa `VITE_GOOGLE_CLIENT_ID`:
  Google GSI log `The given origin is not allowed for the given client ID` vì test chạy trên
  `http://127.0.0.1:4173`. Cách sửa thật: thêm origin đó vào Authorized JavaScript origins của client ID.
  Không che log này trong helper vì như vậy sẽ ẩn cả lỗi thật của thư viện.
- Landing chưa có pinned data pipeline (`Học liệu → Trích xuất → K-Means → Ngân hàng → CP-SAT → Bộ đề`) mà
  spec §7.2 mô tả; hiện chỉ có reveal theo khối và stagger card.
- Nợ từ các lát trước: các trang giáo viên chưa di trú, `FileUpload` tạo hình cũ, mật độ
  `KnowledgeScopeSelector` trên mobile, `ProcessTimeline`, `PathnameNavigationEpoch`.

## Hoãn sang lát sau

- Lát 8: xoá CSS legacy trong `src/index.css` (2905 dòng). Lát này đã bỏ thêm các consumer `.auth-*`,
  `.form-input`, `.alert alert-*` của hai trang xác thực — cần rà lại danh sách consumer trước khi xoá.
- Lát 9: QA toàn hệ thống và tinh chỉnh motion.
