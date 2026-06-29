# 5 — Conventions de code

Objectif : produire des modifications cohérentes avec le reste du dépôt.

## Langages et runtime

| Zone | Langage | Module system |
|------|---------|---------------|
| `apps/*`, `packages/*` | **TypeScript** strict | ESM (`"type": "module"`, imports `.js` en sortie) |
| `embed/` | **JavaScript** vanilla | Pas de compilation |
| `scripts/` | Shell + parfois `tsx` | — |
| SQL | Fichiers `.sql` dans `packages/db/src/migrations/` | — |

Node **22+** (fichier `.node-version`). CI utilise Node 23 pour certains jobs.

## TypeScript

Configuration partagée : `tsconfig.base.json`

- `strict: true` — pas de `any` implicite
- `module: NodeNext` — extensions `.js` dans les imports relatifs :

```typescript
import { config } from "./config.js";  // même si le fichier source est .ts
```

Chaque package compile vers `dist/` via `tsc`.

## Organisation du code

### Où mettre une nouvelle logique ?

| Besoin | Emplacement |
|--------|-------------|
| Calcul pur, validation, types | `packages/shared` |
| SQL, transactions, snapshots | `packages/db` |
| HTTP, headers, auth | `apps/api` |
| Boucle Redis, scheduling | `apps/worker` |
| UI navigateur | `embed/` |

**Règle :** ne pas importer `apps/api` depuis `packages/*`. La dépendance va toujours vers le bas : apps → packages.

### Routes API

Un fichier par ressource dans `apps/api/src/routes/` :

```typescript
export async function pollRoutes(app: FastifyInstance) {
  app.post("/polls", async (request, reply) => { /* … */ });
}
```

Enregistrement dans `server.ts` via `await app.register(pollRoutes)`.

### Validation des entrées

- **HTTP body / params** : [Zod](https://zod.dev/) dans la route
- **Règles métier partagées** : fonctions dans `packages/shared/src/validation.ts`

Les erreurs Zod sont converties en `400 VALIDATION_ERROR` par `plugins/error-handler.ts`.

### Erreurs métier

Utiliser `AppError` (`apps/api/src/errors.ts`) :

```typescript
throw new AppError(403, "POLL_CLOSED", "Poll is closed", { endsAt: poll.endsAt });
```

Ne pas renvoyer des `reply.status()` ad hoc pour les cas métier — le plugin centralise le format JSON.

### Base de données

- Schéma Drizzle pour le typage
- **Nouvelle colonne** : ajouter une migration SQL numérotée, puis mettre à jour `schema.ts`
- Requêtes regroupées dans `packages/db/src/repositories/`
- Transactions pour opérations multi-tables

### Variables d’environnement

- Lues dans `apps/api/src/config.ts` ou `apps/worker/src/config.ts`
- Documentées dans `.env.example` (jamais de secrets réels dans git)
- `apps/api/src/load-env.ts` charge `.env` au démarrage dev

## Style et qualité

- **Minimal scope** : une PR = un sujet ; pas de refactor gratuit
- **Pas de sur-abstraction** : préférer le code inline lisible à une usine à factories
- **Commentaires** : seulement pour logique non évidente (verrous, pièges OAuth, etc.)
- **Nommage** : anglais dans le code (`pollId`, `voteCount`) ; UI embed souvent en français
- **Tests** : `node:test` + `node:assert` (pas Jest/Vitest)

## Embed (JavaScript)

- IIFE ou classes Web Components (`sondage-poll-widget`)
- Pas de framework React/Vue
- État auth : `sessionStorage` via `sondage-auth-storage.js`
- Appels API : `fetch` avec header `Authorization: Bearer` et `X-Data-Region`

## Git et fichiers à ne pas committer

Voir `.gitignore` :

- `.env`, `.env.worker.prod`
- `node_modules/`, `dist/`
- `.cursor/` (config IDE locale)

**Ne jamais** committer d’IP personnelle ou secrets OAuth dans le code versionné.

## CI (ce qui doit passer)

Sur chaque push / PR ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) :

| Job | Commande |
|-----|----------|
| unit | `npm run test:unit` |
| build | `npm run test:build` |
| compliance | `npm run check:compliance` + `test:compliance` |
| integration | `npm run db:migrate` + `npm run test:integration` |

Avant une PR : `npm run test:all` en local si Docker tourne.

## Ajouter une dépendance npm

Depuis la racine, cibler le workspace :

```bash
npm install zod -w @sondage/api
```

Éviter les dépendances dans `packages/shared` sauf si strictement nécessaire (garder le package léger).

## Étape suivante

Tâches concrètes pas à pas : [06-recipes.md](06-recipes.md).
