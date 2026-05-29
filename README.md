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

`http://localhost:3000/embed/demo.html?pollId=<UUID>`

Remplacez `<UUID>` par la valeur affichée par le seed (`Seed poll created: …`).

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
