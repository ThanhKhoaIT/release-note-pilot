import { describe, expect, it } from "vitest";
import { normalizeFromRef } from "../src/main";

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
