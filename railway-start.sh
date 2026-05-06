#!/bin/sh
# Crée les dossiers persistants, applique le schema, restaure la DB, démarre l'app
mkdir -p /data
mkdir -p /data/rapports
npx prisma db push --skip-generate --accept-data-loss || true
if [ "$SKIP_RESTORE" != "1" ]; then
  node prisma/restore.js
fi
exec node_modules/.bin/next start -p ${PORT:-3000}
