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
      images: [],
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

  it("parses Gemini's JSON response into a summary + categorized, single-language item by default", async () => {
    const geminiText =
      '{"summary":{"en":"One checkout improvement this release."},' +
      '"items":[{"index":1,"category_key":"feature","texts":{"en":{"descriptions":["Added a new checkout step"]}}}]}';
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: geminiText }] } }] });

    const result = await new GeminiRewriter("key123").classify(entries);

    expect(result.summary).toEqual({ en: "One checkout improvement this release." });
    expect(result.items).toEqual([
      {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        author: "khoa",
        texts: { en: { descriptions: ["Added a new checkout step"] } },
        images: [],
      },
    ]);
  });

  it("requests and parses multiple languages when configured", async () => {
    const geminiText =
      '{"summary":{"en":"Summary","vi":"Tóm tắt"},"items":[{"index":1,"category_key":"feature","texts":{' +
      '"en":{"descriptions":["Added a new checkout step"]},' +
      '"vi":{"descriptions":["Thêm bước thanh toán mới"]}' +
      "}}]}";
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: geminiText }] } }] });

    const result = await new GeminiRewriter("key123", undefined, ["en", "vi"]).classify(entries);

    expect(result.items[0].texts.en.descriptions).toEqual(["Added a new checkout step"]);
    expect(result.items[0].texts.vi.descriptions).toEqual(["Thêm bước thanh toán mới"]);
    expect(result.summary.vi).toBe("Tóm tắt");
  });

  it("throws when the response cannot be parsed as JSON", async () => {
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: "not json" }] } }] });

    await expect(new GeminiRewriter("key123").classify(entries)).rejects.toThrow(/could not be parsed/);
  });

  it("returns an empty summary/items without calling the API when there are no entries", async () => {
    const result = await new GeminiRewriter("key123").classify([]);

    expect(result).toEqual({ summary: {}, items: [] });
    expect(mockAgent.pendingInterceptors()).toHaveLength(0);
  });

  it("includes a cleaned PR description in the prompt sent to Gemini", async () => {
    const entriesWithBody: Entry[] = [
      {
        type: "pull_request",
        number: 11,
        title: "Refactor checkout",
        body:
          "<!-- please describe your change -->\n" +
          "Switches checkout to the new payment provider.\n\n\n\n" +
          "![screenshot](https://example.com/shot.png)\n" +
          "Closes #42",
        url: "https://pr/11",
        author: "khoa",
        images: ["https://example.com/shot.png"],
      },
    ];

    let capturedBody = "";
    const geminiText =
      '{"summary":{"en":"Summary"},"items":[{"index":1,"category_key":"improvement",' +
      '"texts":{"en":{"descriptions":["Switched checkout to a new payment provider"]}}}]}';
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, ({ body }) => {
        capturedBody = body as string;
        return { candidates: [{ content: { parts: [{ text: geminiText }] } }] };
      });

    const result = await new GeminiRewriter("key123").classify(entriesWithBody);

    const prompt = JSON.parse(capturedBody).contents[0].parts[0].text as string;
    expect(prompt).toContain("Title: Refactor checkout");
    expect(prompt).toContain("Description: Switches checkout to the new payment provider.\n\nCloses #42");
    expect(prompt).not.toContain("<!--");
    expect(prompt).not.toContain("![screenshot]");

    // Images are stripped from the text prompt but still carried through to the result.
    expect(result.items[0].images).toEqual(["https://example.com/shot.png"]);
    expect(result.items[0].author).toBe("khoa");
  });

  it("carries through multiple short bullet points when one item bundles several changes", async () => {
    const geminiText =
      '{"summary":{"en":"Summary"},"items":[{"index":1,"category_key":"feature","texts":{"en":{"descriptions":[' +
      '"Added a hidden approve/reject option for admins",' +
      '"Auto-cancels stale booking links",' +
      '"Extended candidate proposal rights to Hiring Managers"' +
      "]}}}]}";
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, { candidates: [{ content: { parts: [{ text: geminiText }] } }] });

    const result = await new GeminiRewriter("key123").classify(entries);

    expect(result.items[0].texts.en.descriptions).toHaveLength(3);
    expect(result.items[0].texts.en.descriptions[1]).toBe("Auto-cancels stale booking links");
  });
});
