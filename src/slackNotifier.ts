import type { CategoryKey, ClassifiedItem } from "./types";

const CATEGORY_ORDER: CategoryKey[] = ["feature", "improvement", "bugfix", "other"];
const MAX_CARDS_PER_CAROUSEL = 10;

// https://docs.slack.dev/reference/block-kit/blocks
const MAX_HEADER_LENGTH = 150;
const MAX_SECTION_LENGTH = 3000;
const MAX_CONTEXT_LENGTH = 2000;
const MAX_ALT_TEXT_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 3000;
const MAX_CARD_TITLE_LENGTH = 150;

// Slack renders these differently depending on the viewer's own language, so a fixed
// flag + English name reads consistently for everyone regardless of requested code.
const LANGUAGE_NAMES: Record<string, { flag: string; name: string }> = {
  en: { flag: "🇬🇧", name: "English" },
  vi: { flag: "🇻🇳", name: "Vietnamese" },
  ja: { flag: "🇯🇵", name: "Japanese" },
  ko: { flag: "🇰🇷", name: "Korean" },
  zh: { flag: "🇨🇳", name: "Chinese" },
  fr: { flag: "🇫🇷", name: "French" },
  de: { flag: "🇩🇪", name: "German" },
  es: { flag: "🇪🇸", name: "Spanish" },
  th: { flag: "🇹🇭", name: "Thai" },
  id: { flag: "🇮🇩", name: "Indonesian" },
};

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
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${languageLabel(lang)}*` } });
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

      const withImage = includeImages ? group.filter((item) => this.firstValidImage(item) !== undefined) : [];
      const withoutImage = group.filter((item) => !withImage.includes(item));

      if (withoutImage.length > 0) {
        const text = withoutImage.map((item) => `• ${item.texts[lang]?.description ?? ""}`).join("\n");
        blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(text, MAX_SECTION_LENGTH) } });
      }

      for (const group of chunk(withImage, MAX_CARDS_PER_CAROUSEL)) {
        blocks.push({
          type: "carousel",
          elements: group.map((item) => this.cardFor(item, lang, label)),
        });
      }
    }

    return blocks;
  }

  private cardFor(item: ClassifiedItem, lang: string, label: string): unknown {
    const description = item.texts[lang]?.description ?? "";
    return {
      type: "card",
      title: { type: "plain_text", text: truncate(description || label, MAX_CARD_TITLE_LENGTH) },
      hero_image: {
        type: "image",
        image_url: this.firstValidImage(item),
        alt_text: truncate(description || label || "Screenshot", MAX_ALT_TEXT_LENGTH),
      },
    };
  }

  private firstValidImage(item: ClassifiedItem): string | undefined {
    return item.images.find((url) => /^https:\/\//i.test(url) && url.length <= MAX_IMAGE_URL_LENGTH);
  }
}

function languageLabel(code: string): string {
  const entry = LANGUAGE_NAMES[code];
  return entry ? `${entry.flag} ${entry.name}` : code.toUpperCase();
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
