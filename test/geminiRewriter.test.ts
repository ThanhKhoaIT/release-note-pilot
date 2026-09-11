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

  it("parses Gemini's JSON response into categorized items", async () => {
    const geminiText = '[{"index":1,"category":"Tính năng mới","description":"Thêm bước thanh toán mới"}]';
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: geminiText }] } }] });

    const items = await new GeminiRewriter("key123").classify(entries);

    expect(items).toEqual([
      { category: "Tính năng mới", description: "Thêm bước thanh toán mới", number: 10, url: "https://pr/10" },
    ]);
  });

  it("throws when the response cannot be parsed as JSON", async () => {
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: "not json" }] } }] });

    await expect(new GeminiRewriter("key123").classify(entries)).rejects.toThrow(/could not be parsed/);
  });

  it("returns an empty array without calling the API when there are no entries", async () => {
    mockAgent.disableNetConnect();

    const items = await new GeminiRewriter("key123").classify([]);

    expect(items).toEqual([]);
  });
});
