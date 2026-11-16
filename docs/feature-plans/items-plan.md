# Stage 4, part 2: items

**Changes SPEC.md:** §5 Data Model (`items`, `item_identifiers`), §6.4 Normalization (items), §6.5 Review (item names on lines), §6.7 Learning (items), §11 Stage 4.  
**Status:** shipped (2026-11-15, branch `stage-4-items`, merged into `main`).

Part 2 of the five Stage 4 plans (part 1: `store-review-plan.md`, shipped).
Builds items and their identifiers, matching each line to an item,
learning item identifiers on confirm, renaming items (the name shows
everywhere), choosing a different item for a line, and Library › Items. Fixes
the logged bug "Fee lines can match an item by a shared item code"
(`docs/BUGS.md`). After it ships, the same product is one item across
receipts, shown by the household's own name for it.

## Decided with the developer (2026-11-15)

1. **Unmatched lines stay unmatched.** Confirming never creates an item on its
   own. A line belongs to an item only when its identifiers match one, or a
   person names or chooses one for it.
2. **A new item's name** (when a person creates one from a line) starts as the
   model's suggested readable name (`name_source: model`), else the printed
   text (`name_source: printed`). It is renamed at any time
   (`name_source: user`, never overwritten).
3. **No backfill command.** With (1), items only come from people, so receipts
   confirmed in part 1 have nothing to match until items exist. They are
   covered by re-matching (next point).
4. **Re-matching earlier purchases, only when the user agrees.** When a confirm
   (or naming an item) teaches new item identifiers, earlier lines with no
   item that now match one are offered, in the same prompt as re-matching
   stores (part 1): "3 earlier purchases now match items you've named. Match
   them too?" Nothing changes unless the user says yes. This keeps items
   consistent with the stores decision, and lets part 1's receipts pick up
   names as items are created.
5. **Item page in the Library:** name (renamable), identifiers (like a
   store's), and the last 10 purchases (date, store, price). Categories and
   tags join it in part 3.

## Decisions (proposed in this plan)

### Identifiers and matching (`catalog` domain)

- **Types and normalization** (§5):
  - `barcode`: digits only, a complete UPC-A, UPC-E, EAN-8, EAN-13 or GTIN-14
    with a valid check digit, stored as GTIN-14 (zero-padded) so the same
    product printed as UPC-A and EAN-13 is one value. No `store_id`: it
    matches at any company.
  - `code`: any other printed code (SKUs, a UPC with digits dropped),
    uppercased, spaces and dashes removed. Scoped to the store.
  - `name`: the printed line text, lowercased, punctuation removed, spaces
    collapsed; a price or quantity printed inside the name ("2 @ 1.25") is
    kept, since it is what the receipt prints. Scoped to the store.
- **`identifyItem` (pure):** for one line, barcode first (any store), then code,
  then name (that store). The first type with an active hit decides. Two hits
  of the same type for different items (possible after a move) apply
  nothing. Ambiguous identifiers never match. Code and name wait until the
  store is known (§6.4).
- **Fee lines** (the logged bug): never matched or learned by barcode or code,
  only by printed name. A fee line therefore never takes on the item whose
  code it shares (a core charge printed with the battery's code).
- **When matching runs:** after extraction (barcodes always; code and name
  once the store is identified), when a receipt's store is set by re-match,
  and on the review screen for lines with no item (worked out again with the
  current identifiers, like store suggestions). Only exact hits are applied;
  the review screen also offers the closest existing item by name
  (bigram score, the same function as stores) as a suggestion.
- **Shared code with stores.** The learning plan (save, seen, ask before
  moving, mark ambiguous) is the same for stores and items (§5: "one
  matching and learning implementation"). `planStoreLearning` becomes a
  generic `planLearning` that takes the identifiers' keys and which types
  are "supporting only" (addresses for stores; none for items). Store
  identification keeps its own decision function, since its rule (every
  strong hit agrees) differs from items' (the first type that hits).

### Tables

- **`items`** (catalog): `id`, `name`, `name_source` (`printed`, `model`,
  `user`). `category_id` arrives with part 3.
- **`item_identifiers`** (catalog): `id`, `store_id` (null for barcodes),
  `type`, `value`, `display_value` (as printed), `item_id`, `state`,
  `first_receipt_id`, `times_seen`, `last_seen_at`. Unique on (`store_id`,
  `type`, `value`), plus the partial unique index on (`type`, `value`) where
  `store_id` is null (§5). Same columns as `store_identifiers`, so the
  Library shows both the same way.
- **`line_items.item_id`** (receipts): new column, null until matched or
  chosen.

### Confirm and learning

- **A line's item in the draft:** each `DraftLine` gains `item`: an existing
  item (`{ kind: "existing", itemId }`), a new one named in the form
  (`{ kind: "new", name }`, created with the confirm), or none (`null`: the
  line stays unmatched unless its identifiers match an item).
- **Learning on confirm** (§6.7): for each item line, its barcode, code and
  printed name are saved for its item, with the same "ask before moving"
  rule as stores. Questions about items and stores come back together in one
  `NEEDS_ANSWERS`, and the one modal lists them all.
- **Fee lines** learn only their printed name.
- **Choosing a different item** for a line (the match was wrong, or two items
  are really the same product): the line's identifiers then point to the
  chosen item, asked first like any move. Merging two items, which also moves
  their other purchases, is part 5.

### Renaming

- **Rename is immediate**, from the review screen or the Library: it saves at
  once (`catalog.items.rename`, `name_source: user`) and every purchase of the
  item shows the new name. It doesn't wait for Confirm, since it changes the
  item, not this receipt (§6.7: "takes effect immediately").
- Item names are not unique: two products may share a name.

### Screens

- **Review lines** show the item's name, with the printed text beneath it in
  13px muted (§6.5). A line with no item shows its printed text, and below it
  either the closest existing item ("Same as: Whole milk" with **Use it**) or
  the model's readable name as a new item ("Name it: Whole milk, 1 gal" with
  **Use it**). Neither applies until tapped.
- **Tapping a line's name** opens its sheet (the "⋯" sheet from part 1, which
  gains an Item section): **Rename item** (applies everywhere), **Choose a
  different item** (search existing items, or create one), and the line's
  details as before.
- **Digital receipt and receipts list** show item names in place of printed
  text.
- **Library › Items:** the list of items (searchable, alphabetical), and an
  item page with its name, identifiers (remove, mark ambiguous, use for
  matching), and its last 10 purchases. Items appear in the Library page
  beside Stores (replacing the "Coming next" row).
- Layout and colors follow `docs/DESIGN.md`; the item page reuses the store
  page's look. No mock is needed unless the developer wants one.

## Build

1. **Contracts:** item schemas (item ref with `nameSource`, identifier type,
   item detail with purchases), `DraftLine.item`, detail lines with their item
   and suggestion, the catalog `items` procedures (search, list, get, rename,
   identifiers add, remove, set state), item questions in `NEEDS_ANSWERS`.
2. **Catalog domain:** barcode check digits and GTIN-14, code and name
   normalization, `identifyItem`, generic `planLearning` (stores moved onto
   it, their tests unchanged), item suggestions.
3. **Catalog module:** `items` and `item_identifiers` (migration), SQLite
   repositories, service (identify lines, suggest, learn, create, rename,
   search, list, detail, identifiers), rpc.
4. **Receipts module:** `line_items.item_id` (migration), matching in
   `saveExtraction`, item choices and learning in `confirm`, `rematch`
   extended to lines with no item (and the confirm reply's count to both),
   item names in the detail and list, the item's purchases for the Library
   (through the `StoreCatalog` port, renamed `Catalog`).
5. **Web:** item name and printed text on lines; the line sheet's Item
   section (rename, choose another, suggestion); item names on the digital
   receipt; Library › Items and the item page.
6. **Docs:** `SPEC.md` sections above; `docs/BUGS.md` (fee-line bug to
   Fixed); `docs/TESTING.md`; `docs/feature-plans/README.md`.

## Verification

| Stage 4 "Done when" / behavior | Check | Kind |
|---|---|---|
| Barcode check digits for each format; GTIN-14 form; code and name normalization | Domain unit tests, table-driven | automated |
| Matching order barcode → code → name; code and name only once the store is known; ambiguous never matches; conflicting hits apply nothing | `identifyItem` unit tests | automated |
| Fee lines never match or learn by code (the logged bug) | Unit test, plus a use-case test reproducing the bug's steps: battery and core charge sharing a code | automated |
| A company confirmed once: a second receipt from it is matched **with its repeat items** | Use-case test with two recorded extractions; Playwright | automated |
| After a user names an item, a later receipt from the same company with the same code but differently printed text shows the user's name | Use-case test; Playwright | automated |
| A barcode matches at a different company | Use-case test | automated |
| Rename is immediate and never overwritten by automation | Use-case tests | automated |
| Choosing a different item asks before moving identifiers; item and store questions come back together | Use-case tests | automated |
| Confirm never creates an item on its own; a line named in the form creates its item with the confirm | Use-case tests | automated |
| Re-matching earlier purchases: confirm reports the count, changes nothing; `rematch` applies only exact matches, to lines with no item | Use-case tests; Playwright for the prompt | automated |
| One barcode can't be saved for two items | Repository test (the partial unique index, §5) | automated |
| Store learning unchanged after the move to `planLearning` | Part 1's tests, unchanged, still pass | automated |
| Library › Items: list, rename, identifiers, purchases | Use-case tests; Playwright | automated |
| A real receipt's repeat items are matched on a second visit | By hand in development | manual |

`pnpm check`, `pnpm build` and `pnpm test:e2e` must pass.

## Out of scope

- Item categories and tags, "for this item" vs "this purchase only", and model
  category and tag suggestions (part 3).
- Merging two items, including all their purchases (part 5).
- Items in analytics and price history (Stages 6 and 8).
- Manual entry's items (part 4).
