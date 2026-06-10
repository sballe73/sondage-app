#!/usr/bin/env bash
set -euo pipefail

# Pilote Render (plan free) : API + worker dans le même service.
# Migrations au démarrage (preDeploy indisponible sur le plan free).
# En production à volume, séparer en deux services Render (web + worker).
COMPLIANCE_MODE="${COMPLIANCE_MODE:-prototype}" npm run check:compliance
npm run db:migrate:prod
npm run start -w @sondage/worker &
exec npm run start -w @sondage/api
