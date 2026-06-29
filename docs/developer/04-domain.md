# 4 — Concepts métier

Objectif : comprendre le **domaine** du produit avant de modifier le code.

## Jugement majoritaire (MJ)

Chaque votant attribue une **note entière** à **chaque candidat** (pas un seul choix).

- Échelle par défaut : **1 à 7** (1 = Excellent, 7 = À rejeter)
- `bestGradeIsLowest: true` → plus la note est **basse**, mieux c’est

Pour chaque candidat :

1. On construit un **histogramme** (combien de votes à chaque note)
2. On calcule la **médiane** → **mention majoritaire**
3. On classe les candidats par médiane (meilleure médiane = meilleur rang)

Code : `packages/shared/src/majority-judgment.ts`

### Ex-aequo

Si deux candidats ont la même médiane, on applique la **méthode des groupes d’insatisfaits** :

- Code : `packages/shared/src/dissatisfied-groups.ts`, `tie-break.ts`
- Exposé dans l’API : `tieBreakMethod`, `tieBreakMethodDescription`, `ballotage`

### Affichage

`medianDisplay` combine note, libellé et pourcentages partisans/opposants :

> `3 — Bien (partisans 45 %, opposants 20 %)`

## Structure d’un sondage

| Champ | Description |
|-------|-------------|
| `name` | Titre |
| `platform` | Plateforme du **créateur** à la création (`mock`, `facebook`, `google`, etc.) ; voir multi-plateforme ci-dessous |
| `platformLocked` | `false` si `ALLOW_MULTI_PLATFORM_AUTH=true` à la création — le sondage accepte alors plusieurs plateformes de vote |
| `items` | 3 à 14 candidats (`label`) |
| `startsAt` / `endsAt` | Fenêtre de vote (ISO 8601) |
| `visibility` | `public` ou `group` (restreint aux membres OAuth) |
| `voterMode` | `anonymous` (seule la participation compte) ou `public` (bulletins listés) |
| `resultPolicy` | Quand publier les résultats (voir ci-dessous) |
| `dataRegion` | `EU`, `US`, `GLOBAL` |
| `gradeMin` / `gradeMax` / `gradeLabels` | Échelle de notation |

## Authentification multi-plateforme

Avec `ALLOW_MULTI_PLATFORM_AUTH=true` (`.env`), **un même sondage** accepte des votants connectés via **plusieurs plateformes** activées sur l'instance (`ENABLED_PLATFORMS`).

- Le créateur s'authentifie via OAuth (ou `creatorId` en mock) ; le champ `platform` enregistre surtout la plateforme du créateur.
- `platformLocked: false` sur le sondage ; l'embed propose les boutons de connexion disponibles (`/health` → `allowMultiPlatformAuth`, `loginPlatforms`).
- Un votant ne peut voter **qu'une fois par couple** `(plateforme, subjectId)` sur un sondage (contrainte Postgres + Redis SETNX).

Sans cette variable (comportement historique) : le sondage est verrouillé sur **une seule** plateforme ; tout token d'une autre plateforme est rejeté (`403 PLATFORM_MISMATCH`).

Code : `apps/api/src/config.ts` (`isMultiPlatformAuthAllowed`), `apps/api/src/routes/auth.ts`, `packages/db/src/process-vote-batch.ts`.

## Politiques de résultats

| Politique | Résultats visibles quand… |
|-----------|---------------------------|
| `end_only` | Le sondage est terminé (`endsAt` passé ou fermé) |
| `threshold_1` | Au moins 1 vote |
| `threshold_10` | Au moins 10 votes (**défaut** courant) |
| `threshold_100` | Au moins 100 votes |
| `threshold_1000` | Au moins 1000 votes |

Règle importante : le seuil s’applique à la **première** publication. Les mises à jour suivantes publient dès qu’il y a de nouveaux votes (sous réserve de `SNAPSHOT_MIN_INTERVAL_MS`).

Code : `packages/shared/src/results-policy.ts`

## Plateformes OAuth

| Plateforme | Statut | Usage |
|------------|--------|-------|
| `mock` | Dev / CI | `POST /auth/mock/login`, pas de vrai OAuth |
| `facebook` | Pilote prod | Meta Login |
| `google` | Implémenté | Nécessite projet GCP |
| `linkedin`, `x`, `apple` | Prévu / abandonné | Voir `packages/shared/src/platforms.ts` |

Variable `ENABLED_PLATFORMS` (CSV) : restreint les plateformes actives sur une instance.

En production : **pas de `mock`** (`ENABLED_PLATFORMS=facebook` typiquement).

## Modes de vote

### Anonymous

- Enregistre `vote_participation` (qui a voté)
- Pas de `vote_ballots` publics
- Feuille d’émargement (noms) : `GET /polls/:id/attendance` — **créateur uniquement**, sur `creator.html`

### Public

- Bulletins stockés et consultables : `GET /ballots`, `GET /ballots/:subjectId`

## Anti-fraude et limites

| Mécanisme | Où |
|-----------|-----|
| Un vote par personne et sondage | Redis SETNX + UNIQUE Postgres sur `(pollId, platform, subjectId)` |
| Fenêtre temporelle | API à l’ingestion |
| Rate limit global | 100 req/min/IP |
| Rate limit votes | 5 tentatives/min/votant/sondage |
| Idempotency-Key | Rejeu sûr du même vote |

## Conformité et vie privée

- Hash du `subjectId` pour participation anonyme (`PARTICIPATION_HASH_SALT`)
- Suppression données : `POST /auth/me/delete-data`, callback Meta
- Gate au démarrage si `COMPLIANCE_MODE=production`
- Détails : [compliance/README.md](../../compliance/README.md) et [09-compliance.md](09-compliance.md)

## Codes d’erreur API courants

Format uniforme :

```json
{ "error": "message lisible", "code": "CODE_MACHINE", "details": { } }
```

| Code HTTP | Code | Situation |
|-----------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body invalide (Zod) |
| 401 | `UNAUTHORIZED` | Token manquant ou invalide |
| 403 | `FORBIDDEN` / `PLATFORM_MISMATCH` | Mauvaise plateforme (mode mono-plateforme), sondage fermé, seuil non atteint |
| 404 | `NOT_FOUND` | Sondage ou snapshot absent |
| 409 | `ALREADY_VOTED` | Doublon |
| 429 | `RATE_LIMIT_EXCEEDED` | Trop de requêtes |
| 451 | `REGION_MISMATCH` | Header région incorrect |

## Étape suivante

Comment **écrire du code** qui respecte ces règles : [05-code-conventions.md](05-code-conventions.md).
