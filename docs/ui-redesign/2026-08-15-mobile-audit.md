# Rà soát trải nghiệm di động (2026-08-15)

Câu hỏi cần trả lời: đưa lên hosting rồi, người dùng mở bằng điện thoại thì có dùng được không?

Bộ kiểm thử sẵn có chạy 6 viewport (gồm 360px và 390px) và không bài nào tràn ngang — nhưng "không tràn
ngang" mới là điều kiện cần. Những thứ chỉ hỏng trên máy thật (iOS tự phóng to, ngón tay bấm trượt, tai thỏ
che nội dung, thanh URL ăn mất chiều cao) chưa có gì kiểm.

## Cách đo

`npm run test:mobile` (`playwright.mobile-audit.config.ts` + `e2e/mobile-audit.spec.ts`) chạy trên **backend
thật**, đi 21 route của ba vai trò cộng 6 trang công khai, trên **hai máy**:

- **iPhone 12 / WebKit** — đây mới là nơi luật "chạm vào ô nhập nhỏ hơn 16px thì tự phóng to" áp dụng, và là
  nơi `<select>` bỏ qua kích thước CSS. Cần `npx playwright install webkit`.
- **Pixel 5 / Chromium** — đại diện máy Android.

Mỗi lượt đếm:

- tràn ngang và phần tử rộng hơn màn hình;
- vùng chạm nhỏ hơn 40px (ngưỡng khuyến nghị 44px — Apple HIG, WCAG 2.5.5);
- ô nhập có cỡ chữ dưới 16px — **iOS Safari tự phóng to cả trang khi chạm vào và không thu lại**;
- chữ nhỏ hơn 12px;
- thanh cố định che nội dung cuối trang.

Lần đo đầu: **104 vấn đề**. Sau khi sửa: **25**, và 23 trong số đó là chữ 11px của nhãn phụ (xem "Còn lại") — không còn vùng chạm nhỏ, ô nhập gây phóng to hay tràn ngang.

## Đã sửa

### 1. iOS tự phóng to khi chạm vào ô nhập (20 chỗ)

Nguyên nhân gốc: `:root { font: 15px/1.6 ... }` sót lại từ hệ cũ trong `index.css` khiến cỡ chữ gốc là **15px
chứ không phải 16px**, nên mọi giá trị `rem` của hệ thiết kế nhỏ hơn tài liệu ghi 6,25% (`--ez-text-body`
ghi 16px, thực tế 15px). Cộng thêm các rule riêng của từng trang, ô nhập rơi xuống 15/14/13/11,1px ở 8 file
CSS khác nhau.

Sửa ở biên thay vì vá 8 chỗ — `ui.css` thêm một khối cho thiết bị cảm ứng:

```css
@media (pointer: coarse) {
  input:not([type='checkbox']):not([type='radio']):not([type='range']),
  select, textarea { font-size: max(16px, 1rem) !important; }
}
```

`!important` ở đây không phải để thắng tranh chấp thẩm mỹ mà để chặn cả rule cũ lẫn rule viết sau vô tình rơi
xuống dưới 16px. Dùng `pointer: coarse` chứ không dùng bề rộng: máy tính bảng có bút/chuột không cần nới, còn
điện thoại xoay ngang vẫn cần.

### 2. Vùng chạm dưới 44px (28 chỗ)

Nút mặc định của hệ cao 40px, nút nhỏ 32px, nút tự chế trong khu quản trị và trang công khai 32–39px. Trên
thiết bị cảm ứng tất cả nâng lên 44px: `.ez-btn`, `.ez-btn-sm`, `.ez-btn-icon`, `.ez-checkbox`, `.ez-radio`,
`.ez-chip` trong `ui.css`; `.preset-btn`, `.admin-quick-link`, `.admin-action-btn` trong khu quản trị; nhóm
`.pub-*` và `.ezp-*` của trang công khai.

### 3. Vùng an toàn của iPhone đang bị vô hiệu

Code đã có `env(safe-area-inset-bottom)` ở thanh tab và drawer — nhưng **`env(safe-area-inset-*)` luôn trả 0
nếu thẻ meta viewport không có `viewport-fit=cover`**, mà thẻ này thì không có. Nghĩa là phần chừa chỗ cho
thanh home iPhone chưa từng có tác dụng.

Thêm `viewport-fit=cover`, kèm chừa lề trái/phải cho thanh trên cùng và thanh tab — xoay ngang máy có tai thỏ
thì tai thỏ nằm ở cạnh bên và che mất mục ngoài cùng. Không đặt `maximum-scale`/`user-scalable=no`: người
dùng phải phóng to được (WCAG 1.4.4).

### 4. `100vh` cắt mất phần dưới

Trên di động, `100vh` tính cả vùng bị thanh URL che, nên khối cao "một màn hình" luôn cao hơn phần nhìn thấy.
`app-layout.css` đã có `dvh`; bổ sung cho `body`, `PublicLayout` và hero của trang chủ (hero dùng `svh` —
chiều cao nhỏ nhất — để nút chính luôn nằm trong khung ngay khi mới mở).

### 5. Hàng chọn phong cách trả lời bị bóp vỡ chữ

Bốn lựa chọn ép trong một hàng trên màn 393px khiến nhãn vỡ dòng giữa từ ("Bình / thường"). Cho cả cụm xuống
dòng (`flex-wrap`) và cấm ngắt chữ trong từng nút; trên thiết bị cảm ứng nút cao 44px.

### 6. Chữ dưới 12px (54 chỗ)

31 chỗ đặt `fontSize: '9px' | '10px' | '11px'` **inline trong TSX** ở 16 file (inline style thắng cả CSS nên
không thể sửa từ một chỗ) — nâng hết lên 12px. Thêm nhãn thanh tab dưới cùng 11px → 12px, nhãn nhóm ở sidebar
chat 10px → 12px, và bốn giá trị `0.72rem` trong khu quản trị.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:mobile` (Pixel 5, backend thật) | 104 vấn đề → **25** (0 vùng chạm nhỏ, 0 ô nhập gây zoom, 0 tràn ngang) |
| `npx playwright test` | PASS — 927/927 |
| `npx tsc -b` / `npm run lint` / `npm run build` | PASS |

## Vòng hai — sửa nốt hai khoản nợ đã ghi

### Cỡ chữ gốc trả về 16px

Xoá `font: 15px/1.6` khỏi `:root` (giữ `font-family` và `line-height`). Từ nay `1rem = 16px`, tức mọi token
trong `tokens.css` đúng bằng con số ghi trong chú thích, và người dùng chỉnh cỡ chữ mặc định của trình duyệt
thì giao diện theo đúng — trước đây bị ghi đè.

Cả chữ lẫn khoảng cách phóng to 6,7% trên toàn ứng dụng. Đây là thay đổi rộng nên đo lại toàn bộ: **927/927**
bài Playwright vẫn xanh (gồm kiểm tràn ngang ở 6 viewport, hẹp nhất 360px), `npm run test:live` 5/5 với backend
thật, `build` sạch.

Bốn chỗ phát sinh do chữ to hơn, đã sửa:

| Chỗ | Vấn đề | Sửa |
| --- | --- | --- |
| `.ez-chat-mobile-bar` | ba nhãn dài đẩy cột chat rộng 408px trong khung 390px, mép phải bị cắt | cho xuống dòng, và thêm `minWidth: 0` cho flex item (`chatArea`) |
| `<select>` trên Safari | WebKit bỏ qua `padding`/`min-height` khi `appearance: auto`: ô lọc cao 27px dù CSS đặt 44px (Chrome ra 46px) | `appearance: none` + mũi tên tự vẽ, đặt trên chính `select` nên phủ cả 12 ô thô lẫn 36 ô dùng component |
| ô nhập | mới đặt cỡ chữ, chưa đặt chiều cao | thêm `min-height: 44px` |

### Kiểm bằng Safari thật

Đã cài WebKit; bộ audit chạy song song hai máy. Số vấn đề gộp hai máy: **42**, trong đó 38 là chữ 11px của
nhãn phụ và 4 là khối trang trí `.pub-blob` (đã bị khối cha cắt, không gây tràn). **0 vùng chạm nhỏ, 0 ô nhập
gây phóng to, 0 tràn ngang** trên cả hai.

## Còn lại

- **23/25 vấn đề còn lại là chữ 11px của nhãn phụ**: chữ viết tắt trong avatar (11px trong hình tròn 28px, có
  tính trang trí) và mốc thời gian trong khu quản trị (11,7px). Không chặn dùng.
- Vẫn là **giả lập**, chưa phải điện thoại vật lý. WebKit của Playwright rất sát Safari nhưng không thay được
  một lần thử trên máy thật, nhất là phần bàn phím ảo che ô nhập.
- `.pub-blob` rộng 420px trên màn 393px: khối trang trí đã bị `overflow: hidden` của khối cha cắt, không gây
  tràn trang.
