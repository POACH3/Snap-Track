import { describe, expect, it } from "vitest";
import { effectiveCategory, lineTags, pendingSuggestion } from "./classification.ts";

describe("effectiveCategory", () => {
  it("takes this purchase's category first", () => {
    expect(effectiveCategory({ line: "l", item: "i", store: "s" })).toEqual({
      categoryId: "l",
      source: "line",
    });
  });
  it("then the item's", () => {
    expect(effectiveCategory({ line: null, item: "i", store: "s" })).toEqual({
      categoryId: "i",
      source: "item",
    });
  });
  it("then the store's default", () => {
    expect(effectiveCategory({ line: null, item: null, store: "s" })).toEqual({
      categoryId: "s",
      source: "store",
    });
  });
  it("is Unclassified when none is set", () => {
    expect(effectiveCategory({ line: null, item: null, store: null })).toBeNull();
  });
});

describe("lineTags", () => {
  it("keeps the item's tags and the line's own apart, without repeats", () => {
    expect(lineTags(["a", "b", "a"], ["b", "c", "c"])).toEqual({ fromItem: ["a", "b"], fromLine: ["c"] });
  });
});

describe("pendingSuggestion", () => {
  const base = {
    effective: null,
    suggestedCategoryId: "cat",
    suggestedTagIds: ["t1", "t2"],
    tagIds: [],
    outcome: null,
    usable: () => true,
  };

  it("shows the category and tags of an Unclassified line", () => {
    expect(pendingSuggestion(base)).toEqual({ categoryId: "cat", tagIds: ["t1", "t2"] });
  });

  it("stays silent about the category when a user-set one applies at any level", () => {
    for (const source of ["line", "item", "store"] as const) {
      expect(pendingSuggestion({ ...base, effective: { categoryId: "x", source } })).toEqual({
        categoryId: null,
        tagIds: ["t1", "t2"],
      });
    }
  });

  it("leaves out tags the line already has, and unusable entries", () => {
    expect(pendingSuggestion({ ...base, tagIds: ["t1"], usable: (id) => id !== "cat" })).toEqual({
      categoryId: null,
      tagIds: ["t2"],
    });
  });

  it("shows nothing once accepted or dismissed, or when nothing is left", () => {
    expect(pendingSuggestion({ ...base, outcome: "dismissed" })).toBeNull();
    expect(pendingSuggestion({ ...base, outcome: "accepted" })).toBeNull();
    expect(
      pendingSuggestion({ ...base, effective: { categoryId: "x", source: "line" }, tagIds: ["t1", "t2"] }),
    ).toBeNull();
  });
});
