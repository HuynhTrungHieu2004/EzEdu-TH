#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8000}"
RUN_WORKER="${RUN_WORKER:-1}"

if [ "$RUN_WORKER" = "1" ]; then
  echo "[start] bật worker nền (chấm tự luận)"
  python -m app.worker &
fi

echo "[start] uvicorn cổng $PORT"
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" &
wait -n
