# Lát 10 — Trả hết nợ sau lộ trình redesign (2026-08-15)

Lộ trình 9 lát ở `docs/superpowers/specs/2026-08-14-professional-motion-redesign-design.md` §10 đã xong;
báo cáo lát 9 để lại bảy khoản nợ. Lát này xử lý hết bảy khoản, theo đúng thứ tự đã ghi.

## 1. Onboarding học sinh thành stepper (spec §6.3)

Trước: một form dài, cuộn hết bốn nhóm lựa chọn mới bấm lưu, tải lại trang là mất sạch.

Nay: bốn bước (`Lớp hiện tại → Điểm mạnh → Điểm yếu → Tổ hợp ôn thi`) dùng `ProgressSteps`, đi lui được, mỗi
bước ghi nháp vào `localStorage` nên đóng tab hay bấm "Để sau" rồi quay lại vẫn còn nguyên lựa chọn. Chỉ hai
bước có ràng buộc thật (lớp, tổ hợp) — hai bước môn được phép bỏ trống.

`ponytail:` nháp nằm ở máy người dùng, không lưu server. Backend bắt buộc `target_exam_combinations` có ít
nhất một phần tử, nên hồ sơ dở dang không ghi vào hồ sơ thật được; muốn lưu nháp phía server phải thêm chỗ
chứa riêng — chưa đáng làm cho một form bốn bước.

## 2. Dây chuyền dữ liệu ghim theo cuộn (spec §7.2)

`components/public/DataPipeline.tsx`: sáu công đoạn `Học liệu → Trích xuất → K-Means → Ngân hàng → CP-SAT →
Bộ đề`. Từ 1024px trở lên khối được ghim (`ScrollTrigger` pin + scrub) và một gói dữ liệu màu vàng chạy dọc
dây chuyền theo tiến độ cuộn, mỗi công đoạn sáng lên khi gói đi qua. Dùng `gsap.matchMedia()` nên dưới
1024px hoặc khi giảm chuyển động thì không ghim, không scrub — sáu công đoạn hiện sẵn dạng danh sách.

## 3. Di trú nốt các trang còn dùng CSS và biến hệ cũ

Đo lại thì phạm vi nhỏ hơn ghi ở lát 5: `ClassesPage` và `WebKnowledgePage` đã sạch từ trước,
`QuestionSetEditorPage` chỉ khớp nhầm chữ `tag` trong `tagsText`.

| Chỗ sửa | Việc đã làm |
| --- | --- |
| `FileUpload` | `Card`/`Alert`/`Button` + `file-upload.css` riêng, bỏ `.upload-*`, `.btn-primary btn-full` |
| `ClassDetailPage` | 28 class legacy → `PageHeader`/`Card`/`DataTable`/`EmptyState`/`Badge` + `class-detail.css` |
| `QuestionHistoryPage` | 21 biến hệ cũ (`--accent`, `--muted`, `--modal-bg`…) → token `--ez-*`; nút legacy → `Button` |
| `ExamBlueprintDetailPage` | `.data-table`/`.table-wrapper` → `.ez-datatable`/`.ez-datatable-wrap` |

Sau đó quét lại CSS chết: **42 rule** nữa bị xoá. `index.css` còn **1859 dòng / 164 class** (đầu lát 8 là
2905 dòng / 258 class).

## 4. Bộ kiểm thử không còn phụ thuộc Google client ID

`playwright.config.ts` đặt `VITE_GOOGLE_CLIENT_ID: ''` cho dev server của test. Trước đây máy nào có client
ID thật trong `.env` thì GSI log `The given origin is not allowed for the given client ID` và 18 bài
"không lỗi trình duyệt" fail. Bộ kiểm thử không dùng đăng nhập Google, nên chạy với client ID rỗng: nút hiện
đúng trạng thái "chưa cấu hình" và console sạch. Không che log trong helper — lỗi thật của thư viện vẫn hiện.

## 5. Tách vendor, hết cảnh báo chunk lớn

Route đã lazy-load từ trước nhưng React + Router + GSAP + icon vẫn nằm chung chunk 632 kB.
`vite.config.ts` thêm `manualChunks`:

| Chunk | Kích thước |
| --- | ---: |
| `index` | 632 kB → **317 kB** |
| `vendor-react` | 179 kB |
| `vendor-gsap` | 121 kB |
| `vendor-http` | 44 kB |
| `vendor-router` | 43 kB |
| `vendor-icons` | 23 kB |

Build không còn cảnh báo `chunks are larger than 500 kB`. Mã ứng dụng đổi thường xuyên không còn làm mất
cache của vendor gần như không đổi.

## 6. Bỏ `PathnameNavigationEpoch`

Xoá 75 dòng bọc `UNSAFE_NavigationContext` của React Router. Nó tồn tại để reset trạng thái thu gọn nhóm nav
sau **mọi** lượt điều hướng — kể cả lượt bị suspend — trong khi kế hoạch chỉ yêu cầu "nhóm chứa route đang
mở thì bung".

Quy tắc mới, gọn hơn và tôn trọng người dùng hơn: lựa chọn thu gọn được giữ nguyên khi điều hướng; chỉ nhóm
chứa route vừa mở mới bung lại (vì đóng nhóm đang xem thì không thấy mình đang ở đâu). Bài kiểm cũ
"opens groups after fast Back from suspended content navigation" được thay bằng bài kiểm cho hành vi mới.
Trạng thái này không lưu qua reload — mặc định bung lại, đúng như trước.

## 7. Mật độ chat trên mobile

`KnowledgeScopeSelector` + `DocumentSelector` chiếm ~280px chiều cao trước khi tới hội thoại. Dưới 1024px hai
khối này vào drawer, mở bằng nút "Phạm vi kiến thức" trên thanh mobile — cùng cơ chế đã dùng cho "Hội thoại"
và "Nguồn trích dẫn" ở lát 3, không thêm hook hay breakpoint JS nào.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npx tsc -b --force` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — **không còn cảnh báo chunk** |
| `npm run test:chat` | PASS — 11/11 |
| `npx playwright test` (toàn bộ, 6 project viewport) | PASS — **876/876** |

## Nợ còn lại

- Chưa đo FPS trên máy thật (spec §11 "animation kiểm tra trên thiết bị yếu"): mới có nhánh `coarsePointer`
  và chạy đủ ở viewport mobile-360/390.
- Ảnh so sánh trước/sau mới có cho chat, dashboard học sinh, kho học liệu.
- `index.css` còn 1859 dòng: phần lớn là biến alias hệ cũ và style của các trang admin/chat còn dùng chúng.
  Xoá tiếp phải đi cùng việc di trú từng trang, không nên xoá theo lô.
