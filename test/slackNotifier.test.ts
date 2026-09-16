import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlackNotifier } from "../src/slackNotifier";
import type { ClassifiedItem, ClassificationResult } from "../src/types";

describe("SlackNotifier", () => {
  let mockAgent: MockAgent;
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  const bugfixEn: ClassifiedItem = {
    categoryKey: "bugfix",
    number: null,
    url: null,
    author: "khoa",
    texts: { en: { description: "Fixed a login issue" } },
    images: [],
  };

  function result(items: ClassifiedItem[], summary: Record<string, string> = {}): ClassificationResult {
    return { summary, items };
  }

  function capture(): { get: () => Record<string, unknown> } {
    let capturedBody = "{}";
    mockAgent
      .get("https://hooks.slack.com")
      .intercept({ path: "/services/xxx", method: "POST" })
      .reply(200, ({ body }) => {
        capturedBody = body as string;
        return "ok";
      });
    return { get: () => JSON.parse(capturedBody) };
  }

  describe("#post", () => {
    it("posts grouped blocks to the webhook", async () => {
      const client = mockAgent.get("https://hooks.slack.com");
      client.intercept({ path: "/services/xxx", method: "POST" }).reply(200, "ok");

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([bugfixEn]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      expect(mockAgent.pendingInterceptors()).toHaveLength(0);
    });

    it("does not call the webhook when there are no items", async () => {
      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      expect(mockAgent.pendingInterceptors()).toHaveLength(0);
    });

    it("renders the category with its fixed label and emoji, not Gemini-provided text", async () => {
      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([bugfixEn]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const text = JSON.stringify(payload.get());
      expect(text).toContain("🐛 Bug Fixes");
    });

    it("inlines the item on the category line when it's the only one in that category", async () => {
      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([bugfixEn]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const blocks = payload.get().blocks as Array<{ text?: { text?: string } }>;
      expect(blocks.some((b) => b.text?.text === "*🐛 Bug Fixes:* Fixed a login issue")).toBe(true);
    });

    it("keeps the category label on its own line with bullets when there are multiple items", async () => {
      const items: ClassifiedItem[] = [
        { ...bugfixEn, texts: { en: { description: "Fixed a login issue" } } },
        { ...bugfixEn, texts: { en: { description: "Fixed a checkout crash" } } },
      ];
      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result(items),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const blocks = payload.get().blocks as Array<{ text?: { text?: string } }>;
      expect(blocks.some((b) => b.text?.text === "*🐛 Bug Fixes*")).toBe(true);
      expect(blocks.some((b) => b.text?.text === "• Fixed a login issue\n• Fixed a checkout crash")).toBe(true);
    });

    it("includes the summary near the top when present", async () => {
      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([bugfixEn], { en: "One bug fix this release." }),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      expect(JSON.stringify(payload.get())).toContain("One bug fix this release.");
    });

    it("omits the summary block when none is provided for a language", async () => {
      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([bugfixEn]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const blocks = payload.get().blocks as Array<{ text?: { text?: string } }>;
      expect(blocks.some((b) => b.text?.text === "Fixed a login issue")).toBe(false);
    });

    it("adds a contributors block listing unique PR authors", async () => {
      const items: ClassifiedItem[] = [
        { ...bugfixEn, author: "khoa" },
        { ...bugfixEn, author: "alice" },
        { ...bugfixEn, author: "khoa" },
        { ...bugfixEn, author: null },
      ];
      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result(items),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const text = JSON.stringify(payload.get());
      expect(text).toContain("Contributors");
      expect(text).toContain("<https://github.com/khoa|@khoa>");
      expect(text).toContain("<https://github.com/alice|@alice>");
      expect((text.match(/@khoa/g) ?? []).length).toBe(1);
    });

    it("omits the contributors block when no item has an author", async () => {
      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([{ ...bugfixEn, author: null }]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      expect(JSON.stringify(payload.get())).not.toContain("Contributors");
    });

    it("posts one section per requested language, labeled with flag + full name", async () => {
      const bilingual: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        author: "khoa",
        texts: {
          en: { description: "Added a new checkout step" },
          vi: { description: "Thêm bước thanh toán mới" },
        },
        images: [],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([bilingual]),
        "lixibox/example",
        "abcdef1234567",
        ["en", "vi"]
      );

      const text = JSON.stringify(payload.get());
      expect(text).toContain("Added a new checkout step");
      expect(text).toContain("Thêm bước thanh toán mới");
      expect(text).toContain("🇬🇧 English");
      expect(text).toContain("🇻🇳 Vietnamese");
      expect(text).toContain("🆕 What's New");
      expect(text).toContain("🆕 Có gì mới");
    });

    it("falls back to the uppercase code for an unmapped language", async () => {
      const item: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        author: "khoa",
        texts: {
          en: { description: "Added a new checkout step" },
          xx: { description: "Xx description" },
        },
        images: [],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([item]),
        "lixibox/example",
        "abcdef1234567",
        ["en", "xx"]
      );

      expect(JSON.stringify(payload.get())).toContain("*XX*");
    });

    it("groups items with screenshots into a carousel of cards", async () => {
      const withImages: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        author: "khoa",
        texts: { en: { description: "Added a new checkout step" } },
        images: ["https://example.com/1.png"],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([withImages]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const blocks = payload.get().blocks as Array<{ type: string; elements?: Array<{ type: string }> }>;
      const carousels = blocks.filter((b) => b.type === "carousel");

      expect(carousels).toHaveLength(1);
      expect(carousels[0].elements).toHaveLength(1);
      expect(carousels[0].elements?.[0]).toMatchObject({ type: "card" });
    });

    it("splits more than 10 image items into multiple carousels", async () => {
      const items: ClassifiedItem[] = Array.from({ length: 12 }, (_, i) => ({
        categoryKey: "feature",
        number: i,
        url: `https://pr/${i}`,
        author: "khoa",
        texts: { en: { description: `Change ${i}` } },
        images: [`https://example.com/${i}.png`],
      }));

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result(items),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const blocks = payload.get().blocks as Array<{ type: string; elements?: unknown[] }>;
      const carousels = blocks.filter((b) => b.type === "carousel");

      expect(carousels).toHaveLength(2);
      expect(carousels[0].elements).toHaveLength(10);
      expect(carousels[1].elements).toHaveLength(2);
    });

    it("skips carousels and folds items back into the text list when includeImages is false", async () => {
      const withImages: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        author: "khoa",
        texts: { en: { description: "Added a new checkout step" } },
        images: ["https://example.com/1.png"],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([withImages]),
        "lixibox/example",
        "abcdef1234567",
        ["en"],
        false
      );

      const body = payload.get();
      const blocks = body.blocks as Array<{ type: string }>;
      expect(blocks.filter((b) => b.type === "carousel")).toHaveLength(0);
      expect(JSON.stringify(body)).toContain("Added a new checkout step");
    });

    it("drops non-https or overlong image URLs and treats the item as text-only", async () => {
      const withBadImages: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        author: "khoa",
        texts: { en: { description: "Added a new checkout step" } },
        images: ["http://example.com/insecure.png", `https://example.com/${"a".repeat(3000)}.png`],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([withBadImages]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const blocks = payload.get().blocks as Array<{ type: string }>;
      expect(blocks.filter((b) => b.type === "carousel")).toHaveLength(0);
    });

    it("retries without images when Slack rejects the payload with invalid_blocks", async () => {
      const withImages: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        author: "khoa",
        texts: { en: { description: "Added a new checkout step" } },
        images: ["https://example.com/1.png"],
      };

      const client = mockAgent.get("https://hooks.slack.com");
      client.intercept({ path: "/services/xxx", method: "POST" }).reply(400, "invalid_blocks");

      let retryBody: string | undefined;
      client.intercept({ path: "/services/xxx", method: "POST" }).reply(200, ({ body }) => {
        retryBody = body as string;
        return "ok";
      });

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        result([withImages]),
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const payload = JSON.parse(retryBody ?? "{}");
      expect(payload.blocks.filter((b: { type: string }) => b.type === "carousel")).toHaveLength(0);
    });
  });
});
