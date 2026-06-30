#!/usr/bin/env bash
# Émet ou renouvelle un certificat Let's Encrypt (DNS DuckDNS) pour le collecteur syslog TLS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/infra/logs/.env.logs"
CERT_DIR="${ROOT}/infra/logs/certs"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "logs-setup-certs: missing ${ENV_FILE} — copy from infra/logs/.env.logs.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT}/scripts/load-env-file.sh"
load_env_file "$ENV_FILE"
set +a

for var in LOG_HOSTNAME DuckDNS_Token DuckDNS_Domain ACME_EMAIL; do
  if [[ -z "${!var:-}" || "${!var}" == *"CHANGE_ME"* ]]; then
    echo "logs-setup-certs: set ${var} in infra/logs/.env.logs" >&2
    exit 1
  fi
done

export DuckDNS_Token
ACME_SERVER="letsencrypt"
ACME_HOME="${HOME}/.acme.sh"
ACME_SH="${ACME_HOME}/acme.sh"

if [[ ! -x "$ACME_SH" ]] || [[ ! -f "${ACME_HOME}/dnsapi/dns_duckdns.sh" ]]; then
  echo "logs-setup-certs: installing full acme.sh (with dnsapi) to ${ACME_HOME} …"
  curl -fsSL https://get.acme.sh | sh -s "email=${ACME_EMAIL}"
fi

if [[ ! -f "${ACME_HOME}/dnsapi/dns_duckdns.sh" ]]; then
  echo "logs-setup-certs: dns_duckdns hook missing after install — check ${ACME_HOME}/dnsapi/" >&2
  exit 1
fi

export PATH="${ACME_HOME}:${PATH}"

# acme.sh defaults to ZeroSSL (needs EAB); use Let's Encrypt for DuckDNS DNS-01.
"${ACME_SH}" --set-default-ca --server "${ACME_SERVER}" 2>/dev/null || true
"${ACME_SH}" --register-account -m "${ACME_EMAIL}" --server "${ACME_SERVER}" 2>/dev/null || true

mkdir -p "$CERT_DIR"

echo "logs-setup-certs: issuing certificate for ${LOG_HOSTNAME} (DNS DuckDNS, Let's Encrypt) …"
"${ACME_SH}" --issue --dns dns_duckdns -d "${LOG_HOSTNAME}" --server "${ACME_SERVER}" --force

"${ACME_SH}" --install-cert -d "${LOG_HOSTNAME}" \
  --key-file "${CERT_DIR}/key.pem" \
  --fullchain-file "${CERT_DIR}/cert.pem" \
  --reloadcmd "docker compose -f ${ROOT}/docker-compose.logs.yml restart log-collector 2>/dev/null || true"

chmod 600 "${CERT_DIR}/key.pem"
chmod 644 "${CERT_DIR}/cert.pem"

echo "logs-setup-certs: certificates installed in ${CERT_DIR}/"
echo "  cert.pem  → TLS cert (fullchain)"
echo "  key.pem   → TLS private key"
echo ""
echo "Renewal: acme.sh installs a cron job automatically."
echo "Next: npm run logs:start"
