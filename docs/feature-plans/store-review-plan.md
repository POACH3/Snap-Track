# Stage 4, part 1: stores and review

**Changes SPEC.md:** §2 Requirements (F5), §4.2 Repository layout (web features), §5 Data Model (`stores`, `store_identifiers`, `receipts`), §6.4 Normalization (store identification), §6.5 Review (digital receipt, navigation, Library), §6.7 Learning (stores), §11 Stages 4 and 9, §12 Open Questions.  
**Status:** shipped (2026-11-15, branch `stage-4-stores-review`, commit `ea66ea5`; manual checks passed on real phones and through the real LLM server).

Part 1 of the five Stage 4 plans (`SPEC.md` §11):

1. **Stores and review** (this plan)
2. Items: `items-plan.md`
3. Categories and tags: `categories-and-tags-plan.md`
4. Manual entry and duplicate warnings: `manual-entry-plan.md`
5. Merges of stores, items and categories: `catalog-merges-plan.md`

Builds the `catalog` module with stores and store identifiers, automatic store
matching after extraction, the review screen, **Store needs confirmation**,
**Confirm**, learning store identifiers, the receipt detail view, and the
receipts list's labels and filter. When it ships, real receipts can be reviewed and confirmed, and a
company confirmed once is recognized from then on. Line items are edited as
printed text and amounts; items, categories and tags come in parts 2 and 3.

## Decided with the developer (2026-11-15)

- **Returns and refunds: deferred.** No return-specific behavior. The form
  neither adds nor blocks negative amounts; it saves what is entered. The §12
  row stays open, moved to "after Stage 4".
- **Receipts are not split between people.** The §12 row becomes a decision.
- **Re-matching after learning happens only when the user agrees.** After a
  confirm teaches new identifiers, if other receipts with no store would now
  match, the user is asked ("3 other receipts now match Walmart. Match them
  too?"). Nothing changes unless they say yes. §6.4 gains this step.
- **Pinch-zoom and pan are written by hand** (pointer events, no library). If
  that is a problem on real phones, we come back and consider a library.

## Decisions (proposed in this plan)

### Store identification (`catalog` domain)

- **Where each identifier comes from** in `store_evidence`:

  | Type | From |
  |---|---|
  | `name` | `printedName` |
  | `logo_text` | `logoText` |
  | `legal_name` | `legalName` |
  | `phone` | each `phones[].number` |
  | `website` | each `websites[]`, and the domain of each `emails[]` entry |
  | `address` | `address`, only when both street and ZIP were read |

  Brand guess, branch name, store number and merchant ID are never
  identifiers (§6.3.2). They only rank suggestions (brand guess) or are shown
  as evidence.
- **Email domains count as websites** (`receipts@walmart.com` → `walmart.com`).
  Free-mail domains (gmail.com, yahoo.com, outlook.com, icloud.com, aol.com,
  hotmail.com) are on the exclusion list, since small businesses use them.
- **Normalization**, one pure function per type, as in §5:
  - Name-like types: lowercased, punctuation removed without leaving a space
    (`WAL*MART` and `Wal-Mart` both give `walmart`), runs of spaces collapsed.
  - Phone: digits only. Ten digits get the country code `1`. Fewer than ten
    digits is not an identifier.
  - Website: lowercased, scheme, `www.`, path, query and port dropped.
  - Address: lowercased; punctuation removed; common street words abbreviated
    (`street` → `st`, `avenue` → `ave`, `north` → `n`, …; one fixed table);
    ZIP cut to its first five digits; stored as `<street>|<zip>`.
- **The three name-like types are looked up against each other.** A receipt's
  logo text `walmart` finds a saved `name` of `walmart`. All three are
  confirmed names of the same company, so this adds matches without adding
  guesses. They are still saved under their own type.
- **Exclusion list** (one constant in the domain): payment processors and
  point-of-sale vendors (Square, Toast, Clover, Shopify, Stripe, PayPal,
  Lightspeed, Heartland, Elavon, Worldpay, …), card networks, their websites,
  free-mail domains, and generic phrases ("thank you", "customer copy",
  "receipt", "welcome"). The list is also checked after normalization, so
  "Powered by Toast" is dropped as well as "Toast".
- **`identifyStore(evidence, lookup)`** is the single pure decision function of
  §6.4 step 1. `lookup` is the saved identifiers that share a normalized value
  with the receipt's, so the function itself does no I/O. It returns one of:
  - `matched`: the store, the strong identifiers that matched, and any
    supporting address hits for the same store;
  - `needs-confirmation` with a reason (`conflict`, `address-only`, `unknown`)
    and ranked candidates, each with the identifiers that point to it.
- **Suggestions** for `unknown` (and after the candidates in the other cases):
  the brand guess, then known stores whose name or saved name identifiers are
  similar to the receipt's names. "Similar" means a character-bigram Dice
  score of 0.5 or more on normalized names (one named constant). At most five.
  Suggestions are worked out again each time the review screen opens, with the
  current identifiers, so a store learned since extraction is shown first
  ("Walmart: matches its phone number") but is not applied.

### Learning (`catalog` domain and application)

- **`planStoreLearning`** is a pure function. It takes the receipt's
  identifiers, the chosen store, the saved identifiers that share their values,
  and how the receipt was matched before. It returns the changes to make, plus
  any questions for the user:
  - New identifier: save it for the chosen store (`first_receipt_id`,
    `times_seen` 1).
  - Already saved for the chosen store: `times_seen` + 1 and `last_seen_at`.
    This is not counted again when a confirmed receipt is saved again with the
    same store.
  - **Strong identifier saved for another store: a question** ("This phone
    number is saved for Target. Move it to Walmart?" **Move** / **Keep with
    Target**). Nothing is saved until every question is answered.
  - **Address saved for another store:** marked `ambiguous`, no question, and
    the user is told afterwards ("This address is also saved for Target. It is
    now treated as a shared location.").
  - **Correcting a wrong automatic match** (the receipt was `store_matched_by:
    identifier` and the user chose a different store): the identifiers that
    made the match are marked `ambiguous`, with no question (§6.7), and the
    receipt's other identifiers are learned for the chosen store as above.
  - **Changing the store on a confirmed receipt:** identifiers saved for the
    old store are handled as "saved for another store" (a question), since a
    person confirmed them before.
  - Identifiers already `ambiguous` stay ambiguous and are not moved.
- **Two changes to `store_identifiers`** (§5), for Library › Stores:
  `display_value` (the value as first printed or typed, since the normalized
  one, like `123 main st|62701`, is not for reading), and `first_receipt_id`
  may be null for an identifier added by hand.
- **Confirm takes two calls when there are questions.** The first returns
  `NEEDS_ANSWERS` with the questions and saves nothing. The client shows them
  in one confirm modal, then sends the confirm again with the answers. The
  answers are checked against a fresh plan, so a stale answer can't move the
  wrong identifier.

### Receipts

- **New columns on `receipts`:** `store_id`, `store_matched_by`,
  `store_match` (JSON: the identifiers that made or supported the match),
  `note`, `confirmed_by_user_id`, `confirmed_at`. `store_match` is a column of
  its own, not part of `store_evidence` (§5 changes): evidence is what was
  read, and stays the input for re-running matching; the match is the result.
- **Matching runs inside `saveExtraction`**, in the transaction that saves the
  job's result. `receipts` reaches `catalog` through its own port,
  `StoreCatalog` (identify, suggest, plan and apply learning, store names),
  wired in `main.ts`. This is the pattern `UserDirectory` already uses. Tests
  use the real catalog module on the same in-memory database, so there is no
  fake and no contract test.
- **Nothing is saved until Confirm** (or **Save**, when editing a confirmed
  receipt). The form holds every change, including a new store, which is
  created inside the confirm transaction. So an abandoned review leaves no
  stray store. Leaving a form with changes asks first (confirm modal,
  **Discard changes**).
- **Stale edits are refused.** Confirm and Save send the `updatedAt` they
  loaded. If the receipt changed since (another person, or extraction
  finishing), the server refuses (`RECEIPT_CHANGED`) and the screen offers to
  reload.
- **Enter by hand while waiting.** An `uploaded` or `extracting` receipt can be
  typed in and confirmed. Extraction already leaves alone any receipt a person
  has handled (`EXTRACTION_STATUSES`), so its result is then discarded.
- **Consistency warnings stay on the server** (§4.1: no business rules in the
  client). They come with the receipt. While the user edits, the client sends
  the draft to `receipts.checkDraft` (half a second after typing stops) and
  shows the warnings that come back. Each warning names the fields it involves,
  so the form highlights them.
- **Split a line** inserts a copy of the line right below it (same printed name
  and code, empty amounts) for the user to fill in. Lines can also be added
  anywhere and removed.
- **Re-matching on request.** The confirm reply says how many other receipts
  with no store would now be matched. If there are any, the client asks
  (decided above). **Match them** calls `receipts.rematch`, which re-runs
  identification on every receipt that is not confirmed and has no store, and
  applies only `matched` results (`store_matched_by: identifier`). The toast
  says how many changed.
- **Required to confirm:** a store and a total (§6.5), checked in the form and
  again on the server. Nothing else is required.

### What the review screen shows (part of the §12 "which fields" question)

- **Always visible:** store (with "Matched by phone number" or the **Store
  needs confirmation** prompt), date and time, the lines (kind, printed name,
  code, quantity, unit, unit price, amount charged, discount, tax code),
  subtotal, receipt discount, tax, tip, total, note.
- **"More details", collapsed, editable:** tax lines, payments, transaction
  numbers, printed savings, printed item count.
- **"Store details as printed", collapsed, editable:** names, logo text, legal
  name, branch, store number, address, phones, websites, emails, merchant ID.
  They are editable because they are what gets learned: a misread phone number
  can be fixed before it is saved for the store.
- **"Transcription", collapsed, read-only:** `raw_text`.

### Screens

- **Receipts list** (decided with the developer, 2026-11-15): every
  transaction, newest first, scrolling. Each row is a collapsed digital
  receipt showing the date, store name and amount, with its status shown by a
  colored icon (see `docs/DESIGN.md`, "Receipt status"). Thumbnails are no
  longer shown in the list.
  - Date: the purchase date when known, else the capture date. Store: its name,
    or "Unknown store" (muted) until one is set. Amount: the receipt's amount
    (§5 Rules), blank while the receipt is being read.
  - The only filter is review status: All / Unreviewed / Review required
    (§6.5), so the list doubles as a to-do list. Every other filter and search
    is in Analytics.
- **Tapping a confirmed row** expands it in place into the full **digital
  receipt**. Tapping again collapses it. The digital receipt is a summary, not
  a copy of the paper one. It shows:
  - store name and date;
  - each line with its price (printed name in part 1; the item's name from
    part 2), fee lines included;
  - subtotal, tax and total, plus the receipt discount and tip when there are
    any, so the figures add up;
  - the payment method (e.g. "Visa credit ···· 1234", or "Cash");
  - at the bottom, **View receipt image**, which opens the receipt page.
    Photo receipts only; manual entries have no image (part 4).
  The details load when the row first expands.
- **Tapping an unconfirmed row** (unreviewed, review required, or still being
  read) opens the receipt page. **Back** returns to the same place in the list.
- **The receipt page** (`/receipts/:id`, replacing the current
  `ReceiptScreen`): the paper receipt's image beside every extracted field.
  Unconfirmed receipts open ready to edit, with **Confirm**. Confirmed
  receipts open read-only with **Edit**, which turns into **Save**. Layouts
  as approved in the mock (2026-11-15; recorded in `docs/DESIGN.md`,
  "Receipts screens"):
  - **Phone (below 1024px):** no tab bar. An edit card over a photo card,
    both always on screen. The edit card's first page is the store
    (**Continue to items**, disabled until a store is chosen); its second
    page is items and totals, with a **Change store** link under the heading,
    its body scrolling inside the card, and **Confirm** filling the footer.
    The photo card holds only the photo, inset 4px.
  - **Desktop (1024px and up):** the form on the left, the photo pane
    (400px) on the right with its zoom buttons at the bottom; the store in
    the form's header with **Change store**.
- If the receipt changes on the server while the page is open (extraction
  finishing), the form moves to the new version only while nothing has been
  changed in it; otherwise Confirm reports the change and **Reload** fetches
  it.
- **Image viewer** (hand-written, `apps/web/src/shared/ui/`): all the photos
  in order in one strip, which zooms as one piece.
  - Phone: pinch to zoom, drag to pan while zoomed, double-tap to zoom in or
    reset. At normal size, one finger scrolls the page.
  - Desktop: zoom buttons and a reset button, Ctrl/⌘ + scroll wheel zooms,
    drag pans.
  - Zoom is limited to between 1× and 5×.
- **The detected name** (added after shipping, 2026-11-15): the store name
  the receipt shows (brand guess, else logo, else printed name; a trailing
  store number dropped, ALL CAPS given normal capitals) is offered as
  **Create "<name>"**, and is chosen from the start when no known store is
  suggested. A correct name needs only Continue or Confirm; typing is for a
  wrong one. On desktop the store panel stays open until the receipt has a
  saved store, so a pre-chosen new store is always visible.
- **Store section:**
  - When the store needs confirmation, the screen opens on that prompt.
    Candidates are listed with the identifier that points to each, then
    suggestions, then a search of known stores, then **Create "<typed name>"**.
  - When the store was matched, it shows the store and what matched it. The
    store can be changed from there.
- **Library › Stores** (`/library/stores`, `/library/stores/:id`): every store,
  and for each one its name and identifiers. Everything there is editable, so
  the app learns from it:
  - rename the store (names are unique, ignoring case);
  - add an identifier by hand (type and value). It is normalized like a
    learned one. If it is already saved for another store, the same "Move it?"
    question is asked;
  - remove an identifier (asks first);
  - mark an identifier ambiguous, or use it for matching again.
  
  Each identifier shows its type, its value as printed when first seen (or as
  typed), its state, how many times it was seen and when it was last seen.
- **Shared UI this needs:** `Modal` and `ConfirmModal` (`docs/DESIGN.md`,
  "Overlays"), on the browser's `<dialog>`; the image viewer; a danger
  button variant. The store picker and money inputs live with the receipts
  feature.
- **The list's filter counts** ("Unreviewed · 2") come from a small
  `receipts.counts` endpoint.

### Navigation (decided with the developer, 2026-11-15)

- **Main sections:** Receipts, Analytics, Library, Settings, plus Budget
  (Stage 6, F23; a "Coming later" placeholder until then, desktop only). On
  phones the tab bar holds Receipts, Analytics, the raised **Snap** button,
  Library, Settings. On wider screens the side navigation holds, from the
  top: the SnapTrack name, the profile button (a menu with the name and
  **Log out**), Receipts, Analytics, Budget, Library, Settings, and **Upload
  receipt** at the bottom. There is no top bar. The Search placeholder is
  removed, since searching is a filter in Analytics (Stage 9).
  - **Receipts:** the list and each receipt, the digital receipt first.
  - **Analytics:** every filter, breakdown and chart, including "how much have
    I spent at this store?" (Stage 6). It stays a placeholder in part 1.
  - **Library:** what the user has set and the app learns from, all editable.
    **Stores** are the stores from receipts, with their identifying
    information. **Items** are the user's own names for specific items.
    **Labels** are the categories, classes and free tags. Stores arrive in part
    1, Items in part 2, Labels and store defaults in part 3, merges in part 5.
  - **Settings:** light and dark mode, image retention (Stage 5), and the like.
- The web feature folder is `features/library/`. The server module stays
  `catalog` (§4.3).

## Build

1. **Contracts:** catalog schemas (store, identifier type and state, store
   detail); `ReceiptDetail` (every field, lines, images, store and match, store
   review state with candidates, warnings, `updatedAt`); `ReceiptDraft`, shared
   by `checkDraft`, `confirm` and `save`; the `confirm` reply with the re-match
   count; `NEEDS_ANSWERS`, `RECEIPT_CHANGED`, `STORE_NAME_TAKEN` and
   `NOT_CONFIRMABLE` errors; the store and status fields on `ReceiptSummary`,
   and a status filter on `list`.
2. **Catalog domain:** normalization per type, exclusion list, evidence →
   identifiers, `identifyStore`, similar-name ranking, `planStoreLearning`.
3. **Catalog module:**
   - tables `stores` and `store_identifiers` (migration);
   - SQLite repositories;
   - service: identify, suggest, plan and apply learning, create and rename
     stores, search stores by name, store detail with identifiers, add, remove
     and mark identifiers;
   - oRPC router for the store picker and Library › Stores.
4. **Receipts module:**
   - the new columns (migration);
   - the `StoreCatalog` port;
   - matching in `saveExtraction`;
   - `getDetail`, `checkDraft`, `confirm`, `save`, `rematch`;
   - store names and the status filter in `list`.
5. **Composition:** `main.ts`, `createTestApp`, and the e2e server. The e2e
   server starts the worker with a `ScriptedExtractor` that replies with a
   recorded receipt, so Playwright can review real extracted data.
6. **Web:**
   - `Modal`, `ConfirmModal`, image viewer, money input, search picker;
   - receipts list rows that expand into the digital receipt;
   - the receipt page with the store section, form, lines and warnings;
   - the questions modal and the re-match prompt;
   - receipts list store names and filter;
   - navigation: the four sections and Snap; Search removed;
   - the Library page with Stores, and store detail.
7. **Docs:**
   - `SPEC.md` sections listed above, plus §11 (links to the five plans);
   - `docs/TESTING.md`;
   - `docs/feature-plans/README.md`;
   - `docs/DESIGN.md` entries for the new shared components, after the
     developer approves them.

## Verification

| Stage 4 "Done when" / behavior | Check | Kind |
|---|---|---|
| Normalization of each identifier type; exclusion list (before and after normalization); email domains; free-mail dropped | Catalog domain unit tests, table-driven | automated |
| One company: one strong hit is enough; a new location sharing the name or website matches; an address for the same company is supporting evidence only | `identifyStore` unit tests | automated |
| Identifiers pointing to two companies: flagged with both candidates, nothing applied | `identifyStore` unit tests | automated |
| Address-only hit: flagged, that company first, nothing applied; an address for a different company is ignored next to a strong hit | `identifyStore` unit tests | automated |
| Ambiguous identifiers never match; brand guess and similar names only rank suggestions | `identifyStore` and ranking unit tests | automated |
| Learning: every identifier saved; question before moving a strong identifier; shared address marked ambiguous; wrong automatic match marks its identifiers ambiguous; no double counting on re-save | `planStoreLearning` unit tests | automated |
| After a company is confirmed once, a second receipt sharing an identifier (same or different location) is matched automatically | Use-case test: two recorded extractions, real SQLite and both modules; Playwright: upload, confirm with a new store, upload a second, see it matched | automated |
| Correcting a wrong automatic match stops the identifier that caused it from matching again | Use-case test: wrong match → corrected → third receipt with that identifier is flagged, not matched | automated |
| Questions: confirm with an identifier saved elsewhere returns `NEEDS_ANSWERS` and saves nothing; answered, it saves | Use-case test | automated |
| Can't confirm without a store or a total; can with every other field empty | Use-case tests; form test in Playwright (Confirm disabled, then enabled) | automated |
| Stale confirm refused; confirming an `uploaded` receipt by hand, then extraction finishing, keeps the person's data | Use-case tests | automated |
| Re-match only after the user agrees: confirm reports the count, changes nothing; `rematch` applies only matches | Use-case tests; Playwright for the prompt | automated |
| Unique store names ignoring case; unique (`type`, `value`) identifiers | Repository tests on in-memory SQLite | automated |
| Receipts list rows show date, store, amount and a status icon; a confirmed row expands into its digital receipt (lines, subtotal, tax, total, payment) and collapses again; View receipt image opens the receipt page read-only, and Edit makes it editable; an unconfirmed row opens the receipt page, and Back returns to the same place | Playwright, desktop and phone sizes | automated |
| Library › Stores: rename; add an identifier by hand (normalized; asks before moving one from another store); remove; mark ambiguous and back; a removed or ambiguous identifier stops matching, an added one starts | Use-case tests; Playwright for the screen | automated |
| Navigation: four sections and Snap on phone and desktop | Playwright (extends the existing tab bar and side navigation test) | automated |
| A review-required receipt can be entered by hand and confirmed | Use-case test; Playwright with a recorded unreadable reply | automated |
| Warnings come back from `checkDraft` and name their fields | Use-case test; Playwright shows a warning, fixes the figure, sees it clear | automated |
| Every new procedure refuses requests without a session | Existing `api-protection.test.ts` walks the whole contract | automated |
| Pinch-zoom, pan and double-tap on a real iPhone and Android phone; one-finger scroll at normal size | By hand on both phones | manual: passed 2026-11-15 |
| A real receipt through the real relay is matched after its company was confirmed once | By hand in development, with the owner's go-ahead (shared server) | manual: passed 2026-11-15 |

`pnpm check`, `pnpm build` (contracts change) and `pnpm test:e2e` (review is a
critical path, §3.5) must pass.

## Out of scope

- Items, item matching and the fee-line bug in `docs/BUGS.md` (part 2).
- Categories, tags, store defaults and suggestions (part 3).
- Manual entry and duplicate warnings (part 4).
- Merging stores, which is the only way to delete one (part 5).
- Library › Items (part 2) and Labels (part 3), and store default categories
  (part 3).
- Spending per store: an Analytics filter, Stage 6.
- Returns and refunds (deferred), and splitting a receipt between people (not
  planned).
- Images removed under the retention rules (Stage 5). The viewer only shows
  a plain "Image not available" when an image is missing.
