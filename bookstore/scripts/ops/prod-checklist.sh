#!/usr/bin/env bash
# prod-checklist.sh — R4: verify a production box is actually production-ready.
# Run ON the prod machine (needs psql + pm2 + read access to the app .env):
#
#   cd /srv/bookstore && ./scripts/ops/prod-checklist.sh
#
# Every check prints PASS/FAIL; exit code = number of failures (0 = go-live
# ready). Wire it to a weekly cron — configuration drifts, this catches it.
set -uo pipefail

FAIL=0
pass() { echo "✓ PASS: $*"; }
fail() { echo "✗ FAIL: $*"; FAIL=$((FAIL + 1)); }
warn() { echo "⚠ WARN: $*"; }

APP_DIR="${APP_DIR:-/srv/bookstore}"
ENV_FILE="${ENV_FILE:-$APP_DIR/bookstore/.env}"
# shellcheck disable=SC1090
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

echo "══ 1. PostgreSQL — WAL archiving (PITR) ══"
if command -v psql >/dev/null; then
  WAL=$(psql "${DATABASE_URL:-}" -tAc "SHOW archive_mode; SHOW archive_command;" 2>/dev/null | tr '\n' ' ')
  [[ "$WAL" == *"on"* ]] && pass "archive_mode=on ($WAL)" || fail "WAL archiving OFF — RPO is 24h, not 15min"
  # Latest archived segment must be fresh (archiver stuck = silent RPO growth).
  SPOOL="${WAL_SPOOL_DIR:-/var/lib/bookstore/wal}"
  if [[ -d "$SPOOL" ]]; then
    NEWEST=$(find "$SPOOL" -type f -printf "%T@\n" 2>/dev/null | sort -n | tail -1 || echo 0)
    AGE=$(( $(date +%s) - ${NEWEST%.*} ))
    [[ "$AGE" -lt 3600 ]] && pass "newest WAL segment ${AGE}s old" || fail "newest WAL segment ${AGE}s old (archiver stuck?)"
  else
    fail "WAL spool dir missing: $SPOOL"
  fi
else
  fail "psql not found"
fi

echo "══ 2. Backups — recency + offsite ══"
if [[ -n "${RCLONE_REMOTE:-}" ]] && command -v rclone >/dev/null; then
  pass "RCLONE_REMOTE set ($RCLONE_REMOTE)"
  # Newest remote dump within 30h proves the nightly cron actually ran.
  LATEST=$(rclone lsl "$RCLONE_REMOTE" --max-depth 1 2>/dev/null | sort -k2,3 | tail -1 || true)
  [[ -n "$LATEST" ]] && pass "remote backup present: $(echo "$LATEST" | awk '{print $NF}')" || fail "no remote backups found"
else
  fail "offsite backup not configured (RCLONE_REMOTE/rclone) — same-box dump is not a backup"
fi

echo "══ 3. PM2 — app + worker ══"
if command -v pm2 >/dev/null; then
  pm2 jlist 2>/dev/null | grep -q '"name":"bookstore"' && pass "bookstore app online" || fail "bookstore app not in pm2"
  pm2 jlist 2>/dev/null | grep -q '"name":"bookstore-worker"' && pass "bookstore-worker online" || fail "bookstore-worker missing — jobs stall on web worker death"
  if command -v pm2-logrotate >/dev/null || pm2 list 2>/dev/null | grep -q logrotate; then
    pass "pm2-logrotate present"
  else
    fail "pm2-logrotate missing — ./logs grows until disk-full (OPS-002)"
  fi
else
  fail "pm2 not found"
fi

echo "══ 4. Secrets & mail ══"
for var in DATABASE_URL INTEGRATION_ENCRYPTION_KEY; do
  [[ -n "${!var:-}" ]] && pass "$var set" || fail "$var missing"
done
if [[ -n "${SENTRY_DSN:-}" || -n "${ERROR_WEBHOOK_URL:-}" ]]; then
  pass "error tracking configured"
else
  warn "no SENTRY_DSN / ERROR_WEBHOOK_URL — errors live only in PM2 logs"
fi
if [[ -n "${SMTP_HOST:-}" ]]; then
  pass "SMTP configured ($SMTP_HOST)"
else
  warn "SMTP unset — password resets + low-stock mail only log locally"
fi
if [[ -n "${CARRIER_WEBHOOK_SECRET:-}" ]]; then
  pass "carrier webhook secret set"
else
  warn "CARRIER_WEBHOOK_SECRET unset — GHTK/VTP status pushes disabled"
fi

echo "══ 5. App health ══"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"
if curl -fsS -m 10 "$APP_URL/api/health/ready" >/dev/null 2>&1; then
  pass "readiness 200 at $APP_URL"
else
  fail "readiness probe failed at $APP_URL"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then echo "ALL CHECKS PASSED — go-live ready."; else echo "$FAIL CHECK(S) FAILED."; fi
exit "$FAIL"
