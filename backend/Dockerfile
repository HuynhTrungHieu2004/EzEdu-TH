# Ảnh chạy backend EzEdu AI. Dùng được cho Render, Railway, Fly.io hay VPS.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Cài phụ thuộc trước, copy mã nguồn sau: đổi mã không phải cài lại 126 gói.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Nền tảng nào cũng truyền cổng qua biến PORT; mặc định 8000 để chạy tay được.
ENV PORT=8000
EXPOSE 8000

CMD ["bash", "start.sh"]
