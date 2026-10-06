#!/usr/bin/env bash
# Read-only Postgres MCP server for coding agents (pattern from twentyhq/twenty).
# Runs crystaldba/postgres-mcp in restricted mode: SELECT/EXPLAIN only, no writes.
# Credentials stay in bookstore/.env — never inline DATABASE_URL into .mcp.json.
set -a
source "$(dirname "$0")/../../.env"
set +a
# --with "mcp<2": postgres-mcp still uses the v1 FastMCP API; mcp 2.x renamed it.
exec uvx --with "mcp<2" postgres-mcp "$DATABASE_URL" --access-mode=restricted
