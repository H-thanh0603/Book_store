# Engineering conventions

Inspired by twentyhq/twenty's CLAUDE.md, adapted to this repo (Next.js + Prisma + vitest).

## Matching the surrounding code

Match the adjacent files in the directory you are editing. They beat any written rule,
including for file naming.

## Layer boundaries

Monolith equivalent of twentyhq/twenty's package split (`twenty-ui` / `twenty-server`
/ `twenty-shared`). Enforced by `no-restricted-imports` in `eslint.config.mjs` — a
crossing import fails `npm run lint`:

- `src/lib` — server-side domain modules. May import other lib modules and the
  generated Prisma client. Must not import `app/` or `components/`.
- `src/components` — reusable UI. May import other components and exactly two
  client-safe lib modules: `csrf-client`, `error-tracking`. Anything else under
  `lib/` is server-side (Prisma/Redis/SMTP) and would leak into the client bundle.
  If a component needs server data, the route fetches it and passes props.
- `src/app` — routes and pages; the only layer that composes lib + components.

A new client-safe lib module is a deliberate act: add it to the ESLint allowlist in
the same PR with a comment saying why it is safe.

## Task recipes (agent skills)

Recurring changes have a step-by-step recipe in `docs/agents/skills/`:
`add-background-job`, `add-org-scoped-resource`. Follow the recipe instead of
improvising; when a task type recurs a third time, write the next recipe.

## Code style

- Short-form `//` comments explaining only *why* — never what, never JSDoc blocks
  (this repo's `src/lib/jobs.ts` lease/heartbeat comments are the model).
- `type` over `interface`; string-literal unions over `enum`; no `any`.
- Named exports only. (Exception: Next.js route/layout components keep their
  framework-mandated `export default`.)
- No abbreviations in identifiers; `SCREAMING_SNAKE_CASE` for constants; props types
  suffixed `Props`.
- Reuse existing guards/utilities before writing new ones — reimplementing an existing
  util is the most common AI-authored defect. Check `src/lib/` first.

## Testing

- Test behavior, not implementation: query by user-visible text/roles
  (`@testing-library`, Playwright `getByRole`), assert on outcomes.
- Unit tests are colocated `*.test.ts` next to the module (vitest).
- DB-backed integration checks live in `scripts/tests/test-*.ts` (tsx + node:assert).
  The DB-only subset runs under vitest via `npm run test:integration`; scripts that
  need the live dev server run via their own npm scripts (`test:p0`, `test:storefront`,
  `test:hardening`, `test:reset`) with the app up.
- E2E (`npx playwright test`) covers the critical revenue flows: storefront catalog,
  staff auth. Playwright boots the dev server itself on :3000 (with APP_ORIGIN
  overridden to match) and provisions a throwaway staff account through
  `e2e/global-setup.ts` — never log in as seeded accounts in specs; seed passwords
  are create-only and vary per environment.
- Run `npm run test:unit` for the fast loop, `npm run lint` before committing.

## Database migrations (Prisma)

- Never edit a migration that has been applied anywhere. Generate a new one.
- Schema changes that add columns need a backfill plan for existing rows — either
  backfill in the same migration's SQL or a `scripts/` backfill committed alongside.
  Note the rollback in `docs/OPERATIONS.md` when the change is destructive
  (drop column/table/type widening).
- Index changes: run `npm run verify:indexes` after applying.

## Background jobs

- One job = one entry in `JOB_KINDS` (`src/lib/jobs.ts`) + a slot in `NIGHTLY` or
  `FREQUENT`. Job bodies must be idempotent — the scheduler may run them twice.
- Do not add a second queue mechanism (Redis/BullMQ). The Postgres `JobRun` ledger is
  the queue; its runs are visible to ops dashboards.

## Git

- No AI attribution in commit messages (no `Co-Authored-By: Claude`/agent trailers).
- Commit messages follow the existing history: `type(scope): summary`
  (e.g. `fix(pos): link refund txs to original sale via origTxId`).

## Dead code

- `npm run knip` uses a ratchet (`--max-issues`, see `docs/KNIP_BACKLOG.md`): adding
  dead exports/files fails the script. Removing dead code means lowering the count.
- New modules get a call site or a test in the same PR; "we'll wire it later" leaves
  the codebase worse than an unmerged branch.
