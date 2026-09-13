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
        images: [],
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
      '[{"index":1,"category_key":"improvement","texts":{"en":{"category":"Improvements","description":"Switched checkout to a new payment provider"}}}]';
    mockAgent
      .get("https://generativelanguage.googleapis.com")
      .intercept({ path: /\/v1beta\/models\/.*:generateContent.*/, method: "POST" })
      .reply(200, ({ body }) => {
        capturedBody = body as string;
        return { candidates: [{ content: { parts: [{ text: geminiText }] } }] };
      });

    const items = await new GeminiRewriter("key123").classify(entriesWithBody);

    const prompt = JSON.parse(capturedBody).contents[0].parts[0].text as string;
    expect(prompt).toContain("Title: Refactor checkout");
    expect(prompt).toContain("Description: Switches checkout to the new payment provider.\n\nCloses #42");
    expect(prompt).not.toContain("<!--");
    expect(prompt).not.toContain("![screenshot]");

    // Images are stripped from the text prompt but still carried through to the result.
    expect(items[0].images).toEqual(["https://example.com/shot.png"]);
  });
});
