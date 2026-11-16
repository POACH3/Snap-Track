# Known bugs

Open bugs and their status. Add new entries at the top of "Open". When one is
fixed, move it to "Fixed" with the fix date and commit or branch.

Entry format: a short title, then when it was found, where it is, what
happens, how to reproduce it, any known cause or fix idea, and what was not
checked.

## Open

## Fixed

### Fee lines can match an item by a shared item code

- **Fixed:** 2026-11-15, branch `stage-4-items` (Stage 4 part 2, `docs/feature-plans/items-plan.md`).
  Fee lines never match or learn by barcode or code, only by printed name (`lineIdentifiers` in
  `apps/server/src/modules/catalog/domain/items.ts`; `SPEC.md` §5). Covered by unit tests and a
  use-case test that reproduces the steps below.

- **Found:** 2026-11-14, while comparing extraction models on a real receipt.
- **Where:** `SPEC.md` §6.4 step 2 (item matching) and §6.7 (learning from
  corrections). Spec only; no code exists yet.
- **What happens:** some receipts print the same item code on an item and on
  its fee line (e.g. a car battery and its refundable core charge). Matching
  looks up every line by code, fee lines included. Once a person confirms the
  item line, its code is saved for that item, so on the next such receipt the
  fee line auto-matches the item. Price tracking then shows the item's price
  as the fee amount.
- **How to reproduce:** in Stage 4, confirm the item line on a receipt where an
  item and a fee share a code; then process a second receipt from the same
  company with the same pair.
- **Fix idea:** fee lines (`line_items.kind = fee`) never match or save by
  code, only by printed name. Small trade-off, since fees rarely have useful
  codes of their own.
- **Not checked:** how often stores print shared codes like this; whether any
  other line kinds (e.g. bottle deposits printed with the product's code) hit
  the same problem.
