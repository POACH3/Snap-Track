# Fin Snap

Fin Snap is a private, self-hosted expense tracker for one household. Snap a photo of a paper receipt and it becomes structured, line-item expense data: the store, every item, prices, discounts, tax and payment. That data feeds monthly breakdowns, spending trends and price tracking. Everything runs on home hardware; no data leaves the home network.

![Status](https://img.shields.io/badge/status-planning-lightgrey)
![Language](https://img.shields.io/badge/language-TypeScript-blue)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
<!--![Tests](https://img.shields.io/badge/tests-%20none-lightgrey)-->

---

## Goals

- **See where money goes.** Monthly spending by store, by item and by category, and how it changes over time.
- **Track prices.** Notice when an item gets more expensive, and compare what the same item costs at different stores.
- **Replace manual logging.** Capturing a receipt takes less effort than typing it into a spreadsheet, and checking the result is usually a glance.
- **High-quality software.** Clean architecture, loose coupling and code that stays easy to change, enforced by automated checks.

Fin Snap is built for a single household of a few people on a mix of Android phones and iPhones. Every expense records who logged it, so totals can be split by person.

---

## How it works

1. **Capture.** On a phone, tap **Snap** to photograph a receipt, or choose several photos from the library at once. On a desktop, pick image files or drag them in. JPEG, PNG and iPhone HEIC photos all work.
2. **Save first, upload after.** Each receipt is saved on the device before it uploads, so capture works with no connection and nothing is lost. Queued receipts upload when the connection returns, and the app shows how many are waiting.
3. **Extraction.** On the server, a self-hosted vision model reads the receipt: the store and its identifying details, date and time, every line item with quantity, price and discounts, subtotal, tax, total, payments, and a full word-for-word transcription. Receipts it cannot read are marked for review and filled in by hand.
4. **Store identification.** The store is identified as a company (Walmart, not "Walmart #4512") and matched only on a known identifier, never on a guess. Once someone confirms the store for one receipt, Fin Snap remembers its identifiers and never asks again.
5. **Item naming and categories.** The same item is counted as one across receipts. Each line is categorized on its own, so one receipt can span several categories. Corrections and names you give items carry forward to future receipts. The software's own suggestions are never applied unless you accept them.
6. **Review.** Extracted data counts right away, marked unreviewed, and can be checked at any time beside the original image.
7. **Analysis.** Expenses roll up into breakdowns, trends, price history and spending spikes.

Expenses without a paper receipt can be entered by hand, as a quick entry (store, date, total, category) or a full entry with line items. Purchase history from online retailers (Amazon first) can be imported from the retailer's CSV order report.

---

## Planned features

### Capture and entry
- Camera capture, multi-photo library selection, and desktop upload with drag and drop
- Offline capture with an upload queue that syncs automatically
- Quick and full manual entry
- Retailer CSV import (Amazon first) that never creates duplicates, even for overlapping files

### Review and organization
- Side-by-side view of the receipt image and its extracted data, with zoom
- Stores as companies, recognized automatically after one confirmation
- Item names you set, shown everywhere that item appears
- A four-level category hierarchy (category, subcategory and two levels of class), starting from 12 editable defaults: Groceries, Dining, Household, Personal Care, Health, Transportation, Entertainment, Clothing, Kids, Pets, Gifts, Other
- A default category per store, and per-item or per-purchase changes
- Free tags (such as "dessert" or "treat") on an item or a single purchase
- Duplicate warnings

### Analytics
- Monthly breakdowns by store, item, category and tag, filterable by person, date range, review state and source
- Trends: month over month and year over year, overall and per store, item or category
- Spending by payment method
- Price history per item per store, with the latest price at each store
- Flags for unusual spending spikes in a store or category
- Search and combined filters
- Tax, tips and receipt-wide discounts spread across lines so category totals add up to what was actually paid

### Your data
- Full export at any time: one ZIP with a CSV per table, a spreadsheet-friendly expenses CSV, a complete JSON file and, optionally, the receipt images
- An Export button on every list, breakdown and trend view (CSV now, XLSX planned)
- Household settings for how long receipt images are kept (extracted data is always kept)
- Nightly backups with a tested restore

---

## Privacy and hosting

- **Fully private.** Receipts are read by a vision model on the household's own LLM server. No third-party AI services and no paid services.
- **Private access.** The server is reachable only from household devices over Tailscale, never the open internet.
- **Accounts.** One login per household member. No public sign-up.
- **Recoverable.** All data lives in one SQLite file and one image folder, backed up nightly and restorable with plain file copies.

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
| Client | React + Vite installable web app (PWA), responsive from phone to desktop, with an IndexedDB upload queue and offline support |
| Server | Node + Fastify, with Zod schemas shared between client and server |
| Database | SQLite with Drizzle ORM and migrations |
| Extraction | A vision model on the existing LLM server (oMLX), chosen by an evaluation in Stage 3 |
| Packaging | One Docker container for the Fin Snap server; the LLM server runs natively on the same Mac |
| Network | Tailscale, for private access and HTTPS |
| Quality | Vitest, Playwright, ESLint, Prettier and dependency-cruiser, all run by one `pnpm check` command |

The server follows a ports-and-adapters design: business logic never touches the database, file system or model directly, so any of them can be swapped by writing one new adapter.

---

## Build plan

Each stage ends in something that runs and is tested.

| Stage | Delivers |
|---|---|
| 0 | Scaffold, quality checks, Docker, HTTPS over Tailscale, installable placeholder app |
| 1 | Accounts and login |
| 2 | Capture and upload (online) |
| 3 | Extraction with the vision model, plus a model evaluation |
| 4 | Review, stores, items, categories, tags and manual entry |
| **5** | **Offline capture and sync, backups, settings and full export: first usable version (MVP)** |
| 6 | Monthly breakdowns and charts |
| 7 | Trends |
| 8 | Price tracking and spike flags |
| 9 | Search and view export |
| 10 | Retailer CSV import |

### Known limitations
- Extraction accuracy on faded, crumpled or very long receipts has not been evaluated yet; Stage 3 measures it.
- iPhones do not support background upload, so receipts captured offline on an iPhone upload the next time the app is opened.

---

## Usage

Not runnable yet. Setup and run instructions arrive with Stage 0.

---

## Documentation

- [SPEC.md](SPEC.md): the full specification (requirements, data model, receipt pipeline, analytics, export, security and build plan). Where this README and the spec differ, the spec wins.
- [docs/DESIGN.md](docs/DESIGN.md): the UI style guide.
- [AGENTS.md](AGENTS.md): instructions for coding agents working in this repository.

---

## Project Info
**Author:** T. Stratton  
**Start Date:** 13-NOV-2026  
**License:** [GNU AGPL-3.0](LICENSE). Copyright (C) 2026 T. Stratton. Anyone may use, change and share this code; changed versions that are distributed or offered as a network service must be published under the same license.  
**Language:** TypeScript  
**Status:** Planning  
**Topics:** expense-tracker, receipt-scanner, personal-finance, pwa, self-hosted, vision-language-model, typescript
