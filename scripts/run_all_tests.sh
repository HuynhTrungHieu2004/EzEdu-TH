#!/bin/bash

# run_all_tests.sh - Chạy toàn bộ các bộ kiểm thử tĩnh và động của Backend và Frontend

echo "=== KHỞI CHẠY TOÀN BỘ UNIT TESTS & LINT ==="
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 1. Chạy Backend Tests
echo ""
echo "1. Đang chạy backend unit tests..."
cd "$ROOT_DIR/backend" || exit 1
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi
python -m unittest discover -s tests
backend_status=$?

if [ $backend_status -eq 0 ]; then
    echo "✅ Backend tests: PASSED"
else
    echo "❌ Backend tests: FAILED"
fi

# 2. Chạy Frontend Tests
echo ""
echo "2. Đang chạy frontend assertion tests..."
cd "$ROOT_DIR/frontend" || exit 1
npm run test:chat
frontend_test_status=$?

if [ $frontend_test_status -eq 0 ]; then
    echo "✅ Frontend assertion tests: PASSED"
else
    echo "❌ Frontend assertion tests: FAILED"
fi

# 3. Chạy Frontend Lint
echo ""
echo "3. Đang chạy frontend ESLint checks..."
npm run lint
frontend_lint_status=$?

if [ $frontend_lint_status -eq 0 ]; then
    echo "✅ Frontend linting: PASSED"
else
    echo "❌ Frontend linting: FAILED"
fi

echo ""
echo "=== TỔNG HỢP KẾT QUẢ ==="
if [ $backend_status -eq 0 ] && [ $frontend_test_status -eq 0 ] && [ $frontend_lint_status -eq 0 ]; then
    echo "🎉 TẤT CẢ CÁC BỘ KIỂM THỬ ĐỀU ĐẠT CHUẨN!"
    exit 0
else
    echo "🚨 Có lỗi xảy ra trong quá trình chạy kiểm thử. Hãy kiểm tra logs ở trên."
    exit 1
fi
