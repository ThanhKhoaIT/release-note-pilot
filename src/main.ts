import * as core from "./actionIO";
import { GeminiRewriter, DEFAULT_MODEL } from "./geminiRewriter";
import { GithubFetcher } from "./githubFetcher";
import { SlackNotifier } from "./slackNotifier";

// A brand-new branch reports `before` as all zeros; fall back to a single-commit diff.
export function normalizeFromRef(from: string, to: string): string {
  if (!from || from.trim() === "" || /^0+$/.test(from)) {
    return `${to}^`;
  }
  return from;
}

export async function run(): Promise<void> {
  try {
    const repo = core.getInput("repo", { required: true });
    const toRef = core.getInput("to_ref", { required: true });
    const fromRef = normalizeFromRef(core.getInput("from_ref"), toRef);
    const githubToken = core.getInput("github_token", { required: true });
    const geminiApiKey = core.getInput("gemini_api_key", { required: true });
    const slackWebhookUrl = core.getInput("slack_webhook_url", { required: true });
    const model = core.getInput("gemini_model") || DEFAULT_MODEL;

    const entries = await new GithubFetcher(repo, githubToken).entriesBetween(fromRef, toRef);

    if (entries.length === 0) {
      core.info("No changes to generate a release note for.");
      return;
    }

    const items = await new GeminiRewriter(geminiApiKey, model).classify(entries);
    await new SlackNotifier(slackWebhookUrl).post(items, repo, toRef);

    core.info(`Posted release note (${items.length} items) to Slack.`);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}
