import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GeminiRewriter } from "../src/geminiRewriter";
import type { Entry } from "../src/types";

describe("GeminiRewriter", () => {
  let mockAgent: MockAgent;
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

  const entries: Entry[] = [
    {
      type: "pull_request",
      number: 10,
      title: "Add checkout flow",
      body: "",
      url: "https://pr/10",
      author: "khoa",
    },
  ];

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  it("parses Gemini's JSON response into a categorized, single-language item by default", async () => {
    const geminiText =
      '[{"index":1,"category_key":"feature","texts":{"en":{"category":"New Features","description":"Added a new checkout step"}}}]';
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: geminiText }] } }] });

    const items = await new GeminiRewriter("key123").classify(entries);

    expect(items).toEqual([
      {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        texts: { en: { category: "New Features", description: "Added a new checkout step" } },
      },
    ]);
  });

  it("requests and parses multiple languages when configured", async () => {
    const geminiText =
      '[{"index":1,"category_key":"feature","texts":{' +
      '"en":{"category":"New Features","description":"Added a new checkout step"},' +
      '"vi":{"category":"Tính năng mới","description":"Thêm bước thanh toán mới"}' +
      "}}]";
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: geminiText }] } }] });

    const items = await new GeminiRewriter("key123", undefined, ["en", "vi"]).classify(entries);

    expect(items[0].texts.en.description).toBe("Added a new checkout step");
    expect(items[0].texts.vi.description).toBe("Thêm bước thanh toán mới");
  });

  it("throws when the response cannot be parsed as JSON", async () => {
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: "not json" }] } }] });

    await expect(new GeminiRewriter("key123").classify(entries)).rejects.toThrow(/could not be parsed/);
  });

  it("returns an empty array without calling the API when there are no entries", async () => {
    await new GeminiRewriter("key123").classify([]);

    expect(mockAgent.pendingInterceptors()).toHaveLength(0);
  });
});
