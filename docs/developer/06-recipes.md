# 6 — Recettes développeur

Objectif : guides pas à pas pour les modifications les plus fréquentes.

## Recette A — Ajouter un endpoint HTTP

**Exemple :** `GET /polls/:pollId/summary`

1. **Route** — créer ou étendre un fichier dans `apps/api/src/routes/` :

```typescript
app.get("/polls/:pollId/summary", async (request, reply) => {
  const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
  await enforcePollRegion(request, pollId);
  // … logique …
  return { /* … */ };
});
```

2. **Région** — appeler `enforcePollRegion` si le sondage est concerné par `X-Data-Region`.

3. **Données** — utiliser les repositories `@sondage/db`, pas de SQL dans la route.

4. **Erreurs** — `throw new AppError(404, "NOT_FOUND", "…")` si besoin.

5. **Test** — test d’intégration dans `tests/integration/` avec `app.inject()` (voir [07-testing.md](07-testing.md)).

6. **Build** — `npm run build -w @sondage/api` puis tester.

## Recette B — Modifier une règle de validation partagée

**Exemple :** autoriser 2 à 20 candidats au lieu de 3 à 14.

1. Modifier `packages/shared/src/validation.ts` (ou le schéma Zod côté API si HTTP uniquement).
2. Mettre à jour les messages d’erreur embed (`sondage-creator.js`) si l’UI valide côté client.
3. Ajouter / ajuster un test unitaire `packages/shared/src/*.test.ts`.
4. `npm run test:unit`

## Recette C — Ajouter une colonne en base

1. Créer `packages/db/src/migrations/00N_description.sql` :

```sql
ALTER TABLE polls ADD COLUMN IF NOT EXISTS my_field TEXT;
```

2. Mettre à jour `packages/db/src/schema.ts` (Drizzle).
3. Adapter repositories et types `CreatePollInput` dans `packages/shared` si exposé à l’API.
4. `npm run db:migrate`
5. Tests d’intégration si le comportement est critique.

**En production Render :** migration au démarrage API (`db:migrate:prod`) ; redémarrer le worker prod après migration.

## Recette D — Changer l’algorithme de classement MJ

1. Logique dans `packages/shared` (`majority-judgment.ts`, `tie-break.ts`).
2. Tests unitaires obligatoires.
3. Si le JSON snapshot change de forme : régénérer la fixture d’intégration :

```bash
npm run test:integration:generate -- --force
npm run test:integration:print
# Valider manuellement, puis figer meta dans le JSON
```

4. `npm run test:integration`

## Recette E — Tester OAuth Facebook en local

1. Créer une app Meta (type Consumer) — détails dans [README](../../README.md#meta--facebook--configuration).
2. Configurer `.env` : `OAUTH_FACEBOOK_*`, `PUBLIC_BASE_URL`.
3. Créer un sondage `platform: facebook` via `creator.html`.
4. **Important :** l’URL du navigateur doit correspondre à `PUBLIC_BASE_URL` (si vous testez depuis l’extérieur du LAN, utiliser l’IP publique du serveur, pas `localhost` si `PUBLIC_BASE_URL` pointe vers l’IP).

Scopes pilote : `public_profile` uniquement.

## Recette F — Déboguer un sondage

```bash
# État Redis + DB
node scripts/debug-poll-state.mjs <POLL_UUID>

# Résultats API
curl -s -H 'X-Data-Region: EU' http://localhost:3000/polls/<UUID>/results | jq .

# Santé services
curl -s http://localhost:3000/health | jq .
```

Vérifier : worker actif, `voteCount` vs `liveVoteCount`, politique `threshold_*`.

## Recette G — Simuler beaucoup de votes (dev)

```bash
./scripts/simulate-votes.sh <UUID> 50
```

Chaque exécution crée de nouveaux votants `sim-voter-N` (pas de 409).

Pour la charge concurrente : voir `npm run load-test` dans le README.

## Recette H — Modifier l’UI embed (vote ou résultats)

1. Éditer le `.js` correspondant dans `embed/` (ex. `sondage-results.js`).
2. Recharger la page — **pas de build** ; l’API sert les fichiers statiques.
3. Vider le cache navigateur si besoin (Ctrl+Shift+R).
4. Test manuel : créateur → vote → résultats.
5. Test d’intégration si vous changez un contrat API consommé par l’embed.

## Recette I — Ajouter une variable d’environnement

1. Lire la variable dans `config.ts` (API ou worker) avec une valeur par défaut documentée.
2. Documenter dans `.env.example` (commentée).
3. Si impact production : mettre à jour `render.yaml` et la doc README si nécessaire.
4. Si impact conformité : `packages/shared/src/compliance-checks.ts` + `gdpr-checklist.json`.

## Recette J — Lancer uniquement l’API ou le worker

```bash
# API seule
npm run dev -w @sondage/api

# Worker seul (avec .env local)
npm run worker:dev

# Worker prod (machine dédiée, .env.worker.prod)
npm run worker:prod
```

Utile pour isoler un bug (votes acceptés mais pas agrégés → problème worker).

## Recette K — Créer un sondage via curl (sans UI)

```bash
curl -s -X POST http://localhost:3000/polls \
  -H 'Content-Type: application/json' \
  -H 'X-Data-Region: EU' \
  -d '{
    "name": "Test API",
    "creatorId": "dev",
    "platform": "mock",
    "items": [{"label":"A"},{"label":"B"},{"label":"C"}],
    "visibility": "public",
    "voterMode": "anonymous",
    "resultPolicy": "threshold_10",
    "startsAt": "2020-01-01T00:00:00.000Z",
    "endsAt": "2030-01-01T00:00:00.000Z"
  }' | jq .
```

Puis mock login + vote :

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/mock/login \
  -H 'Content-Type: application/json' \
  -d '{"platform":"mock","subjectId":"alice","pollId":"<UUID>"}' | jq -r .accessToken)

curl -s -X POST "http://localhost:3000/polls/<UUID>/votes" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Data-Region: EU' \
  -H 'Content-Type: application/json' \
  -d '{"grades":[{"itemId":"<ITEM_UUID>","grade":3}]}' | jq .
```

## Recette L — Contribuer une PR

1. Branche depuis `main`.
2. Changements focalisés + tests.
3. `npm run test:all` (ou au minimum les jobs CI concernés).
4. Description PR : contexte, plan de test manuel.
5. Ne pas inclure `.env`, fixtures régénérées sans validation, ni docs non demandées.

## Étape suivante

Stratégie de tests détaillée : [07-testing.md](07-testing.md).
