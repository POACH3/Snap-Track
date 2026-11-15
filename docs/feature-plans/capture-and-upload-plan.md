# Stage 2: capture and upload (online)

**Changes SPEC.md:** §4.3 Module responsibilities, §4.4 Tech stack, §5 Data Model (`receipts`, `receipt_images`), §6.1 Capture, §6.8 Image and file retention, §12 Open Questions.  
**Status:** active (built 2026-11-15 on `main`; the manual phone checks below are still to do).

Builds `SPEC.md` §11 Stage 2: the `receipts` module, the `FileStore` port,
capture (camera, library, desktop picker and drag and drop, **Add another
photo**), client-side resize, server-side HEIC conversion, idempotent upload,
the receipts list and the responsive layout shell. Online only: if the upload
fails, the receipt waits in memory with **Try again**; the durable offline
queue is Stage 5.

## Decisions

- **HEIC and server-side shrinking use macOS `sips`** (decided 2026-11-15,
  answers the §12 question). It is built in, so no package is needed, and it
  runs natively on ARM64. It sits behind an `ImageConverter` port, so a
  different library is one new adapter. Its adapter test runs only on macOS
  and is skipped elsewhere. `sips` exits 0 on a file it can't read and prints
  `<nil>`, so the adapter checks the output, not the exit code.
- **New packages** (approved 2026-11-15), pinned exactly: `lucide-react` 1.70.0
  (icons, `docs/DESIGN.md`), `react-router` 7.18.5 (client routes; 8.x needs
  React 19.2.7+ and the repo pins 19.1.10, so 7.x rather than a React bump),
  `@playwright/test` 1.65.0 (end-to-end tests, plus its Chromium and WebKit
  browsers).
- **Thumbnails are made by the server** (decided 2026-11-15): at upload, a
  JPEG at most 400 px on its longest side is saved next to each image, so the
  list stays fast on a phone. `receipt_images.thumbnail_key` is new (§5);
  retention deletes it along with the image (§6.8).
- **Navigation** (decided 2026-11-15): Receipts · Analytics · **Snap** · Search
  · Settings. Analytics ("Stage 6") and Search ("Stage 9") are placeholders.
  Settings shows who is signed in, plus **Log out**. Phone (below 640px): glass
  tab bar with the raised Snap button. Wider screens: side navigation with
  **Upload images** as the main action (hidden on the capture screen, which has
  its own, so each screen has one main button). DESIGN.md names the side navigation
  but doesn't describe its look, so it is built from existing tokens (selected
  item in `--accent-text` on `--surface-raised`) and is marked "proposed" for
  the developer to confirm.
- **`receipts.captured_at`** (new, §5): when the photo was taken on the
  device, taken from the file's date (now, for a fresh camera photo). The
  client already sends it (§6.1 step 3). The list sorts by it, so
  receipts uploaded late (Stage 5) still appear in capture order.
- **Who logged it.** The `receipts` module gets display names through its own
  port, `UserDirectory`, filled in by the composition root from `auth`. It
  never imports `auth`. `logged_by_user_id` has no foreign key, since the
  `users` table belongs to `auth` (§3.1 rule 4) and users are never deleted.
- **Upload procedure.** `receipts.put` (the spec's `PUT /receipts/:id`; oRPC
  sends every call to `/rpc/<path>`). Input: `id` (UUID made on the phone),
  `capturedAt`, `images` (1–10 files, each at most 25 MB). The whole request
  is limited to 100 MB (ADR 0002 asked for this limit): a larger
  `Content-Length` gets 413 before the body is read, and a body sent without
  one (chunked, e.g. relayed by a proxy) is cut off once it passes the limit,
  the same way oRPC's `BodyLimitPlugin` does for its Node adapter. Chunked
  bodies are not refused outright, since `tailscale serve` may relay uploads
  that way. Output: the receipt's summary,
  including how many images the server has.
- **Idempotent.** If the receipt already exists, the upload is ignored and its
  current state is returned. The first upload wins. Files are written first,
  each under a fresh random key. Then the receipt row and all its image rows go
  in one transaction, so a receipt never exists without all of its images. If
  two copies of the same upload arrive at once, the one that loses the insert
  deletes its own files and returns the winner's state.
- **Image handling on the server** (pure decision in `domain/`): the format is
  read from the first bytes (JPEG, PNG or HEIC/HEIF; anything else is refused
  with `UNSUPPORTED_IMAGE`). A JPEG within 4 million pixels is stored as sent,
  since the client already shrank it. Anything else (HEIC, PNG, or too large)
  is converted to JPEG at the §6.1 size. `image_sha256` is the hash of the
  stored file.
- **One pixel rule, shared.** The "at most about 4 million pixels, keep shape,
  never enlarge" size is one function in `packages/core` (`fitWithinPixels`).
  The client resize and the server conversion both use it.
- **Images are served by plain GET routes**, not oRPC, so `<img>` can load them
  and the browser can cache them: `/files/receipt-images/:imageId` and
  `/files/receipt-images/:imageId/thumbnail`. They need a signed-in session
  (the cookie); without one they return 401. Being GET-only with no side
  effects, they need no CSRF header. They are sent with
  `Cache-Control: private, max-age=31536000, immutable`, since an image's
  bytes never change.
- **Add another photo** is offered only after a single photo is taken or
  chosen. When several are chosen together, each becomes its own receipt and
  they upload at once (§6.1). With a receipt already open, any photos added
  join it, in order. The draft uploads on **Done**, or when the person leaves
  the capture screen.
- **Upload queue interface now, durable later.** Pending uploads go through
  the `UploadQueue` interface (§4.2) with an in-memory adapter. Stage 5 adds the
  IndexedDB adapter, offline triggers and `navigator.storage.persist()`. Until
  then, closing the app before an upload finishes loses that receipt (the
  capture screen says so while uploads are pending). Pending receipts show at
  the top of the list: a failed upload has **Try again**; one the server refused
  (not an image) shows "Not saved" until the app closes. It has no Remove
  button, since removing one would need the confirm modal (DESIGN.md), which
  doesn't exist yet; Stage 5's durable queue needs both.
- **Toasts.** The toast component is built here (result of an upload), and the
  login form's "Too many attempts" / "Can't reach SnapTrack" messages move to
  toasts, closing the DESIGN.md "Known inconsistencies" entry.
- **Uploads get a longer time limit** (2 minutes) than other API calls (15 s),
  via the oRPC client context.

## Build

1. **Core:** `fitWithinPixels(width, height, maxPixels)` and
   `MAX_RECEIPT_IMAGE_PIXELS = 4_000_000`, with tests.
2. **Contracts:** `receipts.put`, `receipts.list` (newest first by
   `capturedAt`, cursor paging, 50 per page), `receipts.get`; `ReceiptSummary`
   (id, status, source, capturedAt, loggedBy {id, displayName}, images
   [{id, position}]); `ReceiptStatus`; errors `UNSUPPORTED_IMAGE` (415),
   `RECEIPT_NOT_FOUND` (404).
3. **`receipts` module** (`apps/server/src/modules/receipts/`):
   - `domain/`: receipt and image types, image format detection from bytes,
     "store as is or convert" decision, image key format.
   - `ports.ts`: `ReceiptRepository`, `FileStore`, `ImageConverter`,
     `UserDirectory`.
   - `application/`: `putReceipt`, `listReceipts`, `getReceipt`,
     `readImage` (for the file routes).
   - `adapters/`: schema and SQLite repository (`receipts`, `receipt_images`),
     file-system `FileStore` (atomic write: temp file then rename; keys checked
     so they can't leave the folder), `SipsImageConverter`, oRPC procedures,
     the image GET routes.
   - `testing/`: `InMemoryFileStore` and `FakeImageConverter`, with contract
     tests run against both the real adapters and the fakes.
4. **Migration** `0002_receipts.sql` via `pnpm db:generate`.
5. **Platform:** `createHttpServer` takes extra route registrations (for the
   image routes) and enforces the request size limit on `/rpc`. Vite's dev
   proxy also forwards `/files`; the service worker never answers `/files/`.
6. **Composition:** `main.ts` and `createTestApp` wire the receipts module
   (`FileStore` at `IMAGE_DIR`, created at startup if missing).
7. **Web:**
   - `app/`: React Router routes; `AppShell` (glass top bar, phone tab bar with
     raised Snap, desktop side navigation); toast provider.
   - `shared/ui/`: `Toast`, `Pill`, `EmptyState`; secondary `Button` variant.
   - `features/capture/`: capture screen (Snap, Choose photos, Upload images,
     drop zone, draft with **Add another photo** and **Done**), resize helper
     (canvas; falls back to the original file when the browser can't decode
     it).
   - `features/sync/`: `UploadQueue` interface, in-memory adapter, uploader
     hook (uploads after each capture, keeps failures with **Try again**).
   - `features/receipts/`: receipts list (thumbnail, status pill, who, when,
     photo count, **Load more**, empty state), receipt view (all images in
     order).
   - `features/settings/`: signed-in user and **Log out**. Analytics and Search
     placeholders.
8. **End-to-end:** Playwright config, `pnpm test:e2e` (builds the web app,
   then starts a test server on an in-memory database with a temp image folder
   and a test user). Desktop Chromium and phone-sized WebKit projects.
9. **Docs:** SPEC.md sections above, TESTING.md, DESIGN.md (close the toast
   inconsistency; note the side navigation as proposed), ADR 0005 for `sips`.

## Verification

| Stage 2 "Done when" / behavior | Check | Kind |
|---|---|---|
| Pixel limit: keeps shape, never enlarges, 1:5 receipt ≈ 900 × 4500 | Unit tests of `fitWithinPixels` | automated |
| Format detection; store-or-convert decision | Domain unit tests (JPEG, PNG, HEIC brands, junk, too large) | automated |
| `FileStore`: put, get, delete, missing key, refuses `../` keys | Contract test against the file-system adapter (temp folder) and the fake | automated |
| `ImageConverter`: reads HEIC size, converts to JPEG at the requested size, refuses junk | Contract test against `sips` (macOS only) and the fake | automated |
| Uploading the same receipt twice creates one record | Use-case test (real SQLite, fakes); HTTP test sending the same `receipts.put` twice | automated |
| A receipt never exists without all its images; the loser of a race cleans up | Use-case tests: converter fails on image 2 → no row, no files left; insert conflict → own files deleted | automated |
| Right person attached; not taken from the request | Use-case and HTTP tests: `loggedBy` is the session's user | automated |
| Size limit and unsupported files | HTTP tests: over 100 MB → 413; a text file → 415 | automated |
| Image routes need a session | HTTP tests: 401 without a cookie, 200 with one, 404 for an unknown id; the API-protection test covers the new procedures | automated |
| Three photos chosen together become three receipts | Playwright: choose three files → list shows three receipts | automated |
| A long receipt in three photos with **Add another photo** becomes one receipt with three images in order | Playwright: one photo, add two more, **Done** → one receipt, view shows three images in order | automated |
| A HEIC file dragged in on desktop uploads and displays | Playwright (Chromium can't decode HEIC, so the original is sent): drop a HEIC fixture → thumbnail and full image load | automated |
| Layout: tab bar below 640px, side navigation above | Playwright phone and desktop projects | automated |
| A photo taken on an Android phone and on an iPhone shows up with the right person | By hand on both phones, against the development server | manual |
| Three photos chosen from an iPhone library become three receipts | By hand on an iPhone | manual |
| An iPhone HEIC shows the right way up (EXIF rotation survives conversion) | By hand: upload a portrait HEIC from an iPhone via desktop drag and drop | manual |

`pnpm check`, `pnpm build` and `pnpm test:e2e` must pass.

## Out of scope

- IndexedDB queue, offline capture, Background Sync, `navigator.storage.persist()`, pending count (Stage 5).
- Extraction jobs (Stage 3): uploaded receipts stay `uploaded`.
- Warning about the same photo uploaded twice (`image_sha256` is stored for later).
- Manual entry (F17) and the theme choice in Settings.
- Deleting receipts.

## Risks

- **EXIF rotation.** Canvas re-encoding in the browser applies the rotation.
  `sips` keeps the orientation tag rather than rotating the pixels, so
  browsers show the image correctly, but the Stage 3 model may not. Check by
  hand here; if needed, rotate in the converter in Stage 3.
- **Very large photos on old phones.** Decoding a 48 MP photo into a canvas
  can run out of memory on an iPhone; if it fails, the original is uploaded
  and the server shrinks it.
