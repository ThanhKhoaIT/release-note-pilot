import { describe, expect, it } from "vitest";
import { normalizeFromRef, parseLanguages } from "../src/main";

describe("normalizeFromRef", () => {
  it("returns the given ref unchanged", () => {
    expect(normalizeFromRef("abc123", "def456")).toBe("abc123");
  });

  it("falls back to the parent of `to` when `from` is all zeros", () => {
    expect(normalizeFromRef("0000000000000000000000000000000000000000", "def456")).toBe("def456^");
  });

  it("falls back to the parent of `to` when `from` is empty", () => {
    expect(normalizeFromRef("", "def456")).toBe("def456^");
  });
});

describe("parseLanguages", () => {
  it("defaults to English when nothing is configured", () => {
    expect(parseLanguages("")).toEqual(["en"]);
  });

  it("splits, trims, and lowercases a comma-separated list", () => {
    expect(parseLanguages(" EN, vi ,ja")).toEqual(["en", "vi", "ja"]);
  });

  it("ignores empty entries", () => {
    expect(parseLanguages("en,,vi,")).toEqual(["en", "vi"]);
  });
});
