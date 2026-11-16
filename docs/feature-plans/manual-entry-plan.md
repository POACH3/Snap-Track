# Stage 4, part 4: manual entry and duplicate warnings

**Changes SPEC.md:** §5 Data Model (`duplicate_dismissals`, deleting a receipt), §6.5 Review (duplicate warning, Delete receipt), §6.6 Manual entry (where it starts, its endpoint), §11 Stage 4.  
**Status:** active (built 2026-11-16 on branch `stage-4-manual-entry`; mock approved).

Part 4 of the five Stage 4 plans (parts 1–3 shipped). Adds **Add expense** for purchases with no
paper receipt (quick and full entry, one form with review), and duplicate warnings on every
receipt and manual entry, with **Delete receipt** and **Not a duplicate**.

## Decided with the developer (2026-11-16)

1. **Where Add expense starts:** a secondary **Add expense** button at the top of the Receipts
   list on the phone (Snap stays one tap for photos; the tab bar doesn't change), and under
   **Upload receipt** in the desktop side navigation.
2. **Duplicates warn and offer two ways out:** the receipt page shows a warning linking to the
   other receipt, with **Delete this receipt** (new, after a confirm) and **Not a duplicate**
   (hides the warning for that pair, for everyone). Saving is never blocked.
3. **A quick entry's category is optional.** Only the store and the total are required (§5 Rules);
   with no category the line follows the store's default, else Unclassified.
4. **Mock first:** the Add expense form (quick and full, phone and desktop) and the duplicate
   warning, approved before building.

## Decisions (proposed in this plan)

### Manual entry

- **One form.** The receipt page's form without the photo pane (§6.6): on the phone, the edit
  card fills the screen (still fixed, only its body scrolls); on desktop, the form alone.
- **Quick entry** (the default): store (same store choice as review), date, total, category
  (the category picker, optional) and note. Saved as a receipt with one line, `kind: item`, no
  printed name, its amount the total, and the chosen category as the line's own ("this
  purchase"). **Full entry** switches the same form to lines and totals, as on review.
- **Saved as `confirmed`**, `source: manual`, logged by and confirmed by the person, and learned
  from like any confirm (§6.7): with no store evidence typed, learning has only the lines' items.
- **Its own idempotent procedure, `receipts.putManual`,** keyed by an id made in the browser like
  a photo's, so a retried save is one entry and Stage 5's upload queue can hold both kinds.
  SPEC.md §6.6 says "the same endpoint"; a photo upload is multipart with images and a manual
  entry is a draft, so they share the pattern (client id, `PUT`, idempotent), not the procedure.
  Online only until Stage 5.
- **Labeled by source:** manual entries show **Manual** in the receipts list and on the receipt
  page (look in the mock).

### Duplicates (SPEC.md §6.5)

- **One pure domain function** in `receipts` (`findDuplicates`) compares a receipt with the
  others of the same store:
  - **Definite:** a transaction number matches, or an approval code and card last four match;
    also the same photo uploaded again (`image_sha256`, kept after images are deleted, §6.8).
  - **Possible:** the same date, time (when both print one) and total.
  - Receipts with no store aren't compared until they have one. `review_required` receipts with
    no data match only by photo.
- **Worked out when read**, like warnings: the receipt detail lists each duplicate (the other
  receipt's summary and the kind), and `checkDraft` takes the chosen store so the form's
  warning follows edits, on review and manual entry alike.
- **`duplicate_dismissals`** (receipts): `receipt_id`, `other_receipt_id` (stored with the smaller
  id first, so one row covers the pair), `dismissed_by_user_id`, `dismissed_at`. A dismissed
  pair is never shown again.

### Deleting a receipt (new)

- **Delete receipt** on the receipt page (danger button, confirm modal naming the store, date
  and line count), for any status. It removes the receipt, its lines and their tags, its image
  rows and files, and its dismissals. What a person confirmed from it (store and item
  identifiers) stays learned.
- Its extraction job belongs to `extraction`, which depends on `receipts`, so `receipts`
  tells it through a `ReceiptDeletedListener` port in the same transaction (the pattern of
  `ReceiptUploadedListener`, §4.3). Image files are deleted after the commit; a file left
  behind by a crash is harmless and noted for the nightly cleanup (Stage 5).

## As built (2026-11-16)

- **Mock:** approved 2026-11-16
  (https://claude.ai/code/artifact/d35047a6-b7c5-4fa2-a6a8-c837ebe0afde); the look is in
  `docs/DESIGN.md` (Add expense, Duplicate warning, Delete receipt, Receipts list: manual entries).
- **The quick entry's one line** is built in the browser (`quickEntryForm` in
  `receipt-form.ts`, tested), so the server takes any draft and needs no special case.
- **`checkDraft` checks a receipt not saved yet** (a manual entry being typed) as new, rather
  than refusing it, and takes the chosen store; its `RECEIPT_NOT_FOUND` error is gone.
- **`confirm` and `putManual` share one step** (`applyConfirm` in the receipts service), so a
  manual entry is saved and learned from exactly like a confirmed receipt.
- **The manual form leaves out** Store details as printed and Transcription, which have nothing
  to hold for a manual entry.
- **"Not a duplicate"** is hidden at once on the page and stays hidden after a reload.
- **Migration 0007** adds `duplicate_dismissals` only.
- **Not done:** the confirm's re-match offer ("3 other receipts now match") isn't made after a
  manual save; a manual entry has no store details to teach, so it rarely applies.

## Build

1. **Contracts:** `putManual` input (client id, store choice, draft, answers), duplicate entries in
   the receipt detail and `checkDraft`, `dismissDuplicate`, `delete`.
2. **Receipts domain:** `findDuplicates`, the quick entry's one line, the dismissal pair key.
3. **Receipts module:** `putManual` (create and confirm in one transaction, learning included),
   duplicates in the detail and `checkDraft`, dismissals table (migration), delete with the
   listener; extraction's listener adapter.
4. **Web:** Add expense on Receipts and the side navigation, the manual form (quick and full),
   the Manual label, the duplicate warning, Delete receipt.
5. **Docs:** SPEC.md sections above, `docs/DESIGN.md` (after the mock), `docs/TESTING.md`, the
   plan registry.

## Verification

| Stage 4 "Done when" / behavior | Check | Kind |
|---|---|---|
| A quick and a full manual entry are each saved as confirmed and appear in the receipts list labeled manual | Use-case tests; Playwright | automated |
| A retried manual save is one entry | Use-case test | automated |
| A quick entry with no category follows the store's default; with one, it is this purchase's | Use-case test | automated |
| Definite (transaction number; approval code and last four; same photo) and possible (date, time, total) duplicates found; other stores and no-store receipts never | Domain unit tests | automated |
| The warning shows on both receipts, follows edits, and Not a duplicate hides it for the pair | Use-case tests; Playwright | automated |
| Delete removes the receipt, its lines, tags, images and job, keeps what was learned, and needs a confirm | Use-case tests; Playwright | automated |
| The migration applies | `migrations.test.ts` (every migration on a fresh database) | automated |

`pnpm check`, `pnpm build` and `pnpm test:e2e` must pass.

## Out of scope

- The offline upload queue for manual entries (Stage 5).
- Merging stores, items and hierarchy entries (part 5).
- Guided entry for review-required receipts (Future, §11).
