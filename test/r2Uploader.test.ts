import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { R2Uploader } from "../src/r2Uploader";

describe("R2Uploader", () => {
  let mockAgent: MockAgent;
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

  const config = {
    accountId: "acct123",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "screenshots",
    publicBaseUrl: "https://pub-xxxx.r2.dev",
  };

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  it("PUTs the object to the R2 S3-compatible endpoint and returns its public URL", async () => {
    mockAgent
      .get("https://acct123.r2.cloudflarestorage.com")
      .intercept({ path: "/screenshots/foo.png", method: "PUT" })
      .reply(200, "");

    const url = await new R2Uploader(config).upload("foo.png", new TextEncoder().encode("bytes").buffer, "image/png");

    expect(url).toBe("https://pub-xxxx.r2.dev/foo.png");
  });

  it("throws with the response body when the upload fails", async () => {
    mockAgent
      .get("https://acct123.r2.cloudflarestorage.com")
      .intercept({ path: "/screenshots/foo.png", method: "PUT" })
      .reply(403, "AccessDenied");

    await expect(
      new R2Uploader(config).upload("foo.png", new TextEncoder().encode("bytes").buffer, "image/png")
    ).rejects.toThrow(/R2 upload failed: 403/);
  });
});
