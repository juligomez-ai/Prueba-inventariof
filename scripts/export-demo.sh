#!/usr/bin/env bash
# Genera prisma/demo-data.sql: simula los 6 meses de historia en la base local y la exporta como INSERTs.
# Uso: npm run demo:export   (requiere pg_dump y DATABASE_URL apuntando a una base local)
set -euo pipefail
cd "$(dirname "$0")/.."
URL="$(grep '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"' | cut -d'?' -f1)"
SEED_RESET=1 DEMO_SIMULATE=1 npx prisma db seed
{
  echo "-- Datos de ejemplo de Botánica Viva (6 meses de historia), generados con npm run demo:export"
  echo "-- snapshot: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  pg_dump "$URL" --data-only --inserts --rows-per-insert=300 --no-owner --no-privileges \
    --exclude-table=_prisma_migrations --schema=public
} > prisma/demo-data.sql
echo "Listo: prisma/demo-data.sql ($(du -h prisma/demo-data.sql | cut -f1))"
