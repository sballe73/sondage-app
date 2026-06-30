#!/usr/bin/env bash
# Génère LOG_STREAM_TOKEN et l'ajoute à infra/logs/.env.logs (ou affiche la valeur).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/infra/logs/.env.logs"
TOKEN="$(openssl rand -hex 32)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "LOG_STREAM_TOKEN=${TOKEN}"
  echo ""
  echo "Copy infra/logs/.env.logs.example to infra/logs/.env.logs, then set LOG_STREAM_TOKEN to the value above."
  exit 0
fi

if grep -q '^LOG_STREAM_TOKEN=' "$ENV_FILE"; then
  if [[ "${1:-}" == "--force" ]]; then
    sed -i "s/^LOG_STREAM_TOKEN=.*/LOG_STREAM_TOKEN=${TOKEN}/" "$ENV_FILE"
    echo "logs-generate-token: updated LOG_STREAM_TOKEN in ${ENV_FILE}"
  else
    echo "logs-generate-token: LOG_STREAM_TOKEN already set — use --force to replace" >&2
    exit 1
  fi
else
  printf '\nLOG_STREAM_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
  echo "logs-generate-token: appended LOG_STREAM_TOKEN to ${ENV_FILE}"
fi

echo "Set the same token in Render Dashboard → Log Streams → Token"
echo "LOG_STREAM_TOKEN=${TOKEN}"
