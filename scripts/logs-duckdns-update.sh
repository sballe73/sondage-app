#!/usr/bin/env bash
# Met à jour l'enregistrement DuckDNS avec l'IP publique actuelle (cron toutes les 5 min).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/infra/logs/.env.logs"

if [[ ! -f "$ENV_FILE" ]]; then
  exit 0
fi

set -a
# shellcheck disable=SC1091
source "${ROOT}/scripts/load-env-file.sh"
load_env_file "$ENV_FILE"
set +a

if [[ -z "${DuckDNS_Domain:-}" || -z "${DuckDNS_Token:-}" ]]; then
  exit 0
fi

curl -fsS "https://www.duckdns.org/update?domains=${DuckDNS_Domain}&token=${DuckDNS_Token}&ip=" \
  -o /dev/null
