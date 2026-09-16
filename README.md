# ReleaseNotePilot

A GitHub Action that generates business-friendly release notes from the
commits and pull requests merged since the last deploy, rewrites/classifies
them with Gemini, and posts the result to a Slack channel via an Incoming
Webhook. Works for any project on GitHub Actions, regardless of language.

## Usage

Add this as the last step of your deploy workflow (triggered on `push` to
`main`):

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ...your deploy steps...

      - uses: ThanhKhoaIT/release-note-pilot@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

`from_ref`/`to_ref` default to `github.event.before`/`github.sha`, so every
push is diffed against the state before it — no tagging convention required.
On the very first push to a branch (`before` is all zeros), it falls back to
a single-commit diff.

Set `languages` to a comma-separated list (e.g. `en,vi`) to generate the note
in several languages at once — each language gets its own section in the
Slack message.

The Slack message opens with a 1-3 line summary of the release, then groups
items under fixed, emoji-labeled categories (🆕 What's New, ✨ Improvements,
🐛 Bug Fixes, 📦 Other — translated per language where mapped, English
otherwise), and closes with a **Contributors** line linking each unique PR
author's GitHub profile.

Screenshots embedded in a PR description are posted to Slack as image cards
grouped in a carousel next to their category; set `include_images: "false"`
to skip them and post text only.

#### Re-hosting screenshots on Cloudflare R2 (optional)

GitHub's PR-attachment image URLs (`github.com/user-attachments/assets/...`)
require an authenticated GitHub session, so Slack can't load them directly —
the image will show as broken. Setting the 5 `r2_*` inputs below makes the
action download each screenshot (authenticated with `github_token`) and
re-upload it to a Cloudflare R2 bucket first, so Slack gets a plain public
URL instead. All 5 are optional but must be set together; if omitted,
screenshots are linked directly and may not render for URLs gated by GitHub.

**Important:** the default `secrets.GITHUB_TOKEN` does **not** work for this,
and neither does a **fine-grained** personal access token — both verified by
testing. GitHub's `user-attachments` asset endpoint 404s for either, even for
an image the PR author can see fine in their own browser; this is [GitHub's
own documented limitation](https://github.com/orgs/community/discussions/169297),
not a bug in this action. Only a **classic PAT** (`ghp_...`, `repo` scope)
works here — pass one as `github_token` to make image re-hosting work. It's
also used for the regular GitHub API calls (listing commits/PRs), which a
classic PAT covers just as well as the default token.

One-time setup on the Cloudflare side (not done by this action):

1. **Create the bucket:**
   ```bash
   npx wrangler r2 bucket create release-note-pilot --location=apac
   ```
   (`--location` picks the nearest region: `apac`/`enam`/`weur`/etc.)

2. **Enable public access** — Dashboard → R2 → your bucket → **Settings** →
   **Public Development URL** → **Enable**. Copy the resulting
   `https://pub-xxxxxxxx.r2.dev` URL — that's `r2_public_url` (no trailing
   slash). A custom domain works too, via `wrangler r2 bucket domain add`.

3. **Create a scoped R2 API token** — Dashboard → R2 → **Manage R2 API
   Tokens** → **Create API Token**.
   - Permission: **Object Read & Write** (not Admin)
   - Specify bucket: pick this bucket specifically, not "Apply to all buckets"
   - Save the **Access Key ID** and **Secret Access Key** shown — they're only
     displayed once. These are `r2_access_key_id` / `r2_secret_access_key`.

4. **Get the account ID** — Dashboard → R2 (or any account overview page)
   shows the **Account ID** in the sidebar. That's `r2_account_id`.

5. **(Recommended) Add a lifecycle rule to auto-expire objects** — Dashboard
   → bucket → **Settings** → **Object lifecycle rules** → **Add rule**:
   prefix `release-note-pilot/` (matches the key prefix this action uses),
   action **Delete** after e.g. 7 days. These screenshots are only needed
   for Slack to render them once, not kept long-term.

Also create a classic PAT (see the **Important** note above) and store it as
a repo secret, e.g. `GH_CLASSIC_PAT`. Then set all 6 values as GitHub secrets
(`GH_CLASSIC_PAT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_PUBLIC_URL`) and pass them through — note `github_token`
switches from the default `secrets.GITHUB_TOKEN` to the classic PAT:

```yaml
      - uses: ThanhKhoaIT/release-note-pilot@v1
        with:
          github_token: ${{ secrets.GH_CLASSIC_PAT }}
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
          r2_account_id: ${{ secrets.R2_ACCOUNT_ID }}
          r2_access_key_id: ${{ secrets.R2_ACCESS_KEY_ID }}
          r2_secret_access_key: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          r2_bucket: ${{ secrets.R2_BUCKET }}
          r2_public_url: ${{ secrets.R2_PUBLIC_URL }}
```

### Inputs

| Input                    | Required | Default                    |
|---------------------------|----------|-----------------------------|
| `repo`                    | no       | `github.repository`         |
| `from_ref`                | no       | `github.event.before`       |
| `to_ref`                  | no       | `github.sha`                |
| `github_token`            | yes      | —                            |
| `gemini_api_key`          | yes      | —                            |
| `slack_webhook_url`       | yes      | —                            |
| `gemini_model`            | no       | `gemini-3.6-flash`          |
| `languages`               | no       | `en`                        |
| `include_images`          | no       | `true`                      |
| `r2_account_id`           | no       | —                            |
| `r2_access_key_id`        | no       | —                            |
| `r2_secret_access_key`    | no       | —                            |
| `r2_bucket`               | no       | —                            |
| `r2_public_url`           | no       | —                            |

## Development

This is a Node.js action (`runs.using: node24`), bundled with
[`@vercel/ncc`](https://github.com/vercel/ncc) into `dist/index.js`, which
must be committed — consumers run the bundled file directly, no install step.

```bash
$ npm install
$ npm run typecheck
$ npm run lint
$ npm test
$ npm run build   # regenerates dist/index.js — commit the result
```

## License
This project is available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
