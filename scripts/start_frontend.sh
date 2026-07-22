#!/bin/bash

# start_frontend.sh - Khởi động Vite React Frontend

echo "=== KHỞI ĐỘNG REACT FRONTEND ==="

# Nhảy vào thư mục frontend
cd "$(dirname "$0")/../frontend" || exit 1

# 1. Kiểm tra node_modules
if [ ! -d "node_modules" ]; then
    echo "⚠️ node_modules chưa được cài đặt. Đang chạy npm install..."
    npm install
fi

# 2. Khởi chạy Vite dev server
echo "Khởi chạy frontend qua Vite..."
exec npm run dev
