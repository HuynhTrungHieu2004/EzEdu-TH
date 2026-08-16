# Đăng nhập / đăng ký bằng Facebook

Ngày 16/08/2026.

## Mục tiêu

Thêm nút "Tiếp tục với Facebook" vào trang Đăng nhập và Đăng ký, song song với
nút Google đang có.

**Phạm vi: demo và bảo vệ đồ án.** App Facebook để ở chế độ Development, chỉ tài
khoản có vai trò trong app (admin / developer / tester) đăng nhập được. Không nộp
App Review, không làm Business Verification.

## Facebook khác Google ở đâu

### 1. Cách xác minh

Google trả **ID token** — một JWT tự kiểm được bằng khoá công khai của Google,
backend không cần bí mật gì.

Facebook trả **access token đục**. Backend phải hỏi ngược Facebook hai lần:

```
GET /debug_token?input_token=<token>&access_token=<APP_ID>|<APP_SECRET>
GET /me?fields=id,name,email,picture&access_token=<token>
```

Kéo theo: thêm `FACEBOOK_APP_SECRET` trên máy chủ, và đường đăng nhập giờ có một
lệnh gọi mạng ra ngoài (phải đặt timeout, phải xử lý khi Facebook chậm).

### 2. Chốt `app_id` — chỗ dễ hổng nhất

`/debug_token` trả về `data.is_valid` và `data.app_id`. **Kiểm mỗi `is_valid` là
chưa đủ**: một access token do Facebook cấp cho ứng dụng bất kỳ khác cũng
`is_valid`. Phải kiểm `data.app_id` đúng app của mình.

Đây chính là cái bẫy mà bản Google đã chặn qua tham số `aud`, và chú thích tại
`google_auth_service.py:41` đã ghi lại. Facebook không chặn hộ, phải tự tay.

### 3. Email có thể không có

Người đăng ký Facebook bằng số điện thoại không có email; người dùng cũng bỏ tick
được quyền `email`. Cơ chế gắn tài khoản ở đây khoá theo email.

**Quyết định: từ chối, báo rõ.** Không chế email giả kiểu `fb_123@facebook.local`
— thứ đó chui vào bảng người dùng, hiện trong trang quản trị, và mọi email hệ
thống gửi đi đều rơi vào hư không.

### 4. Không có cờ `email_verified`

Bản Google chặn cứng email chưa xác minh, vì cơ chế gắn-vào-tài-khoản-cũ dựa hoàn
toàn vào đó (`google_auth_service.py:59`). Graph API không trả trường tương đương.

**Quyết định: vẫn tự gắn như Google.** Facebook chỉ trả về email đã xác nhận,
không trả email đang chờ xác nhận. Ghi lại đây vì đó là một suy luận dựa trên
hành vi Facebook chứ không phải một chốt ta tự kiểm được từng lần — khác với
Google, nơi ta đọc được cờ trong token.

## Kiến trúc

Bám đúng khuôn Google đang có: service thuần (không import FastAPI) → router →
hook dùng chung cho hai trang → dialog hỏi vai → cờ tính năng.

### Gộp phần trùng thay vì chép đôi

`find_or_link_google_user` và `create_google_user` chỉ khác Facebook đúng một tên
trường (`google_sub` / `facebook_id`). Phần trong router `/google` sau bước xác
minh — cờ tính năng, hỏi vai, khoá `default_role`, chặn tài khoản xoá/khoá, chế
độ bảo trì, ghi nhật ký — dài khoảng 60 dòng và giống hệt.

Chép đôi chỗ này là đặt bom hẹn giờ: nó mang ba chú thích bảo mật về chiếm tài
khoản và lách lệnh xoá của quản trị. Ai sửa lỗi ở bản Google sau này sẽ không biết
bản Facebook còn nguyên lỗi.

Nên:

- `app/services/social_auth_service.py` — `SocialIdentity`, `find_or_link_social_user`,
  `create_social_user`, nhận tên trường nhà cung cấp làm tham số.
- `google_auth_service.py` giữ nguyên API công khai, gọi vào lõi chung. Router và
  `test_google_auth_service.py` không sửa dòng nào — chính bộ test đó canh việc
  tách không làm hỏng gì.
- `routers/auth.py` — tách phần sau-xác-minh thành một hàm dùng chung, `/google`
  và `/facebook` cùng gọi.

### Backend

| Tệp | Việc |
|---|---|
| `app/services/social_auth_service.py` | mới — lõi gắn và tạo tài khoản, dùng chung |
| `app/services/google_auth_service.py` | sửa — ủy quyền cho lõi chung, giữ API cũ |
| `app/services/facebook_auth_service.py` | mới — hai lệnh gọi Graph API, chốt `app_id` |
| `app/schemas/auth.py` | `FacebookLoginRequest` / `FacebookLoginResponse` |
| `app/routers/auth.py` | hàm dùng chung sau-xác-minh + `POST /auth/facebook` |
| `app/core/config.py` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_VERSION` |
| `app/services/system_settings_service.py` | cờ `enable_facebook_login`, **mặc định tắt** |
| `render.yaml` | hai biến bí mật `sync: false` |

### Frontend

| Tệp | Việc |
|---|---|
| `src/hooks/useSocialSignIn.ts` | mới — lõi chung tách từ `useGoogleSignIn` |
| `src/hooks/useGoogleSignIn.ts` | sửa — gọi lõi chung |
| `src/hooks/useFacebookSignIn.ts` | mới |
| `src/components/FacebookSignInButton.tsx` | mới |
| `src/components/SocialRoleDialog.tsx` | đổi tên từ `GoogleRoleDialog` — vốn đã không dính gì tới Google |
| `src/api/authApi.ts`, `src/types/auth.ts` | thêm `loginWithFacebook` |
| `src/pages/LoginPage.tsx`, `RegisterPage.tsx` | thêm nút |
| `.env.example` | `VITE_FACEBOOK_APP_ID` |

### Cookie: chỉ nạp SDK khi người dùng bấm

SDK Facebook thả cookie ngay khi nạp. Thông báo dữ liệu và trang chính sách vừa
dựng tuần này mô tả những gì trang web lưu; nạp SDK lúc mở trang sẽ làm câu chữ đó
sai với thực tế.

Nên nút Facebook **không nạp gì cho tới khi bị bấm**. Ai không đụng tới Facebook
thì Facebook không đặt cookie của họ. Khác với nút Google — nút đó do thư viện
Google tự render nên buộc phải nạp trước; nút Facebook là nút HTML của ta nên
hoãn được.

## Kiểm thử

Backend, không gọi mạng thật — thay `httpx` bằng bản giả:

- Token hợp lệ thành danh tính.
- **Token của app khác bị từ chối** — kiểm tra quan trọng nhất, đối xứng với
  `test_client_id_is_passed_as_audience` bên Google.
- `is_valid: false` thành 401.
- Không có email thành 403 kèm câu giải thích.
- Thiếu cấu hình App ID/Secret thành 503.
- Facebook hỏng mạng hoặc timeout thành 503, không phải 500.
- Lõi chung: gắn theo `facebook_id`, gắn theo email, tài khoản xoá mềm không bị
  tạo lại — chạy lại đúng bộ ca của Google trên đường Facebook.

Frontend e2e: soi theo bộ spec Google đang có.

## Phần người dùng phải tự làm

1. Tạo app tại developers.facebook.com, thêm sản phẩm **Facebook Login**.
2. Khai domain `ezedu.netlify.app` và `localhost` cho lúc phát triển.
3. **Roles → Testers**: thêm tài khoản Facebook sẽ dùng để demo.
4. Gửi **App ID** (công khai, nằm sẵn trong mã frontend).
5. **App Secret dán thẳng vào Render**, không gửi qua khung chat.
6. Bật cờ `enable_facebook_login` trong trang quản trị khi muốn dùng.

## Ngoài phạm vi

- App Review và Business Verification.
- Trang cài đặt để liên kết / gỡ liên kết tài khoản mạng xã hội.
- Đăng nhập bằng Facebook cho tài khoản không có email.
