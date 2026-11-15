# Stage 3: extraction

**Changes SPEC.md:** §4.1 Components (job runner), §4.3 Module responsibilities, §5 Data Model (`extraction_jobs`), §6.3 Extraction and §6.3.1 Sharing the LLM server, §11 Stage 3, §12 Open Questions.  
**Status:** shipped (2026-11-15, commit `99d3151`; deployed; real receipts read through the relay in development and production).

Builds `SPEC.md` §11 Stage 3: the extraction schema, the `extraction` module
with its persisted job queue, the `ReceiptExtractor` port (relay adapter and
fake), the extraction loop, saving the extracted data, and the consistency
checks. Store and item matching (§6.4) is the `catalog` module, Stage 4.

## What the LLM server provides (settled 2026-11-15 with the LLM-Server project)

- **Same model as chat.** The installed `Qwen3.6-35B-A3B-4bit`
  (`mlx-community` build) includes the vision tower, and oMLX serves it through
  `mlx-vlm` 0.7.1. No separate vision model, and no model switch while it is
  the loaded model. `EXTRACTION_MODEL=Qwen3.6-35B-A3B-4bit`.
- **Relay** at `http://127.0.0.1:8081`. SnapTrack sends ordinary
  `POST /v1/chat/completions` (not streamed), with `X-LLM-Priority: low`,
  `X-OpenWebUI-User-Name: snaptrack` (so usage is logged under that name), and
  its own oMLX API sub-key.
- **Replies SnapTrack relies on:**

  | Reply | Meaning | Attempt used? |
  |---|---|---|
  | 200 with `choices` | output to validate | no (invalid output is a failed attempt) |
  | 200 without `choices` (oMLX commits to 200 after 2 s, so a later failure arrives this way) | failed | yes |
  | 503 `error.code = "server_reserved"` | owner reserved the server; wait (`Retry-After`, else 5 min) | no |
  | 503 `error.code = "low_priority_busy"` | a chat is running or another model is loaded; wait (`Retry-After`, else 30 s) | no |
  | 502, or connection refused | LLM server not running; wait 2 min | no |
  | anything else, or no answer in `EXTRACTION_TIMEOUT_MS` | failed | yes |

  The relay changes (low priority, busy reply, `Retry-After`, passing replies
  through and dropping the oMLX connection when SnapTrack gives up) are built
  in the LLM-Server project.
- **No enforced JSON schema** (oMLX lacks xgrammar). SnapTrack writes the
  schema into its own prompt and validates the reply with Zod.
- **Image size: checked 2026-11-15.** oMLX did not shrink a 4 MP photo
  (3,410 prompt tokens; about 1,000 would mean 1 MP). It took 14.9 s. The
  relay test used the LLM-Server agent's own small schema, so SnapTrack's
  prompt and full schema are still to be tried on a real receipt.

## Decisions

- **Request settings** override the chat defaults: temperature 0, presence
  penalty 0, thinking off (`chat_template_kwargs.enable_thinking: false`),
  `max_tokens` 8,000.
- **Persisted queue = the `extraction_jobs` table**, behind an
  `ExtractionJobRepository` port in the `extraction` module. A generic
  `JobQueue` (§4.1) waits for its second user, the nightly retention cleanup
  (simplest design; rule of three, §3.2). One job per receipt.
- **Upload creates the job in the same transaction** as the receipt, so no
  receipt is ever left without one. `receipts` can't call `extraction`
  (`extraction` depends on `receipts`), so `receipts` defines a synchronous
  `ReceiptUploadedListener` port, wired to the extraction module by the
  composition root, like `CatalogMergeListener` (§4.3). The migration also
  makes jobs for receipts already uploaded in Stage 2.
- **`extraction` reaches receipts through its own port** (`ReceiptsGateway`:
  read the images in order, mark extracting, save the result, mark review
  required), filled from the receipts module in the composition root.
- **The loop** (one worker in the server process): take the oldest pending job
  whose `next_attempt_at` has passed, mark it running and the receipt
  `extracting`, send it, then:
  - output valid and usable → save the data and mark the job done in one
    transaction; receipt `unreviewed`;
  - output valid but with neither a total nor any line amount →
    `review_required` (§5 Rules);
  - invalid output → retried once (`invalid_outputs`, new column); the second
    time, `review_required`;
  - real failure → attempt counted; retried after 1, 2, 4, 8 minutes; after 5
    attempts the job is `failed` and the receipt `review_required`;
  - wait (busy, reserved, offline) → back to `pending` at the suggested time;
    no attempt counted, and the receipt goes back to `uploaded`.
  
  When the queue is empty, the worker sleeps until the next due job (checked at
  least every 30 s), and wakes at once when a receipt is uploaded. At startup,
  jobs left `running` by a crash go back to `pending` with no attempt counted,
  and their receipts back to `uploaded`. At shutdown, the request in flight is
  abandoned the same way.
- **The rules for each outcome** (next state, delay, attempt or not) are one
  pure domain function, tested on its own.
- **Money and quantities.** The model reports amounts as printed decimals;
  domain code converts them to integer cents and quantities to thousandths
  (§3.2). Units are normalized to §5's list (`ea` → `each`, `lbs` → `lb`, …);
  anything else is stored as `each` with the printed text kept in `raw_text`.
- **What is stored now.** On `receipts`: purchase date/time, subtotal,
  receipt discount, tax, tax lines, tip, total, printed savings and item
  count, payments, transaction numbers, `raw_text`, `store_evidence`. On
  `line_items`: position, kind, printed name, item code, quantity, unit, unit
  price, line total, discount, tax code, suggested item name. The catalog
  columns (`store_id`, `store_matched_by`, `item_id`, `line_category_id`,
  `suggested_category_id`, `suggested_tag_ids`) arrive with `catalog` in
  Stage 4, which can re-read `extraction_jobs.raw_output`.
- **Consistency checks** (§6.3 step 4) are pure functions in the receipts
  domain, returning warnings for the Stage 4 review screen. "≈" means within 2
  cents per added figure. "Unreasonably old" means more than 2 years before the
  upload.
  A subtotal that matches the item lines alone, with fee lines added after it
  (e.g. AutoZone: SUBTOTAL, CORE CHARGE, FINAL SUBTOTAL), is accepted, and the
  fees count toward the total check (decided 2026-11-15 after the first real
  receipts; the model keeps reporting the subtotal as printed).
- **The list follows extraction.** Each receipt summary gains its total. The
  list shows it, and refreshes every 10 s while any shown receipt is
  `uploaded` or `extracting`.

## Build

1. **Contracts:** the extraction output schema (what the model returns,
   §6.3.2) and the stored JSON shapes (store evidence, tax lines, payments,
   transaction numbers); `totalCents` on `ReceiptSummary`.
2. **Receipts module:** new columns and `line_items` (migration); domain
   conversion of extracted data to stored rows; consistency checks;
   `ReceiptUploadedListener`; gateway operations for extraction.
3. **Extraction module** (`apps/server/src/modules/extraction/`): domain (reply
   outcomes, retry delays, output parsing); ports (`ReceiptExtractor`,
   `ExtractionJobRepository`, `ReceiptsGateway`); `runNextJob` use case;
   adapters (SQLite jobs, relay extractor with prompt, worker loop); testing
   (scripted fake extractor).
4. **Composition:** `main.ts` and `createTestApp` wire both modules; the worker
   starts with the server and stops on shutdown.
5. **Web:** total on each row; refresh while extraction is pending.
6. **Docs:** SPEC.md sections above, TESTING.md, ADR 0006 (model and relay
   contract).

## Verification

| Stage 3 "Done when" / behavior | Check | Kind |
|---|---|---|
| Outcome rules: next state, delay, attempt counting, the 5-attempt limit, one retry for invalid output | Domain unit tests of the decision function | automated |
| Amount, quantity and unit conversion; output parsing (JSON in code fences, extra text, wrong types) | Domain unit tests | automated |
| Consistency checks, each one firing and staying quiet | Domain unit tests | automated |
| Upload creates a job in the same transaction; Stage 2 receipts get jobs from the migration | Use-case test; migration test | automated |
| A typical receipt reaches `unreviewed` with all lines, store evidence, payments and transcription, line totals net of item discounts | Use-case test with a recorded model reply (fake extractor, real SQLite) | automated |
| A long receipt in several photos goes to the model as one request, images in order | Use-case test (the fake records what it was sent); adapter test (one message, images in order) | automated |
| An unreadable image ends up `review_required` | Use-case tests: invalid output twice; valid output with no amounts | automated |
| A restart mid-job resumes it | Use-case test: a job left `running` is reset and completed, attempts unchanged | automated |
| LLM server stopped → jobs wait, then complete | Use-case test: offline replies don't use attempts; then success | automated |
| Relay busy → jobs wait without using attempts | Use-case test with `low_priority_busy` and `server_reserved`, honoring `Retry-After` | automated |
| Interrupted → back in the queue, never counted | Same rule as busy (the relay has no interrupt reply yet; whatever it adds maps to "wait") | automated (rule only) |
| Relay adapter maps every reply in the table above; sends the headers and settings; times out | Adapter tests against a local stub HTTP server with recorded replies, including keep-alive spaces before the body | automated |
| A real receipt through the real relay: works, image size, time per receipt | One request, with the owner's go-ahead (shared server), while Qwen is loaded and no one is chatting | manual: passed 2026-11-15 (Home Depot and AutoZone receipts read correctly on the first try; 4 MP photo not shrunk; about 15 s per photo) |

`pnpm check` and `pnpm build` must pass; `pnpm test:e2e` too, since the
receipts list changes.

## Out of scope

- Store and item matching, categories, review screen (Stage 4).
- Re-running extraction on demand.
- A chat interrupting a receipt (the relay can't cancel yet).
