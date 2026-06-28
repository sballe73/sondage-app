#!/usr/bin/env bash
# Worker production self-hosted — agrège les votes pour l'API Render (URLs externes TLS).
# Ne pas utiliser pour le dev local (voir run-worker-dev.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/.env.worker.prod"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "run-worker-prod: missing ${ENV_FILE} — copy from .env.worker.prod.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

looks_local() {
  local url="$1"
  [[ "$url" == *"localhost"* || "$url" == *"127.0.0.1"* ]]
}

for var in DATABASE_URL REDIS_URL; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    echo "run-worker-prod: ${var} is not set in .env.worker.prod" >&2
    exit 1
  fi
  if looks_local "$val"; then
    echo "run-worker-prod: ${var} looks local — use npm run worker:dev for docker-compose" >&2
    exit 1
  fi
done

if [[ "${DATABASE_URL}" != *"render.com"* && "${DATABASE_URL}" != *"sslmode=require"* ]]; then
  echo "run-worker-prod: DATABASE_URL should be Render external (render.com + sslmode=require)" >&2
  exit 1
fi

if [[ "${REDIS_URL}" != rediss://* && "${REDIS_URL}" != *"render.com"* ]]; then
  echo "run-worker-prod: REDIS_URL should be Render external (rediss://…)" >&2
  exit 1
fi

COMPLIANCE_MODE="${COMPLIANCE_MODE:-prototype}" npm run check:compliance
npm run build -w @sondage/shared
npm run build -w @sondage/db
npm run build -w @sondage/worker
exec npm run start -w @sondage/worker
