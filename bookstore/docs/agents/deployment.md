# Commerce deployment — three ways to run an agent

Adapted from `anthropics/commerce-agents` `docs/deployment.md`.

## 1. Next.js routes (reference loop — what runs today)

The agents run as route handlers around the same prompt/skills/tools on
every path: `POST /api/concierge` (shopping), `POST /api/merchant`
(merchant, staff-only). Hosts pass identity in the request body/headers;
nothing runs after the turn except best-effort memory writes.

## 2. Agent SDK (bring your own loop)

The prompts (`SYSTEM_PROMPT`, `SKILL_PROMPTS`), tool contracts
(`SEARCH_TOOL`, `SKILL_TOOLS`) and backends (`src/lib/commerce/`) are
plain data + functions — mount them in any agent SDK by exposing each
backend method as a tool. Grounding rules stay identical because they live
in the prompts, not the runner. `managed-agents/*.json` in this repo is
the tool manifest to copy from.

## 3. Managed agents (hosted over MCP)

`managed-agents/shopping-agent.json` and `merchant-agent.json` describe
each role (tools, switches, approval policy) for a hosted agent that calls
this deployment's MCP server (`POST /.well-known/mcp-server` discovery,
JSON-RPC to `/api/mcp`). Provenance gates stay in front of every write:
the MCP surface is read-only + checkout-card-only; merchant writes do not
exist on MCP at all — they live behind staff auth on `/approvals`.

## Schedules

The merchant digest is on-demand today (`skill: "digest"`). A cron hitting
`POST /api/merchant` with a service identity plus `staged-changes?status=
PENDING` polling covers the reference "scheduled digest" until a job
worker owns it.

## Gateways

Any OpenAI-compatible gateway works via `src/lib/llm.ts`: canonical
`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`, with the historical
`DEEPSEEK_*` names as fallback (defaults: `https://api.deepseek.com`,
`deepseek-chat`). OpenRouter: `LLM_BASE_URL=https://openrouter.ai/api/v1`
+ key + model id; `OPENROUTER_HTTP_REFERER` / `OPENROUTER_X_TITLE` are
forwarded when present. Daily spend caps stay on the
`DEEPSEEK_DAILY_LIMIT` / `MERCHANT_DAILY_LIMIT` names.
