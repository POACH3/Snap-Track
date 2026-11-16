# Testing

Index of SnapTrack tests. Run everything with `pnpm check` (format, lint,
typecheck, boundaries, tests); tests alone with `pnpm test`.

## Suites

| Suite | Command | What it covers |
|---|---|---|
| Unit and integration | `pnpm test` (Vitest) | Every `*.test.ts` under `apps/*/src`, `packages/*/src` and `tooling/` |
| Boundaries | `pnpm boundaries` (dependency-cruiser) | Architecture rules in `.dependency-cruiser.mjs` (SPEC.md §3.1) |
| End-to-end | `pnpm test:e2e` (Playwright) | Builds the web app, starts `apps/server/src/testing/e2e-server.ts` (in-memory database, temp image folder, real `sips`, user `e2e`) and runs `apps/web/e2e/` in desktop Chromium and phone-sized WebKit. macOS only (sips). |

## Test files

| File | Covers |
|---|---|
| `packages/core/src/money.test.ts` | `allocateCents` (exact sums, remainders, negative and zero totals, bad weights); `formatUsd` |
| `packages/core/src/image-size.test.ts` | `fitWithinPixels` (never enlarges, keeps shape, 1:5 receipt ≈ 900 × 4500, never a zero side); `fitWithinSide` |
| `packages/core/src/hash.test.ts` | `sha256Hex` against the standard test vector |
| `apps/server/src/config/load-config.test.ts` | Config validation: each missing variable is named; several errors reported at once |
| `apps/server/src/platform/db/sqlite-transaction.test.ts` | `Transaction.run`: commits, rolls back on throw, nested savepoints, refuses async `fn` (type and run time) |
| `apps/server/src/platform/db/migrations.test.ts` | Migrations apply to a fresh database, are idempotent, pending count; foreign keys on |
| `apps/server/src/platform/http/create-http-server.test.ts` | `/healthz`, oRPC under `/rpc`, 404 for unknown procedures, a request ID per request; a body without Content-Length is cut off past the size limit, and a small one is read normally |
| `apps/server/src/modules/auth/domain/auth-rules.test.ts` | Username and password rules, session lifetime and renewal, login throttling |
| `apps/server/src/modules/auth/application/auth-service.test.ts` | Login, authenticate, logout, create user, set password, display names (real SQLite, fake hasher and clock) |
| `apps/server/src/modules/auth/adapters/sqlite-repositories.test.ts` | Users and sessions tables: unique usernames, exact expiry, expired cleanup, cascade on user delete |
| `apps/server/src/modules/auth/adapters/session-cookie.test.ts` | Cookie name and attributes over HTTPS and plain http; reading it back |
| `apps/server/src/modules/auth/adapters/rpc.test.ts` | Login, `me`, renewal, expiry and logout over HTTP; error codes; cookie flags |
| `apps/server/src/modules/auth/testing/password-hasher.contract.test.ts` | `PasswordHasher` contract, run against Argon2 and the fake |
| `apps/server/src/modules/receipts/domain/receipt-rules.test.ts` | Image format from first bytes (JPEG, PNG, HEIC brands; video, GIF, text refused); keep or convert; thumbnail size; image keys; list cursor; timestamp form |
| `apps/server/src/modules/receipts/application/receipts-service.test.ts` | Upload: person from the session, images in order, idempotent, keeps shrunk JPEGs, converts HEIC, refuses non-images by position, no rows or files left after a failed conversion or write, racing duplicates keep one; list paging and order; unknown receipts and images (real SQLite, fakes) |
| `apps/server/src/modules/receipts/adapters/sqlite-receipt-repository.test.ts` | Images in position order, duplicate id refused, one image per position, status check, image rows deleted with their receipt |
| `apps/server/src/modules/receipts/adapters/rpc.test.ts` | Upload over HTTP (multipart, as the oRPC client sends it), person from the session, same upload twice is one record, 415 for non-images, 413 over the size limit, 400 with no images, list and get, 404; image routes: JPEG with cache headers, 401 without a session, 404 for unknown or malformed ids |
| `apps/server/src/modules/receipts/testing/file-store.contract.test.ts` | `FileStore` contract (put, replace, get missing, delete, refuses escaping keys, copies bytes), run against the file-system adapter and the fake; no partial files left |
| `apps/server/src/modules/receipts/testing/image-converter.contract.test.ts` | `ImageConverter` contract (reads JPEG, PNG and HEIC sizes; HEIC to JPEG at an exact size; refuses junk), run against `sips` (macOS only) and the fake |
| `packages/core/src/quantity.test.ts` | `toMilli` (exact thousandths) |
| `packages/contracts/src/extraction.test.ts` | Extraction schema: everything optional, wrong types become null, amounts written as text, unreadable list entries dropped, non-objects refused |
| `apps/server/src/modules/receipts/domain/extraction-rules.test.ts` | Model reply to stored rows (cents, thousandths, units, dates, last four digits, store evidence); usable-amount rule; every consistency check firing and staying quiet |
| `apps/server/src/modules/extraction/domain/extraction-rules.test.ts` | Reading the model's JSON (code fences, extra text, refusals); outcome rules: save, wait (default and suggested times, bounds), back-off 1-2-4-8 min, five attempts, one retry for invalid output |
| `apps/server/src/modules/extraction/application/extraction-service.test.ts` | Upload queues a job in the same transaction; typical receipt reaches `unreviewed` with lines, evidence, payments, transcription; long receipt sent as one request in order; unreadable → `review_required`; no amounts → `review_required`; missing photos; offline, busy, reserved, interrupted never use attempts; five failures; exceptions count; stop puts the job back; restart mid-job resumes (real SQLite and receipts module, scripted extractor) |
| `apps/server/src/modules/extraction/adapters/relay-extractor.test.ts` | Relay adapter against a stub HTTP server: request headers, settings and images in order; output; keep-alive spaces; 200 without choices; reserved and busy with `Retry-After`; 502 and connection refused; other statuses; time limit; cancel; `Retry-After` parsing |
| `apps/server/src/modules/extraction/adapters/prompt.test.ts` | The prompt's JSON template names exactly the schema's fields |
| `apps/server/src/modules/extraction/adapters/sqlite-job-repository.test.ts` | One job per receipt; claim order and due times; failed attempts recorded only when told; running jobs reset; finished jobs never claimed |
| `apps/server/src/modules/extraction/adapters/extraction-worker.test.ts` | Worker reads an upload at once, picks up queued receipts at start, stops promptly |
| `apps/server/src/modules/extraction/adapters/backfill-migration.test.ts` | Migration 0003 queues a job for each receipt uploaded before extraction existed |
| `apps/web/src/features/sync/in-memory-upload-queue.test.ts` | Upload queue: order, no duplicate ids, states, removal, change notifications |
| `apps/web/e2e/capture.spec.ts` | Playwright: three images chosen together become three receipts; a long receipt in three photos becomes one receipt with images in order; a dropped HEIC is converted and displays; Snap and Done upload on a phone; leaving the capture screen uploads the open receipt; tab bar on phones (Receipts, Analytics, Snap, Library, Settings), side navigation on desktop (profile, the five sections, Upload receipt) |
| `packages/contracts/src/receipts.test.ts` | Confirm needs a store and a total and nothing else; negative amounts accepted (returns deferred); last four card digits only; purchase date shape; store names trimmed |
| `apps/server/src/modules/catalog/domain/catalog-rules.test.ts` | Identifier normalization per type (names, phones, websites, email domains, addresses typed on one line); exclusion list before and after normalization; evidence → identifiers; `identifyStore` (one strong hit, all hits agree, supporting address, other company's address ignored, conflict, address only, unknown, ambiguous never matches, name types looked up against each other); suggestions (candidates, brand guess, similar names, a store learned since); `planStoreLearning` (save every identifier, no double counting, ask before moving, move or keep, stale answers ignored, cross-type names, shared address, correcting a wrong match, changing a confirmed receipt's store, ambiguous left alone) |
| `apps/server/src/modules/catalog/adapters/sqlite-catalog-repositories.test.ts` | Store names unique ignoring case; search ignores case and treats `%`/`_` as text; counts and known names; one identifier per (type, value); find by value across types; seen, move, mark, remove; added by hand |
| `apps/server/src/modules/catalog/application/catalog-service.test.ts` | A store learned from one receipt is known by any of its identifiers; the move question and its answer; shared addresses; review suggestions; rename; add by hand (normalized, starts matching, refuses duplicates and payment companies, asks before taking one from another store, reports a shared address); removed or ambiguous identifiers stop matching (real SQLite) |
| `apps/server/src/modules/receipts/application/review.test.ts` | Stage 4 part 1 use cases on real SQLite with the real catalog module: second receipt matched after one confirm; conflict and address-only flagged; a corrected match stays corrected; the move question saves nothing until answered; confirm needs only a store and a total; stale forms refused; a person's entry kept when extraction finishes later; review-required entered by hand; lines kept, added, removed and reordered by id; re-match only on request; the amount when no total was read; the review filter and counts; warnings for a draft |
| `apps/server/src/modules/catalog/domain/item-rules.test.ts` | Barcodes (UPC-A, UPC-E, EAN-8, EAN-13; one product in two forms is one GTIN-14; wrong check digits refused); codes and printed names normalized; a line's identifiers (barcode anywhere, code and name at the store, fee lines by name only); `identifyItem` (barcode, then code, then name; conflicts and ambiguous apply nothing; other stores never match; the core-charge bug); `planItemLearning` (save, seen, ask before moving, the same detail on two lines, no double counting) |
| `apps/server/src/modules/catalog/adapters/sqlite-item-repositories.test.ts` | One barcode can't be saved for two items (the partial unique index, `SPEC.md` §5); a store's code for one item only; a barcode never has a store; identifiers listed with their store; search and rename |
| `apps/server/src/modules/receipts/application/items.test.ts` | Part 2 use cases on real SQLite with the real catalog module: a named item shown on the next receipt with the same code and different text; a barcode at another company; fee lines kept off their item's code; no item created on its own; similar-name suggestions not applied; choosing a different item asks first, with store questions together; re-matching earlier purchases only on request; an item's purchases newest first |
| `apps/web/src/shared/ui/zoom.test.ts` | Image viewer geometry: the pinch point stays still, 1×–5× limits, no gaps at the edges, a long receipt scrolls at fit width, narrow content centered |
| `apps/web/src/features/receipts/receipt-form.test.ts` | Amounts and quantities as typed; the form round-trips a draft; field errors named and nothing sent; card digits; empty rows dropped; split; warnings placed by field |
| `apps/web/src/features/receipts/receipt-format.test.ts` | Printed dates with and without a time, the capture-time fallback, payment names |
| `apps/web/e2e/review.spec.ts` | Playwright: desktop — create a store on a first receipt, confirm, the row expands into the digital receipt, View receipt image opens it read-only beside the photo, a second location sharing the website is matched, Library › Stores lists the learned identifiers; a line's item named with Use it shows on the next receipt by its code, and renaming it in Library › Items shows at once; a review-required receipt typed in by hand, total required, leaving with changes asks first. Phone — no tab bar on the receipt page; the edit card and photo both on screen; store page, then items and totals; a warning clears when the line is fixed; confirm |
| `apps/server/src/testing/api-protection.test.ts` | Walks the whole contract: every non-public procedure refuses requests without a valid session |
| `tooling/boundaries.test.ts` | Each boundary rule fires on its deliberate violation in `tooling/boundary-fixtures/` |

## Test helpers

- `apps/server/src/testing/create-test-app.ts`: `createTestApp()`, the whole server wired
  like `main.ts` on an in-memory database with a fake clock and fast hasher, and in-memory
  images unless a file store and converter are passed; `CSRF_HEADER`.
- `apps/server/src/testing/e2e-server.ts`: the server Playwright starts (see End-to-end above).
- `apps/server/src/modules/receipts/testing/`: `InMemoryFileStore`, `FakeImageConverter`,
  `fakeImage()` (a real format signature plus its size as text, which the fake converter reads),
  and `makeRealImage()` (real PNG, JPEG and HEIC files, made with sips, for adapter tests).
- `apps/server/src/modules/extraction/testing/scripted-extractor.ts`: `ScriptedExtractor`
  (plays back replies, records requests) and `output()`. `createTestApp()` uses one with no
  replies and doesn't start the worker; the e2e server doesn't start it either.
- `apps/web/e2e/fixtures/`: three small JPEGs of different widths and one HEIC, made with
  `makeRealImage()`; and `review-a.jpg` (720 px wide), `review-b.jpg` (760), `review-phone.jpg` (880)
  and `review-unreadable.jpg` (840), whose widths pick their replies.
- `apps/server/src/testing/e2e-extractor.ts`: `E2eExtractor`, the e2e server's stand-in for the LLM
  server: reads the first photo's width and replies with the recorded receipt for it (`E2E_REPLIES`);
  any other photo gets an unknown store and a total. Never used outside tests.
- `apps/server/src/modules/auth/testing/fake-password-hasher.ts`: instant stand-in for Argon2.
- `@snaptrack/core/testing`: `FakeClock`.
- `apps/server/src/platform/db/testing/test-database.ts`: `createTestDatabase()`, a
  fresh in-memory SQLite database with every migration applied. One per test.

## Not covered

- Web client components (no component tests); the capture and upload paths are covered by Playwright.
- Real phones: camera capture on Android and iPhone, choosing from an iPhone library, and an
  iPhone HEIC's rotation are checked by hand (`docs/feature-plans/capture-and-upload-plan.md`).
- Pinch-zoom, pan and double-tap on a real iPhone and Android phone (Playwright can't pinch);
  checked by hand (`docs/feature-plans/store-review-plan.md`).
- The real LLM server: one manual request with the owner's go-ahead (`docs/feature-plans/extraction-plan.md`).
- Login screen in Playwright: used by every end-to-end test, but its error cases are not.
- `pnpm user:create` / `user:set-password` prompts: checked by hand with piped input against a scratch database.
- Host setup, firewall, Tailscale and deploy (Stage 0 steps 9–11): manual checks,
  to be listed in `deploy/README.md`.
