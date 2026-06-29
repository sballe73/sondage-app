# 1 — Prérequis et premier lancement

Objectif : avoir l’application qui tourne sur votre machine et comprendre les briques minimales (navigateur, API, base de données).

## Ce dont vous avez besoin

| Outil | Version | Rôle |
|-------|---------|------|
| **Node.js** | 22+ (voir `.node-version`) | Exécute l’API, le worker et les scripts |
| **npm** | fourni avec Node | Gestion des dépendances (workspaces) |
| **Docker** + **Docker Compose** | récent | Postgres et Redis en local |
| **Git** | récent | Cloner et versionner le code |
| **Un navigateur** | Chrome, Firefox… | Tester les pages embed |

Optionnel mais utile plus tard :

- **jq** — lire les réponses JSON en terminal (`curl … | jq`)
- **k6** — tests de charge (voir README racine)

### Vérifier l’installation

```bash
node -v    # doit afficher v22.x ou v23.x
npm -v
docker compose version
```

## Concepts de base (si vous débutez)

- **Terminal** : fenêtre où vous tapez des commandes texte.
- **API** : programme qui répond à des requêtes HTTP (créer un sondage, enregistrer un vote).
- **Base de données (Postgres)** : stocke les sondages, votes agrégés, snapshots.
- **Redis** : file d’attente rapide entre l’API (qui reçoit les votes) et le worker (qui les traite).
- **Worker** : processus en arrière-plan qui lit Redis et met à jour Postgres.

Sans Postgres/Redis, l’API ne peut pas fonctionner. Sans worker, les votes s’accumulent mais les résultats ne se calculent pas.

## Installation pas à pas

Depuis la racine du dépôt :

```bash
# 1. Services de données
docker compose up -d

# 2. Variables d'environnement
cp .env.example .env
# Le fichier .env par défaut convient au dev local ; ne le commitez pas.

# 3. Dépendances JavaScript
npm install

# 4. Compilation TypeScript de tous les packages
npm run build

# 5. Schéma base de données + données de démo
npm run db:migrate
npm run db:seed

# 6. API + worker en mode développement
npm run dev
```

`npm run dev` lance **deux processus** en parallèle :

- l’**API** sur le port **3000** ;
- le **worker** qui agrège les votes (intervalle configurable, 60 s par défaut).

## Première utilisation dans le navigateur

1. Ouvrir [http://localhost:3000/embed/creator.html](http://localhost:3000/embed/creator.html)
2. Créer un sondage (plateforme **mock**, 3 candidats minimum).
3. Suivre le lien **vote** proposé.
4. Voter (connexion mock automatique en dev).
5. Ouvrir **résultats** — si la politique est `threshold_10`, il faut au moins 10 votes pour voir le classement.

Pour simuler des votes rapidement :

```bash
./scripts/simulate-votes.sh <UUID_DU_SONDAGE> 10
```

Remplacez `<UUID_DU_SONDAGE>` par l’identifiant affiché à la création.

## Vérifier que tout répond

```bash
curl -s http://localhost:3000/health | jq .
```

Réponse attendue : statut `ok`, bases `postgres` et `redis` connectées.

## Structure minimale des dossiers (aperçu)

```
sondage-app/
├── apps/
│   ├── api/          # Serveur HTTP (Fastify)
│   └── worker/       # Agrégation des votes
├── packages/
│   ├── db/           # Postgres, migrations, repositories
│   └── shared/       # Types, validation, algorithme MJ
├── embed/            # Pages HTML + widgets (vote, résultats…)
├── tests/            # Intégration, conformité, charge
├── scripts/          # Utilitaires shell
├── docker-compose.yml
├── .env.example
└── package.json      # Scripts racine (dev, test, build)
```

Le détail de chaque dossier est dans [02-monorepo.md](02-monorepo.md).

## Commandes utiles au quotidien

| Commande | Effet |
|----------|--------|
| `npm run dev` | API + worker avec rechargement auto |
| `npm run build` | Recompile tout le TypeScript |
| `npm run test` | Tests unitaires (`packages/shared`) |
| `npm run test:integration` | Tests bout-en-bout (nécessite Docker) |
| `npm run db:migrate` | Applique les migrations SQL |
| `docker compose down` | Arrête Postgres et Redis |
| `docker compose up -d` | Redémarre les services |

## Dépannage

### `ECONNREFUSED` sur le port 5432 ou 6379

Postgres ou Redis n’est pas démarré :

```bash
docker compose up -d
docker compose ps   # les deux services doivent être "healthy"
```

### Les résultats restent vides après un vote

- Le **worker** doit tourner (`npm run dev` l’inclut).
- Avec `threshold_10`, il faut **10 votes** avant publication.
- Attendre l’intervalle snapshot (`SNAPSHOT_MIN_INTERVAL_MS`, défaut 60 s) ou simuler plus de votes.

### `npm run build` échoue

Compiler dans l’ordre des dépendances : `shared` → `db` → `worker` → `api`. Le script `npm run build` racine le fait déjà.

### Port 3000 déjà utilisé

Changer `PORT` dans `.env` ou arrêter l’autre processus.

## Étape suivante

Vous avez un environnement fonctionnel. Passez à [02-monorepo.md](02-monorepo.md) pour savoir **où chercher** dans le code selon votre tâche.
