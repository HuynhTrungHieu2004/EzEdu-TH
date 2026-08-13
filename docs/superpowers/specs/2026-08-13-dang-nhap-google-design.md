# Đăng nhập bằng tài khoản Google — thiết kế

> Trạng thái: đã chốt phương án, chờ lập kế hoạch hiện thực.
> Ngày: 13/08/2026.

## Mục tiêu

Cho phép người dùng đăng nhập và đăng ký EzEdu AI bằng tài khoản Google, bên cạnh
luồng email + mật khẩu hiện có. Sau khi đăng nhập, người dùng nhận **JWT của chính
hệ thống** — mọi thứ phía sau (RBAC, guard, cờ tính năng) không đổi.

Ngoài phạm vi: đăng nhập Facebook/Microsoft, đồng bộ danh bạ Google Classroom, gọi
API Google thay mặt người dùng.

## Quyết định nền

| Câu hỏi | Chốt | Lý do |
|---|---|---|
| Người mới nhận vai nào? | **Hỏi chọn vai** sau lần đăng nhập đầu | Google không trả về vai trò; mặc định cứng thì giảng viên phải nhờ quản trị nâng vai |
| Email Google trùng tài khoản mật khẩu? | **Gắn vào tài khoản cũ**, cho vào luôn | Google đã xác minh email nên coi là cùng người; giữ nguyên vai và dữ liệu cũ |
| Luồng OAuth nào? | **Google Identity Services** (ID token) | Chỉ cần biết *người này là ai*, không cần quyền truy cập tài nguyên Google |

### Vì sao không dùng luồng Authorization Code

Luồng code sinh ra để **xin quyền truy cập tài nguyên** (Gmail, Drive). Ở đây ta chỉ
cần danh tính — đúng việc mà ID token làm.

Thêm một lý do vận hành: luồng code bắt buộc khai **Authorized redirect URI**, trong
khi backend hiện phơi qua **tunnel Cloudflare tạm có URL đổi mỗi lần khởi động lại**.
Mỗi lần đổi là phải vào Google Cloud Console sửa lại, quên là đăng nhập hỏng. Phương
án ID token không dính vấn đề này: trình duyệt nói chuyện thẳng với Google, chỉ cần
khai origin `http://localhost:5173` cố định.

## Kiến trúc

```
Trình duyệt                    Backend EzEdu                 Google
    │                               │                          │
    │──── bấm nút Google ───────────────────────────────────────▶
    │◀─── ID token (JWT có chữ ký) ─────────────────────────────│
    │                               │                          │
    │─ POST /auth/google {id_token} ▶                          │
    │                               │── lấy khoá công khai ────▶│
    │                               │  xác minh chữ ký/exp/aud  │
    │                               │                          │
    │◀── Token của EzEdu ───────────│  (hoặc needs_role)       │
```

### Một endpoint, gọi hai lần khi cần

```
POST /api/v1/auth/google     { id_token: str, role?: "student" | "lecturer" }
```

**Lần 1** — chỉ gửi `id_token`. Backend xác minh rồi phân nhánh:

| Tình huống | Trả về |
|---|---|
| `google_sub` khớp tài khoản có sẵn | `Token` — đăng nhập |
| Email khớp tài khoản mật khẩu | Gắn `google_sub`, trả `Token` |
| Hoàn toàn mới | `{ needs_role: true, email, full_name }` — **chưa tạo tài khoản** |

**Lần 2** — chỉ khi mới: frontend hiện hộp chọn vai rồi gọi lại cùng endpoint kèm
`role`. Backend tạo tài khoản, trả `Token`.

Không cấp "signup token" trung gian: ID token của Google sống 1 giờ nên gửi lại lần
nữa vẫn hợp lệ. Không bảng tạm, không cần dọn rác, backend vẫn phi trạng thái.

### Xác minh token

```python
thong_tin = id_token.verify_oauth2_token(
    ma_thong_bao, google_requests.Request(), settings.GOOGLE_CLIENT_ID
)
```

Một lời gọi kiểm bốn thứ: **chữ ký** (khoá công khai Google), **hạn dùng**, **`iss`**
là Google, và **`aud`** đúng client ID của ta.

Kiểm `aud` là quan trọng nhất. Thiếu nó thì kẻ tấn công lấy một ID token Google hợp lệ
*cấp cho ứng dụng khác* rồi dùng để đăng nhập vào hệ thống này.

Thêm chốt của riêng ta: **từ chối khi `email_verified` là false**. Không có chốt này
thì cơ chế gắn-vào-tài-khoản-cũ trở thành lỗ chiếm tài khoản.

Thư viện `google-auth` **đã có sẵn** trong dự án (kéo theo bởi `google-genai`), không
thêm phụ thuộc mới.

## Thay đổi dữ liệu

Collection `users`:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `google_sub` | `str \| None` | Định danh Google, bất biến — email đổi được, `sub` thì không |
| `avatar_url` | `str \| None` | Ảnh đại diện Google |
| `hashed_password` | `str \| None` | **Nay được phép vắng** — tài khoản chỉ-Google không có mật khẩu |

Chỉ mục `google_sub`: **unique + sparse**. Unique để hai tài khoản không trỏ cùng một
Google; sparse để tài khoản không dùng Google không vướng ràng buộc.

## Một lỗi hiện có phải sửa kèm

`routers/auth.py` trong hàm `login`:

```python
if not user or not verify_password(user_in.password, user["hashed_password"]):
```

Tài khoản chỉ-Google không có khoá `hashed_password` → **KeyError → HTTP 500**. Không
sửa thì tính năng mới làm hỏng luồng đăng nhập cũ.

Sửa thành `user.get("hashed_password")`, và khi vắng thì báo *"Tài khoản này đăng nhập
bằng Google"*.

**Đánh đổi đã cân nhắc:** thông báo đó xác nhận email tồn tại trong hệ thống. Chấp nhận
vì trang đăng ký hiện đã trả `"Email already registered"` — hệ thống vốn đã tiết lộ
điều này — và người dùng thật sự cần biết phải bấm nút nào.

## Luồng frontend

```
Bấm nút Google
  → Google trả credential (ID token)
  → POST /auth/google { id_token }
       ├─ Token      → lưu access_token → refresh() → điều hướng theo vai
       └─ needs_role → hộp chọn vai → POST lại kèm role → lưu token → refresh()
```

Điều hướng dùng đúng nhánh sẵn có ở `LoginPage.tsx:47-50` (học sinh chưa thiết lập →
`/student-onboarding`, học sinh → `/published-questions`, admin → `/admin/dashboard`,
còn lại → `/dashboard`). Nhánh này được **tách thành hàm dùng chung** để đăng nhập
mật khẩu và Google không lệch nhau về sau.

Nút Google đặt ở **cả `LoginPage` và `RegisterPage`** — với Google thì "đăng nhập" và
"đăng ký" là một hành động.

Script `accounts.google.com/gsi/client` **nạp động** khi trang cần, không nhét vào
`index.html`: trang công khai không phải tải thứ chúng không dùng.

## Xử lý lỗi

| Tình huống | Mã | Thông báo |
|---|---|---|
| Chữ ký / hạn / `aud` sai | 401 | Không đăng nhập được bằng Google. Thử lại. |
| `email_verified` = false | 403 | Email Google này chưa được xác minh. |
| Tài khoản bị khoá | 403 | Tài khoản đã bị khóa. Liên hệ quản trị viên. |
| Bảo trì, không phải admin | 503 | Hệ thống đang bảo trì. |
| Người mới, đăng ký đang tắt | 403 | Đăng ký tài khoản hiện đang tạm tắt. |
| Cờ `enable_google_login` tắt | 403 | Đăng nhập Google hiện không khả dụng. |
| `role` không hợp lệ | 422 | Pydantic `Literal["student","lecturer"]` chặn |
| Thiếu `GOOGLE_CLIENT_ID` | 503 | Chưa cấu hình đăng nhập Google. |

Hai điểm cố ý:

- **Cổng đăng ký chỉ chặn người mới.** Người đã có tài khoản vẫn đăng nhập được khi
  quản trị tắt đăng ký — tắt đăng ký nghĩa là "không nhận người mới", không phải
  "khoá cửa người đang dùng".
- **Mọi nhánh ghi nhật ký** theo khuôn mẫu `record_activity` hiện có: `login_success`
  / `login_failed` / `user_registered`, kèm `metadata: {provider: "google"}` để tách
  được số liệu đăng nhập Google với đăng nhập mật khẩu.

## Cờ tính năng

Thêm `enable_google_login` vào bảng cờ sẵn có (`system_settings_service.py`), mặc định
bật. Quản trị tắt được từ giao diện mà không cần sửa mã — đúng khuôn mẫu 8 cờ đang chạy.

## Kiểm thử

Xác minh token gọi ra mạng ngoài, nên trong test thay `verify_oauth2_token` bằng bản
giả — kiểm **logic phân nhánh của ta**, không kiểm thư viện Google.

| Nhóm | Các ca |
|---|---|
| Phân nhánh tài khoản | `google_sub` đã có → đăng nhập; email trùng → gắn và **giữ nguyên vai + dữ liệu**; hoàn toàn mới → trả `needs_role` và **chưa tạo gì trong DB** |
| Bảo mật | `aud` sai → từ chối; `email_verified` false → từ chối **và không gắn vào tài khoản nào**; token hết hạn → từ chối |
| Cổng chặn | tài khoản khoá; bảo trì; đăng ký tắt chỉ chặn người mới; cờ `enable_google_login` tắt |
| Không phá luồng cũ | **đăng nhập mật khẩu với tài khoản chỉ-Google không được 500** |
| Ràng buộc dữ liệu | hai tài khoản cùng `google_sub` → chỉ mục unique chặn |

Ca quan trọng nhất là `email_verified` false: nếu vẫn gắn vào tài khoản cũ, bất kỳ ai
tạo được tài khoản Google mang email của người khác sẽ chiếm được tài khoản đó.

## Phạm vi sửa

| Backend | Frontend |
|---|---|
| `schemas/auth.py` — `GoogleLoginRequest`, `GoogleLoginResponse` | `api/authApi.ts` — `loginWithGoogle` |
| `services/google_auth_service.py` — **mới**, xác minh + phân nhánh | `components/GoogleSignInButton.tsx` — **mới** |
| `routers/auth.py` — route mới, sửa `KeyError` ở `login` | `pages/LoginPage.tsx`, `RegisterPage.tsx` |
| `core/config.py` — `GOOGLE_CLIENT_ID` | `contexts/auth-context.ts` — hàm điều hướng dùng chung |
| `services/system_settings_service.py` — cờ mới | |
| `database/mongodb.py` — chỉ mục unique sparse | |

Logic xác minh và phân nhánh nằm **trong service riêng**, không nhét vào router — để
test được mà không cần dựng HTTP, giống các service khác trong dự án.

## Cấu hình

Đã tạo trên Google Cloud Console (project `rising-artifact-505403-g0`):

- Loại: Web application
- Authorized JavaScript origins: `http://localhost:5173`
- Authorized redirect URIs: **để trống** (phương án A không chuyển hướng)

Biến môi trường (đã đặt, cả hai file đều được `.gitignore` chặn):

```
backend/.env    GOOGLE_CLIENT_ID=<client id>
frontend/.env   VITE_GOOGLE_CLIENT_ID=<cùng giá trị>
```

Client ID **không phải bí mật** — nó nằm công khai trong mã frontend. Phương án A không
dùng `client_secret`.

### Việc còn lại của người vận hành

App đang ở trạng thái *Testing*, nên **chỉ email nằm trong danh sách Test users mới
đăng nhập được**. Trước khi demo, thêm mọi email sẽ dùng vào mục **Audience → Test
users**, hoặc chuyển app sang *Published*.
