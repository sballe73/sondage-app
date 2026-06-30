#!/usr/bin/env bash
# Démarre le collecteur syslog TLS (Render log stream).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CERT_DIR="${ROOT}/infra/logs/certs"
LOG_DIR="${ROOT}/logs/render"

if [[ ! -f "${CERT_DIR}/cert.pem" || ! -f "${CERT_DIR}/key.pem" ]]; then
  echo "logs-start: missing TLS certs in ${CERT_DIR}/ — run: npm run logs:setup" >&2
  exit 1
fi

ENV_FILE="${ROOT}/infra/logs/.env.logs"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "logs-start: missing ${ENV_FILE} — copy from infra/logs/.env.logs.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT}/scripts/load-env-file.sh"
load_env_file "$ENV_FILE"
set +a

if [[ -z "${LOG_STREAM_TOKEN:-}" || "${LOG_STREAM_TOKEN}" == *"CHANGE_ME"* ]]; then
  echo "logs-start: set LOG_STREAM_TOKEN in ${ENV_FILE} — run: npm run logs:generate-token" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

docker compose -f docker-compose.logs.yml up -d

echo "logs-start: waiting for port 6514 …"
for _ in $(seq 1 15); do
  if ss -tln 2>/dev/null | grep -q ':6514 '; then
    break
  fi
  sleep 1
done

if ! ss -tln 2>/dev/null | grep -q ':6514 '; then
  echo "logs-start: port 6514 not listening — check: docker compose -f docker-compose.logs.yml logs" >&2
  exit 1
fi

if [[ -n "${LOG_HOSTNAME:-}" ]]; then
  echo "logs-start: gate ready — Render log endpoint: ${LOG_HOSTNAME}:6514"
  echo "logs-start: Render token (same as LOG_STREAM_TOKEN): set in Dashboard → Log Streams"
fi

echo "logs-start: logs written to ${LOG_DIR}/"
echo "logs-start: rejected attempts → ${LOG_DIR}/rejected.log"
