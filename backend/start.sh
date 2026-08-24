#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8000}"

if [ "${PERSONALIZATION_ENABLED:-false}" = "true" ]; then
  echo "[start] đồng bộ chỉ mục cá nhân hóa"
  python -m scripts.migrate_personalization_indexes --force-production
fi

if [ -n "${DEMO_PASSWORD:-}" ]; then
  echo "[start] đồng bộ dữ liệu demo"
  python -m app.services.demo_seed_service
fi

echo "[start] uvicorn cổng $PORT"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
