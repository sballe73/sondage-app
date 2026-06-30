# Sondage App — Jugement majoritaire

Application de sondages à grande échelle basée sur le **jugement majoritaire**, intégrée aux réseaux sociaux via OAuth. Chaque sondage est lié à **une seule plateforme** (`facebook`, `x`, `linkedin`, `mock`).

**Nouveau contributeur ?** Suivez le [guide développeur](docs/developer/README.md) (parcours progressif : installation → architecture → recettes → tests).

## Architecture

- **API** (`apps/api`) — Fastify : création de sondages, auth OAuth (mock en dev), ingestion des votes, résultats versionnés
- **Worker** (`apps/worker`) — Consommation Redis Streams, histogrammes, snapshots MJ
- **DB** (`packages/db`) — PostgreSQL + Drizzle
- **Shared** (`packages/shared`) — Types, validation, médiane MJ, politiques de résultats
- **Embed** (`embed/`) — Web Component pour vote in-page

```
Client → API (SETNX Redis, XADD stream) → Worker → Postgres (histogrammes, participation, bulletins publics)

Le worker vérifie le stream Redis **toutes les minutes** (`WORKER_POLL_INTERVAL_MS`, défaut 60 000 ms) et n’agrège les votes **que s’il y en a de nouveaux**. Après traitement, les entrées **déjà ackées** sont retirées du stream (`XTRIM MINID`, activé par défaut — `VOTE_STREAM_TRIM_ENABLED=false` pour désactiver). À la fin de chaque passe, un **snapshot** est publié si le compteur agrégé a augmenté depuis le dernier snapshot affiché (le seuil `threshold_10` ne s’applique qu’à la **première** publication, pas aux mises à jour suivantes). Entre deux publications pour un même sondage, `SNAPSHOT_MIN_INTERVAL_MS` impose un délai minimum (défaut 60 000 ms ; `0` désactive la limite).
                ↓
         Results API (snapshots, Cache-Control)
```

## Démarrage rapide

```bash
docker compose up -d
cp .env.example .env
npm install
npm run build
npm run db:migrate
npm run db:seed
npm run dev
```

Ouvrir dans le navigateur (l’API doit tourner avec `npm run dev`) :

`http://localhost:3000/embed/creator.html`

Parcours complet : **créateur → vote → résultats** (voir section ci-dessous).

Pour le sondage seed uniquement :

`http://localhost:3000/embed/vote.html?pollId=<UUID>`

Remplacez `<UUID>` par la valeur affichée par le seed (`Seed poll created: …`).

## Parcours créateur → vote → résultats

1. Ouvrir [`/embed/creator.html`](http://localhost:3000/embed/creator.html).
2. Renseigner le nom, 3 à 14 candidats, dates, politique (`threshold_10` par défaut), plateforme `mock`.
3. Cliquer **Créer le sondage** — copier le lien vote ou le snippet embed.
4. Ouvrir le lien vote (`vote.html?pollId=…`) et voter (mock OAuth automatique).
5. Simuler des votes supplémentaires si besoin (auto-incrément `sim-voter-*`, évite les 409) :
   ```bash
   ./scripts/simulate-votes.sh <UUID> 10
   ./scripts/simulate-votes.sh <UUID> 20 61   # optionnel : forcer sim-voter-61…80
   ```
6. Ouvrir le lien résultats — le panneau **État du sondage** sur `creator.html` affiche le compteur de votes et la version snapshot.

Champs API avec valeurs par défaut si omis : `gradeMin`/`gradeMax` (1–7), `gradeLabels` (échelle MJ française), `bestGradeIsLowest` (`true`), `dataRegion` (`EU`), `visibility` (`public`).

Recharger `creator.html?pollId=<UUID>` pour retrouver un sondage existant.

## Voir les résultats

Page dédiée aux histogrammes et au classement MJ :

`http://localhost:3000/embed/results.html?pollId=<UUID>`

Depuis la page de vote (`vote.html`), le lien **Voir les résultats** ouvre cette page avec le même `pollId`.

### Recette manuelle

1. Démarrer l’environnement (`docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`).
2. Noter l’UUID du sondage seed (`threshold_10`, 3 candidats).
3. Ouvrir `results.html?pollId=<UUID>` — message « Résultats pas encore disponibles » (0 vote, seuil 10).
4. Simuler des votes (chaque exécution ajoute de **nouveaux** `sim-voter-N`, pas de doublons) :
   ```bash
   ./scripts/simulate-votes.sh <UUID> 10
   ```
5. Actualiser la page résultats (ou attendre le rafraîchissement automatique, intervalle `SNAPSHOT_MIN_INTERVAL_MS`) — classement + histogrammes visibles.
6. Vérifier que `medianDisplay` du tableau correspond aux pourcentages ballotage de l’API :
   ```bash
   curl -s -H 'X-Data-Region: EU' http://localhost:3000/polls/<UUID>/results | jq '.results.ranking[0]'
   ```

États UI gérés : chargement, 403 (seuil non atteint / `end_only`), 404 (snapshot en cours de calcul), résultats publiés.

## Jugement majoritaire et départage

- **Médiane** (mention majoritaire) par candidat, calculée depuis les histogrammes.
- **Ex-aequo** : [méthode des groupes d'insatisfaits](https://fr.wikipedia.org/wiki/Jugement_majoritaire#Méthode_des_groupes_d'insatisfaits) (`tieBreakMethod: "dissatisfied_groups"`), décrite dans `tieBreakMethodDescription` sur chaque snapshot.
- **Affichage** : `medianDisplay` dans `ranking[]` et `items[]`, ex. `3 — Bien (partisans 45 %, opposants 20 %)` ; profils identiques → `(ex-aequo)`.
- Les champs `ballotage` détaillent `supportersPercent` / `opponentsPercent` (jugements strictement meilleurs / moins bons que la médiane, avec 1 = Excellent).

## Règles métier

| Fonctionnalité | Implémentation |
|----------------|----------------|
| Plateforme | Par défaut : `poll.platform` verrouillé ; rejet 403 si OAuth ≠ plateforme. Avec `ALLOW_MULTI_PLATFORM_AUTH=true` : plusieurs plateformes sur un même sondage |
| Vote anonyme | `vote_participation` seulement ; pas de `vote_ballots` |
| Vote public | `vote_ballots` + liste par `subject_id` / `display_name` |
| Anti double vote | Redis `SETNX` + `UNIQUE(poll_id, platform, subject_id)` |
| Fenêtre de vote | `starts_at` / `ends_at` vérifiés à l’API |
| Résultats | `end_only`, `threshold_10`, `threshold_100`, `threshold_1000` |
| Région données | `data_region` sur le sondage ; header `X-Data-Region` (451 si mismatch) |

## API (extraits)

- `POST /polls` — Créer un sondage
- `POST /auth/mock/login` — Token votant (dev, plateforme `mock`)
- `GET /auth/facebook/login?pollId=&returnTo=` — Redirect Meta/Facebook (`platform=facebook`)
- `GET /auth/facebook/callback` — Callback Facebook → redirect embed avec `#access_token=…`
- `GET /auth/google/login?pollId=&returnTo=` — Redirect Google (`platform=google`, si configuré)
- `GET /auth/google/callback` — Callback Google
- `GET /auth/session` — Infos session à partir du Bearer token
- `POST /polls/:id/votes` — Soumettre un vote (Bearer + `Idempotency-Key`)
- `GET /polls/:id/results` — Résultats si politique le permet
- `GET /polls/:id/ballots` — Bulletins (mode public uniquement)

Erreurs JSON homogènes : `{ "error": "…", "code": "…", "details"?: { … } }`  
Codes courants : `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `ALREADY_VOTED` (409), `RATE_LIMIT_EXCEEDED` (429), `REGION_MISMATCH` (451).  
Les votes refusés (double vote, idempotency replay, rate limit) sont logués côté API avec `pollId`, `platform`, `subjectId`, `eventId`.

Rate limiting : **100 req/min/IP** (global, header `X-RateLimit-*`) ; **5 tentatives de vote/min/votant** par sondage (Redis, header `Retry-After`).  
CORS : variable `CORS_ORIGINS` (liste séparée par des virgules, ou `*` / absent en dev).

## OAuth (Lot 3)

**Pilote actuel : Meta (Facebook Login)** — plateforme `facebook` dans l’API. **Google** implémenté aussi (dès qu’un projet GCP est disponible). **Apple** à venir. **X** abandonné. **`mock`** pour dev/CI.

### Meta / Facebook — configuration

1. [developers.facebook.com](https://developers.facebook.com/) → **Create App** → type **Consumer** (ou **Other**).
2. Ajouter le produit **Facebook Login** → **Settings** :
   - **Valid OAuth Redirect URIs** : `{PUBLIC_BASE_URL}/auth/facebook/callback`  
     (ex. distant : `http://VOTRE_HOTE:3000/auth/facebook/callback` — aligné sur `PUBLIC_BASE_URL`)
   - **Client OAuth login** : Oui  
   - **Web OAuth login** : Oui

   **Piège interface Meta :** l’URI OAuth ne se configure **pas** dans *Paramètres → Avancé → Authentification de l’application → Autoriser l’URL de rappel* (champ souvent vide après enregistrement). C’est la liste **Valid OAuth Redirect URIs** sous **Facebook Login → Settings** (ou *Use cases → Facebook Login → Customize → Settings*). Coller l’URI, appuyer sur **Entrée** pour l’ajouter à la liste, puis **Enregistrer**.

   Dans *Paramètres → Avancé → Authentification de l’application*, pour une app **web** (OAuth serveur) : désactiver **App native ou de bureau** et **Clé secrète intégrée dans le client**.

3. **Settings** → **Basic** : noter **App ID** et **App Secret**. Ajouter la plateforme **Website** si absente (*Site URL* = `{PUBLIC_BASE_URL}/`).
4. Mode **Development** : ajouter des **testeurs** (Roles → Test Users ou rôles sur l’app) pour les comptes qui voteront.
5. **Settings** → **Basic** — URLs obligatoires Meta (**HTTPS** publiques, joignables par le crawler Meta) :

   Les pages légales sont servies par l’API (HTTPS) sous `{PUBLIC_BASE_URL}/legal/*.html` (contenu dans `embed/legal/`). Les anciens liens GitHub Pages (`docs/legal/`) redirigent vers le site Render canonique.

   | Champ Meta | URL |
   |------------|-----|
   | Privacy Policy URL | `{PUBLIC_BASE_URL}/legal/privacy.html` |
   | Terms of Service URL | `{PUBLIC_BASE_URL}/legal/terms.html` |
   | User data deletion | `{PUBLIC_BASE_URL}/legal/data-deletion.html` |

   Exemple local : `http://localhost:3000/legal/privacy.html`

6. Dans `.env` :
   ```bash
   PUBLIC_BASE_URL=http://localhost:3000
   OAUTH_FACEBOOK_APP_ID=…
   OAUTH_FACEBOOK_APP_SECRET=…
   OAUTH_FACEBOOK_REDIRECT_URI=http://localhost:3000/auth/facebook/callback
   ```
6. Redémarrer l’API (`npm run dev`).

Scopes demandés par l’app (pilote) : `public_profile` seul (identifiant votant = Graph `id`, nom affiché).

### Recette Meta

1. `creator.html` → sondage plateforme **facebook / Meta**, `threshold_10`.
2. Ouvrir le vote via **la même origine** que `PUBLIC_BASE_URL` (ex. IP publique, pas `localhost` si `PUBLIC_BASE_URL` est l’IP).
3. **Se connecter avec Meta (Facebook)** → voter → `results.html`.

Token en `sessionStorage` (`sondage_token_<pollId>`).

### Google (quand projet Cloud disponible)

1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth 2.0 Client ID (Web).
2. Redirect : `{PUBLIC_BASE_URL}/auth/google/callback`
3. `.env` : `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_GOOGLE_REDIRECT_URI`
4. Sondage `platform=google` → **Se connecter avec Google**

### Roadmap OAuth

| Plateforme | Statut |
|------------|--------|
| **Meta** (`facebook`) | **Pilote** — implémenté |
| **Google** | Implémenté (en attente projet GCP) |
| **Apple** | Phase 3 |
| **X** | Abandonné |

## Multi-région (hybride)

Les sondages portent `data_region` (`EU`, `US`, `GLOBAL`). Les requêtes doivent inclure `X-Data-Region` aligné sur le sondage (sauf `GLOBAL`). En production : déployer une stack API/worker/Postgres/Redis par région et router via GeoDNS.

## Déploiement Render (pilote Meta HTTPS)

Fichier [`render.yaml`](render.yaml) : Postgres (Frankfurt), Redis, service web **API seule** (plan free).  
Le **worker production** tourne sur une machine dédiée (`npm run worker:prod`) — distinct du worker local de dev.

### Deux workers (ne pas confondre)

| | **Dev worker** | **Prod worker (self-hosted)** |
|---|----------------|-------------------------------|
| **Rôle** | Dev local, tests d’intégration, k6 contre `localhost` | Agrégation des votes pour l’API **Render** |
| **Fichier env** | [`.env`](.env.example) | `.env.worker.prod` (copie de [`.env.worker.prod.example`](.env.worker.prod.example)) |
| **Postgres / Redis** | `localhost` ([`docker-compose.yml`](docker-compose.yml)) | URLs **externes** Render (Frankfurt, TLS) |
| **API servie** | `npm run dev` → `http://localhost:3000` | `https://<service>.onrender.com` |
| **Commande** | `npm run dev` ou `npm run worker:dev` | `npm run worker:prod` (+ systemd) |
| **Ne pas utiliser pour** | Trafic Render production | Tests docker-compose locaux |

Règle : `.env` → stack locale uniquement. `.env.worker.prod` → stores Render production uniquement.

### Création (API Render)

1. [render.com](https://render.com/) → **New** → **Blueprint** → repo `sondage-app`.
2. Valider la création des ressources (`sondage-db`, `sondage-redis`, `sondage`).
3. Attendre le 1er déploiement ; noter l’URL : `https://sondage.onrender.com` (nom variable).

### Worker production (machine self-hosted)

1. **Redis** (Dashboard → `sondage-redis` → Access Control) : activer l’accès externe, allowlist IP statique du worker (`/32`), copier l’URL **externe** `rediss://…`.
2. **Postgres** (Dashboard → `sondage-db` → Info → External) : copier l’URL + `?sslmode=require` ; optionnel : restreindre l’accès à la même IP.
3. `cp .env.worker.prod.example .env.worker.prod` — coller URLs externes + `JWT_SECRET` / `PARTICIPATION_HASH_SALT` **identiques** au service web Render.
4. `npm ci && npm run build && npm run worker:prod` — log attendu : `Worker home-prod-worker-1 starting…`.
5. Smoke test : voter via l’URL Render → le worker loggue `processed N`.

Exemple **systemd** (`sondage-worker-prod.service`) :

```ini
[Service]
WorkingDirectory=/path/to/sondage-app
EnvironmentFile=/path/to/sondage-app/.env.worker.prod
ExecStart=/usr/bin/npm run worker:prod
Restart=always
```

Après une migration SQL déployée sur Render : redémarrer le worker prod uniquement.

### Logs Render → machine locale

Render peut **streamer** les logs API / Postgres / Redis vers un endpoint syslog TLS externe ([doc Render](https://render.com/docs/log-streams)). Ce dépôt inclut un collecteur Docker sur la machine du worker prod.

**Prérequis (une fois, manuel) :**

1. **DuckDNS** — créer un sous-domaine sur [duckdns.org](https://www.duckdns.org) (ex. `sondage-logs.duckdns.org`).
2. **Freebox** — [mafreebox.freebox.fr](https://mafreebox.freebox.fr) :
   - Bail DHCP statique pour cette machine (Paramètres → Réseau → DHCP).
   - Redirection de port **TCP 6514 → 6514** vers l’IP LAN de la machine (Mode avancé → Gestion des ports).
3. **Pare-feu hôte** : `sudo ufw allow 6514/tcp comment 'Render syslog TLS'`
4. **Cron DuckDNS** (IP publique à jour) :
   ```bash
   # crontab -e
   */5 * * * * /path/to/sondage-app/scripts/logs-duckdns-update.sh
   ```

**Configuration projet :**

```bash
cp infra/logs/.env.logs.example infra/logs/.env.logs
# Éditer LOG_HOSTNAME, DuckDNS_Token, DuckDNS_Domain, ACME_EMAIL
npm run logs:generate-token   # secret partagé avec Render (LOG_STREAM_TOKEN)
npm run logs:setup            # certificat Let's Encrypt (DNS DuckDNS, pas de port 80)
npm run logs:start            # gate TLS + token sur :6514 → rsyslog interne
```

**Render Dashboard** → Integrations → Observability → Log Streams → **+ Set default** :

| Champ | Valeur |
|-------|--------|
| Log Endpoint | `<LOG_HOSTNAME>:6514` (ex. `radiolouve.duckdns.org:6514`) |
| Token | **identique** à `LOG_STREAM_TOKEN` dans `infra/logs/.env.logs` |
| Preview logs | au choix (désactivé recommandé en pilote) |

Render injecte le token dans les messages syslog (structured data RFC 5424). Le **syslog-gate** (`infra/logs/syslog-gate.mjs`) rejette tout message sans ce token — seul Render (configuré avec le même secret) peut écrire dans `logs/render/`. Tentatives rejetées : `logs/render/rejected.log`.

Services couverts par défaut : `sondage` (API), `sondage-db`, `sondage-redis`.

**Consulter les logs :**

```bash
npm run logs:tail              # suit logs/render/all.log
ls logs/render/                # all.log, all-json.log, render-YYYY-MM-DD.log
npm run logs:stop              # arrête le collecteur
```

**Vérification :**

```bash
docker compose -f docker-compose.logs.yml ps
openssl s_client -connect <LOG_HOSTNAME>:6514 -servername <LOG_HOSTNAME> </dev/null
curl -s https://sondage-app-eweb.onrender.com/health   # génère du trafic API
```

Si rien n’arrive : DuckDNS à jour, redirection Freebox, certificats (`infra/logs/certs/`), statut du log stream Render.

### Variables d’environnement (service web `sondage`)

| Variable | Valeur |
|----------|--------|
| `OAUTH_FACEBOOK_APP_ID` | App ID Meta |
| `OAUTH_FACEBOOK_APP_SECRET` | App Secret Meta |
| `ENABLED_PLATFORMS` | `facebook` (déjà dans le blueprint ; exclure `mock` en prod) |
| `WORKER_POLL_INTERVAL_MS` | `5000` recommandé sous charge (aligner avec `.env.worker.prod`) |
| `SNAPSHOT_MIN_INTERVAL_MS` | `60000` par défaut — au plus une publication snapshot / sondage / intervalle (`0` = illimité) |

`PUBLIC_BASE_URL` est **optionnel** : l’API utilise `RENDER_EXTERNAL_URL` si absent.  
Callback OAuth dérivé : `{PUBLIC_BASE_URL ou RENDER_EXTERNAL_URL}/auth/facebook/callback`.

### Meta Developers (serveur pilote `sondage-app-eweb`)

URL API : **`https://sondage-app-eweb.onrender.com`**

| Champ Meta | Valeur |
|------------|--------|
| App Domains | `sondage-app-eweb.onrender.com` |
| Site URL | `https://sondage-app-eweb.onrender.com` (répond en HTTP 200, lien vers le créateur) |
| Valid OAuth Redirect URIs | `https://sondage-app-eweb.onrender.com/auth/facebook/callback` |
| Data Deletion Request URL | `https://sondage-app-eweb.onrender.com/auth/facebook/data-deletion` |
| Privacy Policy URL | `https://sondage-app-eweb.onrender.com/legal/privacy.html` |
| Terms of Service URL | `https://sondage-app-eweb.onrender.com/legal/terms.html` |
| User data deletion (instructions) | `https://sondage-app-eweb.onrender.com/legal/data-deletion.html` |

Vérification après déploiement :

```bash
curl -s https://sondage-app-eweb.onrender.com/health | jq .
# oauth.facebook.configured doit être true
# oauth.facebook.redirectUri doit correspondre à Meta
```

Mode **Development** : ajouter chaque compte votant dans **App roles → Testers** (ou Test Users).

### Meta Developers (générique)

1. **Facebook Login** → Valid OAuth Redirect URIs :
   `https://<votre-service>.onrender.com/auth/facebook/callback`
2. **Data Deletion Request URL** :
   `https://<votre-service>.onrender.com/auth/facebook/data-deletion`
3. **Basic Settings** — pages légales (API Render, `{PUBLIC_BASE_URL}/legal/…`) :
   - `https://<votre-service>.onrender.com/legal/privacy.html`
   - `https://<votre-service>.onrender.com/legal/terms.html`
   - `https://<votre-service>.onrender.com/legal/data-deletion.html`
4. Mode **Development** + testeurs jusqu’à validation du pilote.

### Recette sur Render

1. `https://sondage-app-eweb.onrender.com/embed/creator.html` → sondage **facebook / Meta**.
2. Ouvrir le lien vote (`vote.html?pollId=…`) → **Se connecter avec Meta (Facebook)**.
3. Voter → `results.html`.

(Générique : remplacer par `https://<votre-service>.onrender.com`.)

### Scripts

| Script | Rôle |
|--------|------|
| `scripts/render-build.sh` | `npm ci` + build monorepo |
| `scripts/render-start-api.sh` | API Render seule + migrations (déploiement prod) |
| `scripts/render-start.sh` | Fallback : API + worker dans le même service Render |
| `scripts/run-worker-dev.sh` | Worker local (`.env` + docker-compose) |
| `scripts/run-worker-prod.sh` | Worker prod self-hosted (`.env.worker.prod` + Render externe) |
| `scripts/logs-setup-certs.sh` | Certificat TLS Let's Encrypt (DuckDNS) pour log stream Render |
| `scripts/logs-generate-token.sh` | Génère `LOG_STREAM_TOKEN` (auth Render) |
| `scripts/logs-start.sh` | Démarre gate TLS + collecteur (`docker-compose.logs.yml`) |
| `scripts/logs-tail.sh` | Suit `logs/render/all.log` |
| `scripts/logs-duckdns-update.sh` | Met à jour l’IP DuckDNS (cron) |
| `npm run worker:dev` | Raccourci worker local |
| `npm run worker:prod` | Raccourci worker prod |
| `npm run logs:setup` | Raccourci certificats log stream |
| `npm run logs:generate-token` | Raccourci génération token Render |
| `npm run logs:start` | Raccourci démarrage gate + collecteur |
| `npm run logs:tail` | Raccourci suivi des logs Render |
| `scripts/run-load-test.sh` | test de charge k6 (votes mock concurrents) |
| `npm run db:migrate:prod` | migrations SQL au démarrage Render |

**Coût indicatif :** API web + Redis free ; Postgres `basic-256mb` (~7 $/mois) ; worker prod self-hosted **0 $**. Le plan free web **s’endort** après inactivité (~30 s au réveil).

**Fallback :** [`render-start.sh`](scripts/render-start.sh) (API + worker combinés sur Render) ou worker Render payant (~7 $/mois) si la machine self-hosted est indisponible.

## Test de charge (k6, mock)

Test de performance distribué : plusieurs machines envoient des votes mock simultanés contre une API en cours d’exécution. Outil **manuel / staging** (pas en CI).

**Branche `perf_test`** : déploiement Render dédié (`ENABLED_PLATFORMS=mock`, rate limit off, `PERF_LOG=true`). Voir [`docs/perf-test.md`](docs/perf-test.md) pour baseline (~11 iter/s), cibles et config.

### Prérequis

1. **k6** sur chaque machine cliente :
   ```bash
   # Debian/Ubuntu
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
     --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
     | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update && sudo apt-get install k6

   # macOS
   brew install k6
   ```
   Alternative sans installation : `--docker` (image `grafana/k6`).

2. **Cible** : API + **worker adapté** démarrés, sondage `platform: mock`, fenêtre de vote ouverte.

   | URL cible k6 | Worker |
   |--------------|--------|
   | `http://localhost:3000` | `npm run dev` ou `npm run worker:dev` (`.env`) |
   | `https://*.onrender.com` | `npm run worker:prod` sur machine self-hosted (`.env.worker.prod`) |

3. **Serveur** : `ENABLED_PLATFORMS` inclut `mock` ; pour forte concurrence depuis une seule IP, `RATE_LIMIT_ENABLED=false`. Sous charge Render, aligner `WORKER_POLL_INTERVAL_MS=5000` sur l’API Render et `.env.worker.prod`.

### Lancement simple (une machine)

```bash
npm run load-test -- -p <UUID> -n 50
# Cible distante (écrase .env) :
npm run load-test -- -p <UUID> -n 50 --url http://localhost:3000
```

Chaque exécution utilise de nouveaux `perf-voter-N` (auto-incrément depuis les bulletins existants).

### Paramètres principaux

| Option | Description |
|--------|-------------|
| `-p, --poll-id` | UUID du sondage (obligatoire) |
| `-n, --users` | Nombre de votants virtuels sur **cette** machine |
| `-c, --concurrency` | Votants **en parallèle** max (défaut : identique à `-n`) |
| `--at HH:MM` | Heure de lancement (jour courant) — synchronise plusieurs machines |
| `--timezone` | Fuseau IANA pour `--at` (ex. `Europe/Paris`) |
| `--ramp-seconds N` | Montée progressive sur N secondes (défaut : rafale immédiate) |
| `-u, --url` | URL de l’API — **prioritaire** sur `.env` (`API_BASE`, `PUBLIC_BASE_URL`) et la variable `API_BASE` |
| `--api-base` | Alias de `--url` |
| `--segment-index i` | Index machine (0-based) pour k6 execution segments |
| `--segments-total n` | Nombre total de machines |
| `--total-users N` | Répartit N votants sur les segments (calcule `-n` et offset) |
| `--api-base` | URL API (défaut : `.env` → `API_BASE` / `PUBLIC_BASE_URL` → `http://localhost:3000`) |
| `--dry-run` | Pré-vol + commande k6 sans exécuter |
| `--report path` | Export JSON des métriques k6 |

Aide complète : `./scripts/run-load-test.sh --help`

### Multi-machine (ex. 600 votants, 3 laptops, 14h30)

Sur chaque machine, à la même heure :

```bash
npm run load-test -- -p <UUID> --total-users 600 --segment-index 0 --segments-total 3 --at 14:30
npm run load-test -- -p <UUID> --total-users 600 --segment-index 1 --segments-total 3 --at 14:30
npm run load-test -- -p <UUID> --total-users 600 --segment-index 2 --segments-total 3 --at 14:30 --ramp-seconds 15
```

k6 affiche latences (p50/p95/p99), débit et taux d’échec. Vérifier le décompte :

```bash
curl -s -H 'X-Data-Region: EU' http://localhost:3000/polls/<UUID>/results | jq '.liveVoteCount, .voteCount'
node scripts/debug-poll-state.mjs <UUID>
```

Fichiers : [`tests/load/poll-votes.k6.js`](tests/load/poll-votes.k6.js), [`scripts/run-load-test.sh`](scripts/run-load-test.sh).


## Test d'intégration (14 candidats × 50 votants)

Fixture **figée et validée** : [`tests/fixtures/fourteen-candidates-50-votes.json`](tests/fixtures/fourteen-candidates-50-votes.json) — sondage public, échelle 1–7, `threshold_10`, checkpoints aux votes 10 / 20 / 30 / 40 / 50 (`meta.frozen: true`).

Le test [`tests/integration/fourteen-candidates-50-votes.test.ts`](tests/integration/fourteen-candidates-50-votes.test.ts) rejoue les 50 votes via le worker (`processVoteEvent`) et compare les snapshots DB aux checkpoints (médianes, histogrammes, classement MJ + ballotage).

```bash
docker compose up -d
npm run db:migrate
export DATABASE_URL=postgres://sondage:sondage@localhost:5432/sondage
export REDIS_URL=redis://localhost:6379
npm run test:integration
```

Tous les tests (unitaires + intégration) : `npm run test:all`.

Pour inspecter les checkpoints attendus : `npm run test:integration:print`.

Pour régénérer la fixture (après changement de l'algorithme MJ uniquement) :

```bash
npm run test:integration:generate -- --force
npm run test:integration:print   # revalidation manuelle
# puis mettre à jour meta.validatedAt / meta.frozen dans le JSON
```

## Licence

MIT
