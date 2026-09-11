import type { CategoryKey, ClassifiedItem } from "./types";

const CATEGORY_ORDER: CategoryKey[] = ["feature", "improvement", "bugfix", "other"];

/** Posts categorized, multi-language release note items to a Slack channel via an Incoming Webhook. */
export class SlackNotifier {
  constructor(private readonly webhookUrl: string) {}

  async post(items: ClassifiedItem[], repo: string, toRef: string, languages: string[]): Promise<void> {
    if (items.length === 0) return;

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: this.buildBlocks(items, repo, toRef, languages) }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook request failed: ${response.status} ${await response.text()}`);
    }
  }

  private buildBlocks(items: ClassifiedItem[], repo: string, toRef: string, languages: string[]): unknown[] {
    const blocks: unknown[] = [
      { type: "header", text: { type: "plain_text", text: `🚀 Release Notes — ${repo}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `Deploy: \`${toRef.slice(0, 7)}\`` }] },
    ];

    for (const lang of languages) {
      blocks.push({ type: "divider" });
      if (languages.length > 1) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${lang.toUpperCase()}*` } });
      }
      blocks.push(...this.languageSections(items, lang));
    }

    return blocks;
  }

  private languageSections(items: ClassifiedItem[], lang: string): unknown[] {
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
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${label}*` } });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: group.map((item) => `• ${item.texts[lang]?.description ?? ""}`).join("\n") },
      });
    }

    return blocks;
  }
}
