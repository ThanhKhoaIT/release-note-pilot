import type { CategoryKey, ClassificationResult, ClassifiedItem } from "./types";

const CATEGORY_ORDER: CategoryKey[] = ["feature", "improvement", "bugfix", "other"];
const MAX_CARDS_PER_CAROUSEL = 10;

// https://docs.slack.dev/reference/block-kit/blocks
const MAX_HEADER_LENGTH = 150;
const MAX_SECTION_LENGTH = 3000;
const MAX_CONTEXT_LENGTH = 2000;
const MAX_ALT_TEXT_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 3000;
const MAX_CARD_TITLE_LENGTH = 150;

// A near-blank block (Slack rejects a truly empty section text) used to add visual breathing
// room between language sections, beyond what a single divider alone gives.
const SPACER_BLOCK = { type: "context", elements: [{ type: "mrkdwn", text: " " }] };

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

// Fixed display names + emoji per category — deterministic, so it doesn't depend on Gemini
// inventing consistent wording/emoji across runs. English is the fallback for unmapped languages.
const CATEGORY_META: Record<CategoryKey, { emoji: string; labels: Record<string, string> }> = {
  feature: { emoji: "🆕", labels: { en: "What's New", vi: "Có gì mới" } },
  improvement: { emoji: "✨", labels: { en: "Improvements", vi: "Cải tiến" } },
  bugfix: { emoji: "🐛", labels: { en: "Bug Fixes", vi: "Sửa lỗi" } },
  other: { emoji: "📦", labels: { en: "Other", vi: "Khác" } },
};

/** Posts categorized, multi-language release note items to a Slack channel via an Incoming Webhook. */
export class SlackNotifier {
  constructor(private readonly webhookUrl: string) {}

  async post(
    result: ClassificationResult,
    repo: string,
    toRef: string,
    languages: string[],
    includeImages = true
  ): Promise<void> {
    if (result.items.length === 0) return;

    try {
      await this.send(this.buildBlocks(result, repo, toRef, languages, includeImages));
    } catch (err) {
      // A malformed/unreachable image URL is the most likely cause of Slack rejecting the
      // whole payload — degrade to a text-only note rather than losing the release note entirely.
      if (includeImages && err instanceof Error && err.message.includes("invalid_blocks")) {
        console.warn(`Slack rejected the message with images (${err.message}); retrying without images.`);
        await this.send(this.buildBlocks(result, repo, toRef, languages, false));
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
    result: ClassificationResult,
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

    languages.forEach((lang, i) => {
      // Extra breathing room between language blocks, beyond the divider alone.
      if (i > 0 && languages.length > 1) blocks.push(SPACER_BLOCK);

      blocks.push({ type: "divider" });
      if (languages.length > 1) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${languageLabel(lang)}*` } });
      }

      const summary = result.summary[lang];
      if (summary) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(summary, MAX_SECTION_LENGTH) } });
      }

      blocks.push(...this.languageSections(result.items, lang, includeImages));
    });

    const contributors = this.contributorsBlock(result.items);
    if (contributors) {
      blocks.push({ type: "divider" });
      blocks.push(contributors);
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

      const label = categoryLabel(key, lang);
      const withImage = includeImages ? group.filter((item) => this.firstValidImage(item) !== undefined) : [];
      const withoutImage = group.filter((item) => !withImage.includes(item));

      // A single text-only item reads better inline with the category label than as its own
      // line with a lone bullet underneath.
      if (group.length === 1 && withImage.length === 0) {
        const description = withoutImage[0].texts[lang]?.description ?? "";
        blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(`*${label}:* ${description}`, MAX_SECTION_LENGTH) } });
        continue;
      }

      blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(`*${label}*`, MAX_SECTION_LENGTH) } });

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

  private contributorsBlock(items: ClassifiedItem[]): unknown | undefined {
    const authors = [...new Set(items.map((item) => item.author).filter((author): author is string => !!author))];
    if (authors.length === 0) return undefined;

    const mentions = authors.map((author) => `<https://github.com/${author}|@${author}>`).join(", ");
    return {
      type: "context",
      elements: [{ type: "mrkdwn", text: truncate(`👤 *Contributors:* ${mentions}`, MAX_CONTEXT_LENGTH) }],
    };
  }
}

function categoryLabel(key: CategoryKey, lang: string): string {
  const meta = CATEGORY_META[key];
  return `${meta.emoji} ${meta.labels[lang] ?? meta.labels.en}`;
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
