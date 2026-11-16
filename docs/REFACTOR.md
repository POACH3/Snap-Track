# Refactor list

Cleanup and refactor work to do later. Nothing here is done yet.

Entry format: a `##` title saying what to clean up, with `(added YYYY-MM-DD)`.
Then a short paragraph on what it is and how it came about (branch or commit
if known), followed by:

- Where: files, and functions or line numbers.
- Why: why it should change, or why it isn't needed any more.
- Why it can wait: what happens if it stays (optional).
- To fix (or To remove): the steps, and the checks to run afterwards.
- Before doing it, decide: anything that needs the developer's call first (optional).

Group related items under one title, each as its own bold bullet with these fields.

## Segmented control styles are copied in two places (added 2026-11-16)

The Dark / Light / System control in Settings (branch `stage-4-manual-entry`) reuses the look of
Add expense's Quick / Items control by copying its CSS and its button-group markup.

- Where: `apps/web/src/features/settings/SettingsScreen.module.css` (`.themes`, `.theme`) and
  `SettingsScreen.tsx`; `apps/web/src/features/receipts/ManualEntry.module.css` (`.modes`,
  `.mode`) and `modeSwitch` in `ManualEntryScreen.tsx`.
- Why: the sizes and colors are one design (`docs/DESIGN.md`, "Add expense"), so a change to it
  has to be made twice.
- Why it can wait: only two uses, and both are small. Worth doing when a third appears (the
  desktop tabs in `docs/DESIGN.md` are a proposed segmented control).
- To fix: add a shared `SegmentedControl` in `apps/web/src/shared/ui/` (options, value,
  `onChange`, `aria-label`), use it in both screens, and delete the copied CSS. Then run
  `pnpm check` and `pnpm test:e2e` (Add expense is covered by `e2e/manual.spec.ts`).
## SPEC.md says the LLM server starts at boot (added 2026-11-15)

Found while settling the relay contract for Stage 3 (commit `99d3151`). SnapTrack's SPEC
describes the LLM server as a LaunchDaemon that starts at boot, but the LLM-Server project's
own spec says its services are started and stopped by hand and never start by themselves.

- Where: `SPEC.md` §4.6 (Host, "Always on": "SnapTrack, the LLM server, and Tailscale start at
  boot"), §4.7 (Starting at boot: "The LLM server runs the same way under its own account"),
  and the §12 row "Whether oMLX gets the GPU when run as a LaunchDaemon …" (marked "Before
  Stage 3").
- Why: the spec no longer matches how the LLM server is run, and the §12 row may not apply.
- Why it can wait: nothing in SnapTrack depends on it. While the LLM server is stopped,
  extraction jobs wait and finish once it is started again.
- To fix: reword those lines to say the LLM server is started by hand (owned by the LLM-Server
  project), and close or reword the §12 row. Docs only; no checks needed.
- Before doing it, decide: whether the LLM server should start at boot after all (an
  LLM-Server project decision).

## Receipt thumbnails are made but no longer shown (added 2026-11-15)

The receipts list stopped showing thumbnails when it became a list of collapsed digital receipts
(`docs/feature-plans/store-review-plan.md`, Stage 4 part 1). The server still makes a 400 px
thumbnail for every uploaded photo.

- Where: `apps/server/src/modules/receipts/application/receipts-service.ts` (`prepareImage`,
  `putReceipt`), `domain/image-plan.ts` (`thumbnailSize`), `domain/image-keys.ts`,
  `adapters/image-routes.ts` (thumbnail route), `receiptThumbnailPath` in
  `packages/contracts/src/receipts.ts`, `receipt_images.thumbnail_key`, and `SPEC.md` §5
  (`thumbnail_key` "for the receipts list") and §6.8.
- Why: work and disk space for a file nothing shows.
- Why it can wait: thumbnails are small, and nothing breaks while they are made.
- To fix: either find them a use (e.g. the receipt page's photo strip while the full image loads)
  and update §5, or stop making them: drop the thumbnail step and route, keep the column until a
  migration removes it. Then `pnpm check`, `pnpm build` and `pnpm test:e2e`.
- Before doing it, decide: use them somewhere, or remove them.
