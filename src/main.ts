import * as core from "./actionIO";
import { DEFAULT_LANGUAGES, DEFAULT_MODEL, GeminiRewriter } from "./geminiRewriter";
import { GithubFetcher } from "./githubFetcher";
import { ImageRehoster } from "./imageRehoster";
import type { R2Config } from "./r2Uploader";
import { R2Uploader } from "./r2Uploader";
import { SlackNotifier } from "./slackNotifier";

// A brand-new branch reports `before` as all zeros; fall back to a single-commit diff.
export function normalizeFromRef(from: string, to: string): string {
  if (!from || from.trim() === "" || /^0+$/.test(from)) {
    return `${to}^`;
  }
  return from;
}

export function parseLanguages(raw: string): string[] {
  const languages = raw
    .split(",")
    .map((lang) => lang.trim().toLowerCase())
    .filter((lang) => lang.length > 0);

  return languages.length > 0 ? languages : DEFAULT_LANGUAGES;
}

// R2 re-hosting is entirely optional — the 5 inputs are all-or-nothing so a partially
// filled-in config (a likely copy-paste mistake) fails loudly instead of silently no-op'ing.
export function readR2Config(): R2Config | undefined {
  const raw = {
    accountId: core.getInput("r2_account_id"),
    accessKeyId: core.getInput("r2_access_key_id"),
    secretAccessKey: core.getInput("r2_secret_access_key"),
    bucket: core.getInput("r2_bucket"),
    publicBaseUrl: core.getInput("r2_public_url"),
  };

  const present = Object.values(raw).filter((value) => value !== "");
  if (present.length === 0) return undefined;

  if (present.length < Object.keys(raw).length) {
    throw new Error(
      "Partial R2 configuration: r2_account_id, r2_access_key_id, r2_secret_access_key, r2_bucket, and " +
        "r2_public_url must all be set together to enable image re-hosting."
    );
  }

  return raw;
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
    const languages = parseLanguages(core.getInput("languages"));
    const includeImages = core.getBooleanInput("include_images", true);
    const r2Config = readR2Config();

    const entries = await new GithubFetcher(repo, githubToken).entriesBetween(fromRef, toRef);

    if (entries.length === 0) {
      core.info("No changes to generate a release note for.");
      return;
    }

    const result = await new GeminiRewriter(geminiApiKey, model, languages).classify(entries);

    if (includeImages && r2Config) {
      result.items = await new ImageRehoster(new R2Uploader(r2Config), githubToken).rehost(result.items);
    }

    await new SlackNotifier(slackWebhookUrl).post(result, repo, toRef, languages, includeImages);

    core.info(`Posted release note (${result.items.length} items) to Slack.`);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}
