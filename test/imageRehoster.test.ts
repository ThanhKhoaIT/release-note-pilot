import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageRehoster } from "../src/imageRehoster";
import { R2Uploader } from "../src/r2Uploader";
import type { ClassifiedItem } from "../src/types";

describe("ImageRehoster", () => {
  let mockAgent: MockAgent;
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

  const uploader = new R2Uploader({
    accountId: "acct123",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "screenshots",
    publicBaseUrl: "https://pub-xxxx.r2.dev",
  });

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  const item: ClassifiedItem = {
    categoryKey: "feature",
    number: 10,
    url: "https://pr/10",
    texts: { en: { category: "New Features", description: "Added a new checkout step" } },
    images: ["https://github.com/user-attachments/assets/abc123"],
  };

  it("downloads with GitHub auth and re-uploads to R2, replacing the URL", async () => {
    mockAgent
      .get("https://github.com")
      .intercept({ path: "/user-attachments/assets/abc123", method: "GET" })
      .reply(200, "fake-bytes", { headers: { "content-type": "image/png" } });

    mockAgent
      .get("https://acct123.r2.cloudflarestorage.com")
      .intercept({ path: /^\/screenshots\/release-note-pilot\/.+\.png$/, method: "PUT" })
      .reply(200, "");

    const rehoster = new ImageRehoster(uploader, "gh-token");
    const [result] = await rehoster.rehost([item]);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatch(/^https:\/\/pub-xxxx\.r2\.dev\/release-note-pilot\/.+\.png$/);
    // Non-image fields are untouched.
    expect(result.texts).toBe(item.texts);
  });

  it("drops the image (without throwing) when the GitHub download fails", async () => {
    mockAgent
      .get("https://github.com")
      .intercept({ path: "/user-attachments/assets/abc123", method: "GET" })
      .reply(404, "Not Found");

    const rehoster = new ImageRehoster(uploader, "gh-token");
    const [result] = await rehoster.rehost([item]);

    expect(result.images).toEqual([]);
  });

  it("drops the image (without throwing) when the R2 upload fails", async () => {
    mockAgent
      .get("https://github.com")
      .intercept({ path: "/user-attachments/assets/abc123", method: "GET" })
      .reply(200, "fake-bytes", { headers: { "content-type": "image/png" } });

    mockAgent
      .get("https://acct123.r2.cloudflarestorage.com")
      .intercept({ path: /^\/screenshots\/.+/, method: "PUT" })
      .reply(403, "AccessDenied");

    const rehoster = new ImageRehoster(uploader, "gh-token");
    const [result] = await rehoster.rehost([item]);

    expect(result.images).toEqual([]);
  });

  it("returns an empty images list untouched", async () => {
    const noImageItem: ClassifiedItem = { ...item, images: [] };
    const rehoster = new ImageRehoster(uploader, "gh-token");

    const [result] = await rehoster.rehost([noImageItem]);

    expect(result.images).toEqual([]);
    expect(mockAgent.pendingInterceptors()).toHaveLength(0);
  });
});
