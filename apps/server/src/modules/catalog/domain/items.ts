import type { IdentifierState, ItemIdentifierType } from "@snaptrack/contracts";
import type { Id } from "@snaptrack/core";

// Item identifiers and matching (SPEC.md §5 `item_identifiers`, §6.4 step 2). Pure.

/** An identifier read from one receipt line, normalized for lookup. */
export interface LineIdentifier {
  readonly type: ItemIdentifierType;
  /** Null for a barcode: the same product at any company. */
  readonly storeId: Id | null;
  readonly value: string;
  readonly displayValue: string;
}

/** A row of `item_identifiers`, as the rules see it. */
export interface SavedItemIdentifier extends LineIdentifier {
  readonly id: Id;
  readonly itemId: Id;
  readonly state: IdentifierState;
}

/** What a line offers for matching: its kind, printed text and printed code. */
export interface LineForMatching {
  readonly kind: "item" | "fee";
  readonly rawName: string | null;
  readonly itemCode: string | null;
}

/** Identifiers with the same key are the same detail. */
export const itemKey = (identifier: { storeId: Id | null; type: ItemIdentifierType; value: string }) =>
  `${identifier.storeId ?? "*"}:${identifier.type}:${identifier.value}`;

/** The GS1 check digit for the digits before it (weights 3 and 1 from the right). */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

const valid = (digits: string) => checkDigit(digits.slice(0, -1)) === Number(digits.at(-1));

/** UPC-E (8 digits, number system 0 or 1) written out as the UPC-A it stands for. */
function upcEToUpcA(upcE: string): string | null {
  const system = upcE[0];
  if (system !== "0" && system !== "1") return null;
  const [d1, d2, d3, d4, d5, d6] = upcE.slice(1, 7);
  const check = upcE[7] ?? "";
  if (d6 === undefined) return null;
  let body: string;
  if (d6 === "0" || d6 === "1" || d6 === "2") body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${system}${body}${check}`;
}

/**
 * A complete barcode (UPC-A, UPC-E, EAN-8, EAN-13 or GTIN-14) with a valid check digit, as
 * GTIN-14, so one product printed in two forms is one value. Null for anything else.
 */
export function normalizeBarcode(text: string): string | null {
  const digits = text.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 8) {
    if (valid(digits)) return digits.padStart(14, "0");
    const upcA = upcEToUpcA(digits);
    return upcA !== null && valid(upcA) ? upcA.padStart(14, "0") : null;
  }
  if (digits.length === 12 || digits.length === 13 || digits.length === 14) {
    return valid(digits) ? digits.padStart(14, "0") : null;
  }
  return null;
}

/** Any other printed code: uppercased, spaces and dashes removed. Null if under three characters. */
export function normalizeItemCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[\s-]/g, "");
  return code.length >= 3 ? code : null;
}

/** The printed text: lowercased, accents and punctuation removed, spaces collapsed. */
export function normalizeItemName(text: string): string | null {
  const name = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.length >= 2 ? name : null;
}

/**
 * A line's identifiers. A barcode matches at any company; a code and the printed name only at
 * `storeId`, so they wait until the store is known. Fee lines offer only their printed name
 * (SPEC.md §5): a core charge printed with its battery's code must not become the battery.
 */
export function lineIdentifiers(line: LineForMatching, storeId: Id | null): LineIdentifier[] {
  const found: LineIdentifier[] = [];
  const code = line.itemCode?.trim() ?? "";
  if (line.kind === "item" && code !== "") {
    const barcode = normalizeBarcode(code);
    if (barcode !== null) found.push({ type: "barcode", storeId: null, value: barcode, displayValue: code });
    else if (storeId !== null) {
      const value = normalizeItemCode(code);
      if (value !== null) found.push({ type: "code", storeId, value, displayValue: code });
    }
  }
  const printed = line.rawName?.trim() ?? "";
  if (storeId !== null && printed !== "") {
    const value = normalizeItemName(printed);
    if (value !== null) found.push({ type: "name", storeId, value, displayValue: printed });
  }
  return found;
}

const ORDER: readonly ItemIdentifierType[] = ["barcode", "code", "name"];

/**
 * The item a line is, from its identifiers and the saved ones sharing their values (SPEC.md §6.4
 * step 2): barcode first, then code, then printed name. The first type with an active hit decides;
 * if it points to two items, nothing is applied. Undefined when nothing matches.
 */
export function identifyItem(
  identifiers: readonly LineIdentifier[],
  saved: readonly SavedItemIdentifier[],
): { itemId: Id; matchedBy: ItemIdentifierType } | undefined {
  const active = new Map<string, Set<Id>>();
  for (const row of saved) {
    if (row.state !== "active") continue;
    const key = itemKey(row);
    active.set(key, (active.get(key) ?? new Set()).add(row.itemId));
  }
  for (const type of ORDER) {
    const items = new Set(
      identifiers.filter((i) => i.type === type).flatMap((i) => [...(active.get(itemKey(i)) ?? [])]),
    );
    if (items.size > 1) return undefined;
    const [itemId] = items;
    if (itemId !== undefined) return { itemId, matchedBy: type };
  }
  return undefined;
}
