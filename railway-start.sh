#!/bin/sh
# Crée les dossiers persistants, applique le schema, restaure la DB, démarre l'app
mkdir -p /data
mkdir -p /data/rapports
npx prisma db push --skip-generate
node prisma/restore.js
exec node_modules/.bin/next start -p ${PORT:-3000}
