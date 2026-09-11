import { HttpError } from "./httpError";
import type { Entry } from "./types";

const API_URL = "https://api.github.com";

interface GithubCommit {
  sha: string;
  html_url: string;
  commit?: { message?: string; author?: { name?: string } };
}

interface GithubPullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  user?: { login?: string };
}

/** Fetches merged pull requests and standalone commits between two git refs. */
export class GithubFetcher {
  constructor(
    private readonly repo: string,
    private readonly token: string
  ) {}

  async entriesBetween(fromRef: string, toRef: string): Promise<Entry[]> {
    const compare = await this.request<{ commits: GithubCommit[] }>(
      `/repos/${this.repo}/compare/${fromRef}...${toRef}`
    );
    const commits = compare.commits ?? [];
    if (commits.length === 0) return [];

    const pullRequests = new Map<number, GithubPullRequest>();
    const standaloneCommits: GithubCommit[] = [];

    for (const commit of commits) {
      const merged = (await this.pullsForCommit(commit.sha)).filter((pr) => pr.merged_at);

      if (merged.length === 0) {
        standaloneCommits.push(commit);
      } else {
        for (const pr of merged) {
          if (!pullRequests.has(pr.number)) pullRequests.set(pr.number, pr);
        }
      }
    }

    return [
      ...this.pullRequestEntries([...pullRequests.values()]),
      ...this.commitEntries(standaloneCommits),
    ];
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new HttpError(
        `GitHub API request to ${path} failed: ${response.status} ${await response.text()}`,
        response.status
      );
    }

    return (await response.json()) as T;
  }

  private async pullsForCommit(sha: string): Promise<GithubPullRequest[]> {
    try {
      return await this.request<GithubPullRequest[]>(`/repos/${this.repo}/commits/${sha}/pulls`);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return [];
      throw err;
    }
  }

  private pullRequestEntries(prs: GithubPullRequest[]): Entry[] {
    return prs.map((pr) => ({
      type: "pull_request",
      number: pr.number,
      title: pr.title,
      body: pr.body ?? "",
      url: pr.html_url,
      author: pr.user?.login ?? null,
    }));
  }

  private commitEntries(commits: GithubCommit[]): Entry[] {
    return commits.map((commit) => {
      const message = commit.commit?.message ?? "";
      return {
        type: "commit",
        number: null,
        title: message.split("\n")[0]?.trim() ?? "",
        body: message,
        url: commit.html_url,
        author: commit.commit?.author?.name ?? null,
      };
    });
  }
}
