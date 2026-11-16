import type { IdentifierRef, StoreEvidence, StoreIdentifierType } from "@snaptrack/contracts";

/** An identifier read from a receipt (or typed by hand), normalized for lookup (SPEC.md §5). */
export interface ReceiptIdentifier {
  readonly type: StoreIdentifierType;
  /** Normalized; what is looked up and stored as `value`. */
  readonly value: string;
  /** As printed or typed; what people see. */
  readonly displayValue: string;
}

/** Strong identifiers can make a match; addresses only support one (SPEC.md §6.4). */
export const isStrong = (type: StoreIdentifierType) => type !== "address";

/** Names, legal names and logo text are all names of the company, so they are looked up against each other. */
const NAME_LIKE: ReadonlySet<StoreIdentifierType> = new Set(["name", "legal_name", "logo_text"]);

/** Identifiers with the same key are the same detail for matching. */
export const lookupKey = (type: StoreIdentifierType, value: string) =>
  `${NAME_LIKE.has(type) ? "name" : type}:${value}`;

export const toRef = (identifier: { type: StoreIdentifierType; displayValue: string }): IdentifierRef => ({
  type: identifier.type,
  displayValue: identifier.displayValue,
});

// Values on receipts from many unrelated companies: payment processors, point-of-sale vendors,
// card networks, and generic phrases (SPEC.md §6.3.2, §6.4). Compared after normalization.
const EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  "square",
  "toast",
  "clover",
  "shopify",
  "shopify pos",
  "stripe",
  "paypal",
  "venmo",
  "zettle",
  "lightspeed",
  "heartland",
  "elavon",
  "worldpay",
  "fiserv",
  "first data",
  "global payments",
  "tsys",
  "chase paymentech",
  "chase",
  "spoton",
  "revel",
  "touchbistro",
  "ncr",
  "aloha",
  "micros",
  "visa",
  "mastercard",
  "master card",
  "american express",
  "amex",
  "discover",
  "thank you",
  "thanks",
  "thank you for shopping",
  "customer copy",
  "merchant copy",
  "receipt",
  "sales receipt",
  "welcome",
]);

// Websites of the same companies, plus free email providers, which small businesses use.
const EXCLUDED_DOMAINS: readonly string[] = [
  "squareup.com",
  "square.site",
  "toasttab.com",
  "clover.com",
  "shopify.com",
  "stripe.com",
  "paypal.com",
  "venmo.com",
  "lightspeedhq.com",
  "heartlandpaymentsystems.com",
  "elavon.com",
  "worldpay.com",
  "fiserv.com",
  "spoton.com",
  "visa.com",
  "mastercard.com",
  "americanexpress.com",
  "discover.com",
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
];

/** Lowercased, accents and punctuation removed (`WAL*MART` → `walmart`), spaces collapsed. Null if nothing usable is left. */
export function normalizeName(text: string): string | null {
  const value = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^powered by /, "");
  if (value.length < 2 || EXCLUDED_NAMES.has(value)) return null;
  return value;
}

/** Digits only, with the country code: ten digits get a leading `1`. Null for anything else. */
export function normalizePhone(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return null;
}

/** The bare domain (`https://www.walmart.com/receipt` → `walmart.com`). Null if not a domain, or excluded. */
export function normalizeWebsite(text: string): string | null {
  const host = text
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/, 1)[0];
  if (host === undefined || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  if (EXCLUDED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
  return host;
}

/** The domain of an email address, as a website. */
export function emailDomain(text: string): string | null {
  const at = text.lastIndexOf("@");
  return at === -1 ? null : normalizeWebsite(text.slice(at + 1));
}

// One spelling for each common street word, so "123 Main Street" and "123 MAIN ST." are the same.
const STREET_WORDS: Readonly<Record<string, string>> = {
  street: "st",
  avenue: "ave",
  av: "ave",
  boulevard: "blvd",
  road: "rd",
  drive: "dr",
  lane: "ln",
  court: "ct",
  place: "pl",
  parkway: "pkwy",
  highway: "hwy",
  hiway: "hwy",
  circle: "cir",
  square: "sq",
  terrace: "ter",
  trail: "trl",
  way: "way",
  plaza: "plz",
  center: "ctr",
  centre: "ctr",
  suite: "ste",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

/** Standardized street and five-digit ZIP, as `<street>|<zip>`. Null unless both are usable. */
export function normalizeAddress(street: string | null, zip: string | null): string | null {
  const zip5 = (zip ?? "").replace(/\D/g, "").slice(0, 5);
  if (zip5.length !== 5 || street === null) return null;
  const words = street
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => STREET_WORDS[word] ?? word);
  if (words.length === 0) return null;
  return `${words.join(" ")}|${zip5}`;
}

/** How an address is shown: "123 Main St, Springfield IL 62701". */
export function displayAddress(address: NonNullable<StoreEvidence["address"]>): string {
  const place = [address.city, address.state, address.zip].filter((part) => part !== null).join(" ");
  return [address.street, place].filter((part) => part !== null && part !== "").join(", ");
}

/** Normalizes one value of a type. Null if it can't identify a store. */
export function normalizeIdentifier(type: StoreIdentifierType, text: string): string | null {
  switch (type) {
    case "name":
    case "legal_name":
    case "logo_text":
      return normalizeName(text);
    case "phone":
      return normalizePhone(text);
    case "website":
      return text.includes("@") ? emailDomain(text) : normalizeWebsite(text);
    case "address": {
      // Typed by hand as one line: the street is before the first comma (or before the ZIP if
      // there is none), and the ZIP is the last five-digit group.
      const zip = text.match(/(\d{5})(?:-\d{4})?\s*$/);
      if (zip === null) return null;
      const street = text.includes(",") ? text.slice(0, text.indexOf(",")) : text.slice(0, zip.index);
      return normalizeAddress(street, zip[1] ?? null);
    }
  }
}

/**
 * Every identifier in a receipt's store evidence, normalized, with excluded and unusable values
 * dropped and duplicates removed (SPEC.md §6.4 step 1). Brand guess, branch name, store number and
 * merchant ID are never identifiers.
 */
export function identifiersFromEvidence(evidence: StoreEvidence): ReceiptIdentifier[] {
  const found: ReceiptIdentifier[] = [];
  const add = (type: StoreIdentifierType, value: string | null, displayValue: string) => {
    if (value !== null) found.push({ type, value, displayValue: displayValue.trim() });
  };
  const named = (type: StoreIdentifierType, text: string | null) => {
    if (text !== null) add(type, normalizeName(text), text);
  };

  named("name", evidence.printedName);
  named("logo_text", evidence.logoText);
  named("legal_name", evidence.legalName);
  for (const phone of evidence.phones) add("phone", normalizePhone(phone.number), phone.number);
  for (const website of evidence.websites) {
    const value = normalizeWebsite(website);
    add("website", value, value ?? website);
  }
  for (const email of evidence.emails) {
    const value = emailDomain(email);
    add("website", value, value ?? email);
  }
  if (evidence.address !== null) {
    add(
      "address",
      normalizeAddress(evidence.address.street, evidence.address.zip),
      displayAddress(evidence.address),
    );
  }

  const seen = new Set<string>();
  return found.filter((identifier) => {
    const key = `${identifier.type}:${identifier.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
