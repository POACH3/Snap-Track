// The prompt's JSON template must name exactly the fields the reply is validated against.
import {
  ExtractedLine,
  ExtractedPayment,
  ExtractedReceipt,
  ExtractedStore,
  ExtractedTaxLine,
  ExtractedTransactionNumber,
} from "@snaptrack/contracts";
import { describe, expect, it } from "vitest";
import { RESPONSE_TEMPLATE, SYSTEM_PROMPT, userText } from "./prompt.ts";

const keys = (value: object) => Object.keys(value).sort();

describe("prompt", () => {
  it("lists every field of the extraction schema, and no others", () => {
    expect(keys(RESPONSE_TEMPLATE)).toEqual(keys(ExtractedReceipt.shape));
    expect(keys(RESPONSE_TEMPLATE.store)).toEqual(keys(ExtractedStore.shape));
    expect(keys(RESPONSE_TEMPLATE.lines[0] ?? {})).toEqual(keys(ExtractedLine.shape));
    expect(keys(RESPONSE_TEMPLATE.payments[0] ?? {})).toEqual(keys(ExtractedPayment.shape));
    expect(keys(RESPONSE_TEMPLATE.taxLines[0] ?? {})).toEqual(keys(ExtractedTaxLine.shape));
    expect(keys(RESPONSE_TEMPLATE.transactionNumbers[0] ?? {})).toEqual(
      keys(ExtractedTransactionNumber.shape),
    );
  });

  it("includes the template and the key rules", () => {
    expect(SYSTEM_PROMPT).toContain('"rawText"');
    expect(SYSTEM_PROMPT).toContain("Never guess or invent");
    expect(SYSTEM_PROMPT).toContain("consecutive parts of one long receipt");
  });

  it("tells the model when several photos make one receipt", () => {
    expect(userText(1)).toBe("Here is the receipt.");
    expect(userText(3)).toContain("These 3 photos are consecutive parts of one receipt");
  });
});
