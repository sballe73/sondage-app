#!/usr/bin/env bash
set -euo pipefail

# Render (plan free) : API seule — worker prod sur machine dédiée (voir run-worker-prod.sh).
# Migrations au démarrage (preDeploy indisponible sur le plan free).
COMPLIANCE_MODE="${COMPLIANCE_MODE:-prototype}" npm run check:compliance
npm run db:migrate:prod
exec npm run start -w @sondage/api
