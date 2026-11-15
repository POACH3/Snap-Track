# 0001: Ports and adapters, feature modules, pnpm monorepo

**Date:** 2026-11-15. **Status:** accepted.

## Context
SnapTrack must stay easy to change (SPEC.md §1, goal 4): the LLM server, the database and
image storage may all be replaced, and the extraction approach will be compared and
possibly swapped (§6.3). Client and server share many data shapes.

## Decision
- **Ports and adapters** (§3.1). Business logic depends on small interfaces; adapters
  implement them; one composition root (`apps/server/src/main.ts`) wires them.
- **Feature modules** under `apps/server/src/modules/<feature>/`, each with `index.ts`,
  `domain/`, `application/`, `ports.ts`, `adapters/`, `testing/`. Modules own their tables.
- **pnpm workspaces**: `apps/server`, `apps/web`, `packages/contracts` (Zod schemas and the
  API contract), `packages/core` (money, ids, `Result`, the `Transaction` port type).
- **Enforced by tooling**: dependency-cruiser rules in `.dependency-cruiser.mjs`, run by
  `pnpm check`, with a self-test (`tooling/boundaries.test.ts`) proving each rule fires.

## Consequences
- More files per feature than a flat layout; each has one purpose.
- Repository ports are synchronous (better-sqlite3), so moving to an async database means
  changing those ports too (§3.1 rule 7). Accepted.
- Layer rules apply to production code; test files are exempt from them (they import test
  tools and wire real modules), but not from the module-boundary and no-cycle rules.
