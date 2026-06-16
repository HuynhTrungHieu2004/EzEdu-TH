# FastAPI Backend Deployment Guide

Hướng dẫn triển khai dịch vụ Backend cho hệ thống đánh giá năng lực tự động.

## 🚀 Startup Command

Trong môi trường Cloud/Production Engine (như Render, Heroku, Railway, hoặc Docker container), hãy sử dụng lệnh khởi chạy sau:

```bash
python3 -m uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

*Lưu ý: Biến `$PORT` sẽ tự động được gán bởi nền tảng hosting của bạn.*

---

## 🔑 Required Environment Variables

Các biến môi trường bắt buộc cần khai báo trên dịch vụ Cloud Hosting của bạn:

| Biến môi trường | Ví dụ giá trị | Mô tả |
| :--- | :--- | :--- |
| `PROJECT_NAME` | `"FastAPI Backend"` | Tên ứng dụng hiển thị trên Swagger UI |
| `API_V1_STR` | `"/api/v1"` | Prefix đường dẫn API |
| `BACKEND_CORS_ORIGINS` | `["https://your-frontend-domain.com"]` | Danh sách URL Frontend được phép truy cập (dạng JSON Array hoặc phân tách bằng dấu phẩy) |
| `MONGODB_URI` | `"mongodb+srv://user:pass@cluster.mongodb.net/dbname"` | Chuỗi kết nối MongoDB Atlas |
| `MONGODB_DB_NAME` | `"learning_assessment"` | Tên database MongoDB |
| `JWT_SECRET_KEY` | `"một_chuỗi_ký_tự_ngẫu_nhiên_rất_dài"` | Khóa bảo mật ký token JWT |
| `JWT_ALGORITHM` | `"HS256"` | Thuật toán băm JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Thời gian hết hạn của token |
| `CLOUDINARY_CLOUD_NAME` | `"cloud_name"` | Tên tài khoản Cloudinary |
| `CLOUDINARY_API_KEY` | `"api_key"` | API Key Cloudinary |
| `CLOUDINARY_API_SECRET` | `"api_secret"` | API Secret Cloudinary |
| `GEMINI_API_KEY` | `"gemini_api_key"` | Google Gemini API Key |
| `GEMINI_MODEL` | `"gemini-2.5-flash"` | Model Gemini sử dụng |
| `CHROMA_PERSIST_DIR` | `"/tmp/chroma_db"` hoặc `/data/chroma_db` | Thư mục lưu trữ vector database ChromaDB |

---

## ⚠️ Lưu ý quan trọng về ChromaDB khi Deploy

Hiện tại, hệ thống sử dụng **ChromaDB local** (lập chỉ mục lưu trữ trực tiếp dưới dạng tệp tin thông qua SQLite/Chroma persistent storage). 

Khi deploy lên các dịch vụ hosting phi trạng thái (ephemeral/stateless container) như Render (bản miễn phí), Heroku:
- Bộ nhớ disk sẽ bị xóa sạch sau mỗi lần ứng dụng khởi động lại (restart/redeploy). Điều này làm mất các vector chỉ mục đã lưu.
- **Giải pháp khắc phục**:
  1. Sử dụng **Persistent Disk / Volume** gắn kèm (ví dụ: Render Mount Disk tại `/data` và cấu hình `CHROMA_PERSIST_DIR=/data/chroma_db`).
  2. Triển khai một server ChromaDB riêng biệt (ChromaDB Server) và trỏ API kết nối từ xa thay vì dùng local client SQLite (nếu mở rộng quy mô lớn).
