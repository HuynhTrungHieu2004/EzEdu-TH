#!/bin/bash

# start_backend.sh - Khởi động Uvicorn FastAPI Backend

echo "=== KHỞI ĐỘNG FASTAPI BACKEND ==="

# Nhảy vào thư mục backend
cd "$(dirname "$0")/../backend" || exit 1

# 1. Kiểm tra virtual env
if [ -d ".venv" ]; then
    echo "Kích hoạt virtual environment (.venv)..."
    source .venv/bin/activate
else
    echo "❌ Lỗi: Không tìm thấy .venv. Vui lòng cài đặt môi trường ảo Python trước."
    exit 1
fi

# 2. Kiểm tra port 8000
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️ Cảnh báo: Port 8000 đang được sử dụng bởi process khác."
    echo "Hãy kiểm tra hoặc tắt process đó để khởi động backend sạch sẽ."
fi

# 3. Khởi chạy Uvicorn
echo "Khởi chạy server Uvicorn..."
exec uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
