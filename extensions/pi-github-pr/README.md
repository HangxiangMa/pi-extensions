# 🔎 pi-github-pr — GitHub Pull Request Status for Pi Agents

[![npm](https://img.shields.io/npm/v/@narumitw/pi-github-pr)](https://www.npmjs.com/package/@narumitw/pi-github-pr) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-github-pr` is a native [Pi coding agent](https://pi.dev) extension that shows GitHub pull request review, CI, and comment status from the GitHub CLI.

Use it to quickly answer: is the current PR approved, are checks passing, and did anyone comment?

## ✨ Features

- Shows a compact PR status through Pi extension status: PR number, CI, review decision, and comment count.
- Provides `/pr` for manual lookup by current branch, PR number, URL, or branch.
- Provides `github_pr_status` so the agent can check PR status itself.
- Refreshes the selected PR after agent turns.
- Uses GitHub CLI auth and repository resolution; the extension stores no GitHub token.
- No background polling, webhook server, or new runtime service.

## 📦 Install

```bash
pi install npm:@narumitw/pi-github-pr
```

Try without installing permanently:

```bash
pi -e npm:@narumitw/pi-github-pr
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-github-pr
```

## ⚙️ Prerequisites

Install and authenticate GitHub CLI yourself:

```bash
brew install gh
gh auth login
```

The extension shells out to `gh pr view`; GitHub Enterprise hosts and credential storage are delegated to `gh`.

## 💬 Command

```text
/pr
```

Shows the pull request for the current branch.

Direct forms are also available:

```text
/pr status
/pr refresh
/pr clear
/pr 123
/pr https://github.com/OWNER/REPO/pull/123
```

- `status` shows the current branch PR.
- `refresh` refreshes the last selected PR.
- `clear` clears the status/widget.
- A number, URL, or branch asks `gh pr view` for that target.

## 🛠️ Pi tool

- `github_pr_status` — show review, CI, and comment status for a GitHub pull request. Optional `target` accepts a PR number, URL, or branch; when omitted, `gh` resolves the current branch PR.

Example tool input:

```json
{
  "target": "123"
}
```

## 📋 Status output

Compact status examples:

```text
PR #123 ✅ ci ✓ approved 💬7
PR #123 ❌ ci 2 failed review required 💬3
PR #123 🟡 ci 5 pending changes requested 💬12
```

Detailed status includes title, state, review summary, CI counts, comments/reviews, updated time, and URL.

## Known limits

- Requires `gh`; there is no direct GitHub API or `GITHUB_TOKEN` fallback.
- Comment count uses `gh pr view` comments and reviews, not precise unresolved review-thread counts.
- No continuous polling in the MVP; refresh happens manually or after agent turns once a PR is selected.

## 📁 Package layout

```text
extensions/pi-github-pr/
├── src/github-pr.ts
├── test/github-pr.test.ts
├── package.json
├── README.md
├── LICENSE
└── tsconfig.json
```

## 🏷️ Keywords

`pi-package`, `pi-extension`, `github`, `pull-request`, `gh`

## 📄 License

MIT
