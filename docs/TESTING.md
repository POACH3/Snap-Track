# Testing

Index of SnapTrack tests. Run everything with `pnpm check` (format, lint,
typecheck, boundaries, tests); tests alone with `pnpm test`.

## Suites

| Suite | Command | What it covers |
|---|---|---|
| Unit and integration | `pnpm test` (Vitest) | Every `*.test.ts` under `apps/*/src`, `packages/*/src` and `tooling/` |
| Boundaries | `pnpm boundaries` (dependency-cruiser) | Architecture rules in `.dependency-cruiser.mjs` (SPEC.md §3.1) |
| End-to-end | `pnpm test:e2e` (Playwright) | Not set up yet; arrives with the first capture flow (Stage 2) |

## Test files

| File | Covers |
|---|---|
| `packages/core/src/money.test.ts` | `allocateCents` (exact sums, remainders, negative and zero totals, bad weights); `formatUsd` |
| `apps/server/src/config/load-config.test.ts` | Config validation: each missing variable is named; several errors reported at once |
| `apps/server/src/platform/db/sqlite-transaction.test.ts` | `Transaction.run`: commits, rolls back on throw, nested savepoints, refuses async `fn` (type and run time) |
| `apps/server/src/platform/db/migrations.test.ts` | Migrations apply to a fresh database, are idempotent, pending count; foreign keys on |
| `apps/server/src/platform/http/create-http-server.test.ts` | `/healthz`, oRPC under `/rpc`, 404 for unknown procedures, a request ID per request |
| `tooling/boundaries.test.ts` | Each boundary rule fires on its deliberate violation in `tooling/boundary-fixtures/` |

## Test helpers

- `apps/server/src/platform/db/testing/test-database.ts`: `createTestDatabase()`, a
  fresh in-memory SQLite database with every migration applied. One per test.

## Not covered

- Web client components (no component tests until there is real UI).
- Host setup, firewall, Tailscale and deploy (Stage 0 steps 9–11): manual checks,
  to be listed in `deploy/README.md`.
