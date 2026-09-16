export interface Entry {
  type: "pull_request" | "commit";
  number: number | null;
  title: string;
  body: string;
  url: string;
  author: string | null;
  images: string[];
}

export type CategoryKey = "feature" | "improvement" | "bugfix" | "other";

export interface LocalizedText {
  /** One or more short bullet points — a PR/commit that bundles several distinct changes gets one per change. */
  descriptions: string[];
}

export interface ClassifiedItem {
  categoryKey: CategoryKey;
  number: number | null;
  url: string | null;
  author: string | null;
  texts: Record<string, LocalizedText>;
  images: string[];
}

export interface ClassificationResult {
  /** 1-3 line overall highlight, per language. */
  summary: Record<string, string>;
  items: ClassifiedItem[];
}
