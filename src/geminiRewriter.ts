import type { ClassifiedItem, Entry } from "./types";

const API_URL = "https://generativelanguage.googleapis.com";
export const DEFAULT_MODEL = "gemini-2.5-flash";
const CATEGORIES = ["Tính năng mới", "Cải tiến", "Sửa lỗi", "Khác"];

interface GeminiItem {
  index: number;
  category: string;
  description: string;
}

/** Rewrites technical PR/commit entries into plain-language, categorized release notes. */
export class GeminiRewriter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL
  ) {}

  async classify(entries: Entry[]): Promise<ClassifiedItem[]> {
    if (entries.length === 0) return [];

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
    const list = entries
      .map((entry, i) => `${i + 1}. [${entry.type}] ${entry.title}\n${entry.body}`.trim())
      .join("\n\n");

    return `Bạn là trợ lý viết release note cho người dùng cuối không rành kỹ thuật.
Với mỗi mục dưới đây, viết lại thành 1 câu mô tả ngắn gọn bằng tiếng Việt,
dùng ngôn ngữ business, không thuật ngữ kỹ thuật, và phân loại vào đúng 1 nhóm
trong: ${CATEGORIES.join(", ")}.

Trả về CHÍNH XÁC một JSON array, không kèm giải thích hay markdown, đúng định dạng:
[{"index": 1, "category": "...", "description": "..."}]

Danh sách:
${list}`;
  }

  private parse(data: unknown, entries: Entry[]): ClassifiedItem[] {
    const text = this.extractText(data);
    const match = text.match(/\[[\s\S]*\]/);
    const jsonText = match ? match[0] : text;

    let items: GeminiItem[];
    try {
      items = JSON.parse(jsonText) as GeminiItem[];
    } catch (err) {
      throw new Error(`Gemini returned data that could not be parsed as JSON: ${(err as Error).message}`);
    }

    return items.map((item) => {
      const entry = entries[item.index - 1];
      return {
        category: item.category,
        description: item.description,
        number: entry?.number ?? null,
        url: entry?.url ?? null,
      };
    });
  }

  private extractText(data: unknown): string {
    const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates;
    return candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}
