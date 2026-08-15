# Đưa hệ thống lên mạng — từng bước

Thứ tự quan trọng: **CSDL → backend → frontend**. Làm ngược thì phải deploy lại,
vì `VITE_API_BASE_URL` được nhúng vào bundle **lúc build**, không đọc lúc chạy.

| | Bước | Ai làm |
| --- | --- | --- |
| 1 | Đẩy code lên GitHub | ✅ đã xong |
| 2 | Dockerfile + `render.yaml` cho backend | ✅ đã xong, đã build và chạy thử |
| 3 | Tạo MongoDB Atlas | **bạn** — cần tài khoản |
| 4 | Deploy backend lên Render | **bạn** — cần tài khoản |
| 5 | Deploy frontend lên Netlify | **bạn** — cần tài khoản |
| 6 | Nối hai đầu: CORS + Google OAuth | **bạn**, có hướng dẫn dưới |

---

## Bước 3 — MongoDB Atlas (bắt buộc)

Hiện `.env` trỏ `mongodb://127.0.0.1:27017`, tức **MongoDB chạy trên máy bạn**. Backend trên mạng không với
tới được, nên phải có một CSDL đám mây.

1. Vào <https://cloud.mongodb.com>, đăng ký, tạo **cluster M0** (miễn phí vĩnh viễn, 512 MB).
2. Chọn vùng gần Việt Nam: **Singapore** hoặc **Mumbai**.
3. **Database Access** → *Add New Database User* → đặt user + mật khẩu (lưu lại, dùng ở bước 4).
4. **Network Access** → *Add IP Address* → chọn **Allow access from anywhere** (`0.0.0.0/0`).
   Render không có IP cố định ở gói free nên không siết theo IP được; bù lại bằng mật khẩu mạnh.
5. **Connect → Drivers** → copy chuỗi dạng:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
   Thay `<password>` bằng mật khẩu thật.

6. **Kiểm chuỗi trước khi dán vào Render** — bước này tiết kiệm nhiều thời gian:
   ```bash
   cd backend && .venv/bin/python scripts/kiem_tra_mongo.py \
     --uri "mongodb+srv://..." --db chuyende02
   ```
   Script bắt ba lỗi hay gặp: mật khẩu chứa ký tự đặc biệt chưa mã hoá URL (nó in luôn chuỗi thay thế), quên
   mở Network Access, và gõ nhầm tên CSDL.

### Chuyển dữ liệu đang có lên Atlas (nếu muốn giữ)

CSDL trên máy tên **`chuyende02`**, tổng **3,7 MB** (0,5 MB dữ liệu + 3,2 MB chỉ mục) — M0 cho 512 MB nên dư
sức. Phần lớn là nhật ký: 635 `system_error_logs`, 344 `user_activity_logs`. Dữ liệu nghiệp vụ thật chỉ có
18 người dùng và 5 lớp học.

**Không bắt buộc di trú.** Ứng dụng tự tạo và seed `system_settings`, `feature_flags`, `website_content` khi
CSDL trống, nên bắt đầu sạch vẫn chạy. Chỉ di trú nếu muốn giữ 18 tài khoản đang có.

Muốn giữ thì bỏ nhật ký lại cho nhẹ:

```bash
mongodump --uri="mongodb://127.0.0.1:27017/chuyende02" \
  --excludeCollection=system_error_logs \
  --excludeCollection=user_activity_logs \
  --excludeCollection=system_health_snapshots \
  --out=/tmp/ezedu-dump

mongorestore --uri="<chuỗi Atlas>" \
  --nsFrom='chuyende02.*' --nsTo='chuyende02.*' /tmp/ezedu-dump
```

`mongodump`, `mongorestore`, `mongosh` đã có sẵn trên máy bạn.

---

## Bước 4 — Backend lên Render

1. Vào <https://render.com>, đăng ký bằng chính tài khoản GitHub.
2. **New → Blueprint** → chọn repo `EzEdu-TH`. Render đọc `render.yaml`, hiện sẵn dịch vụ `ezedu-backend`.
3. Render hỏi các biến bí mật (`sync: false`). Điền:

   | Biến | Lấy ở đâu |
   | --- | --- |
   | `MONGODB_URI` | chuỗi Atlas ở bước 3 |
   | `GEMINI_API_KEY` | <https://aistudio.google.com/apikey> |
   | `GROQ_API_KEY` | <https://console.groq.com/keys> |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary → Dashboard |
   | `GOOGLE_CLIENT_ID` | Google Cloud Console (để trống nếu chưa dùng đăng nhập Google) |
   | `BACKEND_CORS_ORIGINS` | **tạm để** `["http://localhost:5173"]`, sửa lại ở bước 6 |

   `JWT_SECRET_KEY` Render tự sinh, không cần điền.

   Các khoá này đang nằm trong `backend/.env` trên máy bạn — mở ra copy. **Đừng commit file đó.**

4. Bấm **Apply**. Lần build đầu mất khoảng 5–10 phút (126 gói Python).
5. Xong, Render cấp URL dạng `https://ezedu-backend.onrender.com`. Kiểm bằng một lệnh thay vì mở trình duyệt
   đoán:
   ```bash
   python3 backend/scripts/kiem_tra_trien_khai.py \
     --api-url https://ezedu-backend.onrender.com \
     --origin https://ezedu.netlify.app
   ```
   Script chỉ đọc, không ghi gì vào CSDL, không cần cài thư viện. Nó kiểm: HTTPS, `/health/ready` từng dịch vụ
   một, CORS có cho tên miền frontend không, đọc được cấu hình runtime không, và sai mật khẩu có trả 401 không
   (chứng minh đường xác thực chạm tới MongoDB — HTTP 500 ở đây gần như luôn là `MONGODB_URI` sai hoặc Atlas
   đang chặn IP).

   Lần chạy đầu có thể chờ tới một phút nếu Render đang ngủ. Ở bước này CORS sẽ **FAIL** vì chưa khai tên miền
   Netlify — đúng như dự kiến, sửa ở bước 6.

### Ba điều phải biết về gói free của Render

- **Ngủ sau 15 phút không ai dùng.** Người vào đầu tiên chờ khoảng 50 giây. Demo thì được, người dùng thật thì không.
- **Không có ổ đĩa bền.** Vector của ChromaDB mất sau mỗi lần deploy hoặc thức dậy → hỏi đáp có trích dẫn phải
  lập chỉ mục lại học liệu. Dữ liệu nghiệp vụ (người dùng, lớp, câu hỏi, đề) nằm ở Atlas nên không mất.
- **Worker chạy chung container** (`RUN_WORKER=1`). Gói free không có dịch vụ background riêng.

---

## Bước 5 — Frontend lên Netlify

1. Vào <https://netlify.com>, đăng ký bằng GitHub.
2. **Add new site → Import an existing project** → chọn repo `EzEdu-TH`.
   Netlify đọc `netlify.toml` sẵn trong repo: build từ thư mục `frontend`, xuất ra `dist`, kèm rule SPA.
   **Không cần** sửa build command hay publish directory.
3. Trước khi bấm Deploy, vào **Environment variables**, thêm:

   | Biến | Giá trị |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://ezedu-backend.onrender.com` (URL ở bước 4, **không có dấu `/` cuối**) |
   | `VITE_API_URL` | như trên |
   | `VITE_GOOGLE_CLIENT_ID` | client ID Google, hoặc để trống |

4. **Deploy site**. Xong sẽ có `https://<tên-bạn-đặt>.netlify.app`.

> Đổi biến `VITE_*` thì **phải deploy lại** (Deploys → Trigger deploy). Chúng được nhúng vào bundle lúc build.

---

## Bước 6 — Nối hai đầu

1. **CORS**: Render → dịch vụ backend → Environment → sửa `BACKEND_CORS_ORIGINS` thành
   ```
   ["https://<tên-bạn-đặt>.netlify.app"]
   ```
   Lưu → Render tự deploy lại. Thiếu bước này: trang mở được nhưng mọi lời gọi API bị trình duyệt chặn.

2. **Google OAuth** (nếu dùng): Google Cloud Console → Credentials → OAuth client → thêm
   `https://<tên-bạn-đặt>.netlify.app` vào **Authorized JavaScript origins**.

3. **Chạy lại lệnh kiểm tra** — lần này mọi mục phải ĐẠT:
   ```bash
   python3 backend/scripts/kiem_tra_trien_khai.py \
     --api-url https://ezedu-backend.onrender.com \
     --origin https://ezedu.netlify.app
   ```

4. **Kiểm bằng tay**: mở trang Netlify, đăng ký một tài khoản mới, đăng nhập, tạo thử một lớp học. Vào Atlas →
   Browse Collections → thấy bản ghi vừa tạo là thông suốt cả ba lớp.

---

## Đã kiểm chứng ở đây

- `backend/Dockerfile` đã **build thật** bằng Docker và chạy thử: API và worker cùng lên, `/health/ready` trả
  `healthy` cho cả `mongodb`, `chromadb`, `gemini`, `groq`.
- Chạy lại container với **đúng cấu hình Render sẽ dùng** (`APP_ENV=production`, `JWT_SECRET_KEY` ngẫu nhiên,
  `BACKEND_CORS_ORIGINS` chỉ một tên miền Netlify): khởi động sạch, và CORS chặn đúng — origin đã khai được
  trả header cho phép, origin lạ thì không.
- `scripts/kiem_tra_trien_khai.py` đã chạy thử với chính container đó: cả năm nhóm kiểm đều báo đúng.
- Cờ `CREATE_DEFAULT_TEST_USER` mặc định **tắt**. Đừng bật trên bản chạy thật: nó tạo tài khoản
  `test@test.com` mật khẩu `123456`.
- Bản build production của frontend đã chạy thử bằng WebKit giả lập iPhone 12, trỏ vào backend thật: đăng nhập
  và ba trang chính không lỗi, F5 ở đường dẫn con vẫn dựng lại đúng (rule SPA hoạt động).

## Chi phí

Tất cả bước trên đều dùng gói miễn phí: Netlify (100 GB băng thông/tháng), Render free, Atlas M0, Cloudinary
free, Gemini/Groq có hạn mức miễn phí. Thứ tiêu tiền trước nhất là **hạn mức Gemini** khi sinh câu hỏi và chấm
tự luận.
