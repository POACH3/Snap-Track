# Stage 0: scaffold, quality gates and hosting

**Changes SPEC.md:** §4.5 Configuration, §4.7 Hosting and isolation, §9 Security and Privacy, §10 Backups, §11 Stage 0, §12 Open Questions, §13 Risks.  
**Status:** shipped (2026-11-15; every Stage 0 "Done when" check passed on the Mac Studio, see `deploy/README.md`).

Builds everything in `SPEC.md` §11 Stage 0: the monorepo and its quality gates,
a placeholder app served by Fastify, the first migration, and production hosting
on the Mac Studio under `_snaptrack`. No product features.

## What changed in SPEC.md, and why

Decided 2026-11-15, while reviewing the plan against the machine as it is set up.

- **Code, Node and config are owned by root; `_snaptrack` writes only its data
  (§4.7).** The spec had all of them owned by `_snaptrack`. The main risk in §13
  is a bad npm package. The firewall stops it sending data out; making
  everything the service *runs* read-only to it also stops it rewriting its own
  code, swapping its Node binary, or changing its `.env`, so nothing it
  changes outlives a deploy. It also makes rollback a one-link change.
- **Folder layout named** (`/opt/snap-track/{app,runtime,config,build,data,logs,home}`)
  with owners and modes. The spec said `700` everywhere; root-owned folders
  must be `750` so `_snaptrack` can read them through its group.
- **Group membership never reaches data or secrets** (§4.7). The admin
  account `tstrattondesktop` is in the `_snaptrack` group, and the developer
  chose to keep it there. So the group may read only `app/` and `runtime/`
  (code); `data/`, `logs/` and `home/` are `700`; and `config/` and `.env` are
  granted to the `_snaptrack` user by name through an ACL. Without this, the
  admin account (and any coding agent running as it) could read household data
  and secrets without `sudo`.
- **`.env` lives in `config/`, `root:wheel` `600` plus a read-only ACL for
  `_snaptrack`** (§4.5, §9, §10), instead of `600` owned by `_snaptrack`. Kept
  out of `data/` so backups never hold secrets; restores recreate it from saved
  values.
- **Deploy exports the commit from the admin checkout (`git archive`)** instead
  of fetching it, so the install window only needs the package registry, not
  the code host, and `_snaptrack` needs no GitHub credentials. Deploy also
  backs up the database before migrating, checks the new release answers, rolls
  back on failure, and keeps three releases.
- **Node and pnpm are pinned and installed into `runtime/` with `mise`**, and
  the LaunchDaemon runs that Node by full path. On 2026-11-15 Homebrew's Node
  broke (a library it linked against was replaced), which would have taken
  production down with it.
- **pnpm `minimumReleaseAge` = 7 days** (§4.7, §13): no package version
  younger than a week is installed.
- **`PORT` added to config; `.env` loaded with Node's `--env-file`** (§4.5), so
  no dotenv package.
- **Stage 0 "Done when" gains** three checks: the firewall closes again after a
  deploy (even a failed one), `_snaptrack` can't write its code, runtime or
  config, and a rollback works.

## Progress (2026-11-15)

- **Done:** steps 1–8, experiments E3 and E4. `pnpm check` and `pnpm build` pass
  (42 tests). A domain file importing Fastify makes `pnpm check` fail.
- **Written, not yet run:** steps 9–11 as `deploy/setup.sh`, `deploy/deploy.sh`,
  `deploy/admin.sh` and `deploy/firewall/` (they need `sudo`, so the developer runs
  them). E1 and E2 are checks in `deploy/README.md`.
- **Found while writing them:** HTTPS 443 on the Tailscale name is already the LLM
  server's chat page, so SnapTrack uses 8443. Tailscale is the standalone app, so boot
  without login must be tested. The server now refuses to start if it can reach the
  internet (`start-production.ts`), so a missing firewall at boot fails closed.
- **Changed from the plan while building:**
  - No `tsx` and no server build: Node 26 runs the server's TypeScript directly
    (ADR 0003). The LaunchDaemon runs `app/current/apps/server/src/main.ts`.
  - pnpm 11 ignores `onlyBuiltDependencies`; the setting is `allowBuilds`. No
    package needs an install script, so none is allowed (ADR 0003).
  - TypeScript 6.0.3, not 7: typescript-eslint supports below 6.1 only.
  - The server refuses to start while migrations are pending, so new code never
    runs on an old schema; `pnpm db:migrate` stays a deliberate step.
  - The boundary self-test found that excluding `/dist/` hid most npm imports from
    the rules; the exclude is now anchored to `apps/*/dist/`.

## Pinned versions

| Tool | Version | Where pinned |
|---|---|---|
| Node | 26.13.1 (LTS line) | `.node-version`, `engines.node` |
| pnpm | 11.21.0 | `packageManager`, `engines.pnpm` |
| mise | 2026.11.8 (Homebrew, admin account) | not pinned; only installs the two above |

## Before building: the developer does these

1. **`.claude/settings.json`** (the unchecked AGENTS.md setup items), plus for
   this layout:
   - `deny`: `Read`, `Edit` and `Write` for `/opt/snap-track/config/**` and
     `/opt/snap-track/data/**`.
   - `ask`: the native-hosting list in AGENTS.md, plus `Bash(dseditgroup:*)`,
     `Bash(sudo:*)` if not already there, `Bash(mise install:*)`, and
     `Bash(tailscale:*)`.
   Then ask the agent to read it back and confirm. With the admin account in
   the `_snaptrack` group, these deny entries are a second guard for agents;
   the folder modes and ACLs are the first.
2. **Approve the dependency list** below (Step 2 installs it).
3. **Tailnet settings:** MagicDNS and HTTPS certificates enabled in the
   Tailscale admin console (needed by `tailscale serve`).

## Experiments first

Four open questions (§12) decide how later steps are written. Each is a short
experiment, run before its step, with the result recorded in an ADR.

| # | Question | How it's tested | Decides |
|---|---|---|---|
| E1 | Can `pf` block outgoing traffic per user? How is the registry allowed during installs? | A `pf` anchor with `block out ... user _snaptrack` plus `pass` for `127.0.0.1` and the Tailscale interface; `sudo -u _snaptrack curl https://example.com` must fail and `curl http://127.0.0.1:<relay port>` must work. `pf` matches addresses, not names, and the registry is behind a CDN, so the install window most likely opens *all* outgoing traffic for `_snaptrack` for that step only. Compare with Little Snitch (domain rules, but a paid GUI app with its own boot behavior). | Step 9; ADR "Outgoing internet block" |
| E2 ✅ | Does Tailscale connect at boot with no one logged in? **Result (2026-11-15):** no; the standalone app connects at login. Accepted: log in after any restart (SPEC.md §4.7). | `tailscale` here is the GUI app (no `tailscaled` LaunchDaemon). Reboot, don't log in, ping the Mac's Tailscale address from a phone. If it fails, switch to the open-source `tailscaled` run as a LaunchDaemon (Homebrew `tailscale`), re-authenticate, re-test. | Step 10 |
| E3 ✅ | How does oRPC mount on Fastify, and does an image upload work through it? **Result:** `@orpc/server/fastify` under `/rpc/*` with Fastify's body parsers removed; a 5 MB file arrived intact. Stage 2 must add an upload size limit (ADR 0002). | Smallest possible server: one oRPC procedure taking a `File` input, mounted via oRPC's Node/Fastify handler; upload a 5 MB JPEG with the typed client; check bytes and size limit. | Steps 4–5; ADR "API layer: oRPC" |
| E4 ✅ | Where does pnpm 11 read `onlyBuiltDependencies` and `minimumReleaseAge`, and does `better-sqlite3` install on Node 26? **Result:** `allowBuilds` and `minimumReleaseAge` in `pnpm-workspace.yaml`; unlisted scripts fail the install. better-sqlite3 13 ships prebuilt binaries and needs no script (ADR 0003). | In a scratch folder: set both in `pnpm-workspace.yaml`; add `better-sqlite3` plus a test package with a `postinstall` that writes a file; check only `better-sqlite3` builds and the file is not written. Check whether `better-sqlite3` gets a prebuilt binary for Node 26 (ABI 147) or compiles from source (Xcode command-line tools and Python are installed). If it compiles, set `npm_config_nodedir` to `runtime/`'s Node so `node-gyp` doesn't download headers during the install window. | Steps 1, 6, 9 |

## Build steps

Each step ends with its own check. "Ask" marks steps that need the developer's
go-ahead when they run.

1. **Monorepo skeleton.** Root `package.json` (`packageManager`, `engines`,
   scripts), `pnpm-workspace.yaml` (workspaces, build allowlist, release age),
   `.node-version`, `tsconfig.base.json` (strict), workspaces `apps/server`,
   `apps/web`, `packages/contracts`, `packages/core`, each with a placeholder
   export.
   *Check:* `pnpm install` works; `pnpm -r exec tsc --noEmit` passes.
2. **Quality gates (ask: dependency install).** Prettier, ESLint (flat config,
   `typescript-eslint` strict, no `any`), Vitest workspace, dependency-cruiser
   rules for §3.1: domain imports no framework or other layer; modules import
   other modules only through `index.ts`; dependencies point inward; no cycles;
   `apps/web` and `apps/server` never import each other. `pnpm check` runs
   format check → lint → typecheck → boundary check → tests.
   *Check:* `pnpm check` passes on the skeleton; a throwaway
   `modules/example/domain/bad.ts` importing `fastify` makes it fail (then delete it).
3. **`packages/core` and `packages/contracts` starters.** `Result` type and a
   typed error base; `Money` as integer cents with `formatUsd` and
   `allocateCents` (exact, sums to the input); the config schema (§4.5) in
   `contracts`. Only what Stage 0 uses or §3.2 names as shared primitives;
   nothing speculative.
   *Check:* unit tests for `allocateCents` (sums exactly, handles remainders,
   zero and negative totals) and the config schema (rejects each missing or
   bad variable).
4. **Server platform.** `config/` loads `process.env` through the schema and
   exits with a clear message on bad config. Pino logger with a request ID per
   line; Fastify bound to `127.0.0.1:$PORT` with `trustProxy` set for
   `tailscale serve`; `/healthz`; oRPC mounted per E3 with one `ping`
   procedure; `main.ts` as the composition root.
   *Check:* starting with a missing `SESSION_SECRET` exits non-zero with the
   variable named; `curl 127.0.0.1:$PORT/healthz` answers; log lines carry
   `reqId`.
5. **Web placeholder and PWA.** Vite + React + TanStack Query; a page that
   calls `ping` through the typed oRPC client and shows the result;
   `vite-plugin-pwa` manifest and icons, so it can be installed to the home
   screen; Fastify serves the built app with SPA fallback. No real UI yet, but
   colors and type follow `docs/DESIGN.md`.
   *Check:* `pnpm build` then the server alone serves the app and `ping` works
   at `http://127.0.0.1:$PORT`.
6. **Database (ask: running the first migration).** `platform/db`:
   `better-sqlite3` connection (WAL mode, foreign keys on, busy timeout),
   Drizzle, the `Transaction.run(fn)` port whose type rejects a
   Promise-returning `fn` (§3.1 rule 7), and a test helper giving each test a
   fresh `:memory:` database with migrations applied. First migration: one
   `meta` table (schema version), so the pipeline is proven without designing
   feature tables early.
   *Check:* a type test (`// @ts-expect-error` on an async `fn`); a test that
   a thrown error inside `Transaction.run` rolls back; `pnpm db:migrate`
   against a temp file creates the table.
7. **`.env.example` and dev loop.** Every variable from §4.5 with placeholder
   values and a comment on each; `pnpm dev` runs the server (`node --watch`,
   `--env-file=.env`) and Vite (proxying API calls) together; repo `data/`
   for local data (already git-ignored).
   *Check:* fresh clone + `.env` from the example + `pnpm dev` shows the page.
8. **ADRs** in `docs/adr/`: 0001 architecture (ports and adapters, modules,
   monorepo); 0002 API layer: oRPC over ts-rest and a hand-written layer (with
   E3's result); 0003 hosting: native LaunchDaemon, root-owned code, folder
   layout; 0004 outgoing internet block (E1's result).
9. **Host setup (ask: `sudo`, `chown`, `chmod`, `pfctl`, `mise install`).**
   `deploy/setup.sh`, idempotent, run once from the admin account, prints each
   change before making it:
   - Checks `_snaptrack` exists, and lists its group's other members.
   - Creates the missing folders (`runtime/`, `config/`, `build/`, `logs/`) and
     sets owners, modes and ACLs on all of them per §4.7. This changes `data/`
     and `home/` from `750` to `700`. `config/` gets
     `chmod +a "user:_snaptrack allow list,search"`.
   - Installs the pinned Node and pnpm into `runtime/` with `mise`
     (`MISE_DATA_DIR=/opt/snap-track/runtime/mise`), root-owned.
   - Creates `config/.env` from `.env.example` if missing (`root:wheel` `600`,
     plus `chmod +a "user:_snaptrack allow read"`), for the developer to fill
     in with `sudo`. The agent never opens it.
   - Installs the `pf` anchor per E1 and makes it load at boot.
   - Writes `/Library/LaunchDaemons/snaptrack.plist`: `UserName` and
     `GroupName` `_snaptrack`, `Umask` 077 (decimal 63), `RunAtLoad`,
     `KeepAlive`, `HOME=/opt/snap-track/home`, `NODE_ENV=production`,
     `WorkingDirectory` `data/`, output to `logs/`, and `ProgramArguments`
     running `runtime/`'s Node with `--env-file=/opt/snap-track/config/.env`
     on `app/current/apps/server/src/main.ts`.
   - `deploy/README.md`: setup notes (Energy settings, FileVault off,
     Homebrew libraries, Tailscale setup, how to restore `.env`).
   *Check:* the permission checks under Verification.
10. **Tailscale (ask: `tailscale`).** Per E2; then
    `tailscale serve --bg --https=443 http://127.0.0.1:$PORT`.
    *Check:* `https://<mac>.<tailnet>.ts.net` loads from a phone.
11. **Deploy and rollback (ask: running `deploy/deploy.sh`).** The steps in
    §4.7; the firewall window uses a `trap` so it closes even if install fails;
    migrations wait for a typed `yes`; `deploy.sh --rollback` points `current`
    at the previous release and asks before restoring a database backup.
    *Check:* the deploy checks under Verification.

## Dependencies to approve

The newest version of each that is at least 7 days old, resolved at install time.

| Package | Where | Why |
|---|---|---|
| `typescript`, `@types/node` | root (dev) | §3.4 |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals` | root (dev) | linting (§3.4) |
| `prettier` | root (dev) | formatting |
| `vitest` | root (dev) | tests (§3.5) |
| `dependency-cruiser` | root (dev) | boundary check (§3.6) |
| `zod` | contracts, server, web | §3.2 |
| `@orpc/contract`, `@orpc/server`, `@orpc/client`, `@orpc/tanstack-query` | contracts / server / web | API (§4.4) |
| `fastify`, `@fastify/static` | server | HTTP, serving the built app |
| `better-sqlite3`, `@types/better-sqlite3` | server | database; the only build-allowlist entry |
| `drizzle-orm`, `drizzle-kit` (dev) | server | ORM and migrations |
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | web | client |
| `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa` | web (dev) | build, PWA |
| `@tanstack/react-query` | web | data fetching (§4.2) |

Not in Stage 0: Playwright (Stage 2, first capture flow), `idb` (Stage 5),
`argon2` and cookie handling (Stage 1).

## Verification

Every item in §11 Stage 0 "Done when", and how it is checked. Results get
recorded in `docs/TESTING.md` (automated) or `deploy/README.md` (manual host checks).

| Done-when item | Check | Kind |
|---|---|---|
| Boundary violation fails `pnpm check` | Step 2 check; also a dependency-cruiser self-test fixture kept in the repo so the rules can't silently stop matching | automated |
| Install script not on the allowlist doesn't run | E4 fixture: a local test package whose `postinstall` writes a marker file; install, assert no marker | scripted, repeatable |
| Outgoing internet refused, `localhost` works | `sudo -u _snaptrack curl -m 5 https://example.com` fails; `sudo -u _snaptrack curl http://127.0.0.1:<relay port>/` answers | manual, in `deploy/README.md` |
| …and refused again after a deploy, even a failed one | Run a deploy with a deliberately broken lockfile; after it fails, repeat the curl check | manual |
| Other accounts and the admin (no `sudo`) can't read data or `.env` | As `tstrattondesktop` (a `_snaptrack` group member) and a throwaway standard account: `ls /opt/snap-track/data` and `cat /opt/snap-track/config/.env` are refused; `ls -le` shows the only ACL entries are `_snaptrack`'s on `config/` and `.env`. As `_snaptrack`: `.env` is readable, not writable | manual |
| `_snaptrack` can't write code, runtime or config | `sudo -u _snaptrack touch` into `app/current/`, `runtime/`, `config/` all fail; into `data/` succeeds | manual, scripted in `deploy/setup.sh --check` |
| Rollback leaves the previous release serving | Deploy commit A, deploy commit B (placeholder text changed), `--rollback`; the page shows A's text | manual |
| After a reboot with no one logged in, HTTPS page from a phone, installs to home screen | Reboot, don't log in; open the Tailscale URL on the iPhone and an Android phone; Add to Home Screen; opens standalone | manual |
| Unit tests (`allocateCents`, config schema, `Transaction.run`) | `pnpm check` | automated |

`pnpm check` and `pnpm build` must pass before the stage is called done.

## Out of scope

- The `snaptrack-dev` daemon (§4.7). Built only if needed; whether it gets its
  own account is decided then.
- The nightly backup job (Stage 5). Deploy's pre-migration backup is a one-off
  copy.
- Any feature tables or screens.

## Risks and notes

- If E1 shows `pf` can't match by user on this macOS version, the fallback is
  Little Snitch. That changes ADR 0004 and adds a paid app.
- If Tailscale's GUI app doesn't connect at boot, E2's switch to `tailscaled`
  needs a re-login of the Mac to the tailnet.
- Node 26 is new for native modules; if `better-sqlite3` can't build on it,
  fall back to Node 24 LTS and update the pin.
- `deploy/setup.sh` and `deploy/deploy.sh` change the production host; each
  run needs the developer's go-ahead (`.claude/rules/deploys.md`).
