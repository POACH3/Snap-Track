import { ExtractedReceipt } from "@snaptrack/contracts";
import { describe, expect, it } from "vitest";
import { guessesFrom, numberLabels } from "./labels.ts";

const labels = numberLabels({
  categories: [
    { id: "groceries", path: "Groceries" },
    { id: "dairy", path: "Groceries › Dairy" },
  ],
  tags: [
    { id: "breakfast", name: "breakfast" },
    { id: "kids", name: "kids" },
  ],
});

describe("numbered labels", () => {
  it("numbers the hierarchy by full path and the tags from 1", () => {
    expect(labels.categoryLines).toEqual(["1: Groceries", "2: Groceries › Dairy"]);
    expect(labels.tagLines).toEqual(["1: breakfast", "2: kids"]);
  });

  it("maps the model's numbers back to ids, line by line", () => {
    const extracted = ExtractedReceipt.parse({
      lines: [{ category: 2, tags: [1, 2, 1] }, { tags: [] }],
    });
    expect(guessesFrom(extracted, labels)).toEqual([
      { suggestedCategoryId: "dairy", suggestedTagIds: ["breakfast", "kids"] },
      { suggestedCategoryId: null, suggestedTagIds: [] },
    ]);
  });

  it("drops numbers that are not on the lists", () => {
    const extracted = ExtractedReceipt.parse({ lines: [{ category: 9, tags: [0, 3, -1, 2] }] });
    expect(guessesFrom(extracted, labels)).toEqual([
      { suggestedCategoryId: null, suggestedTagIds: ["kids"] },
    ]);
  });
});
