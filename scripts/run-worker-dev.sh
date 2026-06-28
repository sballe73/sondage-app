#!/usr/bin/env bash
# Worker local (docker-compose + .env) — développement et tests contre localhost.
# Ne pas utiliser pour l'agrégation Render production (voir run-worker-prod.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "run-worker-dev: missing ${ENV_FILE} — copy from .env.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT}/scripts/load-env-file.sh"
load_env_file "$ENV_FILE"
set +a

looks_local() {
  local url="$1"
  [[ "$url" == *"localhost"* || "$url" == *"127.0.0.1"* || "$url" == *"@postgres:"* || "$url" == *"@redis:"* ]]
}

for var in DATABASE_URL REDIS_URL; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    echo "run-worker-dev: ${var} is not set in .env" >&2
    exit 1
  fi
  if [[ "$val" == *"render.com"* || "$val" == *"rediss://"* ]]; then
    echo "run-worker-dev: ${var} looks like Render production — use npm run worker:prod instead" >&2
    exit 1
  fi
  if ! looks_local "$val"; then
    echo "run-worker-dev: ${var} does not look local (expected localhost / docker-compose)" >&2
    exit 1
  fi
done

MODE="watch"
if [[ "${1:-}" == "--once" ]]; then
  MODE="once"
fi

if [[ "$MODE" == "once" ]]; then
  npm run build -w @sondage/shared
  npm run build -w @sondage/db
  npm run build -w @sondage/worker
  exec npm run start -w @sondage/worker
else
  npm run build -w @sondage/shared
  npm run build -w @sondage/db
  exec npm run dev -w @sondage/worker
fi
