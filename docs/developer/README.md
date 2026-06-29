# Guide développeur — Sondage App

Ce guide accompagne un nouveau contributeur, **y compris un débutant en programmation**, depuis l'installation jusqu'aux sujets avancés (worker, snapshots, conformité RGPD).

Lisez les chapitres **dans l'ordre** la première fois. Ensuite, utilisez ce sommaire comme référence.

## Parcours d'apprentissage

| Étape | Chapitre | Ce que vous saurez faire |
|-------|----------|---------------------------|
| 1 | [Prérequis et premier lancement](01-setup.md) | Installer les outils, démarrer l'app, voter une première fois |
| 2 | [Carte du monorepo](02-monorepo.md) | Savoir où se trouve chaque partie du code |
| 3 | [Architecture et flux de données](03-architecture.md) | Comprendre API → Redis → Worker → Postgres |
| 4 | [Concepts métier](04-domain.md) | Jugement majoritaire, plateformes, politiques de résultats |
| 5 | [Conventions de code](05-code-conventions.md) | Règles du projet, erreurs API, où ajouter du code |
| 6 | [Recettes](06-recipes.md) | Tâches courantes pas à pas (endpoint, migration, OAuth…) |
| 7 | [Tests](07-testing.md) | Lancer les tests, écrire un test d'intégration |
| 8 | [Conformité et sécurité](09-compliance.md) | Gate RGPD, variables sensibles, checklist prod |

## Documentation complémentaire

| Sujet | Où le trouver |
|-------|----------------|
| Démarrage rapide, OAuth Meta/Google, déploiement Render | [README racine](../../README.md) |
| Conformité RGPD (checklist production) | [compliance/README.md](../../compliance/README.md) |
| Pages légales (privacy, terms) | `embed/legal/` (servies par l'API sous `/legal/`) |

## Glossaire rapide

| Terme | Signification |
|-------|----------------|
| **Sondage / poll** | Question posée aux votants ; chaque candidat reçoit une note |
| **Jugement majoritaire (MJ)** | Méthode de vote : médiane des notes par candidat, puis classement |
| **Plateforme** | Réseau social lié au sondage (`mock`, `facebook`, `google`…) |
| **Snapshot** | Version figée des résultats publiés (histogrammes + classement) |
| **Embed** | Pages et widgets HTML/JS intégrables dans un site |
| **Monorepo** | Un seul dépôt git avec plusieurs packages (`apps/`, `packages/`) |

## Aide

- En cas de blocage sur l'environnement local : revoir [01-setup.md](01-setup.md), section dépannage.
- Pour une modification précise : [06-recipes.md](06-recipes.md).
- Pour comprendre *pourquoi* le worker attend une minute : [03-architecture.md](03-architecture.md).
