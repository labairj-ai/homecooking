#!/usr/bin/env bash
set -e

REMOTE="optiplex@192.168.1.178"
REMOTE_DIR="~/homecooking"

echo "==> Building client..."
npm run build --workspace=client

echo "==> Syncing files to optiplex..."
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'uploads' \
  client/dist/ ${REMOTE}:${REMOTE_DIR}/client/dist/

rsync -az \
  server/ ${REMOTE}:${REMOTE_DIR}/server/

rsync -az \
  package.json ${REMOTE}:${REMOTE_DIR}/package.json

echo "==> Installing server deps on optiplex..."
ssh ${REMOTE} "cd ${REMOTE_DIR} && npm install --workspace=server --omit=dev"

echo "==> Restarting service..."
ssh ${REMOTE} "sudo systemctl restart homecooking"

echo "==> Done. https://homecooking.tailb97cdb.ts.net/"
