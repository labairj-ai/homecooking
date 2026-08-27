#!/usr/bin/env bash
# Backs up homecooking.db and uploads/ to a private GitHub repo.
# Repo: https://github.com/labairj-ai/homecooking-data
# Local clone: ~/.homecooking-backup

set -euo pipefail

PROJECT_DIR="/home/optiplex/homecooking"
BACKUP_DIR="$HOME/.homecooking-backup"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

if [ ! -d "$BACKUP_DIR/.git" ]; then
  echo "[backup] Cloning homecooking-data repo…"
  git clone git@github-homecooking:labairj-ai/homecooking-data.git "$BACKUP_DIR"
fi

cp "$PROJECT_DIR/homecooking.db" "$BACKUP_DIR/homecooking.db"

rsync -a --delete "$PROJECT_DIR/uploads/" "$BACKUP_DIR/uploads/"

cd "$BACKUP_DIR"
git add homecooking.db uploads/

if git diff --cached --quiet; then
  echo "[backup] No changes — nothing to push."
else
  git commit -m "Data backup — $TIMESTAMP"
  git push origin main
  echo "[backup] Pushed to homecooking-data."
fi
