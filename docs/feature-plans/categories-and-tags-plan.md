# Stage 4, part 3: categories and tags

**Changes SPEC.md:** §5 Data Model (`categories`, `tags`, `item_tags`, `line_item_tags`, suggestion outcomes, removing entries), §6.3 Extraction (category and tag suggestions in the prompt), §6.5 Review (category and tags on lines), §11 Stage 4.  
**Status:** shipped (2026-11-16, merged; the by-hand check of a real receipt's suggestions is still pending).

Part 3 of the five Stage 4 plans (parts 1 and 2 shipped). Builds the
four-level hierarchy (categories and classes) with the default L1 set, the
hierarchy editor and picker, free tags, store default categories ("What do
you usually buy here?"), categories and tags per line ("this purchase only")
and per item ("this item"), **Set all lines**, the model's category and tag
suggestions with **Accept** and **Dismiss**, and Library › Labels. After it
ships, every confirmed purchase can have a category, and the
`effectiveCategory` rule (§5, Classification rules) is in place for Stage 6's
breakdowns.

## Decided with the developer (2026-11-15)

1. **Colors wait for Stage 6.** The `color` columns exist and stay empty; the
   palette is chosen with the chart library. Until then chips and tags use the
   existing plain and accent pill styles.
2. **The scope choice starts on "This item".** Choosing a category for a line
   with an item asks each time, **This item** (every purchase of it)
   preselected, **This purchase only** the other choice. A line with no item
   takes **this purchase only**. Accepting a suggestion asks the same way.
3. **Mock first**: the phone items page (category chips, tags, a suggestion,
   the store-default question, Set all lines), the picker with the scope
   choice, and Library › Labels, approved before building.
4. **The picker is the hierarchy.** Choosing a store's default category or an
   item's category opens the categories and classes as a tree to browse
   (expand a category to see its classes), with a filter field on top. The
   same tree serves both; only the item version has the scope choice. A
   **+ New category** button beside the filter adds a top-level category, and
   an "Add a class under …" row inside an open category adds a class there.
5. **The household edits the starting set.** The default L1 categories are a
   starting point: the household can remove any and add their own. Removing
   an entry nothing uses deletes it; removing one already on a line, item or
   store archives it instead (hidden from the picker, kept on past receipts).

## Decisions (proposed in this plan)

### Data

- **`categories`** (catalog), as §5: `id`, `name`, `level` (1–4),
  `parent_id`, `color` (null for now), `sort_order`, `archived`. Unique on
  (`parent_id`, `name`) ignoring case, with a partial unique index for L1
  (`parent_id` null), since SQLite treats every null as different. The
  migration adds the default L1 set (§5: Groceries, Dining, Household,
  Personal Care, Health, Transportation, Entertainment, Clothing, Kids, Pets,
  Gifts, Other).
- **`items.category_id`** and **`stores.default_category_id`** (catalog), set
  by a person only.
- **`tags`** (catalog): `id`, `name` (unique ignoring case), `color`,
  `archived`. **`item_tags`** (catalog) and **`line_item_tags`** (receipts),
  as §5.
- **`line_items`** (receipts) gains `line_category_id`,
  `suggested_category_id` and `suggested_tag_ids` (§5), plus
  `suggestion_outcome` (`accepted` / `dismissed` / null), which §6.7 asks for
  ("Accepted and dismissed suggestions are recorded").

### Rules (catalog domain)

- **`effectiveCategory`** (§5, "One rule, two forms"): this purchase, else this
  item, else the store default, else Unclassified, worked out when read and
  never stored. Exported from `catalog`'s `index.ts`. Its SQL twin, the
  `line_categories` view, is the `analytics` module's, in Stage 6; the test
  that runs both over the same cases comes with it.
- **A line's tags:** its item's tags plus its own, kept apart so the screen
  can show which is which (§6.5).
- **Suggestions stay silent** when a user-set category applies at any level
  (line, item, or store default) (§5). An Unclassified line shows the
  suggested category with **Accept** / **Dismiss**; suggested tags show the
  same way, beside the line's tags.
- **The hierarchy:** an L2–L4 entry's parent is exactly one level up; moving an
  entry keeps its level and takes its children along; archiving hides an
  entry and everything below it from the picker but keeps it on lines and
  items (§5 Rules). Removing an unused entry deletes it; removing a used one
  archives it (decision 5). Merging one entry into another is part 5.

### Model suggestions (extraction)

- The prompt lists the current hierarchy as numbered full paths
  ("12: Groceries › Frozen foods › Ice cream") and the existing tags, and asks
  for each line's most specific justified category number and any fitting
  tag numbers. The numbers map back to ids in code, and an unknown number is
  dropped. `extraction` reads the hierarchy through its own port, filled from
  `catalog` (§4.3 already lists that dependency).
- Only receipts read after part 3 ships get suggestions; earlier ones show
  none (their `raw_output` lacks them).

### Screens

- **Each line** on the receipt page shows its category chip with where it came
  from (this purchase, this item, the store's default) and its tags, item
  tags apart from purchase tags (§6.5). Tapping the chip opens the picker,
  then the "this purchase only / this item" choice.
- **The picker** shows every non-archived entry as a tree (decision 4), with
  a filter field that narrows it by name; it can also add a new entry under
  the open category. The store-default question and the store page use the
  same tree without the scope choice.
- **Set all lines** (in the items card's header menu): one category for every
  line, as this-purchase categories (§6.5).
- **"What do you usually buy here?"** appears on the receipt page when its
  store has no default yet; the answer becomes the store's default at once.
- **Library › Labels:** the hierarchy as an indented tree (add, rename, move,
  remove, decision 5) and the tags (add, rename, archive). **Library › Stores** gains the
  store's default category; **Library › Items** gains the item's category and
  tags.

## As built (2026-11-16)

- **Mock:** approved 2026-11-15
  (https://claude.ai/code/artifact/c9a4413f-f79e-4e5a-a264-c1f75e59c82b); the look is in
  `docs/DESIGN.md`, "Categories and tags".
- **The rule's home:** `effectiveCategory`, `lineTags` and `pendingSuggestion` live in
  `@snaptrack/core` (`classification.ts`), so the receipt page applies the same rule while a
  person edits; `catalog`'s `index.ts` re-exports them as the server's form of the rule.
- **What saves when:** "for this item" (category and tags) and a store's default save at once,
  like renaming an item; a line's own category and tags, Set all lines, and Accept / Dismiss
  save with the confirm. "For this item" on a line whose item is new is kept on the new item
  in the form and given to it when the confirm creates it.
- **Removing:** `catalog` asks `receipts` through its `PurchaseLabelUsage` port whether a line
  uses an entry or tag (wired in `main.ts`), since `line_items` and `line_item_tags` are
  `receipts`' tables. Archived entries can be restored from Library › Labels.
- **Suggested tags** still show (with Accept / Dismiss) on a line that has a category, when the
  line lacks them; only the category guess goes silent (SPEC.md §6.5 updated).
- **Prompt:** the numbered lists go in the user message, so the system prompt stays the same
  for every request.
- **Migration 0006** is additive, with the twelve default L1 categories inserted by hand at its
  end. `line_items.suggestion_outcome` has no CHECK constraint: Drizzle would rebuild the
  table to add one, and its rebuild copies the new columns from the old table, which fails.
- **The digital receipt doesn't show line categories:** the developer decided 2026-11-16 that
  it isn't needed.

## Build

1. **Contracts:** category and tag schemas, the path form, the catalog
   procedures (hierarchy list, add, rename, move, archive; tags list, add,
   rename, archive; set a store's default; set an item's category and tags),
   line category, tags and suggestions in the receipt detail and draft, the
   extraction output's suggestion numbers.
2. **Catalog domain:** `effectiveCategory`, hierarchy rules (levels, moves,
   archived below archived), line tags (item + line), suggestion silence.
3. **Catalog module:** tables and the default L1 set (migration), repositories,
   service, rpc.
4. **Receipts module:** the new `line_items` columns and `line_item_tags`
   (migration), categories and tags in the detail, confirm and save, Set all
   lines, accept and dismiss.
5. **Extraction module:** the hierarchy port, the prompt, mapping numbers back.
6. **Web:** the line chip and tags, the picker, the scope choice, Set all lines,
   the store-default question, suggestions, Library › Labels, the store and
   item pages' additions.
7. **Docs:** `SPEC.md` sections above, `docs/TESTING.md`, `docs/DESIGN.md` (after
   the mock), the plan registry.

## Verification

| Stage 4 "Done when" / behavior | Check | Kind |
|---|---|---|
| `effectiveCategory`: each precedence level and Unclassified | Domain unit tests | automated |
| Hierarchy: parent one level up, moves keep the level and take the children, archived hidden below, unique names per parent (L1 included) | Domain and repository tests | automated |
| With a store default of Groceries, every line from that store is Groceries and the model's differing guess is not shown | Use-case test; Playwright | automated |
| Recategorizing an item "for this item" applies on its next purchase from any store; "this purchase only" changes nothing else | Use-case tests | automated |
| An Unclassified line's suggestion has no effect until accepted; accepted and dismissed are recorded | Use-case tests; Playwright | automated |
| A tag on an item appears on all its purchases; a tag on one purchase appears only there | Use-case tests | automated |
| Set all lines gives every line a this-purchase category | Use-case test | automated |
| The prompt lists the hierarchy and tags; unknown numbers are dropped | Adapter test (prompt), domain test (mapping) | automated |
| The default L1 set exists after the migration | Migration test | automated |
| A real receipt gets sensible category suggestions | By hand, with the owner's go-ahead (shared server) | manual |

`pnpm check`, `pnpm build` and `pnpm test:e2e` must pass.

## Out of scope

- Merging hierarchy entries (part 5).
- Comparing a tag with a hierarchy entry and its overlap notice (§5): the
  comparison is an analytics view, Stage 6.
- The `line_categories` SQL view and its agreement test (Stage 6).
- Category colors (Stage 6, if decided so above).
