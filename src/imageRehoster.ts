import { randomUUID } from "node:crypto";
import type { R2Uploader } from "./r2Uploader";
import type { ClassifiedItem } from "./types";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * GitHub's PR-attachment image URLs require an authenticated session and can't be fetched
 * directly by Slack. This downloads each image (authenticated with the GitHub token) and
 * re-uploads it to R2 so Slack gets a plain, publicly reachable URL instead.
 */
export class ImageRehoster {
  constructor(
    private readonly uploader: R2Uploader,
    private readonly githubToken: string
  ) {}

  async rehost(items: ClassifiedItem[]): Promise<ClassifiedItem[]> {
    return Promise.all(
      items.map(async (item) => ({
        ...item,
        images: await this.rehostAll(item.images),
      }))
    );
  }

  private async rehostAll(urls: string[]): Promise<string[]> {
    const rehosted = await Promise.all(urls.map((url) => this.rehostOne(url)));
    return rehosted.filter((url): url is string => url !== undefined);
  }

  private async rehostOne(url: string): Promise<string | undefined> {
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.githubToken}` } });
      if (!response.ok) {
        throw new Error(`download failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const key = `release-note-pilot/${randomUUID()}${EXTENSION_BY_CONTENT_TYPE[contentType] ?? ""}`;

      return await this.uploader.upload(key, await response.arrayBuffer(), contentType);
    } catch (err) {
      console.warn(`Skipping image ${url}: could not rehost to R2 (${(err as Error).message})`);
      return undefined;
    }
  }
}
