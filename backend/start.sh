#!/usr/bin/env bash
# Khởi động API và worker trong CÙNG một container.
#
# Lý do: gói miễn phí của Render/Railway chỉ cho một dịch vụ web, không có
# "background worker" riêng. Mà thiếu worker thì chấm tự luận bằng AI đứng mãi ở
# "Đang chấm…" — các phần khác vẫn chạy.
#
# Khi đã trả phí (hoặc chạy trên VPS), nên tách thành hai dịch vụ: đặt
# RUN_WORKER=0 cho dịch vụ web và chạy `python -m app.worker` ở dịch vụ kia.
set -euo pipefail

PORT="${PORT:-8000}"
RUN_WORKER="${RUN_WORKER:-1}"

if [ "$RUN_WORKER" = "1" ]; then
  echo "[start] bật worker nền (chấm tự luận)"
  python -m app.worker &
fi

echo "[start] uvicorn cổng $PORT"
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" &

# Tiến trình nào chết thì container thoát để nền tảng khởi động lại cả cụm —
# tốt hơn là để API sống mà worker đã chết âm thầm.
wait -n
exit $?
