#!/usr/bin/env bash
# rollback.sh — redeploy a previous healthy application SHA (app-level only).
#
#   ./scripts/ops/rollback.sh <git-sha> [pm2-app-name]
#
# Policy (see RUNBOOK.md "Rollback"): migrations are FORWARD-ONLY — this
# script never touches the database. It checks out the SHA, rebuilds, and
# rolling-restarts PM2. If the incident needs data repair, restore to a NEW
# database and reconcile (RUNBOOK), don't reverse migrations.
set -uo pipefail

SHA="${1:-}"
APP="${2:-bookstore}"
if [[ -z "$SHA" ]]; then
  echo "usage: $0 <git-sha> [pm2-app-name]" >&2
  exit 2
fi
if ! git cat-file -e "$SHA" 2>/dev/null; then
  echo "unknown git SHA: $SHA" >&2
  exit 2
fi

CURRENT=$(git rev-parse --short HEAD)
echo "rolling back $CURRENT → $SHA (app $APP, database untouched)"
git stash push -m "pre-rollback-$(date +%s)" >/dev/null 2>&1 || true
git checkout "$SHA" || exit 1
npm ci || exit 1
npm run build || exit 1
pm2 reload "$APP" || pm2 start ecosystem.config.js --env production
pm2 save
echo "rollback done. Verify: curl -f localhost:3000/api/health/ready"
echo "Record in HANDOVER/incident log: previous SHA=$CURRENT, restored SHA=$SHA"
