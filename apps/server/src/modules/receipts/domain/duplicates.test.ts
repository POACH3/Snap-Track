import { describe, expect, it } from "vitest";
import { findDuplicates, pairKey, type DuplicateFacts } from "./duplicates.ts";

const base: DuplicateFacts = {
  id: "a",
  storeId: "store",
  purchasedAt: "2026-11-13T17:42",
  totalCents: 700,
  transactionNumbers: [{ label: "TRN", value: "0044-71" }],
  payments: [{ approvalCode: "AB12", last4: "4821" }],
  imageHashes: ["hash-a"],
};
const other = (change: Partial<DuplicateFacts>): DuplicateFacts => ({
  ...base,
  id: "b",
  purchasedAt: null,
  totalCents: null,
  transactionNumbers: [],
  payments: [],
  imageHashes: [],
  ...change,
});

describe("findDuplicates", () => {
  it("is definite when a transaction number matches at the same store, ignoring case, spaces and dashes", () => {
    expect(findDuplicates(base, [other({ transactionNumbers: [{ label: null, value: "004471" }] })])).toEqual(
      [{ id: "b", kind: "definite", reason: "transaction_number", detail: "004471" }],
    );
  });

  it("is definite when an approval code and the card's last four both match", () => {
    expect(findDuplicates(base, [other({ payments: [{ approvalCode: "ab12", last4: "4821" }] })])).toEqual([
      { id: "b", kind: "definite", reason: "approval_code", detail: "ab12" },
    ]);
    expect(findDuplicates(base, [other({ payments: [{ approvalCode: "AB12", last4: "0000" }] })])).toEqual(
      [],
    );
  });

  it("is definite for the same photo, whatever the store", () => {
    expect(findDuplicates(base, [other({ storeId: null, imageHashes: ["hash-a"] })])).toEqual([
      { id: "b", kind: "definite", reason: "same_photo", detail: null },
    ]);
  });

  it("is possible with the same date, time and total; a missing time on either side still counts", () => {
    const same = other({ purchasedAt: "2026-11-13T17:42", totalCents: 700 });
    expect(findDuplicates(base, [same])[0]).toMatchObject({ kind: "possible", reason: "same_details" });
    expect(findDuplicates(base, [other({ purchasedAt: "2026-11-13", totalCents: 700 })])).toHaveLength(1);
    expect(findDuplicates(base, [other({ purchasedAt: "2026-11-13T09:00", totalCents: 700 })])).toEqual([]);
    expect(findDuplicates(base, [other({ purchasedAt: "2026-11-13T17:42", totalCents: 701 })])).toEqual([]);
  });

  it("never compares other stores, or a receipt with no store, except by photo", () => {
    const twin = {
      transactionNumbers: base.transactionNumbers,
      purchasedAt: base.purchasedAt,
      totalCents: 700,
    };
    expect(findDuplicates(base, [other({ ...twin, storeId: "elsewhere" })])).toEqual([]);
    expect(findDuplicates({ ...base, storeId: null }, [other({ ...twin, storeId: null })])).toEqual([]);
  });

  it("leaves out itself and dismissed pairs, and lists definite first", () => {
    const possible = other({ id: "p", purchasedAt: base.purchasedAt, totalCents: 700 });
    const definite = other({ id: "d", transactionNumbers: base.transactionNumbers });
    expect(findDuplicates(base, [base, possible, definite]).map((d) => d.id)).toEqual(["d", "p"]);
    expect(findDuplicates(base, [possible, definite], new Set(["d"])).map((d) => d.id)).toEqual(["p"]);
  });

  it("keys a pair the same way round", () => {
    expect(pairKey("b", "a")).toEqual(["a", "b"]);
    expect(pairKey("a", "b")).toEqual(["a", "b"]);
  });
});
