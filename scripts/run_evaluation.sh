#!/bin/bash

# run_evaluation.sh - Khởi chạy bộ đánh giá chất lượng AI
echo "=== KHỞI CHẠY BỘ ĐÁNH GIÁ CHẤT LƯỢNG AI & RAG ==="

# Nhảy về thư mục backend để chạy python
cd "$(dirname "$0")/../backend" || exit 1

# 1. Kích hoạt virtual environment
if [ -d ".venv" ]; then
    echo "Kích hoạt virtual environment (.venv)..."
    source .venv/bin/activate
else
    echo "❌ Lỗi: Không tìm thấy thư mục .venv trong backend/"
    exit 1
fi

# Thiết lập PYTHONPATH để import app chính xác
export PYTHONPATH=$(pwd)

# 2. Biên dịch cú pháp Python trước
echo "Biên dịch cú pháp Python..."
python3 -m compileall -q ../evaluation
if [ $? -ne 0 ]; then
    echo "❌ Lỗi: Biên dịch cú pháp Python thất bại."
    exit 1
fi
echo "✅ Biên dịch cú pháp thành công."

# 3. Chạy unit tests cho các metric
echo "Chạy unit tests cho metrics..."
python3 -m unittest discover -s ../evaluation/tests -p "test_*.py"
if [ $? -ne 0 ]; then
    echo "❌ Lỗi: Một số unit tests của metric đã thất bại."
    exit 1
fi
echo "✅ Unit tests vượt qua thành công."

# 4. Chạy từng runners riêng để xác minh độc lập
echo "Chạy runner: Parsing & Chunking..."
python3 ../evaluation/runners/run_parsing_chunking_evaluation.py
if [ $? -ne 0 ]; then
    echo "❌ Lỗi: run_parsing_chunking_evaluation thất bại."
    exit 1
fi

echo "Chạy runner: RAG Retrieval..."
python3 ../evaluation/runners/run_rag_evaluation.py
if [ $? -ne 0 ]; then
    echo "❌ Lỗi: run_rag_evaluation thất bại."
    exit 1
fi

echo "Chạy runner: Q&A, Routing..."
python3 ../evaluation/runners/run_qa_evaluation.py
if [ $? -ne 0 ]; then
    echo "❌ Lỗi: run_qa_evaluation thất bại."
    exit 1
fi

echo "Chạy runner: Material Quality Verification..."
python3 ../evaluation/runners/run_verification_evaluation.py
if [ $? -ne 0 ]; then
    echo "❌ Lỗi: run_verification_evaluation thất bại."
    exit 1
fi

echo "Chạy runner: AI Question Generation..."
python3 ../evaluation/runners/run_question_generation_evaluation.py
if [ $? -ne 0 ]; then
    echo "❌ Lỗi: run_question_generation_evaluation thất bại."
    exit 1
fi

# 5. Chạy runner tổng hợp
echo "Chạy Full AI Assessments Suite..."
python3 ../evaluation/runners/run_full_evaluation.py
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "=================================================="
    echo "✅ KHUNG ĐÁNH GIÁ CHẤT LƯỢNG ĐÃ VƯỢT QUA THÀNH CÔNG!"
    echo "=================================================="
else
    echo "=================================================="
    echo "❌ CÓ CA THỬ NGHIỆM THẤT BẠI. XEM CHI TIẾT BÁO CÁO."
    echo "=================================================="
fi

exit $EXIT_CODE
