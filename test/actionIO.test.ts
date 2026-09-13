import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBooleanInput } from "../src/actionIO";

describe("getBooleanInput", () => {
  const envName = "INPUT_INCLUDE_IMAGES";
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[envName];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[envName];
    else process.env[envName] = original;
  });

  it("returns the default when the input is not set", () => {
    delete process.env[envName];
    expect(getBooleanInput("include_images", true)).toBe(true);
  });

  it("parses 'false' (case-insensitive)", () => {
    process.env[envName] = "FALSE";
    expect(getBooleanInput("include_images", true)).toBe(false);
  });

  it("parses 'true'", () => {
    process.env[envName] = "true";
    expect(getBooleanInput("include_images", false)).toBe(true);
  });

  it("throws on an invalid value", () => {
    process.env[envName] = "yes";
    expect(() => getBooleanInput("include_images", true)).toThrow(/must be 'true' or 'false'/);
  });
});
