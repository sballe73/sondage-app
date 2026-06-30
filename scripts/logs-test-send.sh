#!/usr/bin/env bash
# Envoie un message syslog TLS de test (avec token) vers le gate local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/infra/logs/.env.logs"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "logs-test-send: missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT}/scripts/load-env-file.sh"
load_env_file "$ENV_FILE"
set +a

HOST="${1:-127.0.0.1}"
PORT="${2:-6514}"
MSG="<14>1 $(date -u +%Y-%m-%dT%H:%M:%SZ) test-host sondage-test 1 - [logtail@11993 source_token=\"${LOG_STREAM_TOKEN}\"] logs-test-send ok"
LEN=${#MSG}

# Le gate garde la session TLS ouverte — borner openssl pour ne pas bloquer.
export LEN MSG HOST PORT
timeout 8 bash -c 'printf "%s %s\n" "$LEN" "$MSG" | openssl s_client -connect "${HOST}:${PORT}" -quiet 2>/dev/null' \
  || [[ $? -eq 124 ]]
echo "logs-test-send: sent to ${HOST}:${PORT} — check logs/render/all.log or render-$(date +%Y-%m-%d).log"
