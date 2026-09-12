#!/usr/bin/env bash
# wal-archive.sh — PostgreSQL archive_command helper for point-in-time recovery.
#
# A nightly pg_dump alone caps recovery at RPO ~24h: everything committed
# after the last dump is gone. WAL archiving closes that gap to minutes —
# restore = last base backup + replay archived segments to a target time.
#
# Usage (postgresql.conf):
#   wal_level = replica
#   archive_mode = on
#   archive_command = '/srv/bookstore/scripts/ops/wal-archive.sh %p %f'
#
# Env:
#   WAL_SPOOL_DIR  local spool for segments (default: /var/lib/bookstore/wal)
#   RCLONE_REMOTE  optional — rclone remote:path for off-box copy, e.g.
#                  "s3:bookstore-backups/wal". Without it the script keeps
#                  LOCAL ONLY segments and warns (same honesty rule as
#                  backup-offsite.sh: never silently pretend).
#
# Design: cp first (archive_command must be fast and infallible from
# Postgres' view), then best-effort off-box upload. A failed upload exits 0
# so Postgres recycles normally, but logs loudly — the nightly
# backup-offsite.sh + monitoring must alert on spool growth / missing remote.
set -uo pipefail

SRC="${1:-}"; SEG="${2:-}"
SPOOL="${WAL_SPOOL_DIR:-/var/lib/bookstore/wal}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

[[ -n "$SRC" && -n "$SEG" ]] || { echo "usage: $0 <segment-path> <segment-name>" >&2; exit 1; }
mkdir -p "$SPOOL"

# Local spool is the source of truth Postgres depends on — must succeed.
cp "$SRC" "$SPOOL/$SEG" || { echo "✗ wal spool copy failed for $SEG" >&2; exit 1; }
chmod 600 "$SPOOL/$SEG"

# Off-box copy is best-effort: never fail archive_command over the network.
if [[ -n "$RCLONE_REMOTE" ]]; then
  if ! rclone copyto "$SPOOL/$SEG" "$RCLONE_REMOTE/$SEG" >/dev/null 2>&1; then
    echo "⚠ wal segment $SEG spooled locally but OFF-BOX upload failed" >&2
  fi
else
  echo "⚠ RCLONE_REMOTE unset — wal segment $SEG is LOCAL ONLY" >&2
fi
exit 0
