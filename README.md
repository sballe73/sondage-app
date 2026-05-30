# Sondage App — Jugement majoritaire

Application de sondages à grande échelle basée sur le **jugement majoritaire**, intégrée aux réseaux sociaux via OAuth. Chaque sondage est lié à **une seule plateforme** (`facebook`, `x`, `linkedin`, `mock`).

## Architecture

- **API** (`apps/api`) — Fastify : création de sondages, auth OAuth (mock en dev), ingestion des votes, résultats versionnés
- **Worker** (`apps/worker`) — Consommation Redis Streams, histogrammes, snapshots MJ
- **DB** (`packages/db`) — PostgreSQL + Drizzle
- **Shared** (`packages/shared`) — Types, validation, médiane MJ, politiques de résultats
- **Embed** (`embed/`) — Web Component pour vote in-page

```
Client → API (SETNX Redis, XADD stream) → Worker → Postgres (histogrammes, participation, bulletins publics)
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

`http://localhost:3000/embed/demo.html?pollId=<UUID>`

Remplacez `<UUID>` par la valeur affichée par le seed (`Seed poll created: …`).

## Parcours créateur → vote → résultats

1. Ouvrir [`/embed/creator.html`](http://localhost:3000/embed/creator.html).
2. Renseigner le nom, 3 à 14 candidats, dates, politique (`threshold_10` par défaut), plateforme `mock`.
3. Cliquer **Créer le sondage** — copier le lien vote ou le snippet embed.
4. Ouvrir le lien vote (`demo.html?pollId=…`) et voter (mock OAuth automatique).
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

Depuis la page de vote (`demo.html`), le lien **Voir les résultats** ouvre cette page avec le même `pollId`.

### Recette manuelle

1. Démarrer l’environnement (`docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`).
2. Noter l’UUID du sondage seed (`threshold_10`, 3 candidats).
3. Ouvrir `results.html?pollId=<UUID>` — message « Résultats pas encore disponibles » (0 vote, seuil 10).
4. Simuler des votes (chaque exécution ajoute de **nouveaux** `sim-voter-N`, pas de doublons) :
   ```bash
   ./scripts/simulate-votes.sh <UUID> 10
   ```
5. Actualiser la page résultats (ou attendre le polling 30 s) — classement + histogrammes visibles.
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
| Plateforme unique | `poll.platform` immuable ; rejet 403 si OAuth ≠ plateforme |
| Vote anonyme | `vote_participation` seulement ; pas de `vote_ballots` |
| Vote public | `vote_ballots` + liste par `subject_id` / `display_name` |
| Anti double vote | Redis `SETNX` + `UNIQUE(poll_id, subject_id)` |
| Fenêtre de vote | `starts_at` / `ends_at` vérifiés à l’API |
| Résultats | `end_only`, `threshold_10`, `threshold_100`, `threshold_1000` |
| Région données | `data_region` sur le sondage ; header `X-Data-Region` (451 si mismatch) |
| Campagnes | Plusieurs sondages (plateformes différentes) via `campaign_id` |

## API (extraits)

- `POST /polls` — Créer un sondage
- `POST /auth/mock/login` — Token votant (dev, plateforme `mock`)
- `POST /polls/:id/votes` — Soumettre un vote (Bearer + `Idempotency-Key`)
- `GET /polls/:id/results` — Résultats si politique le permet
- `GET /polls/:id/ballots` — Bulletins (mode public uniquement)

Erreurs JSON homogènes : `{ "error": "…", "code": "…", "details"?: { … } }`  
Codes courants : `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `ALREADY_VOTED` (409), `RATE_LIMIT_EXCEEDED` (429), `REGION_MISMATCH` (451).  
Les votes refusés (double vote, idempotency replay, rate limit) sont logués côté API avec `pollId`, `platform`, `subjectId`, `eventId`.

Rate limiting : **100 req/min/IP** (global, header `X-RateLimit-*`) ; **5 tentatives de vote/min/votant** par sondage (Redis, header `Retry-After`).  
CORS : variable `CORS_ORIGINS` (liste séparée par des virgules, ou `*` / absent en dev).

## Multi-région (hybride)

Les sondages portent `data_region` (`EU`, `US`, `GLOBAL`). Les requêtes doivent inclure `X-Data-Region` aligné sur le sondage (sauf `GLOBAL`). En production : déployer une stack API/worker/Postgres/Redis par région et router via GeoDNS.

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

## Publication sur GitHub

Dépôt git initialisé sur `main` (commit racine). Compte GitHub détecté en SSH : **sballe73**.

```bash
# Option A — GitHub CLI (crée le dépôt + push)
gh auth login
./scripts/publish-github.sh

# Option B — dépôt créé à la main sur https://github.com/new (vide, sans README)
git remote add origin git@github.com:sballe73/sondage-app.git
git push -u origin main
```

Pour régénérer la fixture (après changement de l'algorithme MJ uniquement) :

```bash
npm run test:integration:generate -- --force
npm run test:integration:print   # revalidation manuelle
# puis mettre à jour meta.validatedAt / meta.frozen dans le JSON
```

## Licence

MIT
