import { describe, expect, it } from "vitest";
import { dayBlock, paymentText, purchaseText } from "./receipt-format.ts";

describe("receipt dates and payments as shown", () => {
  it("uses the printed date, with or without a time", () => {
    expect(dayBlock("2026-11-14", "2026-11-15T10:00:00.000Z")).toMatchObject({ month: "NOV", day: "14" });
    expect(dayBlock("2026-11-04T17:42", "2026-11-15T10:00:00.000Z")).toMatchObject({ day: "04" });
    expect(purchaseText("2026-11-14", "2026-11-15T10:00:00.000Z")).not.toContain("·");
    expect(purchaseText("2026-11-14T17:42", "2026-11-15T10:00:00.000Z")).toContain("·");
  });

  it("falls back to when the photo was taken", () => {
    expect(dayBlock(null, "2026-03-09T12:00:00.000Z").month).toBe("MAR");
  });

  it("names a payment by card, or by method", () => {
    const card = {
      method: "card",
      cardBrand: "Visa",
      cardType: "credit" as const,
      last4: "4821",
      amountCents: 1,
      approvalCode: null,
    };
    expect(paymentText(card)).toBe("Visa credit ···· 4821");
    expect(paymentText({ ...card, cardBrand: null, cardType: null, last4: null, method: "cash" })).toBe(
      "Cash",
    );
  });
});
