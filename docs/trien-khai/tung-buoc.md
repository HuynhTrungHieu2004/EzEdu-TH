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
   Thay `<password>` bằng mật khẩu thật. Mật khẩu có ký tự đặc biệt (`@`, `/`, `:`) thì phải mã hoá URL.

### Chuyển dữ liệu đang có lên Atlas (nếu muốn giữ)

```bash
mongodump --uri="mongodb://127.0.0.1:27017/ai_question_generator" --out=/tmp/ezedu-dump
mongorestore --uri="<chuỗi Atlas>" --nsFrom='ai_question_generator.*' --nsTo='ai_question_generator.*' /tmp/ezedu-dump
```

Không cần giữ thì bỏ qua — hệ thống tự tạo chỉ mục khi khởi động lần đầu.

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
5. Xong, Render cấp URL dạng `https://ezedu-backend.onrender.com`. Kiểm ngay:
   ```
   https://ezedu-backend.onrender.com/health/ready
   ```
   Phải thấy `"status": "healthy"` với `mongodb`, `chromadb`, `gemini`, `groq`.

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

3. **Kiểm lại**: mở trang Netlify, đăng ký một tài khoản mới, đăng nhập, tạo thử một lớp học. Vào Atlas →
   Browse Collections → thấy bản ghi vừa tạo là thông suốt cả ba lớp.

---

## Đã kiểm chứng ở đây

- `backend/Dockerfile` đã **build thật** bằng Docker và chạy thử: API và worker cùng lên, `/health/ready` trả
  `healthy` cho cả `mongodb`, `chromadb`, `gemini`, `groq`.
- Bản build production của frontend đã chạy thử bằng WebKit giả lập iPhone 12, trỏ vào backend thật: đăng nhập
  và ba trang chính không lỗi, F5 ở đường dẫn con vẫn dựng lại đúng (rule SPA hoạt động).

## Chi phí

Tất cả bước trên đều dùng gói miễn phí: Netlify (100 GB băng thông/tháng), Render free, Atlas M0, Cloudinary
free, Gemini/Groq có hạn mức miễn phí. Thứ tiêu tiền trước nhất là **hạn mức Gemini** khi sinh câu hỏi và chấm
tự luận.
