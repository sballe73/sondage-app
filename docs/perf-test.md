# Branche `perf_test` — baseline et cibles

Branche dédiée au déploiement Render pour les tests de charge k6. Le worker reste **self-hosted** ; les logs Render arrivent via le collecteur syslog local.

## Architecture sous test

| Composant | Où | Rôle |
|-----------|-----|------|
| API | Render free (Frankfurt) | Accepte votes mock → Redis stream |
| Postgres / Redis | Render | Persistance + stream |
| Worker | Machine locale (`npm run worker:prod`) | Agrège votes, snapshots |
| k6 | Machine locale | Génère le trafic |
| Logs | `npm run logs:tail` | Logs API Render en local |

## Résultats après optimisation (perf_test, juillet 2026)

Config k6 : `-n 500 -c 50 --url https://sondage-app-eweb.onrender.com` (après warm-up `/health`)

| Métrique | Avant | Après |
|----------|-------|-------|
| **Itérations / s** | ~11,7 | **~47** |
| p95 latence vote | ~3,1 s | **~800 ms** |
| Durée totale (500 votes) | ~43 s | **~11 s** |
| Échecs HTTP | 0 % | 0 % |

Stress `-n 1000 -c 100` : **~53 itérations / s**, p95 vote ~1,4 s.

Optimisations appliquées : cache poll in-memory (TTL 60 s), suppression des `getPollById` redondants sur le chemin vote, claim Redis en un seul `EVAL` Lua, skip rate-limit vote quand `RATE_LIMIT_ENABLED=false`.

## Baseline historique (main, juin 2026)

Config k6 : `-n 200 -c 50 --url https://sondage-app-eweb.onrender.com`

| Métrique | Valeur |
|----------|--------|
| **Itérations / s** | **~11** (200 votes en ~18 s) |
| Requêtes HTTP / s | ~22 (login mock + vote par itération) |
| p95 latence vote | ~2,9 s |
| Échecs HTTP | 0 % |
| Seuil k6 non tenu | `http_req_duration{name:vote} p(95)<2000` |

Chaque itération = `POST /auth/mock/login` + `POST /polls/:id/votes` (202 accepted). L’agrégation worker est asynchrone et ne bloque pas le débit d’acceptation.

## Contraintes Render free (web)

- **0,1 CPU** partagé, **512 Mo** RAM
- Spin-down après **15 min** sans trafic (~1 min de cold start)
- **750 h/mois** d’instance (partagées entre services free du workspace)
- Postgres du blueprint : `basic-256mb` (payant, plus stable que le Postgres free 30 j)

Le plafond perf est surtout **CPU API + latence Postgres/Redis**, pas le worker local.

## Cibles réalistes après optimisation

| Niveau | Itérations / s | p95 vote | Statut |
|--------|----------------|----------|--------|
| **Cible de travail** | **25** | < 1,5 s | **Atteint** (~47 / s @ 50 VU) |
| **Stretch** | 50+ | < 1,5 s | Atteint (~53 / s @ 100 VU) |

## Config Render (cette branche)

`render.yaml` sur `perf_test` :

- `ENABLED_PLATFORMS=mock`
- `RATE_LIMIT_ENABLED=false`
- `LOG_LEVEL=warn`
- `PERF_LOG=true`

À configurer manuellement dans le Dashboard si le service existe déjà (les env du blueprint ne s’appliquent qu’au 1er déploiement).

## Config worker local (`.env.worker.prod`)

```bash
WORKER_POLL_INTERVAL_MS=5000
WORKER_MAX_EVENTS_PER_TICK=500
PERF_LOG=true
HOSTNAME=home-prod-worker-1
```

## Lancer un test

```bash
# Warm-up (évite cold start Render)
curl -s https://<service>.onrender.com/health

# Worker + logs
npm run worker:prod          # terminal 1
npm run logs:tail            # terminal 2 (logs API Render)

# Charge
npm run load-test -- -p <UUID> -n 500 -c 50 --url https://<service>.onrender.com
```

## Pistes d’optimisation (restantes)

1. Mock login : éviter validation poll si pollId omis (k6 pourrait retirer pollId)
2. Ajuster `-c` k6 vs saturation CPU (50 VU optimal latence ; 100 VU pour débit max)
3. Worker : déjà decoupled ; `WORKER_POLL_INTERVAL_MS=5000` suffit pour l’agrégation

## Métriques à surveiller

- k6 : `iterations/s`, `http_req_duration{name:vote}`, checks `vote:accepted`
- Worker : `tick #N done processed=… own_pel=… duration_ms=…`
- API (PERF_LOG) : `perf_vote` → `total_ms`, `db_poll_ms`, `redis_ms`
- Render Dashboard : CPU/RAM si disponible ; sinon logs via `logs:tail`
