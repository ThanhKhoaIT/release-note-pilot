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
  };

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

    it("posts one section per requested language", async () => {
      const bilingual: ClassifiedItem = {
        categoryKey: "feature",
        number: 10,
        url: "https://pr/10",
        texts: {
          en: { category: "New Features", description: "Added a new checkout step" },
          vi: { category: "Tính năng mới", description: "Thêm bước thanh toán mới" },
        },
      };

      let capturedBody: string | undefined;
      mockAgent
        .get("https://hooks.slack.com")
        .intercept({ path: "/services/xxx", method: "POST" })
        .reply(200, ({ body }) => {
          capturedBody = body as string;
          return "ok";
        });

      await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
        [bilingual],
        "lixibox/example",
        "abcdef1234567",
        ["en", "vi"]
      );

      const payload = JSON.parse(capturedBody ?? "{}");
      const text = JSON.stringify(payload);
      expect(text).toContain("Added a new checkout step");
      expect(text).toContain("Thêm bước thanh toán mới");
    });
  });
});
