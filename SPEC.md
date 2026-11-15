# Fin Snap — Specification

This document defines what Fin Snap is for, how it is built, and the order it is built in. The [README](README.md) is the public summary; this is the working reference. When a decision here changes, update this file in the same change.

---

## 1. Goals

Fin Snap is a household expense tracker. A photo of a paper receipt goes in; structured, categorized, line-item expense data comes out, and that data is turned into monthly breakdowns and trends.

### Primary goals
1. **See where money goes.** Monthly spending broken down by store, by item, and by category, plus how those change over time.
2. **Track prices.** Notice when an item gets more expensive, and compare what the same item costs at different stores.
3. **Replace manual logging.** Capturing a receipt should take less effort than typing it into a spreadsheet. Extraction should be accurate enough that review is usually a glance, not a rewrite.
4. **High-quality software.** Clean architecture, loose coupling, little repetition, and code that stays easy to change. Section 3 makes this concrete and is binding on every stage.

### Users
- A single household (a few people) sharing one pool of expenses.
- Phones are a mix of Android and iPhone.
- Every receipt and manual entry records who logged it, so totals can be split by person.

### Devices and how they are used
| Device | Main use | Also supported |
|---|---|---|
| **Phone** | Photographing receipts and uploading them; choosing receipt photos already in the photo library. | Occasional manual entries. Review and analytics. |
| **Desktop / laptop** | Uploading CSV files and other records from online retailers. | Manual entry; uploading receipt image files. Review and analytics. |

Every feature works on both, but each screen is designed first for the device it is mostly used on:
- **Phone-first:** capture (camera and library), the upload queue, quick review. **Snap** is the most prominent action; **Add expense** is secondary.
- **Desktop-first:** retailer import, full manual entry with many line items, side-by-side review on a wide screen, and analytics.
- One responsive app, not separate mobile and desktop apps. Layouts adapt to screen width; features and code are shared.

### Non-goals
- **Public / multi-household use.** No sign-up flow, no tenant separation, no public hosting.
- **Other automated inputs.** No digital/PDF receipts or bank/card statement import (may be revisited later; see §12). Expenses without a paper receipt are entered by hand (F17) or, for online retailers, imported from the retailer's CSV order report (F19).
- **Importing history.** The app starts fresh.
- **Budgeting.** No spending limits or alerts in the planned scope.
- **Multi-currency.** One currency (USD) assumed throughout.
- **Native mobile apps / app stores.**
- **Third-party AI services.** Extraction runs on a self-hosted model.

---

## 2. Requirements

### Functional
| ID | Requirement |
|---|---|
| F1 | A household member can photograph a receipt from their phone's browser, choose one or more receipt photos from the phone's library, or upload receipt image files from a desktop (file picker or drag and drop). |
| F2 | Capture works without a connection; queued receipts upload once the connection returns. |
| F3 | The server extracts everything that identifies the store, the purchase and payment details, every line item, and a full word-for-word transcription of the receipt, as listed in §6.3.2. |
| F4 | Extracted data counts right away, marked unreviewed, and can be reviewed and corrected at any time. Receipts the model could not read are marked review required and are filled in by hand. |
| F5 | The original image is stored with its receipt and shown side by side with the extracted data, both during review and when viewing a receipt later. |
| F6 | Each line item has its own category, so one receipt can span several categories. |
| F7 | The store is identified as a **company** (e.g. Walmart), not a location, with extreme accuracy: an automatic match is made only on a known identifier, and never on a guess. Items are normalized so the same item is counted as one across receipts. |
| F8 | Once a user confirms which company a receipt is from, every identifier on that receipt is remembered, so the user never has to confirm that company again. |
| F9 | Purchases are classified in a four-level hierarchy: L1 categories, L2 subcategories, L3 classes, L4 classes, each entry assigned to one parent in the level above. L1 starts from an editable default set; all levels can be added, renamed, moved, archived, and merged. |
| F10 | Every expense, photographed or entered by hand, records the household member who logged it. |
| F11 | Monthly breakdowns: by store, by item, by category, filterable by person. |
| F12 | Trends: month-over-month and year-over-year, overall and per store/item/category. |
| F13 | Price history per item, per store. |
| F14 | Flags for unusual spikes in a store or category. |
| F15 | Search, filter, custom date ranges. |
| F16 | Household settings control how long receipt images and imported files are kept: one for confirmed receipts, one for receipts never reviewed. Either can be set to keep images indefinitely. Extracted data is kept regardless. |
| F17 | A household member can enter an expense by hand, with no photo: either a quick entry (store, date, total, category) or a full entry with line items. Manual entries are tagged with the person who entered them and count exactly like receipts. |
| F18 | All household data can be exported at any time: a full export (CSV and JSON, optionally with images) and an export of any view. CSV is required; other formats (XLSX first) can be added without changing anything but a writer. |
| F19 | Purchase history CSV files from online retailers (Amazon first) can be imported. Each retailer has its own column format, supplied as a format definition. Re-importing the same or an overlapping file never creates duplicates. |
| F20 | A user can name any item (e.g. turn a truncated printed name into a readable one). The name is remembered: every past and future purchase of that item, recognized by its code or printed name, shows the user's name everywhere, including summaries. |
| F21 | A user can add any number of tags (e.g. "dessert", "luxury item") to an item, applying to every purchase of it, or to a single purchase. These are free tags: simple filters outside the hierarchy, never assigned to a category or class. A tag can be compared with a hierarchy entry or another tag, but the user is always told how much overlaps and is counted twice. |
| F22 | Each line item is categorized individually. A user can give a store a default category ("what I usually buy here"), which applies to every line from it, and can recategorize any single purchase or any item (every purchase of it). User-set item categories win over the store default. The software's guesses at categories and tags are never applied unless the user accepts them; when a user-set category already applies, the guess stays silent. |

### Non-functional
- **Fully private.** No data leaves the home network. Extraction runs on a self-hosted vision model.
- **Private access.** The server is reachable only from household devices (via Tailscale), never the open internet.
- **No running costs.** Runs on existing home hardware. No paid services.
- **Data integrity.** No receipt captured on a phone is ever silently lost. Uploads are idempotent (safe to retry).
- **Recoverable.** The database and images can be backed up and restored with plain file copies.
- **Maintainable.** Meets the engineering principles in §3, enforced by automated checks where possible.

---

## 3. Engineering Principles

These rules apply to every line of code. When one conflicts with speed, the rule wins. When two conflict, **simplicity** wins: the simplest design that keeps components loosely coupled.

### 3.1 Architecture rules
1. **Ports and adapters.** Business logic never touches I/O directly. It depends on small interfaces ("ports") such as `ReceiptRepository`, `ReceiptExtractor`, `ModelHost`, `FileStore`, `JobQueue`, `Clock`. Concrete implementations ("adapters": SQLite, the LLM server, the file system) plug in from the outside.
2. **Dependencies point inward.** `domain` ← `application` ← `adapters`. Domain code imports nothing from the other layers or from any framework. Fastify, Drizzle, and HTTP clients appear only in adapters.
3. **Modules by feature, not by layer.** Code is grouped by what it does (receipts, catalog, extraction...). Each module exposes a single public entry point (`index.ts`). Other modules import only from that entry point, never from a module's internals.
4. **Each module owns its tables.** No module reads or writes another module's tables. The two exceptions are the `analytics` and `export` modules, which have read-only access to everything for reporting and export (see §4.3).
5. **One composition root.** All wiring (which adapter fills which port) happens in one file per app (`main.ts`). Plain constructor arguments; no dependency-injection framework.
6. **Swappable infrastructure.** Replacing the LLM server, the database, or image storage means writing one new adapter and changing one line in the composition root. Nothing else changes.

### 3.2 No repeated code
1. **One source of truth for data shapes.** Zod schemas in `packages/contracts` define every API request and response, the extraction output, and form validation. TypeScript types are inferred from them, never hand-written twice. Server and client both import them.
2. **Shared primitives live once.** Money (integer cents, formatting, allocation), dates, IDs, and the `Result`/error types live in `packages/core` and are used everywhere.
3. **Rule of three.** Duplication is removed when a pattern appears the third time, not before. No speculative abstractions.

### 3.3 Simplicity
- Fewest moving parts that meet the requirements: one server process, one database file, one container for the app.
- No feature flags, plugin systems, or configuration options unless a requirement needs them.
- Prefer plain functions over classes for domain logic. Use classes only for adapters that hold resources (a DB connection, an HTTP client).
- Small files with one purpose. Names say what something does; comments say *why*, not what.

### 3.4 Code standards
- TypeScript `strict` mode everywhere. No `any`; `unknown` plus validation at boundaries.
- All external input (HTTP bodies, model output, config, IndexedDB contents) is validated with Zod at the edge. Inside, data is trusted and typed.
- **Errors:** domain and application code return typed results for expected failures (e.g. `ReceiptNotFound`, `ExtractionInvalid`). Exceptions are reserved for real bugs. HTTP adapters map results to status codes in one place.
- **Config** is loaded and validated once at startup; the app refuses to start on bad config.
- **Logging** is structured (Pino, built into Fastify), with a request ID on every log line.
- Formatting (Prettier) and linting (ESLint) are automatic, never debated.

### 3.5 Testing
| Layer | Test type | Uses |
|---|---|---|
| Domain | Unit tests | Plain inputs and outputs, no mocks. Highest coverage. |
| Application | Use-case tests | In-memory fake adapters for every port. |
| Adapters | Integration tests | Real SQLite (temp file), real file system, recorded model responses. |
| Ports | Contract tests | One shared test suite per port, run against both the real adapter and the fake, so fakes cannot drift from reality. |
| Whole app | End-to-end (Playwright) | Critical paths only: capture → review → confirm, offline sync. |

Every fake adapter lives next to its port and is reused by all tests (no per-test hand-rolled mocks).

### 3.6 Enforcement
- **Boundaries are checked by tooling**, not memory: `dependency-cruiser` fails the build if a domain file imports a framework, a module imports another module's internals, or a dependency points outward.
- **One command, `pnpm check`,** runs format check, lint, typecheck, boundary check, and all tests. A stage is not done until it passes.
- **Decision records.** Significant decisions (and changes to this section) get a short Architecture Decision Record in `docs/adr/`: context, decision, consequences.

---

## 4. Architecture

```
 Phone (browser / installed PWA)                 Home server
┌───────────────────────────────┐   HTTPS via   ┌──────────────────────────────┐    ┌──────────────────────┐
│ React PWA                     │   Tailscale   │ Fin Snap server (Docker)     │    │ LLM server (existing,│
│  - camera capture             │ ────────────► │  - auth / sessions           │    │ shared; native)      │
│  - image resize/compress      │               │  - receipt upload            │    │  relay → oMLX        │
│  - IndexedDB upload queue     │ ◄──────────── │  - extraction job runner ────┼──► │  one model loaded    │
│  - service worker (offline)   │               │  - normalize / categorize    │    │  at a time           │
│  - review, breakdowns, charts │               │  - analytics queries         │    │                      │
└───────────────────────────────┘               │ SQLite  +  image directory   │    │ also serves chat     │
                                                └──────────────────────────────┘    └──────────────────────┘
```

### 4.1 Components
- **Client (PWA).** Single-page React app, installable to the home screen, responsive from phone to desktop (§1, Devices). Handles capture, offline queueing, review, and visualization. Contains no business rules beyond input validation. Served by the Fin Snap server, so there is one origin.
- **Fin Snap server.** Owns all data and business logic: auth, upload, extraction pipeline, normalization, categorization, analytics.
- **LLM server (existing, shared).** The household's private LLM server already runs on the same Mac (the separate LLM-Server project: a relay in front of oMLX, which runs MLX models natively on the GPU). It serves chat models to other people and holds **one model in memory at a time**; switching models takes roughly 8–13 seconds. Fin Snap does not install or own it. Fin Snap reaches it over its network port and uses it through two ports in code:
  - `ModelHost` — check the server's state (free / in use / reserved / offline), see which model is loaded, and switch models.
  - `ReceiptExtractor` — send a receipt image to the loaded vision model and get structured data back.

  Fin Snap switches the server to the vision model for a batch of receipts, then switches it back to whatever was loaded before (§6.3.1).
- **Job runner.** In-process background queue behind the `JobQueue` port. Jobs are persisted in the database so a restart resumes them.
- **Storage.** SQLite database file plus an image directory on a Docker volume, each behind its own port.
- **Network.** Tailscale provides private access from phones anywhere and a valid HTTPS certificate (required for PWA install, service workers, and camera access).

### 4.2 Repository layout
```
fin-snap/
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── main.ts                  # composition root: wires adapters to ports, starts server
│   │       ├── config/                  # config schema + loader
│   │       ├── platform/                # cross-cutting adapters: db connection, logger, HTTP server, job queue
│   │       └── modules/
│   │           ├── auth/
│   │           ├── receipts/
│   │           ├── extraction/
│   │           ├── catalog/             # stores (companies), items, categories, known identifiers
│   │           ├── settings/            # household settings (e.g. image retention)
│   │           ├── imports/             # retailer CSV import; one format definition per retailer
│   │           ├── analytics/
│   │           └── export/              # full and view exports; format writers
│   └── web/
│       └── src/
│           ├── app/                     # routing, providers, layout
│           ├── features/                # capture, sync, receipts, review, catalog, analytics, settings
│           └── shared/                  # UI components, typed API client, hooks
├── packages/
│   ├── contracts/                       # Zod schemas: API, extraction output (single source of truth)
│   └── core/                            # money, dates, ids, Result/error types
├── docs/adr/                            # architecture decision records
└── docker-compose.yml
```

**Inside every server module:**
```
modules/receipts/
├── index.ts          # public entry point: the only file other modules may import
├── domain/           # pure types and rules (no I/O, no framework imports)
├── application/      # use cases; depend only on domain + ports
├── ports.ts          # interfaces this module needs from the outside
├── adapters/         # SQLite repositories, HTTP routes, other implementations
└── testing/          # fake adapters + port contract tests
```

**Client rules:**
- Each feature folder holds its own screens, components, and hooks.
- Components render; hooks fetch and mutate (TanStack Query). No fetch calls inside components.
- The API client is generated from `packages/contracts`, so endpoints, inputs, and outputs are typed end to end with no hand-written duplicates.
- The offline queue sits behind an interface (`UploadQueue`) with an IndexedDB adapter and an in-memory fake for tests.

### 4.3 Module responsibilities
| Module | Owns | Depends on |
|---|---|---|
| `auth` | users, sessions, login | — |
| `receipts` | receipts, line items, images, receipt lifecycle, consistency checks, image retention cleanup | `catalog` (to resolve stores/items/categories), `settings` (retention period) |
| `extraction` | extraction jobs, model leases, switching the LLM server's model and restoring it, calling the model, validating model output | `receipts` (to save results), `catalog` (the category hierarchy, for suggestions) |
| `catalog` | stores (companies), items, categories, store and item identifiers, store identification, matching and learning | — |
| `settings` | household settings: reading, validating, and changing them | — |
| `imports` | import batches, retailer format definitions, parsing and mapping CSV rows | `receipts` (to create receipts and line items through its public interface), `catalog` (to resolve the retailer's store) |
| `analytics` | nothing (read-only) | Reads all tables for reporting; writes none |
| `export` | format writers (nothing in the database) | Reads all tables for export; reuses `analytics` queries for view exports; writes none |

Modules communicate only through each other's `index.ts`. When the `receipts` module confirms a receipt, it calls `catalog.learnFromConfirmedReceipt(...)` through that public interface; it never writes identifier tables itself. Circular dependencies between modules are not allowed (enforced by the boundary check).

### 4.4 Tech stack
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript throughout | One language for client, server, and shared types. |
| Repo | pnpm workspaces monorepo | Shared `contracts` and `core` packages. |
| Client | React + Vite, `vite-plugin-pwa` (Workbox), TanStack Query | Client-only SPA keeps offline behavior simple. |
| Client storage | IndexedDB (via `idb`) | Durable offline queue for images and pending receipts. |
| Server | Node + Fastify, `fastify-type-provider-zod` | Routes typed and validated directly from the shared contracts. |
| Validation | Zod | One schema for API, model output, forms, and config. |
| Database | SQLite (`better-sqlite3`) + Drizzle ORM and migrations | No DB server; household-scale load; backup is a file copy. |
| Extraction | Vision model on the existing LLM server (oMLX), reached through its relay | Private, free to run, reuses hardware already serving models. Model chosen in Stage 3 (§6.3). |
| Charts | TBD in Stage 6 | Pick when the breakdown views are designed. |
| Tests | Vitest, Playwright | |
| Quality tooling | ESLint, Prettier, dependency-cruiser | See §3.6. |
| Packaging | Docker Compose | Fin Snap server in one container (ARM64 image). The LLM server runs natively on the host and is managed by its own project (§4.6). |

### 4.5 Configuration
Read from `.env` (checked-in `.env.example`), validated at startup:
- `LLM_SERVER_URL` — the LLM server relay's address and port (from inside the container, e.g. `http://host.docker.internal:<relay port>`)
- `LLM_SERVER_API_KEY` — Fin Snap's own key for the LLM server, so its usage is recorded under its own name
- `EXTRACTION_MODEL` — the vision model's name as the LLM server knows it
- `EXTRACTION_TIMEOUT_MS`
- `DATABASE_PATH`, `IMAGE_DIR`
- `SESSION_SECRET`
- `PUBLIC_ORIGIN` — the Tailscale HTTPS address

### 4.6 Host
| | |
|---|---|
| Machine | Apple Mac Studio, M1 Max |
| CPU / GPU | 10-core CPU, 24-core GPU, 16-core Neural Engine |
| Memory | 64 GB unified (shared by CPU and GPU) |
| Storage | 1 TB SSD |

What this means for the design:
- **The LLM server already runs natively** on this Mac (oMLX uses the GPU through Metal). Docker on macOS cannot reach the GPU, so only the Fin Snap server is containerized. It reaches the LLM server at `host.docker.internal`.
- **Model size budget:** the LLM server loads one model at a time, so the vision model gets the GPU memory the chat model was using. Vision models up to roughly 32B parameters fit comfortably at 4-bit (about 20–25 GB; the current chat models use 19–26 GB). Larger models (~70B) technically fit but are likely too slow to be worth it; the Stage 3 evaluation decides.
- **Speed:** expect seconds per receipt for small models and tens of seconds for ~32B models. Extraction is asynchronous, so this never blocks capture.
- **Always on:** the Mac must not sleep (Energy settings: prevent automatic sleep; start after power failure). Docker and Tailscale start at login. The LLM server is started by its own scripts; while it is stopped, extraction jobs simply wait.
- **Storage:** at ~0.5 MB per resized receipt image, 1 TB is effectively unlimited even if images are kept forever. Image retention (§6.8) is a privacy and tidiness choice, not a disk-space need.
- **Backups:** the nightly backup (§10) can target an external drive, and can also be covered by Time Machine.

---

## 5. Data Model

All money is stored as **integer cents**. All IDs are UUIDs. Receipt IDs are generated **on the phone** at capture time so uploads can be retried safely. Every table has `created_at` / `updated_at`. The owning module is shown for each table.

### Tables

**`users`** (auth) — household members.
- `id`, `display_name`, `username` (unique), `password_hash`

**`sessions`** (auth)
- `id`, `user_id`, `expires_at`

**`stores`** (catalog) — companies where money is spent (e.g. "Walmart", "Amazon"). Locations are not tracked as separate stores.
- `id`, `name` (display name, unique)
- `default_category_id` — what the user usually buys here (e.g. Groceries). Set by a user only; optional. Applies to every line from this store that has no item or line category (see Classification rules).

**`store_identifiers`** (catalog) — the table of known identifiers: every detail ever confirmed as belonging to a company. This is how stores are recognized (§6.4).
- `id`, `store_id`, `type`, `value` (normalized; see below), `state` (`active` or `ambiguous` — an ambiguous identifier is never used for automatic matching), `first_receipt_id`, `times_seen`, `last_seen_at`
- Unique on (`type`, `value`): one identifier can only ever point to one company.
- Types and how each value is normalized:
  | Type | Example | Normalized as |
  |---|---|---|
  | `name` | "WAL*MART", "Walmart Supercenter" | lowercased, punctuation and extra spaces removed |
  | `legal_name` | "Wal-Mart Stores, Inc." | same as `name` |
  | `phone` | "(555) 123-4567" | digits only, with country code |
  | `website` | "www.walmart.com/receipt" | bare domain (`walmart.com`) |
  | `address` | "123 Main St, Springfield IL 62701" | standardized street + ZIP |
  | `logo_text` | stylized logo text read by the model | same as `name` |
- Store numbers are kept on the receipt as evidence but are not identifiers on their own, since different companies reuse the same numbers.

**`categories`** (catalog) — the classification hierarchy, four levels deep. One table holds every level.
- `id`, `name`, `level` (1–4), `parent_id`, `color`, `sort_order`, `archived` (archived entries keep their history)
- Levels:
  | Level | Called | Parent |
  |---|---|---|
  | L1 | Category (e.g. Groceries) | none |
  | L2 | Subcategory (e.g. Frozen foods) | exactly one L1 |
  | L3 | Class (e.g. Ice cream) | exactly one L2 |
  | L4 | Class (e.g. Premium ice cream) | exactly one L3 |
- Every L2, L3, and L4 entry must have a parent exactly one level above it. L1 entries have no parent.
- Unique on (`parent_id`, `name`): the same name may appear under different parents.
- An entry can be moved to a different parent on the same level; everything assigned to it and below it moves along.

**`tags`** (catalog) — free tags: simple labels used for filtering (e.g. "luxury item"). Not part of the hierarchy and cannot be assigned to any category or class. A purchase may have any number.
- `id`, `name` (unique), `color`, `archived`

**Classification rules.** Enforced by shared domain functions, so they live in one place:
- **Each purchase (line) is assigned to exactly one entry in the hierarchy,** at the most specific level known (e.g. an L3 class, or just an L1 category if nothing finer applies). It belongs to that entry and every entry above it. A line with no category yet counts as **Unclassified**.
- **Where a line's category comes from**, in order of precedence (first one that applies wins; one shared domain function decides):
  1. **This purchase:** a category the user set on this line.
  2. **This item:** a category the user set for the item (every purchase of it, at any store).
  3. **This store:** the store's default category, set by the user ("what I usually buy here").
  4. **Nothing:** the line is Unclassified.
- **Guesses are never applied.** The software's guess at a line's category (from the model, or later from learned patterns) is only ever a suggestion, and only shown when the line would otherwise be Unclassified. When a user-set category applies at any of levels 1–3, the guess stays silent: it is stored (for measuring accuracy) but not shown. A guess takes effect only when a user accepts it, which makes it a user-set category.
- **Lines follow their source.** When a store's default or an item's category changes, every line that took its category from it updates too. Lines with their own user-set category (level 1) never change.
- **Tags follow the same principle.** A line's tags are the tags the user set on its item plus those set on the line. Guessed tags are only suggestions until the user accepts them.
- **Hierarchy breakdowns never double count.** At any level, every purchase falls in exactly one entry, so a breakdown adds up to its parent's total (or total spending, at L1). Purchases assigned higher up show as "<parent>, unspecified" so the children still add up to the parent.
- **Free tags can overlap anything.** A tagged purchase still has its one place in the hierarchy, and may carry several tags.
- **Comparing a free tag with a hierarchy entry or another tag is allowed, with a notice.** Whenever such a comparison is shown, the overlap is worked out and stated, e.g. "12 purchases ($84.20) tagged luxury item are also in Groceries and are counted in both." The comparison is never shown without that notice. When there is no overlap, no notice is needed.

**`items`** (catalog) — one row per real-world product.
- `id`, `name` (display name shown everywhere, e.g. in summaries), `name_source` (`printed`, `model`, or `user`), `category_id` (set by a user only; null until then)
- A name set by a user (`name_source: user`) is never overwritten by automation.

**`item_tags`** (catalog) — tags on an item; they apply to every purchase of it.
- `item_id`, `tag_id`; unique on the pair.

**`item_identifiers`** (catalog) — the same idea as store identifiers, for items: details confirmed as belonging to an item.
- `id`, `store_id`, `type`, `value` (normalized), `item_id`, `state` (`active` / `ambiguous`)
- Types:
  - `barcode` — a complete, valid UPC/EAN (correct length and check digit). The same product at any company, so `store_id` is null and it matches everywhere.
  - `code` — any other printed item code (store SKU, or a UPC printed with digits dropped, as many receipts do). Scoped to the company, since the same digits can mean different products elsewhere.
  - `name` — the printed line text. Scoped to the company.
- Unique on (`store_id`, `type`, `value`).
- Store and item identifiers share one matching and learning implementation in the catalog domain; only the identifier types differ.

**`receipts`** (receipts)
- `id` (client-generated)
- `logged_by_user_id` — required for every receipt, photo or manual. Set by the server from the logged-in session, never taken from the request body, so an entry can't be tagged as someone else.
- `source`: `photo`, `manual`, or `import`. Manual and imported entries have no image; all image fields stay null.
- `import_batch_id`, `external_order_id` (imported entries only; the retailer's order number). Unique on (`store_id`, `external_order_id`), which is what stops re-imports creating duplicates.
- `status`:
  - `uploaded` → `extracting` → `unreviewed` → `confirmed`
  - `extracting` → `review_required` (model could not read it) → `confirmed` (after the data is typed in)
  - Manual entries are created directly as `confirmed`, since a person entered them.
  - `unreviewed`: data was extracted automatically and counts, but no person has checked it.
  - `review_required`: no usable data; a person must enter it from the image.
  - `confirmed`: a person has reviewed (or entered) the data.
- `store_id` (the company; null until identified)
- `store_matched_by`: `identifier` (automatic, from known identifiers), `user` (chosen by a person), or `import_format` (set by a retailer import); null while unidentified
- `store_evidence` (JSON, schema in `packages/contracts`): everything extracted about the store (§6.3.2), plus which identifiers produced the match. Kept so the match can be explained ("Matched by phone number") and re-run later.
- `purchased_at` (local date and time as printed; time optional)
- `subtotal_cents`, `tax_cents` (total of all tax lines), `tip_cents`, `total_cents`
- `discount_cents` — receipt-wide discounts only (e.g. "$5 off your order"). Per-item discounts live on line items and are never repeated here.
- `printed_savings_cents`, `printed_item_count` — summary figures some receipts print ("total savings", "number of items"). Used only for consistency checks.
- Consistency rule: `total = Σ line totals − discount + tax + tip`, where line totals are already net of item discounts (fees are line items; see `line_items.kind`).
- `tax_lines` (JSON list): one entry per tax line printed, each with its label, rate, and amount as printed. Receipts may show several.
- `payments` (JSON list): one entry per payment, each with method (card, cash, gift card, ...), card brand (Visa, Mastercard, Discover, ...), credit or debit, card last four digits, amount applied to the purchase (for cash, the amount after change, not the amount handed over), and approval code (card payments; used for duplicate detection), as printed. A receipt paid with several methods has several entries.
  - Brand + credit/debit + last four together identify the means of payment (e.g. telling two different Visa credit cards apart). The payment fields hold only the last four digits; any further digits printed on the receipt appear only in the word-for-word transcription (`raw_text`).
- `transaction_numbers` (JSON list): transaction and register numbers as printed, each with its label; receipts may print several. Used for duplicate detection. Optional.
- `raw_text`: a word-for-word transcription of the entire receipt, exactly as printed, with nothing removed or masked (including every card digit shown). Nothing printed is lost even if no field holds it, and extraction or matching can be re-run later without the image.
- `note` (optional free text, e.g. from manual entry)
- All JSON fields have one schema each in `packages/contracts`.
- `confirmed_by_user_id`
- `image_key` (opaque key for the `FileStore` port; null once the image is deleted under the retention rules, §6.8)
- `image_sha256` (catches the same photo uploaded twice; kept after the image is deleted)
- `image_deleted_at` (null while the image exists)
- `confirmed_at`

**`settings`** (settings) — household-wide settings, one row per setting.
- `key` (primary key), `value` (JSON), `updated_by_user_id`
- Valid keys and value shapes are defined by one Zod schema in `packages/contracts`, with defaults. Unknown keys are rejected.
- Both retention settings share one value shape, a `RetentionPeriod`, defined once: `{ "mode": "forever" }` or `{ "mode": "days", "days": N }`, where N is chosen from presets (30, 90, 180, 365) or entered by hand (minimum 1).
- Initial settings:
  - `confirmedImageRetention` — how long images of confirmed receipts are kept. Default: `{ "mode": "forever" }`.
  - `unreviewedImageRetention` — how long images of receipts never confirmed are kept. Default: `{ "mode": "days", "days": 365 }`.

**`line_items`** (receipts)
- `id`, `receipt_id`, `position` (order on the receipt)
- `kind`: `item` or `fee` (bag fee, bottle deposit, shipping, service charge). Fees count toward store and category totals but are left out of item breakdowns and price tracking.
- `raw_name` (exactly as printed), `item_code` (UPC/SKU if printed)
- `item_id` (null until matched)
- `category_id` — the line's one place in the hierarchy, at any level L1–L4; null means Unclassified
- `category_source` — `line` (user set it on this line), `item`, or `store`; null when Unclassified. Used to keep lines in step with their source (see Classification rules).
- `suggested_item_name`, `suggested_category_id`, `suggested_tag_ids` (the software's guesses; never applied on their own; kept for suggestions and for measuring accuracy)
- `quantity` (decimal), `unit` (`each`, `lb`, `oz`, `kg`, `g`, `gal`, `l`, `ml`, `fl_oz`; default `each`), `unit_price_cents` (per that unit)
- `line_total_cents` — the amount **actually charged** for the line, after any item discount.
- `discount_cents` — savings on this line, **already included** in the line total (coupons, markdowns, member prices). When a receipt prints a discount on its own line, it is attached to the item it applies to, not stored as a separate line.
- Regular price is derived, not stored: `line_total + discount`. Price tracking uses both (§7).
- `tax_code` — the tax code printed next to the line, recorded exactly as printed (null if none). Codes differ by company; what they mean is not interpreted for now.
- `import_raw_row` (JSON; imported lines only) — the source row from the retailer's file, word for word, with its column names.

**`line_item_tags`** (receipts) — tags on a single purchase only.
- `line_item_id`, `tag_id`; unique on the pair.
- A line's tags are its item's tags plus its own, worked out by one shared domain function.

**`extraction_jobs`** (extraction)
- `id`, `receipt_id`, `status` (`pending`, `running`, `done`, `failed`), `attempts`, `last_error`, `next_attempt_at`
- `model`, `raw_output` (model's response, kept for debugging and re-processing), `completed_at`

**`model_leases`** (extraction) — a record of each time Fin Snap switched the LLM server's model, so it can always switch it back.
- `id`, `previous_model` (null if no model was loaded), `vision_model`, `started_at`, `restored_at` (null while the lease is open), `restore_outcome` (`restored`, `left_alone` — someone else changed the model meanwhile, or `unloaded`)
- At most one open lease at a time.

**`import_batches`** (imports) — one row per imported file.
- `id`, `imported_by_user_id`, `format_id` (e.g. `amazon`), `file_name`, `file_sha256`, `rows_read`, `orders_created`, `orders_skipped_as_duplicates`, `rows_rejected`, `imported_at`
- `file_key` (opaque key for the `FileStore` port; null once the file is deleted), `file_deleted_at`, `file_deleted_reason` (`superseded` or `retention`)
- `superseded_by_batch_id` — set when the user deleted this file because a later one overlapped it (§6.9). The batch row is kept as history.

### Rules
- `unreviewed` and `confirmed` receipts both count toward breakdowns and trends. `uploaded`, `extracting`, and `review_required` receipts have no data yet and do not.
- Which statuses count is decided by one shared domain function, used by every analytics query, so the rule lives in one place.
- **Keep everything, require little.** Everything extracted is stored, even fields no screen shows yet; which fields are displayed is decided later, per screen. Only the **store** is required before a receipt can be confirmed (or a manual entry saved). Every other field may be null when the receipt doesn't print it or the model can't read it. Imported entries get their store from the retailer's format definition.
- Deleting a store or item is a **merge**: its identifiers and line items move to another one, never orphaned.
- Archiving a hierarchy entry hides it (and everything below it) from pickers but keeps it on existing line items.
- Deleting a hierarchy entry is a merge into another entry on the same level; its purchases and children move along.

### Default L1 categories
Groceries, Dining, Household, Personal Care, Health, Transportation, Entertainment, Clothing, Kids, Pets, Gifts, Other. No default L2–L4 entries; users build those as needed.

---

## 6. Receipt Pipeline

### 6.1 Capture (client)
1. Choosing the image, depending on the device:
   - **Phone, camera:** **Snap** opens the camera (`<input type="file" accept="image/*" capture="environment">`).
   - **Phone, library:** **Choose photos** opens the photo library with multi-select. Each chosen photo becomes its own receipt.
   - **Desktop:** **Upload images** opens a file picker (multi-select), or image files can be dragged onto the page. Each file becomes its own receipt.
   - All three feed the same capture pipeline (steps 2–4); only the way the image is chosen differs.
2. The client resizes the image (longest side ~2000 px) and re-encodes it as JPEG, which cuts upload size and model processing time. Accepted inputs: JPEG, PNG, and HEIC (the iPhone's default photo format). If the browser can't decode an image itself (e.g. HEIC in Chrome on a desktop), the original file is uploaded and the server converts it.
3. The client generates the receipt ID and saves `{id, image blob, captured_at, user}` to the upload queue **before** trying to upload.
4. The capture screen confirms "saved" right away, whether online or not.

### 6.2 Upload and sync (client → server)
- The queue is flushed when the app opens, when the connection returns, and after each capture.
- On Android/Chrome, Background Sync also flushes the queue with the app closed. iOS does not support it, so queued receipts upload the next time the app is opened. The UI shows a pending count so this is visible.
- Upload is `PUT /receipts/:id` (idempotent). Retrying a receipt the server already has returns its current state. The same endpoint and queue carry manual entries (data, no image), so they also work offline.
- A queue entry is deleted only after the server confirms it has the image.

### 6.3 Extraction (server)
1. Upload creates a `receipts` row (`uploaded`) and enqueues an extraction job.
2. Jobs are processed in batches, with the vision model loaded on the LLM server (§6.3.1). For each receipt, the job runner passes the image to the `ReceiptExtractor` port. The production adapter sends the image (as a base64 data URI) and a prompt to the LLM server's OpenAI-compatible chat endpoint and requests JSON matching the extraction schema from `packages/contracts` (using structured-output / JSON-schema mode if the server supports it).
3. The output is validated against the same schema. Invalid output is retried once. If it is still invalid, or the job runs out of retries, the receipt is marked `review_required` and a person enters its data by hand (§6.5).
4. **Consistency checks** (pure domain functions; warnings, not failures), shown to the reviewer:
   - Line totals ≈ subtotal (line totals are already net of item discounts).
   - Subtotal − receipt discount + tax + tip ≈ total.
   - Tax lines add up to tax.
   - Payments ≈ total.
   - Item discounts plus receipt discount ≈ printed savings, when printed.
   - Number of item lines ≈ printed item count, when printed.
   - `quantity × unit_price` ≈ line total + line discount.
   - Date is not in the future and not unreasonably old.
5. On success, normalization runs (§6.4) and the receipt moves to `unreviewed`. From this point it counts toward analytics.
6. Transient errors (timeout, server error) retry with backoff, up to 5 attempts. Time spent waiting for the LLM server to be free or online does not count as an attempt; nothing is lost.
7. Receipts in a batch are processed one at a time, so the LLM server is never asked to do more than one thing for Fin Snap at once.

#### 6.3.1 Sharing the LLM server
The LLM server is shared with people chatting, and swapping models costs ~8–13 seconds each way. Fin Snap therefore takes the server only when nobody is using it, does as much as it can in one switch, and always puts things back.

**Batch flow** (an application-layer use case; all LLM server access goes through the `ModelHost` and `ReceiptExtractor` ports):
1. **Wait for pending jobs.** Nothing happens while the extraction queue is empty.
2. **Wait for the server to be free.** Ask `ModelHost` for the server's state. Start only when it is `free`. If it is `in_use`, `reserved`, or `offline`, check again later (every couple of minutes). Fin Snap never interrupts a chat or overrides the owner's reservation.
3. **Open a lease.** Record the currently loaded model (or none) in `model_leases` **before** switching, so the previous model is known even if Fin Snap crashes.
4. **Switch** the server to the vision model and wait until it is ready.
5. **Process receipts** one at a time. Before each one, check the server's state again. If someone has started using it, finish the receipt in progress and stop. Also stop when the queue is empty or after about 10 minutes, so chat users are never shut out for long.
6. **Restore.** If the vision model is still the one loaded, switch back to the previous model, or unload it if nothing was loaded before. If someone else changed the model in the meantime, leave their choice alone. Close the lease with the outcome.
7. **Repeat** from step 1 if jobs remain.

**Recovery:** on startup, if an open lease exists (Fin Snap stopped mid-batch), the restore step runs before anything else. A failed restore is retried and logged; it never leaves the lease silently open.

**Access through the relay, not oMLX directly**, with Fin Snap's own API key. This way the LLM server records Fin Snap's usage under its own name, its free / in use / reserved status already covers Fin Snap, and the owner's reservation is respected automatically.

**What the LLM server must provide.** The `ModelHost` adapter needs four operations: read the server's state, read the loaded model, load a model, and unload a model. How each maps onto the relay and oMLX is confirmed in Stage 3. If one is missing (for example, oMLX may switch models only implicitly, when a request names a different model), it is added to the LLM-Server project, which is a separate change made there. Fin Snap's code depends only on the port, so either way nothing outside the adapter changes.

**Model choice.** Decided in Stage 3 with an evaluation harness (a script plus a fixture set of 20+ real household receipts with hand-checked correct answers). It scores each candidate on field accuracy and time per receipt. Candidates:
- Vision-language models in MLX format that oMLX supports (oMLX runs vision models through `mlx-vlm`, so support depends on the architecture; check oMLX's release notes for each candidate and use a recent oMLX version): e.g. Qwen2.5-VL / Qwen3-VL, Gemma 4 (vision), Llama 3.2 Vision, from ~7B up to ~32B at 4-bit (the host's comfortable limit; §4.6).
- Time per receipt is measured with the model already loaded; the swap cost is paid once per batch, not per receipt.
- Two-step fallback, if no vision model is accurate enough on its own: an OCR model that oMLX also runs (e.g. DeepSeek-OCR, DOTS-OCR, GLM-OCR) reads the text, then a text model structures it into the extraction schema. This is a second `ReceiptExtractor` adapter; nothing else changes. Because it needs two models, it would cost an extra swap per batch, so it is only used if the evaluation shows a clear accuracy gain.

The harness is kept so any future model can be compared against the same fixtures. It scores **store identification separately**: the share of receipts where the model extracted at least one usable identifier, and the accuracy of every store field.

#### 6.3.2 What is extracted
The model reads the **whole receipt, top and bottom**. Store details are often in the footer as well as the header, and every one of them raises the odds of identifying the company. All fields are optional; the model leaves out anything not printed and never invents a value.

**Store evidence** (stored in `receipts.store_evidence`):
| Field | Notes |
|---|---|
| Logo text | The store name as shown in the logo, including stylized lettering. |
| Brand guess | The model's own guess at the company, if it recognizes the logo or layout. A suggestion only; never used to match on its own. |
| Printed store name | As printed in text (e.g. "WALMART SUPERCENTER"). |
| Legal / business name | If printed separately (e.g. "Wal-Mart Stores, Inc."). |
| Branch name | The store's own name for the location, if printed. Evidence only, not an identifier. |
| Store number | As printed (e.g. "ST# 1234"). Evidence only, not an identifier. |
| Address | Street, city, state, ZIP. |
| Phone numbers | A list; receipts may print several (main store, pharmacy, other departments), each with its label if printed. Each one is an identifier. |
| Websites / emails | A list. |
| Merchant ID | Evidence only, not an identifier: these numbers are assigned by each payment processor, so unrelated companies can share one. |

The full word-for-word transcription (`receipts.raw_text`) also keeps every store detail, so matching can be re-run later with better rules without re-reading the image.

The prompt tells the model to report only the merchant's own details, and to ignore payment processor and point-of-sale branding ("Powered by Toast", "Square", card network logos), which appear on receipts from many unrelated companies. The same exclusion list is also applied in code (§6.4).

**Purchase details** (stored on `receipts`): date and time; subtotal, receipt-wide discount, each tax line, tip, total; printed savings and item count; each payment (method, card brand, credit/debit, card last four digits, amount applied, approval code); transaction and register numbers. (Merchant ID is extracted as store evidence, above.)

**Each line** (stored on `line_items`): printed name (exactly as printed, even when truncated), item code (UPC/SKU) if printed, quantity and unit (e.g. 2.31 lb), unit price, amount charged, item discount already applied, tax code as printed, whether it is an item or a fee, plus the model's suggested readable name and category.

**Full transcription:** every line of the receipt, word for word, exactly as printed, with nothing removed or masked (`receipts.raw_text`). It is the one place where everything printed is kept, including the items listed below.

**Not extracted into fields:** card digits beyond the last four, lane, cashier name or number, terminal ID, card entry method (chip, tap, swipe), change due and amount tendered, loyalty account numbers, survey codes, and card-network technical codes used only for payment processing. These either change from visit to visit without describing the purchase or the store, or are sensitive. They remain in the transcription only.

### 6.4 Normalization and categorization (server, after extraction)
Runs right after extraction. Because unreviewed receipts count toward analytics, the best available matches are **applied** to the receipt, not just suggested. Lives in the `catalog` module.
1. **Store (company) identification.** One pure domain function, tested exhaustively, decides the store from the store evidence and the table of known identifiers:
   1. Normalize every extracted identifier (name, legal name, logo text, phone, website, address). Drop any value on the exclusion list (payment processors, point-of-sale vendors, card networks, generic phrases like "thank you").
   2. Look each one up in `store_identifiers`, ignoring any marked `ambiguous`.
   3. **One company:** if every hit points to the same company, it is applied (`store_matched_by: identifier`) and the matching identifiers are recorded as evidence. One exact hit is enough; it can be a new location of a known company, since the company name or website still matches.
   4. **Conflict:** if hits point to two or more companies, nothing is applied. The receipt is flagged **Store needs confirmation**, showing the candidates and which identifier points to each.
   5. **Unknown:** if nothing hits, nothing is applied. The receipt is flagged **Store needs confirmation**, with suggestions: the model's brand guess and known companies with similar names.
   - The model's brand guess, similar-name matches, and store numbers are **never applied automatically**; they only rank suggestions. This is what keeps automatic matches extremely accurate: a store is only ever applied because a person previously confirmed one of the identifiers on this receipt.
   - Until confirmed, an unidentified receipt still counts toward analytics, grouped under **Unidentified store**.
2. **Items:** for each line, look up its barcode (any company), then its code, then its printed name (that company) in `item_identifiers`. On a hit, set `item_id`; the line then shows the item's name and carries its tags. On a miss:
   - Leave `item_id` empty and offer the closest existing item by fuzzy match on the review screen.
   - Store the model's suggested readable name, category (chosen from the current hierarchy at the most specific level it can justify), and tags (chosen from existing tags) as suggestions only.
   - Then set each line's category by the precedence rule (§5, Classification rules): item category, else store default, else Unclassified. The model's category is never applied here.
   - Matching by code or printed name waits until the store is known, since those identifiers are per company. A full barcode can match before.
3. Only exact identifier hits are applied automatically. Fuzzy matches are never applied without a person, so a wrong guess can't merge two different stores or items.
4. In analytics, a line with no matched item is grouped under its printed name, labeled unmatched.
5. Learning (§6.7) happens only when a person confirms or edits, never from unreviewed data.

### 6.5 Review (client)
- The receipt image and the editable extracted fields are shown side by side (stacked on a phone, with the image collapsible). The image supports pinch-zoom and pan, so small print can be checked against each field.
- The same side-by-side layout (one shared component) is used when opening a confirmed receipt later, read-only until **Edit** is tapped.
- Every field is editable. Lines can be added, removed, or split.
- Consistency warnings are highlighted next to the fields involved.
- **Store first.** When the store is unidentified or conflicting, the review screen opens on a **Store needs confirmation** prompt: pick a suggested company, search known companies, or create a new one. When the store was matched automatically, the screen shows which identifier matched (e.g. "Matched by phone number").
- Store and item pickers search existing entries or create new ones.
- **Each line shows the item's name**, with the printed text beneath it. Tapping the name lets the user:
  - **Rename the item.** The new name applies to the item everywhere: this line, every past purchase of it, and every future one.
  - **Choose a different item** (if the match is wrong, or two items are really the same product).
  - **Tag it:** add or remove tags on the item (every purchase of it) or on this purchase only. The two are shown apart, so it's clear which applies where.
- Items can also be renamed and tagged from an Items screen, without opening a receipt.
- **Categories on the review screen:**
  - Each line shows its category and where it came from (this purchase, this item, or the store's default).
  - Any line can be recategorized. The user chooses whether the new category is for **this purchase only** or for **this item** (every purchase of it).
  - **Set all lines:** one action assigns a category to every line on the receipt (as this-purchase categories).
  - **Store default:** when a store has no default yet, the screen offers "What do you usually buy here?" The answer becomes the store's default and fills every line without an item or line category. The default can also be changed later from the store's detail screen.
  - **Suggestions:** an Unclassified line shows the software's suggested category (and suggested tags) with **Accept** / **Dismiss**. Nothing is applied until accepted. Lines that already have a category from the user, the item, or the store show no suggestion.
- Duplicates: flagged as **definite** when the store matches and either a transaction number matches, or the approval code and card last four match; flagged as **possible** when the store, date, time (if printed), and total match.
- **Confirm** saves everything, sets `confirmed`, and triggers learning (below). Confirm is blocked until the store is set; every other field may be left empty.
- **Unreviewed receipts** are labeled "Unreviewed" everywhere they appear (lists, receipt view, drill-downs). The receipts list can be filtered to show only unreviewed or review-required receipts.
- **Review-required receipts:** the same side-by-side screen opens with the image and empty fields. The user types in what the receipt shows, using the same pickers, validation, and consistency checks, then confirms. Planned later: a guided entry mode that walks the user through the fields one at a time (Future, §11).

### 6.6 Manual entry (client)
For expenses with no paper receipt (cash, bills, a forgotten receipt). Started from an **Add expense** button beside **Snap**.
- **One form, not two.** Manual entry uses the same receipt form component as review, without the image panel. Fields, pickers, validation, and consistency checks are shared, not duplicated.
- **Quick entry** (default): store, date, total, category, and an optional note. Saved as a receipt with a single line item for the full amount in that category, so the data model and analytics need no special case.
- **Full entry:** switch the same form to line items to record a multi-item purchase.
- Saved entries go through the same upload queue and endpoint as photos, so they work offline and are tagged with the person who entered them.
- Manual entries are `confirmed` on save and trigger the same learning step as a confirmed receipt (§6.7). Duplicate warnings apply.
- Receipts and manual entries are labeled by source in lists, and analytics can be filtered by source.

### 6.7 Learning from corrections
On confirm (and whenever a confirmed receipt's store or items are edited), `receipts` calls `catalog.learnFromConfirmedReceipt(...)`, which:

**Stores — the user confirms a company once, and never again:**
- Saves **every** identifier from the receipt's store evidence (name, legal name, logo text, phone, website, address) against the chosen company, not just the one that matched. A company confirmed once is then recognized by any of those details, at any location that shares one of them.
- If an identifier is already saved for a **different** company, the user is asked before anything changes ("This phone number is saved for Target. Move it to Walmart?"). Identifiers are never silently moved.
- **Correcting a wrong automatic match:** the identifiers that caused it are marked `ambiguous` (they stop being used for automatic matching), and the receipt's other identifiers are saved for the correct company. The same mistake can't happen twice.
- Every store has an **Identifiers** list (in the store's detail screen) showing what it is recognized by, where each identifier can be removed or marked ambiguous by hand. Merging two stores combines their identifiers.

**Items:**
- Saves the line's barcode or code (if printed) and printed name → chosen item in `item_identifiers`, with the same "ask before moving" rule. So once an item is named, any purchase sharing its code or printed name shows that name, even when the printed text differs (e.g. truncated differently on another receipt).
- Renaming or tagging an item takes effect immediately for every purchase of it; nothing has to be re-confirmed.
- Categories are learned only from what the user sets: choosing "for this item" sets the item's category (applied to every purchase of it from then on, ahead of the store default); choosing "this purchase only" changes nothing else. Accepting a suggestion counts as the user setting it.
- Accepted and dismissed suggestions are recorded, so suggestion accuracy can be measured and improved later.

Over time, stores and repeat purchases are matched by identifier, with no model guess needed.

### 6.8 Image and file retention
- **Settings:** two household-wide settings (§5), changed on the Settings screen by any household member. Each can be a number of days or **keep indefinitely**.
- **Confirmed receipts** (`confirmedImageRetention`, default: keep indefinitely): the period runs from the receipt's `confirmed_at`.
- **Receipts never confirmed** (`unreviewedImageRetention`, default: 365 days): the period runs from upload (`created_at`). When it passes:
  - `unreviewed` receipts lose their image. The receipt stays, still marked unreviewed, and still counts toward analytics. It can still be confirmed (without the image) or discarded.
  - `review_required` receipts (and any stuck in `uploaded` / `extracting`) are deleted entirely, since without the image there is no data and nothing left to enter.
  - Set to keep indefinitely, nothing is ever deleted: unreviewed receipts keep their images and review-required receipts wait until someone enters them.
  - Warning: from 30 days before the deadline (or a third of the period, if shorter), the receipt list marks the receipt "Image will be deleted in N days — review now" (or "Receipt will be deleted in N days — enter it now" for review-required ones).
- **Cleanup:** a nightly job (on the `JobQueue`) applies all of the above: deletes due images through the `FileStore` port (clearing `image_key`, setting `image_deleted_at`) and deletes due review-required receipts. Deciding what is due ("keep / delete image / delete receipt") is one pure domain function covering every case, tested on its own.
- **What is kept when only the image is deleted:** all extracted data, line items, and `image_sha256` (so duplicate detection still works). Analytics are unaffected.
- **Shortening a period:** before saving, the Settings screen shows how many images (and, for the unreviewed setting, how many review-required receipts) the new value will delete, and asks for confirmation. Deletion happens at the next nightly run, not instantly, so a mistaken change can be reverted the same day.
- **After deletion:** the receipt view shows "Image removed on <date>" with the reason (confirmed-receipt retention, or not reviewed in time) in place of the image; the data side is unchanged and still editable.
- **Backups:** deleted images remain in nightly backups until those backups rotate out (up to 14 days; §10).
- **Imported files (CSV)** follow the same two settings, applied per file. A file's purchases are every receipt whose order appears in it, whether that receipt was created from this file or from an earlier one.
  - While any of the file's purchases is unconfirmed, the unreviewed setting applies, counted from the file's upload.
  - Once all of them are confirmed, the confirmed setting applies, counted from the later of the file's upload and the last confirmation.
  - **The clock resets when a file replaces an older one.** Because a new file's clock runs from its own upload and covers every purchase in it, purchases carried over from an older file it completely contains start a fresh retention period with the new file. Deleting the older file doesn't shorten how long that information is kept.
  - Deleting an imported file never deletes data: its receipts stay, and each imported line keeps its original row.
  - A file the user chose to delete because a newer one overlaps it (§6.9) is deleted right away, whatever the settings.
  - The same nightly job, domain function, warnings, and confirmation on shortening apply.

### 6.9 Retailer CSV import
For online purchases that come with no paper receipt (Amazon first). The user downloads their purchase history report from the retailer and uploads it in Fin Snap (Import → choose retailer → choose or drag in the file). Designed for desktop, where this is normally done, but works on a phone too. Requires a connection; it is not queued offline.

**Format definitions.** Each retailer's report is described by one format definition (`imports/formats/<retailer>.ts`), validated by a shared Zod schema. A definition says:
- How to recognize the file (expected header columns), so a wrong file or a retailer changing its layout is caught with a clear message.
- Which column holds each field: order ID, order date, item name, quantity, unit price, item total, tax, shipping, discounts, and anything else the retailer supplies.
- How to read values: date format, money format, currency.
- How rows group into orders (normally by order ID): one order becomes one receipt, one row becomes one line item.
- Which store the orders belong to (e.g. Amazon).

Definitions are data, not code: one generic importer reads any definition. Custom code is added for a retailer only if its report can't be described this way, behind the same interface. Adding a retailer means adding one definition file and its tests.

**Import flow:**
1. **Parse and validate** the file against the chosen definition. Rows that can't be read are listed with the reason; they never stop the rest of the import.
2. **Preview:** a summary before anything is saved: orders found, date range, total spent, orders already imported (to be skipped), and rejected rows.
3. **Import:** create one receipt per new order (`source: import`, tagged with the person importing) through the `receipts` module's public interface, then run normalization and categorization (§6.4) exactly as for photo receipts.
4. **Record** the batch in `import_batches` with its counts, and store the uploaded file through the `FileStore` port so it can be viewed or downloaded later.
5. **Report overlaps** with older files and offer to delete them (below).

**Duplicates:** an order is skipped if a receipt with the same store and `external_order_id` already exists, so re-importing the same file or an overlapping date range is always safe. Uploading the exact same file again (same `file_sha256`) is recognized in the preview as already imported.

**Overlapping files.** Retailer reports are usually cumulative, so a new file often repeats purchases from an earlier one.
- **Older files are never deleted automatically.** The user is told about the overlap and chooses.
- After the import, for each older file from the same retailer that overlaps, the user is informed:
  - **Completely contained:** every order and row in the older file is also in the new one. Shown as "Everything in <older file> is also in this file. Delete <older file>?", with the option to delete or keep it.
  - **Significant overlap:** at least half of the older file's purchases are also in the new one, but not all. Shown with the share and count (e.g. "80% of <older file>'s purchases (120 of 150) are also in this file"), with the option to delete or keep it.
  - Below that, the overlap is mentioned in the import summary only, and nothing is offered.
- Either way, the message says that deleting the older file loses no data: the receipts it created stay, and each imported line keeps its original row.
- **Delete** removes the older file (`file_deleted_reason: superseded`) and marks its batch `superseded_by_batch_id`. **Keep** leaves both files, and the older one can still be deleted later from the import history.
- Already-imported orders are skipped as usual whatever the user chooses.
- If an order already imported appears in the new file with different values (e.g. a changed status or amount), it is not changed automatically; the preview lists it as a difference for the user to look at.
- How much one file overlaps another (completely contained, share of purchases) is worked out by one pure domain function comparing the files' orders and rows, tested on its own. The "significant" threshold (half) is a single named constant, adjustable later.

**Status of imported entries:** proposed `unreviewed`. The amounts come straight from the retailer and are reliable, but item matches have not been checked by a person. To be confirmed (§12).

**Original rows are kept.** Each imported line keeps its source row word for word (`line_items.import_raw_row`), the import equivalent of a receipt's transcription, so imports can be re-run with improved rules.

#### 6.9.1 Amazon order history format
Amazon's order history report has **one row per item**; an order with several items has several rows sharing an Order ID. Columns appear in this order:

| # | Column | Used as |
|---|---|---|
| 1 | ASIN | Item `code` identifier, scoped to Amazon (Amazon's own product ID) |
| 2 | Billing Address | Not imported |
| 3 | Carrier Name & Tracking Number | Not imported |
| 4 | Currency | Checked to be USD; rows in other currencies are rejected |
| 5 | Department | Hint for category suggestions only (never applied) |
| 6 | Gift Message | Not imported |
| 7 | Gift Recipient Contact | Not imported |
| 8 | Gift Sender Name | Not imported |
| 9 | Item Serial Number | Not imported |
| 10 | Order Date | Purchase date and time; given in UTC, converted to local time |
| 11 | Order ID | `external_order_id`; groups rows into one receipt; duplicate detection |
| 12 | Order Status | Cancelled orders are skipped |
| 13 | Original Quantity | Quantity (unit `each`) |
| 14 | Payment Method Type | Payment, written as "Brand - last four"; split into card brand and last four digits |
| 15 | Product Condition | Kept in the original row |
| 16 | Product Name | Line `raw_name` |
| 17 | Purchase Order Number | Not imported |
| 18 | Ship Date | Not imported |
| 19 | Shipment Item Subtotal | Line total (unit price × quantity) |
| 20 | Shipment Item Subtotal Tax | Tax for the line; summed into the receipt's tax |
| 21 | Shipment Status | Kept in the original row |
| 22 | Shipping Address | Not imported |
| 23 | Shipping Charge | A `fee` line on the receipt |
| 24 | Shipping Option | Not imported |
| 25 | Total Amount | Row check: must equal subtotal + subtotal tax + shipping − discounts |
| 26 | Total Discounts | Line discount |
| 27 | Unit Price | Unit price |
| 28 | Unit Price Tax | Not used for totals (tax per single unit; using it as well would double count tax) |
| 29 | Website | Store evidence (e.g. which Amazon site); the store is set by the format |

- "Not Available" and "Not Applicable" are read as empty.
- "Not imported" means not stored in any field; the value still exists in the kept original row.
- A row that fails the Total Amount check is shown in the preview as a warning, not silently imported with wrong numbers.

---

## 7. Analytics

All analytics are read-only SQL queries over receipts that count (`unreviewed` and `confirmed`; §5), owned by the `analytics` module. Every view filters by date range, by person (all / a specific household member), by review state (all, the default / confirmed only), and by source (all, the default / photo / manual / import). Each view shows how much of its total comes from unreviewed receipts, so you can tell how much of a number has been checked.

| View | Shows |
|---|---|
| **By store** | Total per store (company) per month; visit count; average spend per visit. Receipts still awaiting store confirmation appear as **Unidentified store**. |
| **By item** | Total spent and quantity bought per item per month. |
| **By category** | Total and share of spending per L1 category per month, drilling down through L2, L3, and L4. Each level adds up to the level above. |
| **By tag** | Spending per free tag, on its own or compared with hierarchy entries or other tags; comparisons always show the overlap notice (§5). Details to be designed. |
| **Trends** | Monthly totals over time; month-over-month and year-over-year change; overall and per store/item/category. |
| **By payment method** | Spending per card (brand, credit/debit, last four) and per other payment method. Details to be designed. |
| **Price history** | Unit price over time for an item, one line per store, showing both the price paid and the regular price (before item discounts); latest price at each store. |
| **Spikes** | A store or category whose monthly total is well above its recent average (initial rule: more than 1.5× the trailing 3-month average and at least $25 more; tune later). |

**Tax, tip, and receipt-wide discounts** are not tied to one line. For category and item breakdowns they are spread across lines in proportion to line totals (one shared allocation function in `packages/core`), so category totals add up to what was actually paid. Tax codes are recorded but not yet used for allocation (§12). Fee lines keep their own category. Store totals use the receipt total directly.

---

## 8. Export

All household data can be exported at any time, by any household member. Nothing is locked into Fin Snap. Owned by the `export` module, which (like `analytics`) reads every module's tables and writes none.

### 8.1 Full export
From Settings → **Export all data**. Produces one ZIP file:

| Path in the ZIP | Contents |
|---|---|
| `csv/<table>.csv` | One CSV per data table: receipts, line items, stores, store identifiers, items, item identifiers, categories (all four levels, with each entry's parent), tags, item tags, line item tags, settings, import batches, and users (display name and username only). |
| `csv/expenses.csv` | A spreadsheet-friendly flat view: one row per line item with date, store, item name, category, tags, person, source, review status, quantity, and amounts already joined in. |
| `data.json` | Everything in one structured file, receipts with their line items nested, plus a `schemaVersion`. Lossless, and the basis for any future import. |
| `images/<receipt id>.jpg` | Receipt images still on file. Optional (a checkbox), since this is the large part. |
| `README.txt` | What each file and column means. |

**Not exported:** password hashes, sessions, and internal working records (extraction jobs, model leases). These are operational state, not household data.

### 8.2 View export
Every list, breakdown, and trend view has an **Export** button that downloads exactly what is on screen, with the current filters, as CSV (or any other supported format).

### 8.3 Formats
- **Now:** CSV and JSON.
- **Planned:** XLSX (one sheet per table). Other formats are added the same way.
- **One design for all formats:** the export module builds a format-neutral dataset once (named tables of typed columns and rows). Each format is a small writer behind one `ExportWriter` port (`CsvWriter`, `JsonWriter`, later `XlsxWriter`). Column names and order are defined once and shared by every writer. Adding a format means adding one writer, with nothing else changing.

### 8.4 Conventions
- **CSV:** UTF-8 (with a byte-order mark, so Excel reads it correctly), a header row, standard quoting (RFC 4180).
- **Dates:** ISO 8601 (`2026-11-14`, `2026-11-14T13:05`).
- **Money:** decimal dollars in CSV and XLSX for readability (`12.34`); integer cents in JSON, so it is exact.
- **Safety:** CSV/XLSX cells that begin with `=`, `+`, `-`, or `@` are escaped, so a store or item name can never run as a spreadsheet formula when opened.
- **Delivery:** exports stream directly to the browser; at household scale no background job is needed.

---

## 9. Security and Privacy

- **Network:** the Fin Snap server listens only on the Tailscale interface (or behind `tailscale serve`); the LLM server listens only on the Mac itself (per its own project). Neither is exposed to the internet. Fin Snap's LLM server API key lives in `.env` only.
- **Auth:** username and password per household member, hashed with Argon2. Login sets an HTTP-only, Secure, SameSite cookie session. No public sign-up; an admin command (or first-run setup) creates users.
- **Secrets:** `.env` is git-ignored.
- **Data leaving the network:** none.
- **Image retention:** households can limit how long receipt images are kept (§6.8).
- **On the phone:** queued images stay in IndexedDB only until uploaded. Logging out clears the queue after warning about any receipts not yet uploaded.

---

## 10. Backups

- Everything lives in two places: the SQLite file and the image directory.
- A nightly job uses SQLite's online backup to make a safe copy, copies new images alongside it, and keeps the last 14 nights.
- Restore = stop the container, put the files back, start the container. Documented and tested once in Stage 5.

---

## 11. Build Plan

Each stage ends in something that runs and is verified. A stage is done when its **Done when** items are tested, not just written, **and `pnpm check` passes**.

### Stage 0 — Scaffold and quality gates
**Build:** monorepo with `apps/server`, `apps/web`, `packages/contracts`, `packages/core`; strict TypeScript, ESLint, Prettier, Vitest; dependency-cruiser rules for §3.1; `pnpm check`; config loader with validation; structured logging; Fastify serving the built React app; SQLite + Drizzle with a first migration; Dockerfile and `docker-compose.yml`; `.env.example`; first ADR recording this architecture; Tailscale HTTPS setup notes.
**Done when:** `docker compose up` serves a placeholder page over HTTPS at the Tailscale address from a phone, it installs to the home screen, and a deliberate boundary violation (e.g. a domain file importing Fastify) makes `pnpm check` fail.

### Stage 1 — Accounts
**Build:** `auth` module (users, sessions, login/logout, route protection); admin command to create users.
**Done when:** each household member can log in from their own phone; requests without a session are rejected.

### Stage 2 — Capture and upload (online)
**Build:** `receipts` module skeleton; `FileStore` port (stores receipt images and imported files) with file-system adapter and fake; capture by camera, phone library (multi-select), and desktop file picker / drag and drop; client-side resize; server-side conversion for images the browser can't decode (HEIC); idempotent `PUT /receipts/:id`; receipts list showing status and thumbnail; responsive layout shell (phone and desktop navigation).
**Done when:** a photo taken on both an Android phone and an iPhone shows up in the list with the right person attached; three photos chosen together from an iPhone library become three receipts; a HEIC file dragged in on a desktop uploads and displays; uploading the same receipt twice creates one record.

### Stage 3 — Extraction
**Build:** extraction schema in `contracts`; `extraction` module; `JobQueue` port with persisted SQLite adapter; `ModelHost` port with LLM-server adapter and fake; `ReceiptExtractor` port with LLM-server adapter and fake; model leases, batch flow, and startup recovery (§6.3.1); consistency checks; confirm how the LLM server exposes state, loaded model, load, and unload, and add anything missing in the LLM-Server project; vision model added to the LLM server.
**Model evaluation:** build the evaluation harness and fixture set; compare candidate models (§6.3); record the choice in an ADR.
**Done when:** a typical grocery receipt reaches `unreviewed` with all lines, its store evidence, payments, and full transcription extracted, and line totals net of item discounts; an unreadable image ends up `review_required`; a Fin Snap restart mid-job resumes the job; stopping the LLM server leaves jobs waiting and they complete once it's back. After a batch, the LLM server has the same model loaded as before it started. A batch does not start while the server is in use or reserved, and stops after the current receipt when someone starts chatting. Killing Fin Snap mid-batch and restarting it restores the previous model.

### Stage 4 — Review and log
**Build:** `catalog` module (stores, items, categories with defaults, store and item identifiers, store identification, matching, learning, store detail screen with its Identifiers list); hierarchy editor (L1–L4: add, rename, move, archive, merge); hierarchy picker showing the full path (e.g. "Groceries › Frozen foods › Ice cream"); free tags; item naming and tagging from the review screen and an Items screen; side-by-side image/data component with zoom; review screen; receipt detail view (same component); manual entry with quick and full modes (same form component, §6.6); store/item pickers; confirm flow; duplicate warning.
**Done when:** after a company is confirmed once, a second receipt from it (same or different location, sharing at least one identifier) is matched to it automatically, with its repeat items; a receipt whose identifiers point to two companies is flagged, not guessed; correcting a wrong automatic match stops the identifier that caused it from matching again; a receipt can't be confirmed without a store but can with any other field empty; after a user names an item, a later receipt from the same company with the same code but differently printed text shows the user's name; a tag added to an item appears on all its purchases, and a tag added to one purchase appears only there; with a store default of Groceries, every line from that store is Groceries and the model's differing guess is not shown; recategorizing one item "for this item" applies on its next purchase from any store, while "this purchase only" changes nothing else; an Unclassified line's suggestion has no effect until accepted; a confirmed receipt reopens with its image beside its data; a review-required receipt can be entered by hand and confirmed; a quick manual entry and a full manual entry are each saved as confirmed and appear in the receipts list labeled manual.

### Stage 5 — Offline capture and sync  ← **first usable version (MVP)**
**Build:** service worker app-shell caching; `UploadQueue` with IndexedDB adapter; sync on open/reconnect; Background Sync where supported; pending-count indicator; nightly backup job and a tested restore; `settings` module and Settings screen; both image retention settings and the nightly cleanup job; `export` module with full export (CSV, JSON, optional images).
**Done when:** with the phone in airplane mode, three receipts are captured and one manual entry is saved, the app is closed, and all four upload correctly after the connection returns, on both Android and iPhone. With confirmed retention at 30 days and unreviewed retention at 365 days, the cleanup job removes images from receipts confirmed more than 30 days ago and from unreviewed receipts uploaded more than 365 days ago (their data still displays and still counts), deletes review-required receipts uploaded more than 365 days ago, and leaves everything else alone. With both set to keep indefinitely, it deletes nothing. A full export opens correctly in Excel and Numbers, its JSON validates against the schema, and its totals match the app's.

### Stage 6 — Breakdowns
**Build:** `analytics` module; pick a chart library (ADR); by-store, by-item, and by-category monthly views; person filter; date range picker; tax/discount allocation.
**Done when:** category totals for a month add up to the sum of that month's receipt totals.

### Stage 7 — Trends
**Build:** monthly totals over time; month-over-month and year-over-year comparisons; drill-down from a trend to the underlying receipts.

### Stage 8 — Price tracking and spikes
**Build:** price history per item per store; latest-price comparison across stores; spike detection and a flags view.

### Stage 9 — Search and view export
**Build:** search receipts and line items; combined filters; Export button on every list, breakdown, and trend view (§8.2); XLSX writer.

### Stage 10 — Retailer CSV import
**Build:** `imports` module; format definition schema; generic importer; Amazon format definition; import screen with preview; duplicate skipping; storing uploaded files; superseding older files; retention for imported files; `import_batches`.
**Done when:** importing a real Amazon report creates one receipt per order with the right totals; importing the same file again creates nothing; a file from the wrong retailer is rejected with a clear message; a newer report containing everything in an older one plus new orders imports only the new orders and tells the user the older file is completely contained, deleting it only if the user chooses; a report overlapping an older one by half or more is reported with its share and offered for deletion; a smaller overlap is only mentioned; no older file is ever deleted without the user choosing to; no order is ever duplicated.

### Future
- **Guided manual entry** for review-required receipts: walks the user through the fields one at a time (store, date, each line, totals), highlighting the relevant area of the image where possible. Replaces the plain form from Stage 4 as the default for manual entry.

---

## 12. Open Questions

| Question | When it must be decided |
|---|---|
| Which vision model (must run on oMLX). | Stage 3 |
| How the relay / oMLX expose server state, loaded model, load, and unload, and what must be added to the LLM-Server project. | Stage 3 |
| Docker runtime on macOS (Docker Desktop vs. OrbStack). | Stage 0 |
| Chart library. | Stage 6 |
| How to handle returns and refunds (negative receipts or line items?). | Stage 4 |
| How to treat receipts split between people. (Several payment methods on one receipt are handled by `payments`.) | Stage 4 |
| Whether and how recorded tax codes are interpreted (e.g. to spread tax only across the lines it applies to). | Stage 6 |
| Spike threshold: is 1.5× / $25 useful or noisy? | Stage 8 |
| Which extracted fields each screen displays (all are stored regardless). | Stage 4 onward, per screen |
| Server-side image conversion library for HEIC (must run in the ARM64 container). | Stage 2 |
| What "other records from online retailers" covers beyond CSV (e.g. PDF invoices, order confirmation emails), and whether any are in scope. Currently digital/PDF receipts are a non-goal. | Stage 10 |
| Other retailers' report formats, as they're supplied. | Stage 10 |
| Status of imported entries: `unreviewed` (proposed) or treated as checked like manual entries. | Stage 10 |
| How returns and refunds in a retailer report are recorded (ties to the returns question above). | Stage 10 |
| Revisit non-goals later: digital receipts, budgeting. | After Stage 9 |

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| A local model is less accurate than large hosted models. | Evaluation harness picks the best model that fits; required review step; consistency checks; OCR + text model fallback adapter; identifier learning reduces reliance on the model over time. |
| Extraction is slow on modest hardware. | Extraction is asynchronous, so capture is never blocked; images are resized; jobs run one at a time. |
| Fin Snap disrupts people chatting on the shared LLM server, or leaves it on the wrong model. | Starts only when the server is free; respects reservations; stops between receipts when someone starts chatting; batches capped at ~10 minutes; lease recorded before every switch and restored on startup after a crash; never overrides a model someone else chose. |
| A busy LLM server delays extraction for a long time. | Receipts wait safely in the queue; the receipts list shows "waiting for the model server". Unreviewed counting starts once extraction finishes. |
| iOS clears PWA storage after long inactivity, losing queued receipts. | Upload as soon as possible; show the pending count; warn when a receipt has been queued for more than a day. |
| Item matching gets messy (same item, many spellings and sizes). | Per-company item identifiers, matched by item code first; merge tool for canonical items; raw text is kept so items can be re-mapped later. |
| Architecture erodes over time. | Boundary rules enforced by `pnpm check`; contract tests keep fakes honest; ADRs record why decisions were made. |
| A receipt is matched to the wrong company. | Automatic matches only from identifiers a person confirmed; model guesses and similar names are never applied; conflicts are flagged, not guessed; processor/point-of-sale branding is excluded; a corrected mistake marks the causing identifier ambiguous so it can't recur; store identification has its own score in the evaluation harness. |
| Home server downtime (sleep, updates, power loss). | Mac set to never sleep and restart after power failure; services start at login; phones keep queueing offline; jobs resume after restart; nightly backups. |
