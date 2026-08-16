# Thông báo lưu trữ dữ liệu trên trình duyệt (2026-08-16)

## Vì sao không làm banner cookie kiểu magicschool.ai

Yêu cầu ban đầu là banner "Accept All / Customize / Reject All". Rà soát mã nguồn cho thấy làm vậy sẽ là
thông báo sai sự thật:

| Kiểm | Kết quả |
| --- | --- |
| `document.cookie` trong frontend | **0 chỗ** |
| Backend đặt cookie (`set_cookie`) | **không** |
| Analytics: GA, GTM, Plausible, PostHog, Mixpanel, Hotjar, Sentry, pixel | **không có cái nào** |
| Lưu trên trình duyệt | chỉ `localStorage`: token đăng nhập, giao diện sáng/tối, nháp onboarding, công cụ hay dùng |
| Script bên thứ ba | đúng một: Google Identity Services, chỉ nạp ở trang có nút đăng nhập Google |

Không có tracker nào để từ chối. Một nút "Reject All" sẽ không thay đổi điều gì — đó là hộp thoại trang trí,
và còn tệ hơn im lặng vì nó ngụ ý có hoạt động theo dõi đang diễn ra.

Nên phạm vi rút về: **thông báo trung thực**, không có cơ chế chặn giả.

## Hành vi

Dải thông báo ở đáy màn hình, hiện trên mọi trang, **không chặn thao tác**. Người dùng đọc và dùng app bình
thường ở phía sau.

- Nút **"Đã hiểu"** → ẩn vĩnh viễn, ghi `localStorage['ez-data-notice-v1'] = 'ack'`
- Liên kết **"Chi tiết"** → `/chinh-sach-du-lieu`
- Không bấm gì → lần mở sau vẫn hiện

Khoá có số phiên bản: sửa nội dung chính sách sau này thì đổi sang `v2`, thông báo hiện lại cho người đã đọc
bản cũ.

## Nội dung

> Trang này lưu một ít dữ liệu ngay trên trình duyệt của bạn để giữ đăng nhập và nhớ tuỳ chọn hiển thị.
> Không dùng cookie quảng cáo hay theo dõi. — [Chi tiết] [Đã hiểu]

## Trang `/chinh-sach-du-lieu`

Dùng lại `PublicInfoShell` trong `pages/PublicInfoPages.tsx` (đang phục vụ ba trang FAQ / Tính năng / Cách
hoạt động) nên có sẵn header, footer và nội dung nhận diện lấy từ CMS.

Nội dung: bảng bốn khoá `localStorage` đang dùng kèm mục đích; cách xoá; một đoạn về Google Sign-In; một đoạn
nói rõ dữ liệu nghiệp vụ (học liệu, câu hỏi, bài làm) nằm ở máy chủ chứ không ở trình duyệt.

## Kỹ thuật

| Tệp | Việc |
| --- | --- |
| `components/DataNotice.tsx` | dải thông báo; đọc/ghi khoá; dùng `Button` sẵn có |
| `components/data-notice.css` | định vị đáy màn hình, chừa vùng an toàn và thanh tab trên di động |
| `pages/PublicInfoPages.tsx` | thêm `DataPolicyPage` dùng `PublicInfoShell` |
| `App.tsx` | thêm route `/chinh-sach-du-lieu`; gắn `<DataNotice />` ngoài `<Routes>` |

Gắn ngoài `Routes` để không dựng lại mỗi lần chuyển trang.

### Ràng buộc trên di động

Thanh tab dưới cùng (`.ez-tabbar`) cao 60px cộng `env(safe-area-inset-bottom)`. Dải thông báo phải nằm **trên**
nó, không đè. Ở màn rộng từ 1024px không có thanh tab nên chỉ cần chừa vùng an toàn.

### Khả năng tiếp cận

`role="region"` với `aria-label`, không phải `dialog` — vì nó không chặn và không giam focus. Vùng chạm 44px
theo đúng khối `@media (pointer: coarse)` đã có trong `ui.css`.

## Kiểm thử

`e2e/data-notice.spec.ts`, chạy trong bộ stub thường:

1. Lần đầu vào trang: thông báo hiện.
2. Bấm "Đã hiểu" → biến mất; tải lại trang vẫn ẩn.
3. Ở 360px: không đè lên thanh tab (so sánh toạ độ hai khối).
4. Trang `/chinh-sach-du-lieu` mở được, không tràn ngang, axe sạch.

## Cố ý không làm

- **Không có nhóm đồng thuận** (analytics / marketing): chưa có gì để phân nhóm. Thêm khi nào thật sự gắn
  công cụ đo lường, lúc đó mới là đồng thuận thật.
- **Không chặn script Google Sign-In**: nó chỉ nạp ở trang đăng nhập và là thứ người dùng chủ động chọn dùng.
  Chặn trước khi có analytics là phức tạp hoá mà không đổi lại được gì.
