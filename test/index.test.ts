import { afterEach, describe, expect, it } from "vitest";
import { normalizeFromRef, parseLanguages, readR2Config } from "../src/main";

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

describe("readR2Config", () => {
  const R2_INPUT_NAMES = [
    "INPUT_R2_ACCOUNT_ID",
    "INPUT_R2_ACCESS_KEY_ID",
    "INPUT_R2_SECRET_ACCESS_KEY",
    "INPUT_R2_BUCKET",
    "INPUT_R2_PUBLIC_URL",
  ];

  afterEach(() => {
    for (const name of R2_INPUT_NAMES) delete process.env[name];
  });

  it("returns undefined when none of the R2 inputs are set", () => {
    expect(readR2Config()).toBeUndefined();
  });

  it("returns the config when all R2 inputs are set", () => {
    process.env.INPUT_R2_ACCOUNT_ID = "acct";
    process.env.INPUT_R2_ACCESS_KEY_ID = "key";
    process.env.INPUT_R2_SECRET_ACCESS_KEY = "secret";
    process.env.INPUT_R2_BUCKET = "bucket";
    process.env.INPUT_R2_PUBLIC_URL = "https://pub.r2.dev";

    expect(readR2Config()).toEqual({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
      publicBaseUrl: "https://pub.r2.dev",
    });
  });

  it("throws when only some R2 inputs are set", () => {
    process.env.INPUT_R2_ACCOUNT_ID = "acct";

    expect(() => readR2Config()).toThrow(/must all be set together/);
  });
});
