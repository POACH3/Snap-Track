# Stage 4, part 5: merges

**Changes SPEC.md:** §4.3 Merges (tags join, `tagsMerged`), §5 Rules (what a merge keeps), §11 Stage 4.  
**Status:** active (built 2026-11-16 on branch `stage-4-merges`).

The last of the five Stage 4 plans. Merging two stores, two items, two hierarchy entries or two
tags into one, as SPEC.md §4.3 lays out: `catalog` merges its own tables, and `receipts` moves its
own rows through the `CatalogMergeListener` port, all in one transaction.

## Decided with the developer (2026-11-16)

1. **Tags merge too**, like the rest (SPEC.md listed stores, items and the hierarchy).
2. **Same-named children merge too.** When an entry's children move under the kept entry and one
   has the same name as a child already there, the two merge, all the way down, so siblings never
   share a name.
3. **The kept one's settings win.** Where only one value fits (an item's category, a store's
   default), the kept entry keeps its own; the merged-away one's fills a gap only. Tags combine.
4. **No mock.** Built from the guide's existing pieces: a search picker, the confirm modal and
   the main button ("Merge stores", as `docs/DESIGN.md` names it).

## Decisions (proposed in this plan)

### What each merge does (catalog, then receipts through the listener)

- **Stores:** every store identifier moves to the kept store (they are unique by type and
  value, so none collide). Item codes and printed names saved for the merged-away store move to
  the kept one; where the kept store already has the same code or name, its row stays and the
  other goes, and if they pointed to different items the kept row is marked ambiguous (it no
  longer tells the two apart). The default category per decision 3. Receipts move
  (`receipts.store_id`). The merged-away store is deleted.
- **Items:** every identifier moves to the kept item; category per decision 3; tags combine;
  the kept item's name stays. Purchases move (`line_items.item_id`). The merged-away item is
  deleted.
- **Hierarchy entries:** only on the same level (SPEC.md §5). Children move under the kept entry,
  same names merging (decision 2). Items' categories and stores' defaults that pointed to it
  point to the kept one; so do purchases' own categories and the model's guesses
  (`line_items.line_category_id`, `suggested_category_id`). The merged-away entry is deleted.
- **Tags:** items' and purchases' tags move to the kept tag, without repeats; the model's tag
  guesses too (`suggested_tag_ids`). The merged-away tag is deleted.
- **One transaction:** `catalog`'s changes and the listener's run in one `Transaction.run`; a
  failure anywhere changes nothing (SPEC.md §4.3).

### The port

`CatalogMergeListener` in `catalog`'s `ports.ts`: `storesMerged(from, to)`, `itemsMerged(from,
to)`, `categoriesMerged(from, to)`, `tagsMerged(from, to)`, synchronous. `receipts` supplies
`SqliteCatalogMergeListener`, wired in `main.ts` like `PurchaseLabelUsage`.

### Screens

- **Library › Stores › a store** and **Library › Items › an item:** a **Merge into another…**
  secondary button opens a modal with a search of the others; choosing one opens the confirm
  ("Merge Fresh Mart #31 into Fresh Mart? Its receipts and details move to Fresh Mart, and Fresh
  Mart #31 is gone."), with **Merge stores** / **Merge items** as its main button. After it, the
  kept one's page opens with a toast.
- **Library › Labels:** an entry's ⋯ sheet and a tag's sheet gain **Merge into…**, listing the
  entries on the same level (by full path) or the other tags.

## As built (2026-11-16)

- **No migration:** merges only move and delete rows.
- **The merge steps** are `catalog`'s `MergeRepository` (`sqlite-merge-repository.ts`) and the use
  cases in `merge-catalog.ts`; `receipts`' side is `SqliteCatalogMergeListener`, wired in
  `main.ts` and `createTestApp()` like `PurchaseLabelUsage`.
- **The model's tag guesses** (`line_items.suggested_tag_ids`) move with a tag merge too.
- **After a store or item merge** the kept one's page opens before the lists refresh, so the
  merged-away page never shows "No such store".
- **In Library › Labels** the merge picker takes the sheet's place, since no window opens over
  another (`docs/DESIGN.md`, "Modals").
- **Playwright** covers a store and a category merge; item and tag merges are covered by the
  use-case tests only.

## Build

1. **Contracts:** `stores.merge`, `items.merge`, `categories.merge`, `tags.merge` (`{ id, intoId }`;
   errors: not found, into itself, a different level).
2. **Catalog:** repositories' merge steps, the merge use cases, the port.
3. **Receipts:** `SqliteCatalogMergeListener`.
4. **Web:** the merge picker and confirm on the four pages.
5. **Docs:** SPEC.md sections above, `docs/DESIGN.md`, `docs/TESTING.md`, the plan registry.

## Verification

| Stage 4 "Done when" / behavior | Check | Kind |
|---|---|---|
| After merging two items, every line from both shows the kept item; its identifiers still match | Use-case test | automated |
| A store merged from its Library page: its receipts listed under the kept store; a category merged in Labels leaves the tree | Playwright | automated |
| The same for two stores (receipts, identifiers, item codes, default) and two hierarchy entries (children, same names merged, items, stores, lines, guesses) | Use-case tests | automated |
| Tags merge without repeats on items and lines | Use-case test | automated |
| A merge that fails partway changes nothing | Use-case test (a listener that throws) | automated |
| Into itself, missing, or another level is refused | Use-case tests | automated |

`pnpm check`, `pnpm build` and `pnpm test:e2e` must pass.

## Out of scope

- Undoing a merge.
- Suggesting likely duplicates of stores or items to merge.
