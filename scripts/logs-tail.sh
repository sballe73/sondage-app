#!/usr/bin/env bash
# Affiche les logs Render reçus (fichier agrégé du collecteur).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${ROOT}/logs/render/all.log"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "logs-tail: no logs yet at ${LOG_FILE}" >&2
  echo "logs-tail: start collector (npm run logs:start) and configure Render log stream" >&2
  exit 1
fi

exec tail -f "$LOG_FILE"
