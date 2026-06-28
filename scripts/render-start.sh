#!/usr/bin/env bash
set -euo pipefail

# Fallback Render : API + worker dans le même service (plan free, urgence ou test).
# Déploiement prod recommandé : render-start-api.sh (API seule) + worker:prod self-hosted.
# Dev local : npm run dev (pas ce script).
COMPLIANCE_MODE="${COMPLIANCE_MODE:-prototype}" npm run check:compliance
npm run db:migrate:prod
npm run start -w @sondage/worker &
exec npm run start -w @sondage/api
