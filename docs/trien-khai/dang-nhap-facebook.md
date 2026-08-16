# Bật đăng nhập Facebook

Code đã xong và đã gộp vào nhánh chính, nhưng **cờ tính năng đang tắt**. Tài liệu
này là phần chỉ bạn làm được: tạo app bên Facebook rồi nối hai đầu lại.

Khoảng 15 phút.

## Trước khi bắt đầu: giới hạn cần biết

App Facebook mới tạo nằm ở chế độ **Development**. Ở chế độ đó, **chỉ tài khoản
Facebook có vai trò trong app** (Admin, Developer, Tester) mới đăng nhập được.
Người lạ bấm nút sẽ bị chính Facebook chặn với thông báo app chưa hoạt động.

Muốn người lạ vào được thì phải qua **App Review + Business Verification**: nộp
giấy tờ doanh nghiệp, quay video mô tả luồng, chờ Facebook duyệt vài ngày tới vài
tuần. Ngoài phạm vi đồ án.

Nên: thêm sẵn tài khoản Facebook của bạn và của người chấm vào mục Testers.

## Bước 1 — Tạo app

1. Vào [developers.facebook.com/apps](https://developers.facebook.com/apps) →
   **Create App**.
2. Use case: chọn **Authenticate and request data from users with Facebook Login**.
3. Đặt tên app, ví dụ `EzEdu AI`.
4. Tạo xong, vào **App settings → Basic**. Ở đây có **App ID** và **App Secret**
   (bấm *Show* để xem Secret).

## Bước 2 — Khai domain

Vẫn ở **App settings → Basic**:

- **App Domains**: `ezedu.netlify.app`
- **Privacy Policy URL**: `https://ezedu.netlify.app/chinh-sach-du-lieu`
  (Facebook bắt buộc có, trang này đã dựng sẵn.)

Rồi vào **Facebook Login → Settings**:

- **Valid OAuth Redirect URIs**: `https://ezedu.netlify.app/`
- Bật **Login with the JavaScript SDK**
- **Allowed Domains for the JavaScript SDK**:
  `https://ezedu.netlify.app` và `http://localhost:5173`

## Bước 3 — Thêm người được phép đăng nhập

**App roles → Roles → Add People → Testers.** Thêm tài khoản Facebook của bạn.
Người được thêm phải vào [developers.facebook.com/requests](https://developers.facebook.com/requests)
để bấm chấp nhận, nếu không lời mời chỉ nằm treo ở đó.

Đây là bước hay bị quên nhất. Quên nó thì nút bấm vào chỉ báo lỗi khó hiểu.

## Bước 4 — Nối vào backend (Render)

**Render → dịch vụ `ezedu-backend` → Environment → Add Environment Variable:**

| Key | Value |
|---|---|
| `FACEBOOK_APP_ID` | App ID ở bước 1 |
| `FACEBOOK_APP_SECRET` | App Secret ở bước 1 |
| `FACEBOOK_GRAPH_VERSION` | phiên bản ở App Dashboard, ví dụ `v21.0` |

**App Secret chỉ dán ở đây.** Đừng gửi nó qua khung chat, đừng đặt vào biến
`VITE_*`, đừng commit. Bất cứ thứ gì bắt đầu bằng `VITE_` đều nằm nguyên văn
trong file JavaScript mà mọi khách truy cập tải về.

Lộ App Secret nghĩa là người khác mạo danh app của bạn gọi Graph API được. Lỡ lộ
thì vào **App settings → Basic → App Secret → Reset**.

Lưu xong Render tự deploy lại, chờ khoảng 2 phút.

## Bước 5 — Nối vào frontend (Netlify)

**Netlify → Site configuration → Environment variables → Add a variable:**

| Key | Value |
|---|---|
| `VITE_FACEBOOK_APP_ID` | App ID (công khai, không sao) |
| `VITE_FACEBOOK_GRAPH_VERSION` | cùng số với bên Render |

Sau đó **bắt buộc deploy lại**: **Deploys → Trigger deploy → Clear cache and
deploy site**. Biến `VITE_*` được nhúng vào lúc dựng, không phải lúc chạy — thêm
biến mà không dựng lại thì bản đang chạy vẫn không có gì, đúng lỗi đã gặp hồi
dựng Google.

### Trước khi làm bước này thì trang web ra sao — chế độ trưng bày

Chưa có App ID thì nút **vẫn hiện**, nhưng bấm vào không đi đâu cả: nó hiện một
dòng nói rằng chức năng đã lập trình xong và Facebook đòi duyệt ứng dụng kèm xác
minh doanh nghiệp. Đủ để trình bày trong buổi bảo vệ mà không phải giải thích
bằng miệng, và không trông như một nút hỏng.

**Bấm vào cũng không chạm tới Facebook.** Vite thay `VITE_FACEBOOK_APP_ID` bằng
chuỗi rỗng lúc dựng, nên bộ nạp SDK bị cắt hẳn khỏi bundle. Đã kiểm bằng cách
dựng thử hai lần và tìm chuỗi trong tệp JavaScript sinh ra:

| trong bundle | không App ID | có App ID |
|---|---|---|
| nút `Tiếp tục với Facebook` | có | có |
| `facebook-jssdk`, `connect.facebook.net` | không có | có |

Không cookie Facebook, không request nào ra ngoài. Có một bài kiểm tự dựng lại
và soi bundle để canh điều này, xem `e2e/facebook-signin.spec.ts`.

## Bước 6 — Bật cờ tính năng

Đăng nhập EzEdu bằng tài khoản quản trị → **Quản trị → Cài đặt hệ thống** → bật
**`enable_facebook_login`**.

Trước khi bật thì `/auth/facebook` trả 403 và nút bấm vào báo "Đăng nhập bằng
Facebook hiện không khả dụng". Đó là chủ ý: có một nút mà đa số người bấm vào sẽ
bị từ chối thì tệ hơn là chưa có nút.

## Kiểm lại

Mở `ezedu.netlify.app/login` bằng tài khoản đã thêm vào Testers, bấm **Tiếp tục
với Facebook**. Lần đầu sẽ hỏi vai (học sinh / giảng viên), chọn xong là vào thẳng.

Vào lại **Quản trị → Nhật ký hoạt động**, lọc `provider: facebook` để thấy bản ghi.

## Khi hỏng thì xem đây

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| "Đăng nhập bằng Facebook hiện không khả dụng" | Chưa bật cờ ở bước 6 |
| "Chưa cấu hình đăng nhập Facebook trên máy chủ" | Thiếu biến bên Render, hoặc chưa deploy lại |
| Bấm nút chỉ hiện lời giải thích về xác minh doanh nghiệp | Đang ở chế độ trưng bày: thiếu `VITE_FACEBOOK_APP_ID`, hoặc Netlify chưa dựng lại sau khi thêm biến |
| Facebook báo app chưa hoạt động | Tài khoản chưa nằm trong Testers, hoặc chưa bấm chấp nhận lời mời |
| "Tài khoản Facebook này không chia sẻ email" | Tài khoản Facebook đăng ký bằng số điện thoại. Không sửa được, dùng Google hoặc mật khẩu |
| "Không liên lạc được với Facebook" | Graph API lỗi hoặc chậm quá 10 giây. Thử lại |
| Đăng nhập được nhưng vào nhầm tài khoản | Kiểm ngay `FACEBOOK_APP_ID` bên Render có đúng app không — chốt `app_id` dựa vào nó |

## Vì sao Facebook cần App Secret mà Google thì không

Google trả về **ID token**: một JWT ký bằng khoá riêng của Google, ai cũng kiểm
được bằng khoá công khai. Backend không cần biết bí mật nào.

Facebook trả về **access token đục** — một chuỗi không nói lên điều gì. Muốn biết
nó là gì thì phải hỏi ngược Facebook, và Facebook chỉ trả lời khi bạn chứng minh
mình là chủ app, bằng chính App Secret.

Chi tiết kỹ thuật: [`docs/superpowers/specs/2026-08-16-dang-nhap-facebook-design.md`](../superpowers/specs/2026-08-16-dang-nhap-facebook-design.md).
