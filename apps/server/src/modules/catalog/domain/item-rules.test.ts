import { describe, expect, it } from "vitest";
import {
  identifyItem,
  lineIdentifiers,
  normalizeBarcode,
  normalizeItemCode,
  normalizeItemName,
  type LineIdentifier,
  type SavedItemIdentifier,
} from "./items.ts";
import { planItemLearning } from "./learning.ts";

const STORE = "00000000-0000-4000-8000-0000000000a1";
const OTHER_STORE = "00000000-0000-4000-8000-0000000000a2";
const MILK = "00000000-0000-4000-8000-0000000000b1";
const BREAD = "00000000-0000-4000-8000-0000000000b2";
const BATTERY = "00000000-0000-4000-8000-0000000000b3";

let rowCount = 0;
const saved = (
  itemId: string,
  identifier: LineIdentifier,
  state: SavedItemIdentifier["state"] = "active",
) => ({
  ...identifier,
  id: `00000000-0000-4000-9000-${String(++rowCount).padStart(12, "0")}`,
  itemId,
  state,
});

const line = (rawName: string | null, itemCode: string | null = null, kind: "item" | "fee" = "item") => ({
  kind,
  rawName,
  itemCode,
});

describe("barcodes", () => {
  it.each([
    ["036000291452", "00036000291452", "UPC-A"],
    ["0036000291452", "00036000291452", "the same product as EAN-13"],
    ["4006381333931", "04006381333931", "EAN-13"],
    ["96385074", "00000096385074", "EAN-8"],
    ["04252614", "00042100005264", "UPC-E, written out as its UPC-A"],
    ["0 36000 29145 2", "00036000291452", "printed with spaces"],
  ])("%s → %s (%s)", (text, gtin) => {
    expect(normalizeBarcode(text)).toBe(gtin);
  });

  it("refuses a wrong check digit, a partial code and letters", () => {
    expect(normalizeBarcode("036000291453")).toBeNull();
    expect(normalizeBarcode("36000291452")).toBeNull();
    expect(normalizeBarcode("A36000291452")).toBeNull();
  });
});

describe("codes and printed names", () => {
  it("normalizes a code and refuses one too short", () => {
    expect(normalizeItemCode(" sku-123 45 ")).toBe("SKU12345");
    expect(normalizeItemCode("12")).toBeNull();
  });

  it("normalizes printed text, keeping what is printed", () => {
    expect(normalizeItemName("GV WHL MLK GAL")).toBe("gv whl mlk gal");
    expect(normalizeItemName("AVOCADOS 2 @ 1.25")).toBe("avocados 2 1 25");
    expect(normalizeItemName("Crème Brûlée")).toBe("creme brulee");
    expect(normalizeItemName("*")).toBeNull();
  });
});

describe("lineIdentifiers", () => {
  it("offers a barcode at any company, and a code and the printed name at the store", () => {
    expect(lineIdentifiers(line("MILK", "036000291452"), STORE)).toEqual([
      { type: "barcode", storeId: null, value: "00036000291452", displayValue: "036000291452" },
      { type: "name", storeId: STORE, value: "milk", displayValue: "MILK" },
    ]);
    expect(lineIdentifiers(line("MILK", "4417"), STORE).map((i) => i.type)).toEqual(["code", "name"]);
  });

  it("offers only a barcode before the store is known", () => {
    expect(lineIdentifiers(line("MILK", "036000291452"), null).map((i) => i.type)).toEqual(["barcode"]);
    expect(lineIdentifiers(line("MILK", "4417"), null)).toEqual([]);
  });

  it("offers a fee line's printed name only, never its code (the core charge bug)", () => {
    expect(lineIdentifiers(line("CORE CHARGE", "036000291452", "fee"), STORE)).toEqual([
      { type: "name", storeId: STORE, value: "core charge", displayValue: "CORE CHARGE" },
    ]);
  });
});

describe("identifyItem", () => {
  const milkCode = lineIdentifiers(line("GV WHL MLK GAL", "4417"), STORE);

  it("matches by barcode first, at any company", () => {
    const barcode = lineIdentifiers(line("MILK", "036000291452"), OTHER_STORE);
    const savedBarcode = lineIdentifiers(line("WHOLE MILK", "036000291452"), STORE)[0];
    if (savedBarcode === undefined) throw new Error("no barcode");
    expect(identifyItem(barcode, [saved(MILK, savedBarcode)])).toEqual({
      itemId: MILK,
      matchedBy: "barcode",
    });
  });

  it("matches by code when the printed text differs", () => {
    const [code] = milkCode;
    if (code === undefined) throw new Error("no code");
    const other = lineIdentifiers(line("GV WHOLE MILK 1GAL", "4417"), STORE);
    expect(identifyItem(other, [saved(MILK, code)])).toEqual({ itemId: MILK, matchedBy: "code" });
  });

  it("takes the first type that hits, even if a later one points elsewhere", () => {
    const [code, name] = milkCode;
    if (code === undefined || name === undefined) throw new Error("missing");
    expect(identifyItem(milkCode, [saved(MILK, code), saved(BREAD, name)])).toEqual({
      itemId: MILK,
      matchedBy: "code",
    });
  });

  it("applies nothing when one type points to two items, or the hit is ambiguous", () => {
    const [, name] = milkCode;
    if (name === undefined) throw new Error("missing");
    const codeForBread = { type: "code" as const, storeId: STORE, value: "4417", displayValue: "4417" };
    const codeForMilk = { ...codeForBread, displayValue: "4-417" };
    expect(
      identifyItem(milkCode, [saved(MILK, codeForMilk), saved(BREAD, codeForBread), saved(MILK, name)]),
    ).toBeUndefined();
    expect(identifyItem([name], [saved(MILK, name, "ambiguous")])).toBeUndefined();
  });

  it("never matches a code or printed name from another store", () => {
    const [code] = milkCode;
    if (code === undefined) throw new Error("missing");
    expect(
      identifyItem(lineIdentifiers(line("X", "4417"), OTHER_STORE), [saved(MILK, code)]),
    ).toBeUndefined();
  });

  it("keeps a fee line off the item whose code it shares", () => {
    const battery = lineIdentifiers(line("CAR BATTERY 24F", "8812"), STORE);
    const coreCharge = lineIdentifiers(line("CORE CHARGE", "8812", "fee"), STORE);
    expect(
      identifyItem(
        coreCharge,
        battery.map((i) => saved(BATTERY, i)),
      ),
    ).toBeUndefined();
  });
});

describe("planItemLearning", () => {
  const milk = lineIdentifiers(line("GV WHL MLK GAL", "4417"), STORE);

  it("saves each line's identifiers for its item, and counts them seen next time", () => {
    expect(
      planItemLearning({
        lines: [{ itemId: MILK, identifiers: milk, alreadyCounted: false }],
        saved: [],
        answers: new Map(),
      }),
    ).toEqual({
      kind: "changes",
      changes: milk.map((identifier) => ({ kind: "insert", itemId: MILK, identifier })),
    });
    const rows = milk.map((i) => saved(MILK, i));
    expect(
      planItemLearning({
        lines: [{ itemId: MILK, identifiers: milk, alreadyCounted: false }],
        saved: rows,
        answers: new Map(),
      }),
    ).toEqual({
      kind: "changes",
      changes: rows.map((row) => ({ kind: "seen", rowId: row.id })),
    });
  });

  it("asks before moving an identifier to a line's different item, and moves it when told to", () => {
    const rows = milk.map((i) => saved(BREAD, i));
    const plan = planItemLearning({
      lines: [{ itemId: MILK, identifiers: milk, alreadyCounted: false }],
      saved: rows,
      answers: new Map(),
    });
    expect(plan).toMatchObject({
      kind: "questions",
      questions: [{ savedForItemId: BREAD, movingToItemId: MILK }, {}],
    });
    const answers = new Map(rows.map((row) => [row.id, true]));
    expect(
      planItemLearning({
        lines: [{ itemId: MILK, identifiers: milk, alreadyCounted: false }],
        saved: rows,
        answers,
      }),
    ).toEqual({
      kind: "changes",
      changes: rows.map((row) => ({ kind: "move", rowId: row.id, itemId: MILK })),
    });
  });

  it("gives a detail printed on two lines to the first line's item only", () => {
    const [, name] = milk;
    if (name === undefined) throw new Error("missing");
    const plan = planItemLearning({
      lines: [
        { itemId: MILK, identifiers: [name], alreadyCounted: false },
        { itemId: BREAD, identifiers: [name], alreadyCounted: false },
      ],
      saved: [],
      answers: new Map(),
    });
    expect(plan).toEqual({ kind: "changes", changes: [{ kind: "insert", itemId: MILK, identifier: name }] });
  });

  it("doesn't count a re-saved line twice", () => {
    const rows = milk.map((i) => saved(MILK, i));
    expect(
      planItemLearning({
        lines: [{ itemId: MILK, identifiers: milk, alreadyCounted: true }],
        saved: rows,
        answers: new Map(),
      }),
    ).toEqual({
      kind: "changes",
      changes: [],
    });
  });
});
