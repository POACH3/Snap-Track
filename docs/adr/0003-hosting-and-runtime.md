# 0003: Native LaunchDaemon, root-owned code, TypeScript run directly by Node

**Date:** 2026-11-15. **Status:** accepted.

## Context
SnapTrack runs on the Mac Studio next to the LLM server, which needs the GPU (no Docker;
§4.6). The likeliest threat is a malicious npm package (§13). On 2026-11-15 Homebrew's
Node broke after a library it linked to was replaced.

## Decision
- **Hosting** as a LaunchDaemon under the hidden `_snaptrack` account, folders under
  `/opt/snap-track/` (§4.7).
- **Root owns everything the service runs** (code in `app/releases/<commit>/`, Node in
  `runtime/`, `.env` in `config/`); `_snaptrack` writes only `data/`, `logs/`, `home/`.
  `config/` and `.env` are granted to the `_snaptrack` user by ACL, because the admin
  account is (by choice) in the `_snaptrack` group.
- **Pinned runtime**: Node 26.13.1 and pnpm 11.21.0 (`.node-version`, `engines`,
  `packageManager`), installed into `runtime/` with `mise`, started by full path.
- **No server build step.** Node 26 strips TypeScript types itself, so the server runs
  its `.ts` source directly, in development (`node --watch`) and production. TypeScript is
  set to `erasableSyntaxOnly` (no enums, namespaces or constructor parameter properties)
  and imports use `.ts` extensions. Workspace packages export their `src/index.ts`.
- **No install scripts at all.** pnpm 11 reads `allowBuilds` (not `onlyBuiltDependencies`,
  which it ignores) from `pnpm-workspace.yaml` and fails the install when an unlisted
  package wants a script. better-sqlite3 13 ships prebuilt binaries and esbuild ships
  platform packages, so both are listed as `false`. `minimumReleaseAge` is 7 days.
- **TypeScript 6.0**, not 7: typescript-eslint 8 supports TypeScript below 6.1 only.

## Consequences
- Deploy ships source plus `node_modules`; only the web app is built.
- A future package that truly needs an install script must be added to `allowBuilds`
  with the developer's approval; until then installs refuse it.
- The outgoing-internet block (§4.7) is decided in ADR 0004, after the `pf` experiment.
