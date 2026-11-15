import { describe, expect, it } from "vitest";
import { ONE, toMilli } from "./quantity.ts";

describe("toMilli", () => {
  it("stores quantities exactly in thousandths", () => {
    expect(toMilli(2.31)).toBe(2310);
    expect(toMilli(1)).toBe(ONE);
    expect(toMilli(0.455)).toBe(455);
    expect(toMilli(12)).toBe(12000);
  });
});
