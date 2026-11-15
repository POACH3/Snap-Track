# Architecture decision records

One file per significant decision (SPEC.md §3.6): context, decision, consequences.
Numbered in order; a later record may supersede an earlier one, and says so.

| # | Decision | Status |
|---|---|---|
| [0001](0001-architecture.md) | Ports and adapters, feature modules, pnpm monorepo | accepted |
| [0002](0002-api-layer-orpc.md) | API layer: oRPC, contract-first | accepted |
| [0003](0003-hosting-and-runtime.md) | Native LaunchDaemon, root-owned code, TypeScript run directly by Node | accepted |
| [0004](0004-outgoing-internet-block.md) | Outgoing internet block with pf per-user rules | accepted |
