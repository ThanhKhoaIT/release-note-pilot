import type { CategoryKey, ClassificationResult, Entry } from "./types";

const API_URL = "https://generativelanguage.googleapis.com";
export const DEFAULT_MODEL = "gemini-3.6-flash";
export const DEFAULT_LANGUAGES = ["en"];
const CATEGORY_KEYS: CategoryKey[] = ["feature", "improvement", "bugfix", "other"];
const MAX_DESCRIPTION_LENGTH = 2000;

interface GeminiItem {
  index: number;
  category_key: CategoryKey;
  texts: Record<string, { descriptions: string[] }>;
}

interface GeminiResponse {
  summary: Record<string, string>;
  items: GeminiItem[];
}

/** Rewrites technical PR/commit entries into plain-language, categorized, multi-language release notes. */
export class GeminiRewriter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    private readonly languages: string[] = DEFAULT_LANGUAGES
  ) {}

  async classify(entries: Entry[]): Promise<ClassificationResult> {
    if (entries.length === 0) return { summary: {}, items: [] };

    const response = await fetch(`${API_URL}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: this.promptFor(entries) }] }] }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API request failed: ${response.status} ${await response.text()}`);
    }

    return this.parse(await response.json(), entries);
  }

  private promptFor(entries: Entry[]): string {
    const list = entries.map((entry, i) => this.itemBlock(entry, i)).join("\n\n");
    const exampleLang = this.languages[0];

    return `You are an assistant writing release notes for non-technical business end users.

First, write a short overall summary (1-3 sentences) highlighting the most notable changes in
this release, in EACH of these languages: ${this.languages.join(", ")}.

Then, for each item below:
1. Read both the Title and Description (when present) — PR titles are often too terse, and the
   description usually holds the actual detail needed for an accurate summary.
2. Classify it into exactly one category key: ${CATEGORY_KEYS.join(", ")}.
3. Write one or more short, one-line, plain-language bullet points with no technical jargon — if
   this item bundles several distinct changes, split them into separate bullet points instead of
   one long run-on sentence; if it's a single change, write just one bullet point. Each bullet
   should have enough detail (what changed and why it matters) for a non-technical reader to
   understand the impact, but stay on a single line. Write these in EACH of these languages:
   ${this.languages.join(", ")}.

Return EXACTLY a JSON object, no explanation or markdown, in this format:
{"summary": {"${exampleLang}": "..."}, "items": [{"index": 1, "category_key": "feature", "texts": {"${exampleLang}": {"descriptions": ["...", "..."]}}}]}

Items:
${list}`;
  }

  private itemBlock(entry: Entry, index: number): string {
    const description = this.cleanDescription(entry.body);
    const lines = [`${index + 1}. [${entry.type}] Title: ${entry.title}`];
    if (description) lines.push(`Description: ${description}`);
    return lines.join("\n");
  }

  // PR descriptions from templates are noisy: HTML comments, checklists, embedded images.
  // Strip that noise so the model spends its attention on the actual explanation.
  private cleanDescription(body: string): string {
    return body
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_DESCRIPTION_LENGTH);
  }

  private parse(data: unknown, entries: Entry[]): ClassificationResult {
    const text = this.extractText(data);
    const match = text.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : text;

    let response: GeminiResponse;
    try {
      response = JSON.parse(jsonText) as GeminiResponse;
    } catch (err) {
      throw new Error(`Gemini returned data that could not be parsed as JSON: ${(err as Error).message}`);
    }

    const items = response.items.map((item) => {
      const entry = entries[item.index - 1];
      return {
        categoryKey: item.category_key,
        number: entry?.number ?? null,
        url: entry?.url ?? null,
        author: entry?.author ?? null,
        texts: item.texts,
        images: entry?.images ?? [],
      };
    });

    return { summary: response.summary ?? {}, items };
  }

  private extractText(data: unknown): string {
    const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates;
    return candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}
