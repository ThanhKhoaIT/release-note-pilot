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
  category: string;
  description: string;
}

export interface ClassifiedItem {
  categoryKey: CategoryKey;
  number: number | null;
  url: string | null;
  texts: Record<string, LocalizedText>;
  images: string[];
}
