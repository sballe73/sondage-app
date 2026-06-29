# 2 — Carte du monorepo

Objectif : savoir **quel dossier ouvrir** selon ce que vous voulez modifier.

Le projet est un **monorepo npm** : plusieurs packages dans un seul dépôt, liés par des workspaces (`package.json` racine).

```
workspaces: packages/*, apps/*
```

Les packages s’importent entre eux avec le préfixe `@sondage/` :

```typescript
import { validateGrades } from "@sondage/shared";
import { getPollById } from "@sondage/db";
```

## Vue d’ensemble

```
                    ┌─────────────────────────────────────┐
                    │           embed/                     │
                    │  HTML + JS (navigateur, pas de build) │
                    └─────────────────┬───────────────────┘
                                      │ fetch HTTP
                    ┌─────────────────▼───────────────────┐
                    │         apps/api                     │
                    │  Routes, auth OAuth, rate limit      │
                    └──────┬──────────────────┬───────────┘
                           │                  │
              ┌────────────▼────────┐    ┌────▼────────────┐
              │    apps/worker      │    │  Redis (stream)  │
              │  Lit le stream      │◄───┤  SETNX votes     │
              └────────────┬────────┘    └─────────────────┘
                           │
              ┌────────────▼────────────────────────────┐
              │  packages/db  +  packages/shared         │
              │  Postgres, snapshots, MJ, validation     │
              └─────────────────────────────────────────┘
```

## `apps/api` — Serveur HTTP

| Chemin | Rôle |
|--------|------|
| `src/server.ts` | Point d’entrée : enregistre plugins, routes, sert `/embed/` |
| `src/routes/` | Un fichier par domaine : `polls`, `votes`, `auth`, `results`, `admin` |
| `src/auth/` | OAuth (Facebook, Google), mock login, JWT |
| `src/plugins/` | CORS, rate limiting, gestion d’erreurs globale |
| `src/middleware/` | Ex. vérification région `X-Data-Region` |
| `src/services/` | Logique transverse (vote-drain, snapshots côté API…) |
| `src/config.ts` | Lecture des variables d’environnement |
| `src/errors.ts` | `AppError` et format JSON des erreurs |
| `src/redis.ts` | SETNX anti-doublon, publication événements vote |
| `src/embed-pages.ts` | Routes HTML légales et pages embed |

**Quand modifier ici :** nouvel endpoint HTTP, règle à l’ingestion du vote, configuration OAuth, headers CORS.

## `apps/worker` — Traitement asynchrone

| Chemin | Rôle |
|--------|------|
| `src/worker.ts` | Boucle principale : poll Redis, ACK, snapshots |
| `src/processor.ts` | Appelle `packages/db` pour agréger un lot de votes |
| `src/redis.ts` | Consumer group Redis Streams |
| `src/config.ts` | `WORKER_POLL_INTERVAL_MS`, nom du consumer |

**Quand modifier ici :** fréquence de traitement, retry, métriques worker. La logique métier d’agrégation est surtout dans `packages/db`.

## `packages/shared` — Code partagé (sans I/O)

Bibliothèque **pure** : pas de base de données, pas de HTTP. Utilisable par API, worker, tests.

| Fichier / dossier | Rôle |
|-------------------|------|
| `types.ts` | `Platform`, `CreatePollInput`, `VoteSubmittedEvent`, etc. |
| `validation.ts` | Validation création sondage, notes, fenêtre de dates |
| `majority-judgment.ts` | Médiane depuis histogramme |
| `dissatisfied-groups.ts` | Départage ex-aequo (groupes d’insatisfaits) |
| `tie-break.ts` | Orchestration du classement final |
| `results-policy.ts` | Visibilité selon `threshold_*` / `end_only` |
| `grade-scale.ts` | Échelle 1–7, libellés français par défaut |
| `platforms.ts` | Plateformes autorisées, gate production |
| `compliance-checks.ts` | Vérifications RGPD automatisées |
| `sanitize-text.ts` | Nettoyage des textes stockés |
| `*.test.ts` | Tests unitaires (Node test runner) |

**Quand modifier ici :** algorithme MJ, nouvelle politique de résultats, validation partagée API/worker.

## `packages/db` — Persistance Postgres

| Chemin | Rôle |
|--------|------|
| `src/schema.ts` | Schéma Drizzle (miroir des tables) |
| `src/migrations/*.sql` | Migrations SQL versionnées (source de vérité) |
| `src/migrate.ts` | Applique les migrations |
| `src/repositories/` | Requêtes par agrégat (`polls`, `results`) |
| `src/process-vote-event.ts` | Insère participation / bulletins, met à jour histogrammes |
| `src/snapshot.ts` | Calcule et enregistre un snapshot MJ |
| `src/publish-snapshot.ts` | Décide si un snapshot doit être publié (seuil, throttle) |
| `src/seed.ts` | Données de démo au `npm run db:seed` |

**Quand modifier ici :** nouvelle colonne, requête SQL, logique snapshot, suppression RGPD.

## `embed/` — Interface utilisateur intégrable

Fichiers **JavaScript vanilla** et HTML statiques, servis par l’API sous `/embed/`.

| Fichier | Rôle |
|---------|------|
| `creator.html` + `sondage-creator.js` + `sondage-attendance.js` | Création / édition + feuille d’émargement (créateur) |
| `vote.html` + `sondage-widget.js` | Formulaire de vote (Web Component) |
| `results.html` + `sondage-results.js` | Affichage histogrammes et classement |
| `sondage-auth-storage.js` | Token OAuth en `sessionStorage` |
| `sondage-theme.css` | Styles communs |
| `legal/` | Pages privacy, terms, data-deletion |

Pas de bundler : chaque page charge ses scripts explicitement. Pas de TypeScript dans `embed/`.

**Quand modifier ici :** UX vote/résultats, textes UI, comportement widget.

## `tests/`

| Dossier | Rôle |
|---------|------|
| `integration/` | API + DB + Redis réels ; `app.inject()` Fastify |
| `compliance/` | Gate RGPD production |
| `build/` | Vérifie que le build Render passe |
| `load/` | Scripts k6 (hors CI) |
| `fixtures/` | JSON figés pour tests de non-régression MJ |

## `scripts/`

Shell et utilitaires : déploiement Render, worker prod, simulation de votes, génération de fixtures.

## Ordre de compilation

Les dépendances imposent cet ordre :

```
@sondage/shared  →  @sondage/db  →  @sondage/worker
                              ↘  @sondage/api
```

`npm run build` à la racine respecte cet ordre.

## Étape suivante

Vous savez où chercher. Lisez [03-architecture.md](03-architecture.md) pour comprendre **comment les pièces communiquent** lors d’un vote.
