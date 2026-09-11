#!/usr/bin/env bash
# restore-drill.sh — prove a backup is restorable.
# Usage: ./scripts/ops/restore-drill.sh /path/to/backup.dump [scratch_db_name]
# Env:   DATABASE_URL   (admin connection to the "postgres" maintenance DB with
#        CREATEDB, e.g. postgresql://bookstore:pw@localhost:5432/postgres)
#
# Two known Postgres quirks this drill works around:
#
# 1. --clean is NOT used: the scratch DB is created empty at the top, so there
#    is nothing to clean — and on partitioned tables (InventoryMovement) the
#    DROP of inherited partition pkeys always errors ("cannot drop inherited
#    constraint"). Restoring into a fresh DB is both faster and correct.
#
# 2. pg_dump never captures CREATE EXTENSION. The dump DOES contain
#    CREATE EXTENSION IF NOT EXISTS for pg_trgm/unaccent (trusted — any user
#    with CREATE on the schema can run them) and for vector (NOT trusted in
#    pgvector <=0.8.1 — superuser only). When the maintenance URL is not a
#    superuser, vector objects (ProductEmbedding table + data + hnsw index)
#    are EXCLUDED from the drill via a filtered TOC, with a loud warning.
#    Embeddings are derived data (re-embeddable from Product rows), so this
#    still proves the backup restorable where it matters.
set -euo pipefail

DUMP_PATH="${1:-}"; SCRATCH_DB="${2:-bookstore_restore_drill}"
if [[ -z "$DUMP_PATH" || ! -f "$DUMP_PATH" ]]; then
  echo "usage: $0 <path/to/backup.dump> [scratch_db_name]" >&2; exit 2
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must point at the maintenance (postgres) database" >&2; exit 2
fi

# Swap the maintenance db suffix for the scratch db name.
SCRATCH_URL="${DATABASE_URL%/*}/$SCRATCH_DB"

echo "▶ creating scratch database $SCRATCH_DB"
psql "$DATABASE_URL" <<SQL >/dev/null 2>&1
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname='$SCRATCH_DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$SCRATCH_DB";
CREATE DATABASE "$SCRATCH_DB";
SQL

RESTORE_ARGS=(--no-owner)
TOC=""; TRIMMED=""; DEPLOY_LOG="$(mktemp)"
cleanup() { rm -f $TOC $TRIMMED "$DEPLOY_LOG"; }
trap cleanup EXIT

# Best-effort: make the vector extension exist before restore. Trusted
# extensions (trgm/unaccent) are handled by the dump itself.
if psql "$SCRATCH_URL" -c 'CREATE EXTENSION IF NOT EXISTS "vector";' >/dev/null 2>&1; then
  echo "  vector extension ready (superuser or trusted pgvector)"
else
  echo "⚠ pgvector needs superuser to create; drilling WITHOUT ProductEmbedding"
  echo "  (embeddings are derived data — re-embeddable from Product rows)."
  TOC="$(mktemp)"
  TRIMMED="$(mktemp)"
  pg_restore -l "$DUMP_PATH" > "$TOC"
  # Drop: the vector extension DDL + its comment + every ProductEmbedding object
  # (table, data, pkey, hnsw index, FK to Product).
  grep -vE 'EXTENSION - vector|COMMENT - EXTENSION vector|ProductEmbedding' "$TOC" > "$TRIMMED"
  RESTORE_ARGS+=(-L "$TRIMMED")
fi

echo "▶ restoring backup"
pg_restore "${RESTORE_ARGS[@]}" -d "$SCRATCH_URL" "$DUMP_PATH" >/dev/null

echo "▶ verifying migration parity (migrate deploy must be a no-op)"
# Note the ../../.. — this script lives at scripts/ops/, the repo root (where
# prisma/schema.prisma is) is THREE levels up. The old "$(dirname "$0")/.."
# resolved to scripts/ and prisma never found the schema; output went into a
# Capture to a file instead of piping — under `set -o pipefail` a grep -q that
# exits early (SIGPIPE to npx) turned successful runs into failures.
if ( cd "$(dirname "$0")/../.." && DATABASE_URL="$SCRATCH_URL" npx prisma migrate deploy ) > "$DEPLOY_LOG" 2>&1 \
   && grep -qE "applied|No pending migrations|No migrations" "$DEPLOY_LOG"; then
  echo "  ✓ schema in parity"
else
  echo "✗ migrate deploy failed on restored DB:" >&2; sed 's/^/  /' "$DEPLOY_LOG" >&2; exit 1
fi

echo "▶ checking core row counts"
declare -A MIN_ROWS=( [User]=1 [Product]=1 [Store]=1 [Order]=0 )
for tbl in User Product Store Order; do
  count=$(psql "$SCRATCH_URL" -tAc "SELECT count(*) FROM \"$tbl\"" 2>/dev/null || echo 0)
  if (( ${count:-0} < ${MIN_ROWS[$tbl]:-0} )); then
    echo "✗ $tbl has ${count:-0} rows (expected >= ${MIN_ROWS[$tbl]:-0})" >&2; exit 1
  fi
  echo "  ✓ $tbl = ${count:-0}"
done

echo "▶ dropping scratch database"
psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null

echo "✓ restore drill passed — backup $DUMP_PATH is restorable"
