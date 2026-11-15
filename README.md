# SnapTrack

SnapTrack is a private, self-hosted expense tracker for one household. Snap a photo of a paper receipt and it becomes structured, line-item expense data: the store, every item, prices, discounts, tax and payment. That data will feed monthly breakdowns, spending trends and price tracking. Everything runs on home hardware; no data leaves the home network.

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![Language](https://img.shields.io/badge/language-TypeScript-blue)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

---

## Goals

- **See where money goes.** Monthly spending by store, by item and by category, and how it changes over time.
- **Track prices.** Notice when an item gets more expensive, and compare what the same item costs at different stores.
- **Replace manual logging.** Capturing a receipt takes less effort than typing it into a spreadsheet, and checking the result is usually a glance.
- **High-quality software.** Clean architecture, loose coupling and code that stays easy to change, enforced by automated checks.

SnapTrack is built for a single household of a few people on a mix of Android phones and iPhones. Every expense records who logged it, so totals can be split by person.

---

## How it works

1. **Capture.** On a phone, tap **Snap** to photograph a receipt, or choose several photos from the library at once; each becomes its own receipt. A long receipt can be taken in several photos with **Add another photo**. On a desktop, pick image files or drag them in. JPEG, PNG and iPhone HEIC photos all work.
2. **Upload.** The phone shrinks each photo to about 4 megapixels before sending it. Photos the browser can't read itself (such as HEIC on a desktop) are converted on the server. Uploads are safe to repeat: sending the same receipt twice creates one record.
3. **Extraction.** On the server, a vision model on the household's own LLM server reads the receipt: the store and its identifying details, date and time, every line item with quantity, unit price and discounts, subtotal, tax, total, payments, and a full word-for-word transcription. Receipts are read one at a time, in the background, and only when no one is using the LLM server for chat. Receipts it cannot read are marked for review.
4. **Checks.** SnapTrack checks that the figures add up (lines to subtotal, subtotal plus tax to total, payments to total, quantity times unit price) and keeps any mismatch as a warning for whoever reviews the receipt.
5. **Review** *(planned)*. Extracted data counts right away, marked unreviewed, and can be checked at any time beside the original photos.
6. **Store identification** *(planned)*. The store is identified as a company (Walmart, not "Walmart #4512") and matched only on a known identifier, never on a guess. Once someone confirms the store for one receipt, SnapTrack remembers its identifiers and never asks again.
7. **Items and categories** *(planned)*. The same item is counted as one across receipts. Each line is categorized on its own, so one receipt can span several categories. Corrections and names you give items carry forward to future receipts. The software's own suggestions are never applied unless you accept them.
8. **Analysis** *(planned)*. Expenses roll up into breakdowns, trends, price history and spending spikes.

---

## Features

### Working now
- Login for each household member; every receipt records who logged it
- Camera capture, multi-photo library selection, and desktop upload with drag and drop
- Long receipts in several photos, kept together in order
- Photo shrinking on the device, and server-side conversion of HEIC and other photos the browser can't read
- Receipts list with thumbnails, status and totals; receipt view with every photo
- Automatic extraction of store details, line items, totals, tax, payments and a full transcription, with retries when the LLM server is busy or offline
- Consistency checks on the extracted figures
- Installable web app with a phone tab bar and desktop side navigation

### Planned
- **Capture and entry:** offline capture with an upload queue that syncs automatically; quick and full manual entry; retailer CSV import (Amazon first) that never creates duplicates, even for overlapping files
- **Review and organization:** side-by-side view of the photos and their data, with zoom; stores recognized automatically after one confirmation; item names you set, shown everywhere that item appears; a four-level category hierarchy starting from 12 editable defaults (Groceries, Dining, Household, Personal Care, Health, Transportation, Entertainment, Clothing, Kids, Pets, Gifts, Other); a default category per store, and per-item or per-purchase changes; free tags (such as "dessert" or "treat"); duplicate warnings
- **Analytics:** monthly breakdowns by store, item, category and tag, filterable by person, date range, review state and source; month-over-month and year-over-year trends; spending by payment method; price history per item per store; flags for unusual spending spikes; search and combined filters; tax, tips and receipt-wide discounts spread across lines so category totals add up to what was actually paid
- **Your data:** full export at any time (a CSV per table, a spreadsheet-friendly expenses CSV, a complete JSON file and, optionally, the photos); an Export button on every list and chart; household settings for how long receipt photos are kept; nightly backups with a tested restore
- **Extraction:** a comparison of other vision models, and of a two-step approach (a text-reading model followed by a structuring model)

---

## Privacy and hosting

- **Fully private.** Receipts are read by a vision model on the household's own LLM server. No third-party AI services and no paid services.
- **Private access.** The server is reachable only from household devices over Tailscale, never the open internet.
- **Accounts.** One login per household member. No public sign-up.
- **Isolated.** SnapTrack runs under its own macOS account, can change only its own data folder, and is blocked from reaching the internet.
- **Recoverable.** All data lives in one SQLite file and one image folder, which can be backed up and restored with plain file copies.

### Not in scope
- Public or multi-household use
- Digital or PDF receipts and bank or card statement import (may be revisited later)
- Importing spending history from before the app starts
- Budgeting, spending limits or alerts
- Currencies other than USD
- Native mobile apps or app store releases

---

## Architecture

| Part | Choice |
|---|---|
| Language | TypeScript throughout, in a pnpm workspaces monorepo |
| Client | React + Vite installable web app (PWA), responsive from phone to desktop |
| Server | Node + Fastify, with a contract-first oRPC API whose Zod schemas are shared between client and server |
| Database | SQLite with Drizzle ORM and migrations |
| Extraction | Qwen3.6-35B-A3B (4-bit) on the household's LLM server (oMLX), reached through its relay as low-priority requests, so chat always comes first |
| Image conversion | macOS's built-in `sips` |
| Hosting | Runs natively on a Mac as a macOS service under its own account, with no Docker |
| Network | Tailscale, for private access and HTTPS |
| Quality | Vitest, Playwright, ESLint, Prettier and dependency-cruiser, all run by one `pnpm check` command |

The server follows a ports-and-adapters design: business logic never touches the database, file system or model directly, so any of them can be swapped by writing one new adapter.

---

## Extraction results

First real receipts read through the full pipeline (November 2026), each on the first try:

| Receipt | Result |
|---|---|
| Hardware store, 5 lines with quantity lines (2 @ 4.68, 3 @ 0.88) | Every line, code, quantity, unit price and total correct; store address, phone, card and transaction number captured; figures add up with no warnings |
| Auto-parts store, a battery and its core charge | Every figure correct, with the core charge recognized as a fee; store details and card captured |

A 4-megapixel photo takes about 15 seconds to read. Earlier side-by-side checks against a large cloud model (used only as a reference, not part of the app) agreed on every price and total.

### Known limitations
- Extraction has been checked on a handful of receipts. Faded receipts, weighed items and long receipts in several photos are not yet tested.
- Until offline capture arrives, a receipt is uploaded as soon as it is captured; if the upload fails, it can be retried while the app stays open.
- iPhones do not support background upload, so once offline capture arrives, receipts captured offline on an iPhone will upload the next time the app is opened.

---

## Usage

### Development
Requires macOS (image conversion uses `sips`), Node and pnpm at the versions pinned in `package.json`, and, for extraction, the household's LLM server.

```sh
pnpm install
cp .env.example .env        # then fill in SESSION_SECRET and the LLM server values
pnpm db:migrate             # creates the local database in data/
pnpm user:create            # one login per household member
pnpm dev                    # server and web app; open http://localhost:5173
```

`pnpm check` runs formatting, linting, type checks, architecture checks and all tests; `pnpm test:e2e` runs the browser tests.

### Production
SnapTrack runs on the Mac as a LaunchDaemon under its own account. Setup, deploys, rollbacks and checks are in [deploy/README.md](deploy/README.md).

---

## Documentation

- [SPEC.md](SPEC.md): the full specification (requirements, data model, receipt pipeline, analytics, export and security). Where this README and the spec differ, the spec wins.
- [docs/DESIGN.md](docs/DESIGN.md): the UI style guide.
- [docs/TESTING.md](docs/TESTING.md): what each test covers.
- [docs/adr/](docs/adr/): architecture decision records.
- [AGENTS.md](AGENTS.md): instructions for coding agents working in this repository.

---

## Project Info
**Author:** T. Stratton  
**Start Date:** 13-NOV-2026  
**License:** [GNU AGPL-3.0](LICENSE). Copyright (C) 2026 T. Stratton. Anyone may use, change and share this code; changed versions that are distributed or offered as a network service must be published under the same license.  
**Language:** TypeScript  
**Status:** In development  
**Topics:** expense-tracker, receipt-scanner, personal-finance, pwa, self-hosted, vision-language-model, typescript
