# Máy chủ ngủ trên gói miễn phí Render

## Chuyện gì xảy ra

Render tắt web service sau **15 phút** không có request. Lần gọi kế tiếp phải chờ
**một đến hai phút** để container khởi động lại — đo thật ngày 16/08/2026 là 105 giây.

Render có trang chờ riêng, nhưng người dùng EzEdu không bao giờ thấy nó: frontend
nằm ở Netlify và gọi API bằng XHR, không phải điều hướng trình duyệt. Nên với
người dùng, ứng dụng chỉ đứng im — họ bấm lại, tải lại trang, rồi bỏ đi.

Hai lớp xử lý, độc lập nhau:

## Lớp 1 — Nói cho người dùng biết

`frontend/src/api/serverWaking.ts` đếm số request đang treo. Quá **4 giây** thì
`ServerWakingNotice` hiện dải thông báo trên đầu màn hình:

> Máy chủ đang khởi động lại, thường mất một đến hai phút. Bạn không cần tải lại trang.

Chỉ báo, không huỷ và không thử lại — request vẫn chạy và sẽ trả về khi máy chủ
sẵn sàng. Bộ đếm gỡ ở cả nhánh thành công lẫn nhánh lỗi (`client.ts`), nếu chỉ gỡ
ở nhánh thành công thì một request hỏng sẽ làm thông báo treo vĩnh viễn.

Lớp này luôn đúng kể cả khi lớp 2 bị tắt hoặc GitHub Actions trễ lịch.

## Lớp 2 — Giữ máy chủ thức trong giờ hoạt động

`.github/workflows/giu-backend-thuc.yml` gọi `/health/ready` mỗi 10 phút, từ
**06:00 đến 23:00 giờ Việt Nam**.

Không chạy 24/7 vì Render cấp **750 giờ instance mỗi tháng cho cả workspace**.
Thức suốt ngày đêm tốn ~730 giờ — vừa khít, không còn chỗ cho dịch vụ nào khác,
và hết hạn mức thì Render tạm dừng dịch vụ tới tháng sau. Lịch 06:00–23:00 tốn
khoảng **520 giờ**, còn dư ~230.

Workflow kiêm luôn giám sát: nó fail (và GitHub gửi email) khi `/health/ready`
không trả 200, hoặc khi có dịch vụ phụ thuộc nào không `healthy` — `/health/ready`
vẫn trả 200 kể cả lúc Mongo hay Gemini hỏng, nên bước thứ hai đọc chi tiết trong
JSON.

Muốn tắt: **Actions → "Giữ backend thức" → Disable workflow**.
Bấm chạy thử: **Run workflow** (đã bật `workflow_dispatch`).

## Ngoài giờ

Từ 23:00 tới 06:00 máy chủ vẫn ngủ. Người vào lúc đó chờ 1-2 phút và thấy thông
báo ở lớp 1. Đây là đánh đổi có chủ ý, không phải thiếu sót.

## Khi nào nên bỏ hai lớp này

Nâng Render lên gói trả phí (từ 7 USD/tháng) thì máy chủ không ngủ nữa. Lúc đó:

- Xoá `.github/workflows/giu-backend-thuc.yml` — không còn tác dụng gì.
- Giữ `ServerWakingNotice` — vẫn hữu ích khi backend deploy lại hoặc mạng chậm.
