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

## Baseline actuelle (main, juin 2026)

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

| Niveau | Itérations / s | p95 vote | Commentaire |
|--------|----------------|----------|-------------|
| **Minimum** | **20** | < 2 s | Rate limit off, logs réduits, poll cache — gain ~2× |
| **Bon** | **25–30** | < 1,5 s | Moins de round-trips DB/Redis par vote, login mock allégé |
| **Stretch** | **35–40** | < 1 s | Plafond probable sur 0,1 CPU ; au-delà, gains marginaux |
| **Hors scope free** | 50+ | — | Nécessiterait Starter (0,5 CPU) ou optimisations majeures |

Recommandation : fixer la **cible de travail à 25 itérations / s** (≈ 2,5× la baseline) avec **p95 vote < 1,5 s** et **0 % d’échec**, mesurée sur un run `-n 500 -c 50` après warm-up (quelques requêtes `/health`).

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

## Pistes d’optimisation (ordre probable)

1. Réduire le travail par vote API (cache poll en mémoire, moins de logs)
2. Mock login : éviter écritures DB inutiles pour sujets perf récurrents
3. Pipeline Redis (pipeline XADD + rate check si réactivé)
4. Ajuster `-c` k6 vs saturation CPU (souvent 30–50 VU optimal sur free)
5. Worker : déjà decoupled ; `WORKER_POLL_INTERVAL_MS=5000` suffit pour l’agrégation

## Métriques à surveiller

- k6 : `iterations/s`, `http_req_duration{name:vote}`, checks `vote:accepted`
- Worker : `tick #N done processed=… own_pel=… duration_ms=…`
- API (PERF_LOG) : `perf_vote` → `total_ms`, `db_poll_ms`, `redis_ms`
- Render Dashboard : CPU/RAM si disponible ; sinon logs via `logs:tail`
