import type { CategoryKey, ClassifiedItem } from "./types";

const CATEGORY_ORDER: CategoryKey[] = ["feature", "improvement", "bugfix", "other"];
const MAX_IMAGES_PER_ITEM = 3;

// https://api.slack.com/reference/block-kit/blocks
const MAX_HEADER_LENGTH = 150;
const MAX_SECTION_LENGTH = 3000;
const MAX_CONTEXT_LENGTH = 2000;
const MAX_ALT_TEXT_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 3000;

/** Posts categorized, multi-language release note items to a Slack channel via an Incoming Webhook. */
export class SlackNotifier {
  constructor(private readonly webhookUrl: string) {}

  async post(
    items: ClassifiedItem[],
    repo: string,
    toRef: string,
    languages: string[],
    includeImages = true
  ): Promise<void> {
    if (items.length === 0) return;

    try {
      await this.send(this.buildBlocks(items, repo, toRef, languages, includeImages));
    } catch (err) {
      // A malformed/unreachable image URL is the most likely cause of Slack rejecting the
      // whole payload — degrade to a text-only note rather than losing the release note entirely.
      if (includeImages && err instanceof Error && err.message.includes("invalid_blocks")) {
        console.warn(`Slack rejected the message with images (${err.message}); retrying without images.`);
        await this.send(this.buildBlocks(items, repo, toRef, languages, false));
        return;
      }
      throw err;
    }
  }

  private async send(blocks: unknown[]): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook request failed: ${response.status} ${await response.text()}`);
    }
  }

  private buildBlocks(
    items: ClassifiedItem[],
    repo: string,
    toRef: string,
    languages: string[],
    includeImages: boolean
  ): unknown[] {
    const blocks: unknown[] = [
      { type: "header", text: { type: "plain_text", text: truncate(`🚀 Release Notes — ${repo}`, MAX_HEADER_LENGTH) } },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: truncate(`Deploy: \`${toRef.slice(0, 7)}\``, MAX_CONTEXT_LENGTH) }],
      },
    ];

    for (const lang of languages) {
      blocks.push({ type: "divider" });
      if (languages.length > 1) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${lang.toUpperCase()}*` } });
      }
      blocks.push(...this.languageSections(items, lang, includeImages));
    }

    return blocks;
  }

  private languageSections(items: ClassifiedItem[], lang: string, includeImages: boolean): unknown[] {
    const grouped = new Map<CategoryKey, ClassifiedItem[]>();
    for (const item of items) {
      const group = grouped.get(item.categoryKey) ?? [];
      group.push(item);
      grouped.set(item.categoryKey, group);
    }

    const blocks: unknown[] = [];
    for (const key of CATEGORY_ORDER) {
      const group = grouped.get(key);
      if (!group || group.length === 0) continue;

      const label = group[0].texts[lang]?.category ?? key;
      blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(`*${label}*`, MAX_SECTION_LENGTH) } });

      const withImages = includeImages ? group.filter((item) => item.images.length > 0) : [];
      const withoutImages = includeImages ? group.filter((item) => item.images.length === 0) : group;

      if (withoutImages.length > 0) {
        const text = withoutImages.map((item) => `• ${item.texts[lang]?.description ?? ""}`).join("\n");
        blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(text, MAX_SECTION_LENGTH) } });
      }

      for (const item of withImages) {
        const description = item.texts[lang]?.description ?? "";
        blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(`• ${description}`, MAX_SECTION_LENGTH) } });

        const validImageUrls = item.images
          .filter((url) => /^https:\/\//i.test(url) && url.length <= MAX_IMAGE_URL_LENGTH)
          .slice(0, MAX_IMAGES_PER_ITEM);

        for (const imageUrl of validImageUrls) {
          blocks.push({
            type: "image",
            image_url: imageUrl,
            alt_text: truncate(description || label || "Screenshot", MAX_ALT_TEXT_LENGTH),
          });
        }
      }
    }

    return blocks;
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
