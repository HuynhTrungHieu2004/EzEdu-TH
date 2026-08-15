# Đưa lên Netlify (bản miễn phí)

## Trả lời ngắn

**Được — nhưng Netlify chỉ chạy được phần giao diện.** Backend phải đặt ở nơi khác.

Netlify miễn phí phục vụ tệp tĩnh và hàm serverless ngắn hạn. Backend của dự án này không vừa, vì ba lý do
đo được chứ không phải phỏng đoán:

| Ràng buộc | Thực tế của dự án |
| --- | --- |
| Hàm serverless bản miễn phí chạy tối đa **10 giây** | Sinh câu hỏi bằng Gemini mất **30–50 giây** (đo ở `npm run test:ai`) |
| Không có tiến trình chạy nền | Chấm tự luận là job nền trong `app/worker.py`, phải luôn bật |
| Không có ổ đĩa ghi được giữa các lần gọi | ChromaDB mặc định ghi xuống `backend/chroma_db` (hiện 6,9 MB) |

Thêm nữa `requirements.txt` có 126 gói, trong đó `chromadb`, `ortools`, `numpy` — vượt xa giới hạn kích thước
gói của hàm serverless.

## Kiến trúc khả thi

```
Netlify (miễn phí)        →  giao diện React đã build
Render / Railway / Fly.io →  FastAPI + worker  (cần luôn bật + ổ đĩa)
MongoDB Atlas             →  đã dùng sẵn, chạy được từ mọi nơi
Cloudinary                →  đã dùng sẵn, lưu tệp học liệu
Gemini / Groq             →  đã dùng sẵn
```

Chỉ backend là phải chuyển chỗ; ba dịch vụ còn lại vốn đã trên mây.

## Phần Netlify (làm được ngay)

`netlify.toml` ở gốc repo đã sẵn sàng: build từ thư mục `frontend`, xuất ra `dist`, kèm rule SPA.

1. Netlify → **Add new site → Import an existing project** → chọn repo. Netlify tự đọc `netlify.toml`, không
   cần điền build command bằng tay.
2. **Site configuration → Environment variables**, thêm:

   | Biến | Giá trị |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://ten-backend-cua-ban.onrender.com` (bắt buộc, không có thì mọi lời gọi API hỏng) |
   | `VITE_API_URL` | như trên |
   | `VITE_GOOGLE_CLIENT_ID` | client ID thật, hoặc để trống nếu chưa dùng đăng nhập Google |

   Biến `VITE_*` được nhúng vào bundle **lúc build**, nên đổi biến thì phải deploy lại.
3. Deploy. Netlify cấp tên miền dạng `ten-site.netlify.app`, đã có HTTPS.

### Vì sao cần rule SPA trong `netlify.toml`

React Router định tuyến ở phía trình duyệt. Không có `/* → /index.html`, người dùng mở thẳng
`ten-site.netlify.app/dashboard` hoặc bấm F5 giữa chừng sẽ nhận trang 404 của Netlify.

## Ba việc phải làm sau khi có tên miền

1. **CORS** — thêm tên miền Netlify vào `BACKEND_CORS_ORIGINS` của backend:
   ```
   BACKEND_CORS_ORIGINS=["https://ten-site.netlify.app"]
   ```
   Thiếu bước này thì giao diện tải được nhưng mọi lời gọi API bị trình duyệt chặn.
2. **Backend phải chạy HTTPS.** Netlify phục vụ qua HTTPS; trang HTTPS gọi API qua HTTP sẽ bị trình duyệt
   chặn thẳng (mixed content). Render/Railway/Fly.io đều cấp HTTPS sẵn.
3. **Google OAuth** — thêm `https://ten-site.netlify.app` vào Authorized JavaScript origins trong Google
   Cloud Console, nếu không nút đăng nhập Google báo lỗi origin.

## Phần backend — chọn nơi đặt

Cần: tiến trình luôn bật, ổ đĩa ghi được cho ChromaDB, và **hai** tiến trình (`uvicorn` và `python -m
app.worker`).

| Nơi | Bản miễn phí | Lưu ý |
| --- | --- | --- |
| **Render** | có, nhưng **ngủ sau 15 phút không dùng** — lần gọi đầu chờ ~50 giây | Ổ đĩa (Persistent Disk) là tính năng trả phí; muốn free thì chuyển ChromaDB sang `CHROMA_MODE=http` trỏ tới Chroma Cloud |
| **Railway** | dùng theo mức tín dụng dùng thử | Chạy được cả hai tiến trình, có ổ đĩa |
| **Fly.io** | máy nhỏ gần như miễn phí | Có volume; cấu hình nhiều bước hơn |

Nếu chọn bản miễn phí có ngủ: người dùng đầu tiên mỗi sáng sẽ chờ khoảng một phút. Với đồ án/demo thì chấp
nhận được; với người dùng thật thì không.

Nếu chỉ chạy một tiến trình (bỏ worker) thì phần **chấm tự luận bằng AI sẽ đứng mãi ở "Đang chấm…"** — các
phần còn lại vẫn chạy.

## Đã kiểm chứng

Bản build production (đúng thứ Netlify sẽ phục vụ) được dựng bằng `vite preview` rồi chạy thử bằng WebKit
giả lập iPhone 12, trỏ vào backend thật:

- đăng nhập, `/documents`, `/question-bank`, `/chat-advanced`: **0 lỗi console, 0 lỗi trang, 0 phản hồi ≥ 400**;
- F5 giữa chừng ở đường dẫn con: trang vẫn dựng lại đúng — xác nhận rule SPA cần và đủ.
