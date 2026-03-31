#!/bin/sh
# Crée le dossier data si besoin, applique les migrations, démarre l'app
mkdir -p /data
npx prisma db push --skip-generate
exec node_modules/.bin/next start -p ${PORT:-3000}
