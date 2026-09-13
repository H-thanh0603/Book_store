# Commerce safety — enforced rules

Adapted from `anthropics/commerce-agents` `docs/safety.md`. Each rule lists
its module and the paths that enforce it. A deployment adds authentication
and real payment verification first; the examples here assume the existing
staff session + agent-key quotas.

| Rule | Module | Paths |
|---|---|---|
| Consequential actions need a human (checkout/payment/refund never auto-called) | `lib/agent.ts` policy + concierge prompt + `prepareCheckout` card | concierge, MCP, manifest |
| Read-only agent tools; model never mutates | `SKILL_TOOLS` + `BASE_RULES`, `MerchantBackend.applyChange` refuses | `/api/merchant`, `/api/concierge` |
| Merchant writes are staged; atomic approve claim | `lib/staged-changes.ts` (`reviewStagedChange`), `/approvals` | staged-changes API, UI |
| Grounding: names/prices/numbers only from tool results | concierge `byId` filter + DB override; merchant `BASE_RULES` | concierge, merchant |
| Fencing: catalog text in tool results sanitized (control chars, forged turn markers, tool/fence tags) + wrapped in `<UNTRUSTED_DATA>`; memory values sanitized; prompt declares fence content data-not-instructions | `lib/fencing.ts` (`sanitizeUntrusted`, `fenceUntrusted`, `fenceToolResult`), `lib/customer-memory.ts` `renderMemoryBlock`, concierge system prompt | concierge |
| Provenance labels (`humanVerified:false`, W3C PROV) | `merchantProvenance`, concierge response | both agents |
| Two-factor order tracking (number + phone), no PII out | `trackStorefrontOrder` | REST, MCP |
| Memory validation (allowlist keys, ≤200 chars, no card-like runs) | `lib/customer-memory.ts` `validateMemoryInput` | concierge |
| Rate limits: per-IP/key buckets + global daily LLM caps | `agentRateLimit`, `enforceRateLimit`, `DAILY_LIMIT` | all agent routes |
| Quotas for keyed agents + hash-chained session log | `lib/agent-auth.ts`, `GET /api/agent-events/verify` | all agent routes |
| Agent-side discount caps (percentage ≤30, fixed ≤100k) | `validatePromotionCreate` | staged-changes |
| Listing-patch bounds (description 10–2000, no dynamic markup) | `validateProductPatch` | staged-changes |
| Deterministic totals (quote == checkout engine) | `quoteStorefrontOrder` shared by quote/card/checkout | storefront |

What is intentionally NOT here yet: web `checkout` still trusts the
client-supplied cart shape (re-priced server-side, amounts never trusted),
and there is no card-charge flow at all (COD/VNPay via existing checkout).
