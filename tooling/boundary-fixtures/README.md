Deliberate boundary violations. `tooling/boundaries.test.ts` runs dependency-cruiser
on this folder and checks each rule in `.dependency-cruiser.mjs` catches its case.
Never imported by real code; excluded from typecheck, lint and `pnpm boundaries`.
