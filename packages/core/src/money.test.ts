import { describe, expect, it } from "vitest";
import { allocateCents, dollarsToCents, formatUsd } from "./money.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("allocateCents", () => {
  it("splits in proportion when it divides evenly", () => {
    expect(allocateCents(600, [1, 2, 3])).toEqual({ ok: true, value: [100, 200, 300] });
  });

  it("gives leftover cents to the largest remainders, earlier weight first on ties", () => {
    expect(allocateCents(100, [1, 1, 1])).toEqual({ ok: true, value: [34, 33, 33] });
    expect(allocateCents(10, [3, 3, 4])).toEqual({ ok: true, value: [3, 3, 4] });
  });

  it("always adds up to the total exactly", () => {
    const cases: [number, number[]][] = [
      [1, [1, 1, 1]],
      [999, [7, 13, 1, 0, 40]],
      [87, [1234, 999, 1]],
      [-517, [250, 125, 125]],
    ];
    for (const [total, weights] of cases) {
      const result = allocateCents(total, weights);
      expect(result.ok && sum(result.value)).toBe(total);
    }
  });

  it("gives a zero weight nothing", () => {
    expect(allocateCents(50, [0, 1])).toEqual({ ok: true, value: [0, 50] });
  });

  it("splits a negative total (e.g. a receipt discount) the same way as a positive one", () => {
    expect(allocateCents(-100, [1, 1, 1])).toEqual({ ok: true, value: [-34, -33, -33] });
  });

  it("handles a zero total", () => {
    expect(allocateCents(0, [5, 5])).toEqual({ ok: true, value: [0, 0] });
  });

  it("refuses weights that cannot be split", () => {
    expect(allocateCents(100, [0, 0])).toEqual({ ok: false, error: "weights-sum-to-zero" });
    expect(allocateCents(100, [])).toEqual({ ok: false, error: "weights-sum-to-zero" });
    expect(allocateCents(100, [1, -1])).toEqual({ ok: false, error: "weights-negative" });
    expect(allocateCents(100, [1.5])).toEqual({ ok: false, error: "weights-not-integers" });
    expect(allocateCents(10.5, [1])).toEqual({ ok: false, error: "total-not-integer" });
  });
});

describe("formatUsd", () => {
  it("formats cents as dollars", () => {
    expect(formatUsd(1234)).toBe("$12.34");
    expect(formatUsd(5)).toBe("$0.05");
    expect(formatUsd(-250)).toBe("-$2.50");
  });
});

describe("dollarsToCents", () => {
  it("converts printed amounts exactly, removing floating-point noise", () => {
    expect(dollarsToCents(4.99)).toBe(499);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    expect(dollarsToCents(1234.5)).toBe(123450);
    expect(dollarsToCents(-5)).toBe(-500);
    expect(dollarsToCents(0)).toBe(0);
  });
});
