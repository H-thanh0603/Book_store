# Commerce backends — mapping the agents onto your systems

Adapted from `anthropics/commerce-agents` `docs/backends.md`. The shopping and
merchant agents never touch Prisma directly: they read through two interfaces
in `src/lib/commerce/`.

| Interface | File | Prisma implementation | Stub |
|---|---|---|---|
| `StorefrontBackend` | `storefront-backend.ts` | `PrismaStorefrontBackend` → `lib/storefront.ts` | `StubStorefrontBackend` |
| `MerchantBackend` | `merchant-backend.ts` | `PrismaMerchantBackend` → `lib/merchant-agent.ts` | `StubMerchantBackend` |

## Rules

- **Each method calls your service server-side** with the credential the host
  holds for the session; the model reads only the result. Identity
  (`customer.phone/customerId`, staff `auth`) is resolved in the route, never
  by the model.
- **A flow with a fixed order enforces it in the backend**: quote-before-card
  (`prepareCheckout` runs the same engine as `POST /api/storefront`),
  two-factor track (number + phone), atomic suggestion claim
  (`applySuggestionDecision`).
- **Start small**: `COMMERCE_BACKEND=stub` returns `{ unavailable: true }`
  from every method and changes no prompt bytes. A pilot implements search +
  product details and stubs the rest.
- **Switch off what you lack**: `COMMERCE_ENABLE_SEARCH/QUOTE/CHECKOUT/
  TRACKING/MEMORY` and `COMMERCE_ENABLE_DIGEST/INVENTORY/PRICING/CAMPAIGNS/
  LISTING_EDITS` remove tools, prompt lines and grounding rules on every
  path (concierge, merchant, MCP, manifest).
- **Singleton factory**: `getStorefrontBackend()` / `getMerchantBackend()`
  in `src/lib/commerce/index.ts` (reset with `resetCommerceBackends()` in tests).

## Checkout hands off

`prepareCheckout` validates items through the quote engine and returns a
`CheckoutCard { items, quote, checkoutUrl }`. The host (`/shop?agent_cart=…`,
merged by `CartContext`) completes the order via the existing checkout modal
+ `POST /api/storefront`. The model never sees a payment URL.

## Merchant writes refuse

`MerchantBackend.applyChange` always refuses: every write is a `StagedChange`
(`src/lib/staged-changes.ts`) the human applies on `/approvals`. Kinds:
`promotion.create` (draft, `active=false`), `product.patch` (description
only), `suggestion.accept` (same atomic flow as `POST /api/replenishment`).
