import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlackNotifier } from "../src/slackNotifier";

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

  it("posts grouped blocks to the webhook", async () => {
    const client = mockAgent.get("https://hooks.slack.com");
    client.intercept({ path: "/services/xxx", method: "POST" }).reply(200, "ok");

    await new SlackNotifier("https://hooks.slack.com/services/xxx").post(
      [{ category: "Sửa lỗi", description: "Sửa lỗi đăng nhập", number: null, url: null }],
      "lixibox/example",
      "abcdef1234567"
    );

    expect(mockAgent.pendingInterceptors()).toHaveLength(0);
  });

  it("does not call the webhook when there are no items", async () => {
    mockAgent.disableNetConnect();

    await new SlackNotifier("https://hooks.slack.com/services/xxx").post([], "lixibox/example", "abcdef1234567");
  });
});
