// Stands in for the LLM server in Playwright tests (pnpm test:e2e). It reads each receipt's first
// photo's width and replies with the recorded receipt for it, so every test uploads the fixture
// for the receipt it needs and tests can't take each other's replies. Never used outside tests.
import type { ReceiptExtractor } from "../modules/extraction/index.ts";

/** A JPEG's width from its start-of-frame marker; undefined for anything else. */
export function jpegWidth(bytes: Uint8Array): number | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] ?? 0;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0);
    }
    at += 2 + length;
  }
  return undefined;
}

const freshMartStore = {
  logoText: "FRESH MART",
  printedName: "FRESH MART #12",
  phones: [{ number: "(555) 010-2000", label: "Store" }],
  websites: ["www.freshmart.example"],
  address: { street: "12 Market St", city: "Springfield", state: "IL", zip: "62701" },
};

/** Replies by photo width, matching the fixtures in apps/web/e2e/fixtures/. */
export const E2E_REPLIES: Record<number, unknown> = {
  // review-a.jpg: a Fresh Mart receipt that adds up.
  720: {
    store: freshMartStore,
    purchaseDate: "2026-01-10",
    purchaseTime: "17:42",
    subtotal: 6.48,
    tax: 0.52,
    total: 7.0,
    lines: [
      {
        printedName: "WHOLE MILK GAL",
        itemCode: "4417",
        amount: 3.49,
        quantity: 1,
        unitPrice: 3.49,
        suggestedName: "Whole milk, 1 gal",
      },
      { printedName: "SOURDOUGH LOAF", amount: 2.99, quantity: 1, unitPrice: 2.99 },
    ],
    payments: [{ method: "card", cardBrand: "Visa", cardType: "credit", last4: "4821", amount: 7.0 }],
    rawText: "FRESH MART #12\nWHOLE MILK GAL 3.49\nSOURDOUGH LOAF 2.99\nTOTAL 7.00",
  },
  // review-b.jpg: another Fresh Mart location, sharing only the website; the milk is printed
  // differently but carries the same item code.
  760: {
    store: {
      printedName: "FRESH MART #31",
      websites: ["freshmart.example"],
      phones: [{ number: "(555) 010-3100" }],
    },
    purchaseDate: "2026-01-11",
    subtotal: 4.0,
    tax: 0,
    total: 4.0,
    lines: [{ printedName: "WHL MILK 1GAL", itemCode: "4417", amount: 4.0 }],
  },
  // review-phone.jpg: a corner shop, for the phone layout; the subtotal is off by a dollar.
  // (Not 800: the HEIC fixture converts to that width.)
  880: {
    store: { printedName: "CORNER MARKET", phones: [{ number: "(555) 010-4000" }] },
    purchaseDate: "2026-01-12",
    subtotal: 6.0,
    tax: 0.4,
    total: 6.4,
    lines: [
      { printedName: "APPLES", amount: 3.0 },
      { printedName: "TEA", amount: 2.0 },
    ],
  },
  // review-unreadable.jpg: nothing the model could read.
  840: {},
  // labels.jpg: a store of its own, with category guesses by number from the prompt's list
  // (1 is Groceries and 3 is Household among the default categories, in order).
  900: {
    store: { printedName: "LABEL MART", phones: [{ number: "(555) 010-5000" }] },
    purchaseDate: "2026-01-13",
    subtotal: 7.0,
    tax: 0,
    total: 7.0,
    lines: [
      { printedName: "OAT MILK", amount: 4.0, suggestedName: "Oat milk", category: 1 },
      { printedName: "CANDLE", amount: 3.0, category: 3 },
    ],
  },
};

/** Any other photo (the capture tests' fixtures): an unknown store and a total. */
const DEFAULT_REPLY = { total: 1.0, purchaseDate: "2026-01-09" };

export class E2eExtractor implements ReceiptExtractor {
  extract(images: readonly Uint8Array[]) {
    const width = images[0] === undefined ? undefined : jpegWidth(images[0]);
    const reply = (width === undefined ? undefined : E2E_REPLIES[width]) ?? DEFAULT_REPLY;
    return Promise.resolve({ kind: "output" as const, content: JSON.stringify(reply), model: "e2e" });
  }
}
