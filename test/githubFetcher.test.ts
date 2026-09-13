import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GithubFetcher } from "../src/githubFetcher";

const REPO = "lixibox/example";

describe("GithubFetcher", () => {
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

  it("groups commits under their merged pull request, deduplicated by PR number", async () => {
    const client = mockAgent.get("https://api.github.com");
    client.intercept({ path: `/repos/${REPO}/compare/abc...def`, method: "GET" }).reply(200, {
      commits: [{ sha: "c1" }, { sha: "c2" }],
    });

    const prPayload = [
      {
        number: 10,
        title: "Add checkout flow",
        body: "desc",
        html_url: `https://github.com/${REPO}/pull/10`,
        merged_at: "2026-01-01T00:00:00Z",
        user: { login: "khoa" },
      },
    ];
    client.intercept({ path: `/repos/${REPO}/commits/c1/pulls`, method: "GET" }).reply(200, prPayload);
    client.intercept({ path: `/repos/${REPO}/commits/c2/pulls`, method: "GET" }).reply(200, prPayload);

    const entries = await new GithubFetcher(REPO, "token123").entriesBetween("abc", "def");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "pull_request", number: 10, title: "Add checkout flow" });
  });

  it("falls back to the commit message when no pull request is associated", async () => {
    const client = mockAgent.get("https://api.github.com");
    client.intercept({ path: `/repos/${REPO}/compare/abc...def`, method: "GET" }).reply(200, {
      commits: [
        {
          sha: "c1",
          commit: { message: "Fix typo\n\nmore detail" },
          html_url: `https://github.com/${REPO}/commit/c1`,
        },
      ],
    });
    client.intercept({ path: `/repos/${REPO}/commits/c1/pulls`, method: "GET" }).reply(200, []);

    const entries = await new GithubFetcher(REPO, "token123").entriesBetween("abc", "def");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "commit", title: "Fix typo" });
  });

  it("extracts markdown and HTML image URLs from the PR body", async () => {
    const client = mockAgent.get("https://api.github.com");
    client.intercept({ path: `/repos/${REPO}/compare/abc...def`, method: "GET" }).reply(200, {
      commits: [{ sha: "c1" }],
    });

    const prPayload = [
      {
        number: 10,
        title: "Add checkout flow",
        body:
          "Before/after:\n" +
          "![before](https://example.com/before.png)\n" +
          '<img src="https://example.com/after.png" alt="after">',
        html_url: `https://github.com/${REPO}/pull/10`,
        merged_at: "2026-01-01T00:00:00Z",
        user: { login: "khoa" },
      },
    ];
    client.intercept({ path: `/repos/${REPO}/commits/c1/pulls`, method: "GET" }).reply(200, prPayload);

    const entries = await new GithubFetcher(REPO, "token123").entriesBetween("abc", "def");

    expect(entries[0].images).toEqual(["https://example.com/before.png", "https://example.com/after.png"]);
  });

  it("drops image URLs that are not absolute http(s) links", async () => {
    const client = mockAgent.get("https://api.github.com");
    client.intercept({ path: `/repos/${REPO}/compare/abc...def`, method: "GET" }).reply(200, {
      commits: [{ sha: "c1" }],
    });

    const prPayload = [
      {
        number: 10,
        title: "Add checkout flow",
        body:
          "![relative](/assets/shot.png)\n" +
          "![data](data:image/png;base64,aGVsbG8=)\n" +
          "![ok](https://example.com/shot.png)",
        html_url: `https://github.com/${REPO}/pull/10`,
        merged_at: "2026-01-01T00:00:00Z",
        user: { login: "khoa" },
      },
    ];
    client.intercept({ path: `/repos/${REPO}/commits/c1/pulls`, method: "GET" }).reply(200, prPayload);

    const entries = await new GithubFetcher(REPO, "token123").entriesBetween("abc", "def");

    expect(entries[0].images).toEqual(["https://example.com/shot.png"]);
  });

  it("returns an empty array when there are no commits in range", async () => {
    const client = mockAgent.get("https://api.github.com");
    client.intercept({ path: `/repos/${REPO}/compare/abc...abc`, method: "GET" }).reply(200, { commits: [] });

    const entries = await new GithubFetcher(REPO, "token123").entriesBetween("abc", "abc");

    expect(entries).toEqual([]);
  });
});
