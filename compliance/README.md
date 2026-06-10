# Conformité RGPD — checklist opérationnelle

Checklist versionnée dans [`gdpr-checklist.json`](gdpr-checklist.json). Vérification automatisée :

```bash
npm run check:compliance              # mode prototype (warnings)
COMPLIANCE_MODE=production npm run check:compliance
```

## Modes

| `COMPLIANCE_MODE` | Comportement |
|---|---|
| `prototype` (défaut) | Checks exécutés, échecs = warnings, exit 0 |
| `production` | Échec sur item automatisé ou attestation manquante → exit 1 |

## Passage en production

1. Implémenter et valider tous les checks automatisés (`COMPLIANCE_MODE=production npm run check:compliance`).
2. Compléter la checklist manuelle ci-dessous.
3. Définir dans l’environnement de déploiement :
   - `COMPLIANCE_MODE=production`
   - `GDPR_MANUAL_ATTESTATION_VERSION=2026-06-09` (doit correspondre à `manualAttestationVersion` dans `gdpr-checklist.json`)
   - `ENABLED_PLATFORMS=facebook` (sans `mock`)
   - `MOCK_OAUTH=false`

## Checklist manuelle (avant attestation)

- [ ] AIPD rédigée et archivée
- [ ] Registre des traitements à jour
- [ ] DPO désigné ou prestataire identifié
- [ ] Revue CNIL si applicable
- [ ] Meta Developers : URLs légales, callback suppression testé en conditions réelles
- [ ] Politique de confidentialité revue et alignée avec le comportement technique
- [ ] Procédure email suppression manuelle documentée (`embed/legal/data-deletion.html`)

## Post-déploiement

```bash
curl -s https://VOTRE_INSTANCE/health | jq .
# oauth.facebook.configured, enabledPlatforms, legalUrls
```

Test callback Meta depuis le Dashboard Developers (Data Deletion).
