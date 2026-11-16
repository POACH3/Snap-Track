import type { StoreEvidence, StoreIdentifierType } from "@snaptrack/contracts";
import { describe, expect, it } from "vitest";
import { identifyStore, type SavedIdentifier } from "./identify-store.ts";
import {
  identifiersFromEvidence,
  normalizeAddress,
  normalizeIdentifier,
  normalizeName,
  normalizePhone,
  normalizeWebsite,
  type ReceiptIdentifier,
} from "./identifiers.ts";
import { planStoreLearning, type PreviousStore } from "./learning.ts";
import { nameSimilarity, rankSuggestions, type KnownStore } from "./suggestions.ts";

const WALMART = "00000000-0000-4000-8000-000000000001";
const TARGET = "00000000-0000-4000-8000-000000000002";
const COSTCO = "00000000-0000-4000-8000-000000000003";

const evidence = (overrides: Partial<StoreEvidence> = {}): StoreEvidence => ({
  logoText: null,
  brandGuess: null,
  printedName: null,
  legalName: null,
  branchName: null,
  storeNumber: null,
  address: null,
  phones: [],
  websites: [],
  emails: [],
  merchantId: null,
  ...overrides,
});

const id = (type: StoreIdentifierType, text: string): ReceiptIdentifier => {
  const value = normalizeIdentifier(type, text);
  if (value === null) throw new Error(`${text} is not a usable ${type}`);
  return { type, value, displayValue: text };
};

let rowCount = 0;
const saved = (
  storeId: string,
  identifier: ReceiptIdentifier,
  state: SavedIdentifier["state"] = "active",
): SavedIdentifier => ({
  id: `00000000-0000-4000-9000-${String(++rowCount).padStart(12, "0")}`,
  storeId,
  type: identifier.type,
  value: identifier.value,
  displayValue: identifier.displayValue,
  state,
});

describe("normalization", () => {
  it.each([
    ["WAL*MART", "walmart"],
    ["Wal-Mart", "walmart"],
    ["  Walmart   Supercenter ", "walmart supercenter"],
    ["Café Olé", "cafe ole"],
    ["Powered by Toast", null],
    ["TOAST", null],
    ["Square", null],
    ["Thank you!", null],
    ["*", null],
  ])("name %j → %j", (text, expected) => {
    expect(normalizeName(text)).toBe(expected);
  });

  it.each([
    ["(555) 123-4567", "15551234567"],
    ["+1 555.123.4567", "15551234567"],
    ["1-555-123-4567", "15551234567"],
    ["123-4567", null],
    ["+44 20 7946 0958", null],
  ])("phone %j → %j", (text, expected) => {
    expect(normalizePhone(text)).toBe(expected);
  });

  it.each([
    ["www.walmart.com/receipt", "walmart.com"],
    ["https://WWW.Walmart.com:443/x?y=1", "walmart.com"],
    ["shop.example.co.uk", "shop.example.co.uk"],
    ["squareup.com/receipts/123", null],
    ["mystore.square.site", null],
    ["not a website", null],
  ])("website %j → %j", (text, expected) => {
    expect(normalizeWebsite(text)).toBe(expected);
  });

  it.each([
    ["123 Main Street", "62701-1234", "123 main st|62701"],
    ["123 MAIN ST.", "62701", "123 main st|62701"],
    ["45 North Avenue, Suite 2", "10001", "45 n ave ste 2|10001"],
    ["123 Main St", null, null],
    [null, "62701", null],
    ["123 Main St", "627", null],
  ])("address %j %j → %j", (street, zip, expected) => {
    expect(normalizeAddress(street, zip)).toBe(expected);
  });

  it("reads an address typed on one line, with or without city and state", () => {
    expect(normalizeIdentifier("address", "123 Main Street, Springfield IL 62701")).toBe("123 main st|62701");
    expect(normalizeIdentifier("address", "123 Main St 62701")).toBe("123 main st|62701");
    expect(normalizeIdentifier("address", "123 Main St")).toBeNull();
  });

  it("treats an email address as its domain, and drops free-mail domains", () => {
    expect(normalizeIdentifier("website", "receipts@Walmart.com")).toBe("walmart.com");
    expect(normalizeIdentifier("website", "joesdiner@gmail.com")).toBeNull();
  });
});

describe("identifiersFromEvidence", () => {
  it("takes every identifier, never the brand guess, branch, store number or merchant ID", () => {
    const found = identifiersFromEvidence(
      evidence({
        printedName: "WALMART SUPERCENTER",
        logoText: "Walmart",
        legalName: "Wal-Mart Stores, Inc.",
        brandGuess: "Walmart",
        branchName: "Springfield North",
        storeNumber: "ST# 1234",
        merchantId: "998877",
        phones: [
          { number: "(555) 123-4567", label: "Store" },
          { number: "555-765-4321", label: "Pharmacy" },
        ],
        websites: ["www.walmart.com"],
        emails: ["help@walmart.com", "owner@gmail.com"],
        address: { street: "1 Main St", city: "Springfield", state: "IL", zip: "62701" },
      }),
    );
    expect(found.map((i) => [i.type, i.value])).toEqual([
      ["name", "walmart supercenter"],
      ["logo_text", "walmart"],
      ["legal_name", "walmart stores inc"],
      ["phone", "15551234567"],
      ["phone", "15557654321"],
      ["website", "walmart.com"],
      ["address", "1 main st|62701"],
    ]);
    expect(found.find((i) => i.type === "address")?.displayValue).toBe("1 Main St, Springfield IL 62701");
  });

  it("drops processor branding and repeated values", () => {
    const found = identifiersFromEvidence(
      evidence({
        printedName: "Powered by Square",
        websites: ["squareup.com", "joes.example", "www.joes.example"],
      }),
    );
    expect(found.map((i) => i.value)).toEqual(["joes.example"]);
  });
});

describe("identifyStore", () => {
  const phone = id("phone", "(555) 123-4567");
  const website = id("website", "walmart.com");
  const address = id("address", "1 Main St 62701");
  const name = id("name", "WALMART");

  it("matches on one strong identifier, such as a new location sharing the website", () => {
    const result = identifyStore([website, id("phone", "555-999-0000")], [saved(WALMART, website)]);
    expect(result).toEqual({
      kind: "matched",
      storeId: WALMART,
      match: { matched: [{ type: "website", displayValue: "walmart.com" }], supporting: [] },
    });
  });

  it("matches when every strong hit agrees, and records the same store's address as support", () => {
    const result = identifyStore(
      [phone, website, address],
      [saved(WALMART, phone), saved(WALMART, website), saved(WALMART, address)],
    );
    expect(result.kind).toBe("matched");
    if (result.kind !== "matched") return;
    expect(result.match.matched).toHaveLength(2);
    expect(result.match.supporting).toEqual([{ type: "address", displayValue: "1 Main St 62701" }]);
  });

  it("ignores a different company's address next to a strong hit", () => {
    const result = identifyStore([phone, address], [saved(WALMART, phone), saved(TARGET, address)]);
    expect(result).toMatchObject({ kind: "matched", storeId: WALMART, match: { supporting: [] } });
  });

  it("flags identifiers pointing to two companies, with both candidates", () => {
    const result = identifyStore(
      [phone, website, name],
      [saved(WALMART, phone), saved(WALMART, website), saved(TARGET, name)],
    );
    expect(result).toEqual({
      kind: "needs-confirmation",
      issue: "conflict",
      candidates: [
        { storeId: WALMART, reason: "identifier", identifiers: [expect.anything(), expect.anything()] },
        { storeId: TARGET, reason: "identifier", identifiers: [{ type: "name", displayValue: "WALMART" }] },
      ],
    });
  });

  it("flags a receipt known only by its address, that company first", () => {
    const result = identifyStore([address, id("phone", "555-000-1111")], [saved(TARGET, address)]);
    expect(result).toEqual({
      kind: "needs-confirmation",
      issue: "address_only",
      candidates: [{ storeId: TARGET, reason: "address", identifiers: [expect.anything()] }],
    });
  });

  it("flags an unknown store", () => {
    expect(identifyStore([phone], [])).toEqual({
      kind: "needs-confirmation",
      issue: "unknown",
      candidates: [],
    });
  });

  it("never matches on an ambiguous identifier", () => {
    expect(identifyStore([phone], [saved(WALMART, phone, "ambiguous")]).kind).toBe("needs-confirmation");
  });

  it("looks names, legal names and logo text up against each other", () => {
    const result = identifyStore([id("logo_text", "Walmart")], [saved(WALMART, id("name", "WAL-MART"))]);
    expect(result).toMatchObject({ kind: "matched", storeId: WALMART });
  });

  it("doesn't count one store twice when two of its rows share a value", () => {
    const result = identifyStore(
      [name],
      [saved(WALMART, id("name", "Walmart")), saved(WALMART, id("logo_text", "Walmart"))],
    );
    expect(result).toMatchObject({ kind: "matched", match: { matched: [{ type: "name" }] } });
  });
});

describe("rankSuggestions", () => {
  const stores: KnownStore[] = [
    { id: WALMART, name: "Walmart", names: ["walmart", "walmart supercenter"] },
    { id: TARGET, name: "Target", names: ["target"] },
    { id: COSTCO, name: "Costco", names: ["costco", "costco wholesale"] },
  ];

  it("scores names by shared letter pairs", () => {
    expect(nameSimilarity("walmart", "walmart")).toBe(1);
    expect(nameSimilarity("walmart supercenter", "walmart")).toBeGreaterThan(0.5);
    expect(nameSimilarity("target", "walmart")).toBeLessThan(0.5);
  });

  it("offers the candidates first, then the brand guess, then similar names, each store once", () => {
    const result = rankSuggestions(
      {
        kind: "needs-confirmation",
        issue: "address_only",
        candidates: [{ storeId: TARGET, reason: "address", identifiers: [] }],
      },
      evidence({ brandGuess: "Costco", printedName: "WALMART SUPER CENTER" }),
      stores,
    );
    expect(result.map((s) => [s.storeId, s.reason])).toEqual([
      [TARGET, "address"],
      [COSTCO, "brand_guess"],
      [WALMART, "similar_name"],
    ]);
  });

  it("offers a store the receipt matches now, though it wasn't known when the receipt was read", () => {
    const result = rankSuggestions(
      {
        kind: "matched",
        storeId: WALMART,
        match: { matched: [{ type: "phone", displayValue: "555" }], supporting: [] },
      },
      evidence(),
      stores,
    );
    expect(result).toEqual([
      { storeId: WALMART, reason: "identifier", identifiers: [{ type: "phone", displayValue: "555" }] },
    ]);
  });

  it("suggests nothing for unrelated names", () => {
    const result = rankSuggestions(
      { kind: "needs-confirmation", issue: "unknown", candidates: [] },
      evidence({ printedName: "Joe's Diner", brandGuess: "Joe's" }),
      stores,
    );
    expect(result).toEqual([]);
  });
});

describe("planStoreLearning", () => {
  const phone = id("phone", "(555) 123-4567");
  const website = id("website", "walmart.com");
  const address = id("address", "1 Main St 62701");
  const fresh: PreviousStore = { storeId: null, matchedBy: null, alreadyCounted: false };
  const plan = (input: {
    identifiers: ReceiptIdentifier[];
    saved?: SavedIdentifier[];
    previous?: PreviousStore;
    answers?: [string, boolean][];
    storeId?: string;
  }) =>
    planStoreLearning({
      storeId: input.storeId ?? WALMART,
      identifiers: input.identifiers,
      saved: input.saved ?? [],
      previous: input.previous ?? fresh,
      answers: new Map(input.answers ?? []),
    });

  it("saves every identifier on the receipt, not just the one that matched", () => {
    const phoneRow = saved(WALMART, phone);
    expect(plan({ identifiers: [phone, website, address], saved: [phoneRow] })).toEqual({
      kind: "changes",
      changes: [
        { kind: "seen", rowId: phoneRow.id },
        { kind: "insert", identifier: website },
        { kind: "insert", identifier: address },
      ],
      notices: [],
    });
  });

  it("doesn't count identifiers again when a confirmed receipt is saved again with the same store", () => {
    const phoneRow = saved(WALMART, phone);
    const result = plan({
      identifiers: [phone, website],
      saved: [phoneRow],
      previous: { storeId: WALMART, matchedBy: "user", alreadyCounted: true },
    });
    expect(result).toEqual({
      kind: "changes",
      changes: [{ kind: "insert", identifier: website }],
      notices: [],
    });
  });

  it("asks before moving a strong identifier saved for another company, and changes nothing until answered", () => {
    const targetPhone = saved(TARGET, phone);
    expect(plan({ identifiers: [phone, website], saved: [targetPhone] })).toEqual({
      kind: "questions",
      questions: [
        {
          key: targetPhone.id,
          identifier: { type: "phone", displayValue: phone.displayValue },
          savedForStoreId: TARGET,
        },
      ],
    });
  });

  it("moves it when the answer is yes, and keeps it when no", () => {
    const targetPhone = saved(TARGET, phone);
    expect(plan({ identifiers: [phone], saved: [targetPhone], answers: [[targetPhone.id, true]] })).toEqual({
      kind: "changes",
      changes: [{ kind: "move", rowId: targetPhone.id }],
      notices: [],
    });
    expect(plan({ identifiers: [phone], saved: [targetPhone], answers: [[targetPhone.id, false]] })).toEqual({
      kind: "changes",
      changes: [],
      notices: [],
    });
  });

  it("ignores answers to questions that no longer apply", () => {
    expect(plan({ identifiers: [website], answers: [["stale", true]] })).toMatchObject({ kind: "changes" });
  });

  it("asks about a matching name saved under another name type", () => {
    const targetName = saved(TARGET, id("name", "WALMART"));
    const result = plan({ identifiers: [id("logo_text", "Walmart")], saved: [targetName] });
    expect(result).toMatchObject({ kind: "questions", questions: [{ key: targetName.id }] });
  });

  it("marks an address saved for another company as shared, without asking or moving it", () => {
    const targetAddress = saved(TARGET, address);
    expect(plan({ identifiers: [address], saved: [targetAddress] })).toEqual({
      kind: "changes",
      changes: [{ kind: "mark-ambiguous", rowId: targetAddress.id }],
      notices: [
        { identifier: { type: "address", displayValue: address.displayValue }, alsoSavedForStoreId: TARGET },
      ],
    });
  });

  it("correcting a wrong automatic match marks what caused it ambiguous and learns the rest for the right store", () => {
    const targetPhone = saved(TARGET, phone);
    const result = plan({
      identifiers: [phone, website],
      saved: [targetPhone],
      previous: { storeId: TARGET, matchedBy: "identifier", alreadyCounted: false },
    });
    expect(result).toEqual({
      kind: "changes",
      changes: [
        { kind: "mark-ambiguous", rowId: targetPhone.id },
        { kind: "insert", identifier: website },
      ],
      notices: [],
    });
  });

  it("asks before moving identifiers when a confirmed receipt's store is changed", () => {
    const targetPhone = saved(TARGET, phone);
    const result = plan({
      identifiers: [phone],
      saved: [targetPhone],
      previous: { storeId: TARGET, matchedBy: "user", alreadyCounted: true },
    });
    expect(result).toMatchObject({ kind: "questions" });
  });

  it("leaves ambiguous identifiers alone", () => {
    const shared = saved(TARGET, phone, "ambiguous");
    expect(plan({ identifiers: [phone], saved: [shared] })).toEqual({
      kind: "changes",
      changes: [],
      notices: [],
    });
  });
});
