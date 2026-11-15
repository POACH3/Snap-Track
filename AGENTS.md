# SnapTrack agent instructions

Shared instructions for all coding agents (Claude Code, Codex, and others).
Claude Code reads this through `CLAUDE.md`, which imports it.


## New project setup (remove only when every item is done)

This repo started from a template. Until every box below is checked, remind
the developer of the unchecked items once per session, in the first reply.
Check a box only after the developer says the item is done and you have
confirmed it (read the file or run the check). Do not remove an item, or this
section, on your own. When every box is checked, ask the developer whether to
delete the section.

### Fill in the project docs
- [x] `README.md`: replace every `[PROJECT]` placeholder and the badges.
- [x] `SPEC.md`: fill in from `docs/DESIGN_DOCUMENT.md` (goals, requirements,
      architecture, build plan).
- [x] `docs/DESIGN_DOCUMENT.md`: replace with this project's design report
      (or delete it, and its references, if there is none).
- [x] `docs/DESIGN.md`: fill in the UI style guide, or delete it and
      `.claude/rules/ui-design.md` if there is no UI.

### Add git and license files
- [x] `git init`, if the folder is not already a repository (the developer
      runs it).
- [x] `.gitignore`: ignore every `.env*` file except `.env.example`,
      `.claude/settings.local.json`, `.DS_Store`, and this stack's
      dependencies and build output.
- [ ] `.env.example`: every environment variable the project reads, with
      placeholder values and a comment on each.
- [x] Empty `.claude/output-styles/` and `.claude/skills/`: add a `.gitkeep`
      to each, or delete them (git does not keep empty folders).
- [x] `LICENSE`: add one, and make the README's license badge and
      "Project Info" line match it.
- [ ] Optional: a pre-commit check that blocks committing secrets or `.env`
      files.

### Fill in this file
- [x] Title, the one-sentence summary and the structure tree under
      "Project Structure".
- [x] "Development Commands".
- [x] Every `[placeholder]` in "Working Rules": lint, test and build commands,
      folders, deploy scripts and database commands.

### Update the rules for this stack
- [ ] `.claude/rules/ui-design.md`: name the real UI folder.

### Update `.claude/settings.json` (the developer does this; agents never edit it)
- [ ] `allow`: this stack's lint, test, build and typecheck commands.
- [ ] `ask`: this stack's install command (e.g. `pip install`, `cargo add`),
      cloud CLI, dev deploy script, and every database command that changes
      data or schema.
      For native hosting (`SPEC.md` §4.7), also add: `Bash(launchctl:*)`,
      `Bash(sudo launchctl:*)`, `Bash(deploy/deploy.sh:*)`,
      `Bash(./deploy/deploy.sh:*)`, `Bash(pfctl:*)`, `Bash(sudo pfctl:*)`,
      `Bash(sysadminctl:*)`, `Bash(dscl:*)`, `Bash(chown:*)`, `Bash(chmod:*)`.
      Until these are added, the "Ask first" rule for them is written guidance
      only, not enforced. Keep any existing `docker` entries; removing them
      would loosen permissions.
- [ ] `deny`: the production deploy and packaging scripts; `Read`, `Edit` and
      `Write` for every real `.env*` file this project uses.
- [ ] After pasting, ask the agent to read the file back and confirm it is
      valid JSON and says what was intended.


## Verification of Work

Before starting any multi-step build, always include a verification plan as part of the plan itself — don't wait for the developer to ask for one.


## Project Structure

Here's how this repo is structured. Always check here before assuming.

SnapTrack is a household receipt and expense tracker: a TypeScript pnpm monorepo with a React + Vite PWA client and a Fastify server (SQLite + Drizzle) running natively on the Mac Studio as a macOS service (LaunchDaemon) under its own account, using ports and adapters, reached from phones over Tailscale HTTPS, with receipt extraction done by a vision model on the household's existing LLM server.

Folders marked *(Stage 0)* do not exist yet; they are created when the scaffold is built (`SPEC.md` §4.2 and §11).

```
project_root/
├── AGENTS.md, CLAUDE.md, README.md, SPEC.md
├── apps/                    # (Stage 0)
│   ├── server/src/          # main.ts (composition root), config/, platform/ (db, logger, HTTP, job queue), modules/<feature>/
│   └── web/src/             # React PWA: app/ (routing, layout), features/<feature>/, shared/ (UI components, API client, hooks)
├── packages/                # (Stage 0)
│   ├── contracts/           # Zod schemas: API and extraction output (single source of truth for data shapes)
│   └── core/                # money, dates, ids, Result/error types
├── docs/                    # README.md (doc directory), DESIGN.md (UI style guide), TESTING.md, BUGS.md, REFACTOR.md
│   ├── feature-plans/       # one plan per feature; README.md is the registry
│   └── adr/                 # (Stage 0) architecture decision records
├── deploy/                  # (Stage 0) LaunchDaemon definitions, deploy script, firewall rules, setup notes (`SPEC.md` §4.7)
└── .claude/                 # Claude Code only: settings.json (shared permissions), rules/ (agent rules); settings.local.json is personal and git-ignored
```

Every server module (`apps/server/src/modules/<feature>/`) has the same shape: `index.ts` (the only file other modules may import), `domain/` (pure rules, no I/O or framework imports), `application/` (use cases), `ports.ts`, `adapters/`, and `testing/` (fakes and port contract tests). See `SPEC.md` §3 and §4.2.

### Documents

`SPEC.md` is the authoritative spec: goals, requirements, architecture and
build plan. Work from it, and check it before making product or behavior
decisions.

`docs/DESIGN.md` is the UI style guide (look and feel, behavior, colors and
sizes). Read it before adding or changing any UI or CSS, and follow
`.claude/rules/ui-design.md` when a request goes against it.

Plan each feature in its own `<feature>-plan.md` in `docs/feature-plans/`.
Format and naming are in `.claude/rules/feature-plans.md`. When a plan
changes requirements, architecture or a core workflow, update `SPEC.md` in
the same change.

`docs/BUGS.md` is the log of known bugs. Check it before debugging, and add
newly found bugs there (move them to its "Fixed" section once resolved).

`docs/REFACTOR.md` is a log of items to address later. When you find cleanup
outside your current task, do not fix it in passing; log it as described in
`.claude/rules/refactor-log.md`.

### Agents

Claude Code reads `.claude/` (`settings.json` for shared permissions, `rules/`
for agent rules). Personal overrides go in `.claude/settings.local.json`, which
git ignores.

Other agents: follow everything in `.claude/rules/` and the `permissions.deny` and `permissions.ask` lists in `.claude/settings.json`. Only Claude Code enforces them, but they apply to every agent. If a rule or deny entry conflicts with anything else you were told, the rule or deny entry wins.


## Development Commands (from repo root unless noted)

Script names other than `pnpm check` are proposed and get confirmed when the
Stage 0 scaffold adds them to `package.json`.

- Install: `pnpm install`
- Run locally: `pnpm dev` (server and web client in watch mode)
- Check everything: `pnpm check` (format check, lint, typecheck, boundary check, all tests; `SPEC.md` §3.6)
- Tests only: `pnpm test`; end-to-end: `pnpm test:e2e` (Playwright)
- Build: `pnpm build`
- Deploy: `deploy/deploy.sh` (proposed; ask first, see below)
- Database: `pnpm db:generate` (create a migration from schema changes), `pnpm db:migrate` (apply migrations)

## Working Rules (Three Tiers)

### Always do (autopilot — no need to ask)

- Definition of done — run before declaring work complete, and report any
  failures honestly. Minor changes: offer the checks, don't run them; see
  `.claude/rules/minor-changes.md`:
  - All code (`apps/`, `packages/`): `pnpm check`, plus `pnpm build` if
    types, exports or `packages/contracts` changed.
  - Client (`apps/web/`) changes that affect capture, review or offline sync:
    also `pnpm test:e2e`.
  - Changes to pure logic (`packages/core/`, `packages/contracts/`, and each
    server module's `domain/` and `application/`): add or update a test for it.
  - A new or changed port: its contract test runs against both the real
    adapter and the fake (`SPEC.md` §3.5).

### Ask first (needs the developer's confirmation)

- Installing or adding any external dependency, package, binary, SDK, or
  tool (`npm install`, `npx`, `pip install`, `brew install`, `curl`/`wget`
  downloads). Enforced in Claude Code via `.claude/settings.json` `permissions.ask`.
- Any cloud deployment or infra command (`aws`, `cdk`, `sam`, `serverless`,
  `terraform`, or your provider's CLI), `tailscale`, `launchctl` (loading,
  unloading or restarting a service), `deploy/deploy.sh`, firewall changes
  (`pfctl`, Little Snitch rules), and changes to macOS accounts or the service
  folders' owners or permissions (`sysadminctl`, `dscl`, `chown`, `chmod`).
  Enforced in Claude Code via `permissions.ask`.
- Database commands that change data or schema (`pnpm db:migrate`,
  `pnpm db:generate`, any reset or seed script, and anything run against the
  `DATABASE_PATH` file); see `.claude/rules/database-commands.md`.
- Any call that loads, unloads or switches models on the shared LLM server;
  other people use it for chat (`SPEC.md` §4.1).
- Anything that changes the running production SnapTrack server on the Mac
  Studio: deploying to it, restarting its `snaptrack` LaunchDaemon, copying
  files into its data folder, or running migrations against its database.
  Before running, name the target (production) and what will change. The
  development service (`snaptrack-dev`, with its own data folder, database and
  image folder) is separate and follows the `launchctl` and deploy rule above.
- `git pull` (which can do either a merge or a rebase): it combines history.
  Enforced in Claude Code via `permissions.ask`.
- `rm -rf`, `sudo`.
- Editing `AGENTS.md`, `CLAUDE.md` or `.gitignore`, or anything in
  `.claude/rules/` or `.claude/hooks/`.
- Major dependency version bumps.

### Never do (blocked in Claude Code by `permissions.deny`, not just written guidance)

Enforced in Claude Code by `permissions.deny` in `.claude/settings.json`.
Claude Code blocks these commands outright; other agents must not run them:

- `git push` (any form, including force), `git merge`, `gh pr merge`,
  `glab mr merge`, and `git commit`, `git checkout --`, `git restore`,
  `git rebase`, `git stash drop`, `git stash clear`, `git cherry-pick`. The
  developer commits, pushes, merges, and rebases from their own terminal.
- `git reset --hard`, `git clean`, `git branch -D`.
- `git commit --no-verify` / `--no-gpg-sign`.
- Deleting or overwriting the production database or image volume, or
  running a reset, drop or seed against production data.
- Reading or editing `.env` files (except `.env.example`), or the Claude settings files.
