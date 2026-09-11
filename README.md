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

### Inputs

| Input                | Required | Default                    |
|-----------------------|----------|-----------------------------|
| `repo`                | no       | `github.repository`         |
| `from_ref`            | no       | `github.event.before`       |
| `to_ref`              | no       | `github.sha`                |
| `github_token`        | yes      | —                            |
| `gemini_api_key`      | yes      | —                            |
| `slack_webhook_url`   | yes      | —                            |
| `gemini_model`        | no       | `gemini-3.6-flash`          |
| `languages`           | no       | `en`                        |

## Development

This is a Node.js action (`runs.using: node20`), bundled with
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
