# 7 — Tests

Objectif : savoir **quels tests lancer** et **comment en écrire** un nouveau.

## Pyramide des tests du projet

```
        ┌─────────────────┐
        │  load (k6)      │  Manuel / staging — pas en CI
        ├─────────────────┤
        │  intégration    │  API + Postgres + Redis
        ├─────────────────┤
        │  API unit       │  apps/api/src/*.test.ts
        ├─────────────────┤
        │  shared unit    │  packages/shared/src/*.test.ts
        ├─────────────────┤
        │  compliance     │  RGPD, build Render
        └─────────────────┘
```

## Commandes

| Commande | Contenu |
|----------|---------|
| `npm run test` | Alias tests unitaires shared |
| `npm run test:unit` | `packages/shared/src/*.test.ts` |
| `npm run test:api` | `apps/api/src/*.test.ts` |
| `npm run test:compliance` | RGPD + compliance-checks |
| `npm run test:build` | Vérifie script build Render |
| `npm run test:integration` | `tests/integration/*.test.ts` |
| `npm run test:all` | Tout sauf load k6 |
| `npm run check:compliance` | Checklist RGPD (warnings ou bloquant) |

### Prérequis intégration

```bash
docker compose up -d
npm run db:migrate
export DATABASE_URL=postgres://sondage:sondage@localhost:5432/sondage
export REDIS_URL=redis://localhost:6379
npm run test:integration
```

Le setup `tests/integration/setup-redis-env.ts` est importé automatiquement par la commande racine.

## Tests unitaires (shared)

Framework : **Node.js test runner** natif (`node:test`).

Exemple : `packages/shared/src/majority-judgment.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { medianFromHistogram } from "./majority-judgment.js";

describe("medianFromHistogram", () => {
  it("returns null for empty", () => {
    const r = medianFromHistogram({});
    assert.strictEqual(r.median, null);
  });
});
```

**Quand en ajouter :** toute modification d’algorithme MJ, validation, politique de résultats.

Lancer un seul fichier :

```bash
node --import tsx --test packages/shared/src/majority-judgment.test.ts
```

## Tests API unitaires

Fichiers à côté du code source : `apps/api/src/*.test.ts`

Exemples : `oauth.test.ts`, `pkce.test.ts`, `errors.test.ts`

Nécessitent `npm run build -w @sondage/api` (imports depuis `dist/` ou sources selon le test).

## Tests d’intégration

### Principe

- Vraie base Postgres et Redis
- Application Fastify construite sans écoute réseau : `buildApiApp()` dans `tests/integration/build-api-app.ts`
- Requêtes via `app.inject({ method, url, payload, headers })`
- Votes traités en appelant `processVoteEvent` du worker (simule le stream)

### Squelette

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApiApp } from "./build-api-app.js";
import { processVoteEvent } from "../../apps/worker/dist/processor.js";
import { closeDb } from "../../packages/db/dist/index.js";

const hasEnv = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;

describe("Ma feature", { skip: !hasEnv }, () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;

  before(async () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    app = await buildApiApp();
  });

  after(async () => {
    await closeDb().catch(() => {});
    // fermer Redis API + worker si utilisé
  });

  it("fait quelque chose", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/polls",
      headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
      payload: { /* … */ },
    });
    assert.equal(res.statusCode, 201);
  });
});
```

### Fixture figée 14 candidats × 50 votes

Fichier : `tests/fixtures/fourteen-candidates-50-votes.json`

Test : `tests/integration/fourteen-candidates-50-votes.test.ts`

- Rejoue 50 votes et compare snapshots aux **checkpoints** enregistrés
- `meta.frozen: true` — ne régénérer qu’après changement volontaire de l’algorithme

```bash
npm run test:integration:print    # afficher les checkpoints attendus
npm run test:integration:generate -- --force   # régénération (prudence)
```

## Tests de conformité

- `tests/compliance/gdpr-gate.test.ts` — démarrage bloqué en mode production si config invalide
- `packages/shared/src/compliance-checks.test.ts` — règles automatisées

Simuler production en local :

```bash
COMPLIANCE_MODE=production JWT_SECRET=… npm run check:compliance
```

(Voir variables dans CI `.github/workflows/ci.yml`.)

## Tests navigateur (embed)

Pas de Playwright/Cypress en CI actuellement.

Validation manuelle :

1. `creator.html` → créer sondage
2. `vote.html` → voter
3. `results.html` → vérifier affichage

Certains comportements embed sont couverts indirectement via tests d’intégration API.

## Load tests (k6)

Hors CI. Voir README section « Test de charge ».

```bash
npm run load-test -- -p <UUID> -n 50
```

## Bonnes pratiques

- **Désactiver le rate limit** dans les tests : `process.env.RATE_LIMIT_ENABLED = "false"`
- **Fermer** connexions DB/Redis dans `after()` pour éviter les handles ouverts
- **skip** si `DATABASE_URL` absent — permet `test:unit` sans Docker
- Préférer des **données uniques** (`creatorId`, `subjectId`) pour éviter les collisions entre tests parallèles futurs
- Un test d’intégration = un scénario utilisateur lisible

## Étape suivante

Conformité RGPD et passage production : [09-compliance.md](09-compliance.md).
