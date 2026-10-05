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
  # (audit Q139) Error tracking is a launch gate, not a nice-to-have:
  # log-only prod means silent money bugs. Missing tracking FAILS go-live.
  fail "no SENTRY_DSN / ERROR_WEBHOOK_URL — errors would live only in PM2 logs"
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

echo "══ 4b. Payment gateway hosts (audit Q155) ══"
# Sandbox hosts must never serve real money. Each gateway host is
# env-selectable (sandbox default, dev-safe); prod MUST point at live.
for pair in "VNP_PAY_HOST|https://www.vnpayment.vn/paymentv2/vpcpay.html" "MOMO_CREATE_URL|https://payment.momo.vn/v2/gateway/api/create" "ZALOPAY_CREATE_URL|https://openapi.zalopay.vn/v2/create"; do
  var="${pair%%|*}"; live="${pair##*|}"
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    warn "$var unset — gateway runs SANDBOX (dev-safe, no real money)"
  elif [[ "$val" == "$live" ]]; then
    pass "$var points at LIVE host"
  else
    fail "$var points at non-live host ($val) — expected $live"
  fi
done
# VNPay specifically: if credentials are set but the host isn't live, go-live
# would silently collect nothing — escalate from warn to FAIL (audit HIGH-2).
if [[ -n "${VNP_TMN_CODE:-}" && -n "${VNP_HASH_SECRET:-}" && "${VNP_PAY_HOST:-}" != "https://www.vnpayment.vn/paymentv2/vpcpay.html" ]]; then
  fail "VNPay credentials set but VNP_PAY_HOST is not the LIVE host — real payments would 404"
fi

echo "══ 4c. Secrets handling (audit HIGH-1, HIGH-6) ══"
# HIGH-1: real secrets must not sit plaintext in a group/world-readable .env.
# Prod should use a secret store / systemd EnvironmentFile outside the repo;
# when .env exists it must at least be owner-only.
if [[ -f "$ENV_FILE" ]]; then
  PERMS=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || echo 0)
  if [[ "$PERMS" == "600" || "$PERMS" == "400" ]]; then
    pass ".env permissions $PERMS (owner-only)"
  else
    fail ".env permissions $PERMS — chmod 600 $ENV_FILE (secrets readable by other users)"
  fi
else
  pass "no .env in worktree — secrets come from the environment"
fi
# HIGH-6: offsite backups carry full PII. backup-offsite.sh encrypts only when
# BACKUP_ENCRYPT_KEY is set — unset means plaintext dumps leave the box.
if [[ -n "${BACKUP_ENCRYPT_KEY:-}" ]]; then
  pass "BACKUP_ENCRYPT_KEY set — offsite backups are encrypted"
else
  fail "BACKUP_ENCRYPT_KEY unset — nightly offsite dumps are plaintext PII"
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
