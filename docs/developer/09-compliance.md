# 9 — Conformité et sécurité (aperçu développeur)

Objectif : connaître les garde-fous techniques avant un déploiement production.

Documentation opérationnelle complète : [compliance/README.md](../../compliance/README.md).

## Modes de conformité

| `COMPLIANCE_MODE` | Comportement |
|-------------------|--------------|
| `prototype` (défaut) | Checks exécutés, échecs = warnings, processus continue |
| `production` | Échec sur check automatisé ou attestation manquante → **exit 1** au démarrage |

Vérification :

```bash
npm run check:compliance
COMPLIANCE_MODE=production npm run check:compliance
```

## Gate au démarrage

`assertStartupCompliance()` est appelé dans :

- `apps/api/src/server.ts`
- `apps/worker/src/worker.ts`

En production, l’API et le worker **refusent de démarrer** si la configuration est dangereuse (secrets faibles, `mock` activé, `LOG_PII=true`, etc.).

Code des règles : `packages/shared/src/compliance-checks.ts`

## Variables sensibles

| Variable | Rôle |
|----------|------|
| `JWT_SECRET` | Signature des tokens votants |
| `PARTICIPATION_HASH_SALT` | Hachage identifiants en mode anonyme |
| `OAUTH_*_SECRET` | Secrets OAuth fournisseurs |

En prod : longueur minimale, valeurs uniques, jamais dans git.

## Plateformes en production

```bash
ENABLED_PLATFORMS=facebook   # sans mock
```

Le check compliance échoue si `mock` est présent en mode production.

## Données personnelles

- `LOG_PII=true` interdit en production (loguer `subjectId`)
- Suppression utilisateur : `POST /auth/me/delete-data`
- Callback Meta : `POST /auth/facebook/data-deletion`
- Pages légales servies sous `/legal/` (contenu `embed/legal/`)

## Rate limiting

Activé en production (`RATE_LIMIT_ENABLED=true`) :

- Global par IP
- Votes par `subjectId` et sondage

Désactivable en dev/staging pour les tests de charge.

## Régions

Header obligatoire `X-Data-Region` pour les sondages non `GLOBAL`.

Mismatch → **451** (séparation juridictionnelle).

## Checklist avant mise en production

1. `COMPLIANCE_MODE=production npm run check:compliance` — exit 0
2. `GDPR_MANUAL_ATTESTATION_VERSION` aligné sur `gdpr-checklist.json`
3. URLs légales HTTPS joignables (crawler Meta)
4. OAuth redirect URIs configurés chez Meta/Google
5. `curl https://VOTRE_INSTANCE/health | jq` — `oauth.facebook.configured`, `enabledPlatforms`
6. Worker prod connecté aux mêmes Postgres/Redis que l’API Render
7. Tests CI verts sur la branche déployée

## Retour au sommaire

[README développeur](README.md)
