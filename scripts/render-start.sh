#!/usr/bin/env bash
set -euo pipefail

# Pilote Render (plan free) : API + worker dans le même service.
# En production à volume, séparer en deux services Render (web + worker).
npm run start -w @sondage/worker &
exec npm run start -w @sondage/api
