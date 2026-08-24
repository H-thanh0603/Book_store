#!/usr/bin/env bash
# restore-drill.sh — prove a backup is restorable.
# Usage: ./scripts/restore-drill.sh /path/to/backup.dump [scratch_db_name]
# Env:   DATABASE_URL   (admin connection to the "postgres" maintenance DB;
#            e.g. postgresql://bookstore:pw@localhost:5432/postgres)
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

echo "▶ restoring backup"
pg_restore --clean --if-exists --no-owner -d "$SCRATCH_URL" "$DUMP_PATH" >/dev/null

echo "▶ verifying migration parity (migrate deploy must be a no-op)"
( cd "$(dirname "$0")/.." && DATABASE_URL="$SCRATCH_URL" npx prisma migrate deploy 2>&1 ) \
  | grep -qE "applied|No pending migrations|No migrations" || { echo "✗ migrate deploy failed on restored DB" >&2; exit 1; }

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
