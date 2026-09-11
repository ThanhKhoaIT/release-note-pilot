import type { ClassifiedItem } from "./types";

/** Posts categorized release note items to a Slack channel via an Incoming Webhook. */
export class SlackNotifier {
  constructor(private readonly webhookUrl: string) {}

  async post(items: ClassifiedItem[], repo: string, toRef: string): Promise<void> {
    if (items.length === 0) return;

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: this.buildBlocks(items, repo, toRef) }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook request failed: ${response.status} ${await response.text()}`);
    }
  }

  private buildBlocks(items: ClassifiedItem[], repo: string, toRef: string): unknown[] {
    const blocks: unknown[] = [
      { type: "header", text: { type: "plain_text", text: `🚀 Release Notes — ${repo}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `Deploy: \`${toRef.slice(0, 7)}\`` }] },
    ];

    const grouped = new Map<string, ClassifiedItem[]>();
    for (const item of items) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }

    for (const [category, categoryItems] of grouped) {
      blocks.push({ type: "divider" });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${category}*` } });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: categoryItems.map((i) => `• ${i.description}`).join("\n") },
      });
    }

    return blocks;
  }
}
