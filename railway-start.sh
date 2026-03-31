#!/bin/sh
# Applique les migrations Prisma puis démarre l'app
npx prisma db push --skip-generate
exec node_modules/.bin/next start -p ${PORT:-3000}
