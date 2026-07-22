#!/bin/bash

# check_environment.sh - Kiểm tra môi trường hệ thống trước khi chạy ứng dụng

echo "=== KIỂM TRA MÔI TRƯỜNG HỆ THỐNG ==="

# 1. Kiểm tra Python
if command -v python3 &>/dev/null; then
    py_version=$(python3 --version)
    echo "✅ Python3: $py_version"
else
    echo "❌ Lỗi: Chưa cài đặt Python3."
    exit 1
fi

# 2. Kiểm tra Virtual Environment
if [ -d "backend/.venv" ]; then
    echo "✅ Virtual Environment: Tìm thấy backend/.venv"
else
    echo "⚠️ Cảnh báo: Chưa cài đặt Virtual Environment tại backend/.venv"
fi

# 3. Kiểm tra Node.js & npm
if command -v node &>/dev/null; then
    node_version=$(node --version)
    echo "✅ Node.js: $node_version"
else
    echo "❌ Lỗi: Chưa cài đặt Node.js."
    exit 1
fi

if command -v npm &>/dev/null; then
    npm_version=$(npm --version)
    echo "✅ npm: $npm_version"
else
    echo "❌ Lỗi: Chưa cài đặt npm."
    exit 1
fi

# 4. Kiểm tra file cấu hình .env
if [ -f "backend/.env" ]; then
    echo "✅ Backend Config: Tìm thấy backend/.env"
    
    # Kiểm tra biến bắt buộc
    echo "Kiểm tra các biến môi trường bắt buộc..."
    while IFS= read -r line || [ -n "$line" ]; do
        # Bỏ qua dòng trống hoặc dòng bắt đầu bằng #
        if [[ ! -z "$line" && ! "$line" =~ ^# ]]; then
            key=$(echo "$line" | cut -d'=' -f1 | tr -d ' ')
            val=$(echo "$line" | cut -d'=' -f2- | tr -d ' ')
            
            if [[ "$key" == "GEMINI_API_KEY" && ( -z "$val" || "$val" == *"your_gemini_api_key"* ) ]]; then
                echo "⚠️ Cảnh báo: Chưa thiết lập GEMINI_API_KEY thật trong backend/.env"
            fi
            if [[ "$key" == "MONGODB_URI" && -z "$val" ]]; then
                echo "⚠️ Cảnh báo: MONGODB_URI đang trống. Hệ thống sẽ sử dụng mock database cho local development."
            fi
        fi
    done < backend/.env
else
    echo "❌ Lỗi: Không tìm thấy file backend/.env. Hãy copy từ backend/.env.example."
    exit 1
fi

# 5. Kiểm tra kết nối MongoDB (nếu có cấu hình URI)
echo "-------------------------------------"
echo "Môi trường cơ bản đã sẵn sàng!"
exit 0
