import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlackNotifier } from "../src/slackNotifier";
import type { ClassifiedItem } from "../src/types";

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
    texts: { en: { category: "Bug Fixes", description: "Fixed a login issue" } },
    images: [],
  };

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
        [bugfixEn],
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      expect(mockAgent.pendingInterceptors()).toHaveLength(0);
    });

    it("does not call the webhook when there are no items", async () => {
      await new SlackNotifier("https://hooks.slack.com/services/xxx").post([], "lixibox/example", "abcdef1234567", [
        "en",
      ]);

      expect(mockAgent.pendingInterceptors()).toHaveLength(0);
    });

    it("posts one section per requested language, labeled with flag + full name", async () => {
      const bilingual: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        texts: {
          en: { category: "New Features", description: "Added a new checkout step" },
          vi: { category: "Tính năng mới", description: "Thêm bước thanh toán mới" },
        },
        images: [],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        [bilingual],
        "lixibox/example",
        "abcdef1234567",
        ["en", "vi"]
      );

      const text = JSON.stringify(payload.get());
      expect(text).toContain("Added a new checkout step");
      expect(text).toContain("Thêm bước thanh toán mới");
      expect(text).toContain("🇬🇧 English");
      expect(text).toContain("🇻🇳 Vietnamese");
    });

    it("falls back to the uppercase code for an unmapped language", async () => {
      const item: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        texts: {
          en: { category: "New Features", description: "Added a new checkout step" },
          xx: { category: "New Features", description: "Xx description" },
        },
        images: [],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        [item],
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
        texts: { en: { category: "New Features", description: "Added a new checkout step" } },
        images: ["https://example.com/1.png"],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        [withImages],
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
        texts: { en: { category: "New Features", description: `Change ${i}` } },
        images: [`https://example.com/${i}.png`],
      }));

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        items,
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
        texts: { en: { category: "New Features", description: "Added a new checkout step" } },
        images: ["https://example.com/1.png"],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        [withImages],
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
        texts: { en: { category: "New Features", description: "Added a new checkout step" } },
        images: ["http://example.com/insecure.png", `https://example.com/${"a".repeat(3000)}.png`],
      };

      const payload = capture();

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        [withBadImages],
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
        texts: { en: { category: "New Features", description: "Added a new checkout step" } },
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
        [withImages],
        "lixibox/example",
        "abcdef1234567",
        ["en"]
      );

      const payload = JSON.parse(retryBody ?? "{}");
      expect(payload.blocks.filter((b: { type: string }) => b.type === "carousel")).toHaveLength(0);
    });
  });
});
