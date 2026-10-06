---
name: add-org-scoped-resource
description: Use when adding a new Prisma model, API route or store-scoped resource to the multi-tenant bookstore — schema conventions, org-scope helpers, plan gating and tenant-isolation testing.
---

# Add an org-scoped resource

This is a multi-tenant system on a shared schema. Every resource belongs to an
org, directly or through `Store → Region → Organization`. A query without an
org boundary is a P0 data leak, not a style issue.

## Steps

1. **Schema** (`prisma/schema.prisma`):

   ```prisma
   model MyResource {
     id        String       @id @default(uuid())
     orgId     String       // direct org association, or storeId + join below
     // ...
     org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

     @@index([orgId, createdAt])   // tenant-scoped list queries
   }
   ```

   Resources tied to a store (orders, inventory) use `storeId` instead and get
   their org boundary via the join — Prisma can't infer cross-relation filters.

2. **Migration**: `npx prisma migrate dev --name <name>` in dev, hand-written
   SQL following the existing style for anything destructive. Never edit an
   applied migration. Run `npm run verify:indexes` for index changes.

3. **Route** (`src/app/api/**/route.ts`) — routes are the query layer:

   ```ts
   import { prisma } from "@/lib/db";
   import { withOrg } from "@/lib/org-scope";        // direct orgId models
   import { withOrgViaStore } from "@/lib/org-scope"; // store-linked models

   const rows = await prisma.myResource.findMany({ where: withOrg(auth) });
   ```

   - `withOrg(auth)` fails closed: no org on the auth → 403, never unscoped.
   - Store-scoped resources still need `requirePermission(..., storeId)`; the
     helpers only enforce the org boundary.
   - Growth paths (create stores/users/webhook endpoints) call
     `assertWithinPlanLimits` / `assertPlanFeature` first.

4. **Prisma discipline**: import the shared `prisma` from `@/lib/db` — never
   construct a client (ESLint enforces this). Route value-imports from the
   generated client are limited to enums and the `Prisma` error namespace.

5. **Test**: unit tests colocated; tenant isolation is covered by
   `npm run test:tenant` — extend it when the resource introduces a new
   scoping pattern. Verify: `npm run lint && npm run knip && npx tsc --noEmit`.

## Anti-patterns

- `prisma.myResource.findMany()` without a `where` built from `withOrg*`.
- Trusting `orgId` from the request body — it comes from `auth` only.
- A new PrismaClient instance, or per-route connection pools.
- Feature toggles per org: use `src/lib/feature-flags.ts` overrides, not ad-hoc
  boolean columns.
