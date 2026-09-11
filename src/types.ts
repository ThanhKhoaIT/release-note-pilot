export interface Entry {
  type: "pull_request" | "commit";
  number: number | null;
  title: string;
  body: string;
  url: string;
  author: string | null;
}

export interface ClassifiedItem {
  category: string;
  description: string;
  number: number | null;
  url: string | null;
}
