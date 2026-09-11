#!/usr/bin/env bash
# backup-offsite.sh — nightly logical backup copied OFF the database host.
#
# Same-box pg_dump is not a backup: one disk failure, one fat-fingered
# DROP DATABASE, one crypto-locker and both the database AND its "backup"
# are gone together. This script does the minimum credible thing:
#
#   1. pg_dump --format=custom (parallel-restorable, single file)
#   2. verify the dump is non-empty and has a plausible magic header
#   3. push it off-box with rclone (S3/GDrive/B2 — whatever is configured)
#   4. keep a local mirror (last N days only)
#   5. prune remote copies older than the retention window
#   6. ping a healthcheck URL (healthchecks.io / Better Uptime cron style)
#      so a silently-dead cron page someone instead of being discovered
#      at the next incident.
#
# Usage:    ./scripts/ops/backup-offsite.sh
# Cron:     15 3 * * *  cd /srv/bookstore && ./scripts/ops/backup-offsite.sh
# Env:      DATABASE_URL   required — app connection string
#           RCLONE_REMOTE required for upload — rclone remote:path, e.g.
#                        "s3:bookstore-backups" (configured via `rclone config`)
#           BACKUP_LOCAL_DIR  dir for the local mirror   (default: backups/)
#           BACKUP_RETENTION_DAYS  days to keep remote  (default: 30)
#           BACKUP_LOCAL_KEEP_DAYS days to keep local   (default: 3)
#           HEALTHCHECK_URL  optional — GET-pinged on success
#           HEALTHCHECK_URL_FAIL  optional — GET-pinged on failure
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOCAL_KEEP_DAYS="${BACKUP_LOCAL_KEEP_DAYS:-3}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
HEALTHCHECK_URL_FAIL="${HEALTHCHECK_URL_FAIL:-}"

fail() {
  echo "✗ $*" >&2
  # Ping the failure URL only if it's set — a dead backup cron must page.
  if [[ -n "$HEALTHCHECK_URL_FAIL" ]]; then curl -fsS -m 10 "$HEALTHCHECK_URL_FAIL" >/dev/null 2>&1 || true; fi
  exit 1
}

[[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL is required"
command -v pg_dump >/dev/null || fail "pg_dump not found — install postgresql-client"
command -v rclone >/dev/null || [[ -n "$RCLONE_REMOTE" ]] || true

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$LOCAL_DIR/bookstore-$STAMP.dump"

mkdir -p "$LOCAL_DIR"

echo "▶ dumping database"
pg_dump --format=custom --compress=6 "$DATABASE_URL" > "$DUMP"

# Sanity checks before we call it a backup: custom-format dumps start with
# the 5-byte magic "PGDMP" and a plausible empty dump is still ~10KB+ with
# schema. A truncated dump would be caught by restore-drill.sh, but we
# don't want to upload garbage in the first place.
SIZE=$(stat -c %s "$DUMP")
[[ "$SIZE" -gt 8192 ]] || fail "dump is only ${SIZE} bytes — suspiciously small"
head -c 5 "$DUMP" | grep -q "PGDMP" || fail "dump does not start with the PGDMP magic header"
echo "  dump: $DUMP ($SIZE bytes)"

if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v rclone >/dev/null || fail "RCLONE_REMOTE is set but rclone is not installed"
  echo "▶ uploading to $RCLONE_REMOTE"
  rclone copy "$DUMP" "$RCLONE_REMOTE" --create-empty-src-dirs=false
  echo "▶ pruning remote copies older than ${RETENTION_DAYS}d"
  # --min-age pairs with -P to delete files, not try to prune the dir itself.
  rclone delete "$RCLONE_REMOTE" --min-age "${RETENTION_DAYS}d" || true
else
  echo "⚠ RCLONE_REMOTE not set — dump kept LOCAL ONLY. This is not an offsite backup."
fi

echo "▶ pruning local mirror older than ${LOCAL_KEEP_DAYS}d"
find "$LOCAL_DIR" -name 'bookstore-*.dump' -mtime +"$LOCAL_KEEP_DAYS" -delete

if [[ -n "$HEALTHCHECK_URL" ]]; then
  curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null 2>&1 \
    && echo "▶ healthcheck pinged" \
    || echo "⚠ healthcheck ping FAILED (backup itself succeeded)"
fi

echo "✓ backup complete: $DUMP"
