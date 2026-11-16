import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolveTheme } from "./theme.ts";

describe("parseThemeChoice", () => {
  it("keeps a saved Dark or Light", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("light")).toBe("light");
  });

  it("means System when nothing, or something unknown, is saved", () => {
    expect(parseThemeChoice(null)).toBe("system");
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice("sepia")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the device when the choice is System", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });

  it("uses an explicit choice whatever the device prefers", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });
});
