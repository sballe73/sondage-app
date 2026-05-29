#!/usr/bin/env bash
# Crée le dépôt GitHub et pousse la branche main (nécessite : gh auth login).
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${1:-sondage-app}"
VISIBILITY="${2:-public}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Installez GitHub CLI : https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Connectez-vous : gh auth login"
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Dépôt git absent — lancez d'abord : git init && git add -A && git commit"
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote origin déjà configuré : $(git remote get-url origin)"
else
  gh repo create "$REPO_NAME" \
    --"$VISIBILITY" \
    --source=. \
    --remote=origin \
    --description "Sondages à grande échelle par jugement majoritaire (MJ), intégration réseaux sociaux"
  echo "Dépôt créé : $(gh repo view --json url -q .url)"
fi

git push -u origin main
echo "OK — code publié sur origin/main"
