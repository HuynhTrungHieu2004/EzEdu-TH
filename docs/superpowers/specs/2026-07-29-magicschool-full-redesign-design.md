# EzEdu AI — Thiết kế lại toàn bộ theo phong cách MagicSchool.ai

- **Ngày:** 2026-07-29
- **Yêu cầu:** "Không chỉ màu sắc mà tôi muốn giống toàn bộ bố cục và thiết kế của trang web" (MagicSchool.ai), sau đợt đổi màu chủ đạo/phụ sang bảng MagicSchool đã xong trước đó.
- **Nguồn tham khảo:** `https://magicschool.ai` — đã browse trực tiếp bản live (không dùng tài liệu "18 nguyên tắc" cũ, vì đợt đó chỉ mượn cấu trúc UX, không mượn phong cách thị giác thật).
- **Phạm vi quyết định qua hỏi-đáp với người dùng (không suy diễn):**
  1. Áp dụng cho **toàn bộ app** (public + dashboard/admin/teacher/student), không chỉ trang công khai.
  2. Giống **hết tinh thần thị giác** MagicSchool (gradient tươi sáng, bo tròn lớn, pill nav/button, banner thông báo) — không chỉ lấy cấu trúc rồi giữ nguyên phong cách tối giản cũ.
  3. **Sao y toàn bộ cấu trúc section** của trang chủ MagicSchool, kể cả phần chưa khớp tính năng thật của EzEdu (sẽ xử lý riêng, xem mục "Nội dung theo section").
  4. Nội bộ (admin/dashboard) đồng bộ **cùng mức độ** màu sắc/bo tròn/pill như trang công khai, không tách biệt hai phong cách.
  5. Ảnh minh họa người: **hoạt hình/đồ họa flat, nhiều màu, phong cách kiểu Canva** — không phải ảnh chụp thật, không phải vector line-art tối giản đang có.
  6. Cách triển khai: **Phương án A — big-bang**, làm toàn bộ trong một lượt, không tách nhiều spec/nhiều lần duyệt theo khu vực.

---

## 1. Nền tảng design system (`tokens.css` + `components/ui/`)

| Hạng mục | Hiện tại | Đổi thành |
|---|---|---|
| Radius input/button | 10px | 16–20px |
| Radius card | 14–20px | 24–28px |
| Radius nav/button chính | — | pill `9999px` |
| Shadow | Rất tiết chế | Giữ nguyên — MagicSchool cũng không lạm dụng shadow, tách lớp bằng màu/bo góc |
| Gradient | Không có token riêng | Thêm `--ez-gradient-hero` (cam→hồng→tím, dùng đúng bảng màu MagicSchool đã đổi ở `tokens.css`), `--ez-gradient-cta` |
| Type hero | Thang hiện có (64/40/32...) | Giữ font Inter (đã quyết định trước, không đổi font), tăng độ "chunky" (weight 800, bo tròn hình khối xung quanh) |
| Component mới | — | `SparkleIcon`/`StarShape` (SVG tự vẽ nhiều biến thể), `AnnouncementBar`, `PillNav` |
| Component sửa | `Button` | Thêm size `hero` (to, bo tròn hết cỡ) |
| Component sửa | `Card`/`Badge`/`StatTile` | Thêm variant bo góc lớn, dùng chung cho cả admin lẫn public (đồng bộ theo quyết định #4) |

Không đổi: font family, hệ thống 3 tầng token (primitive→semantic→alias), spacing 4px, breakpoint.

## 2. Asset gốc — không sao chép tài sản có bản quyền của MagicSchool

- Sparkle/sao/blob: tự vẽ SVG mới (cùng cách `HeroArt.tsx` hiện đang tự vẽ sơ đồ), nhiều biến thể xoay/kích thước.
- Minh họa người: **nhân vật hoạt hình flat, màu tươi sáng, phong cách kiểu Canva** — vẽ bằng SVG component gốc (không dùng ảnh chụp thật, không tải bất kỳ file từ magicschool.ai).
- Không copy CSS, không copy màu ngoài phạm vi đã tự tính lại, không copy bố cục pixel-perfect từng phần tử — chỉ mượn **cấu trúc section + tinh thần thị giác**, dựng lại bằng component/asset gốc của EzEdu.

## 3. Nội dung theo section (trang chủ — sao y cấu trúc, đổi nội dung thật)

Thứ tự section giữ đúng như MagicSchool:

1. `AnnouncementBar` — banner trên cùng (nội dung lấy từ CMS `website_content`, có thể ẩn nếu không có tin)
2. Header `PillNav`
3. Hero — headline lớn + minh họa hoạt hình + 2 CTA
4. "Được xây cho việc học" — 3 trụ đối tượng: **giáo viên / học sinh / quản lý lớp học** (thay "quản lý cấp Sở/quận" vì EzEdu không có sản phẩm cấp Sở — không bịa tính năng không tồn tại)
5. Khối AI cho giáo viên — dùng đúng danh sách công cụ thật đang có trong `toolRegistry.ts`
6. Khối AI cho học sinh — dùng đúng công cụ thật đang có
7. Số liệu — **chỉ dùng số liệu thật** lấy được (vd từ admin dashboard/API thống kê công khai nếu có); nếu không có nguồn thật thì **ẩn khối này**, không bịa %
8. Testimonial — **để trống/ẩn** cho tới khi có quote thật từ người dùng thật; không tự tạo lời chứng thực giả
9. Trust & Safety — chỉ liệt kê đúng cơ chế bảo mật EzEdu thực sự có (vd RBAC, soft-delete có audit log); **không tự nhận chứng chỉ SOC2/FERPA/COPPA** vì chưa qua kiểm định
10. Tích hợp (Google Classroom/Canvas...) — EzEdu chưa có, section này **ẩn hoặc đổi thành "Sắp ra mắt"**, không bịa tích hợp chưa tồn tại
11. CTA cuối + Footer nhiều cột

App nội bộ (dashboard/admin/teacher/student): áp `PillNav` + card bo tròn lớn + gradient nhẹ ở phần chrome/header/stat tile. **Không viết lại cấu trúc `DataTable`/`FormField`/logic nghiệp vụ** — chỉ đổi token màu/bo góc mà các component này đang tham chiếu.

## 4. Phạm vi file

| Nhóm | Số file ước tính | Cách làm |
|---|---|---|
| Foundation (`tokens.css`, `components/ui/*`) | ~30 (sửa), 3–4 (mới) | Làm tay, tuần tự, trước tiên |
| `pages/landing/*` + `LandingPage.tsx`, `PublicInfoPages.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `PublicLayout.tsx` | ~17 | Viết lại theo cấu trúc mục 3, sau khi foundation xong |
| App chrome: `AppLayout.tsx`, sidebar, route guard wrapper style | ~3 | Sửa tay |
| Dashboard: `DashboardPage.tsx`, `TeacherDashboardPage.tsx`, `StudentDashboardPage.tsx` | 3 | Sửa tay |
| 19 trang admin, 6 trang teacher, 4 trang student, ~15 trang public phụ | ~44 | Tự động ăn theo token mới vì đã 100% dùng `components/ui/` (đợt migrate trước) — chỉ cần rà lại điểm nào còn CSS riêng không qua token |

## 5. Rollout & verify

1. Foundation trước (tay, tuần tự) — token + component mới.
2. Fan-out song song (Agent fleet, giống đợt migrate 10 trang admin trước) viết lại `pages/landing/*` theo cấu trúc mục 3, và cập nhật `AppLayout`/dashboard chrome.
3. Rà lại các trang còn CSS riêng chưa qua token (nếu phát hiện, vá riêng).
4. Verify: `tsc -b --force`, `eslint .`, `npm run build`, Playwright full suite (438 test hiện có — ảnh cũ trong `docs/ui-redesign/screenshots/` sẽ lệch nhiều do đổi bo góc/gradient, không phải regression).
5. Xem trực tiếp bằng browser (landing + 1 dashboard + 1 trang admin) trước khi báo hoàn thành.
6. Axe accessibility re-check bắt buộc vì gradient/nền mới có thể đổi tương phản chữ — áp lại logic "chữ gần đen trên nền sáng" đã dùng khi đổi màu trước đó nếu cần.

## 6. Việc không làm (out of scope, để tránh phạm vi phình to)

- Không đổi font family.
- Không đổi nội dung/logic nghiệp vụ của `DataTable`/`FormField`/admin actions.
- Không tự bịa số liệu, testimonial, chứng chỉ bảo mật, tích hợp chưa có thật.
- Không tải/sao chép file ảnh, SVG, hoặc CSS trực tiếp từ magicschool.ai.
