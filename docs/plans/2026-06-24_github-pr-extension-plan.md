## Goal

Build `@narumitw/pi-github-pr`, a small Pi extension that shows the current GitHub pull request status in Pi and exposes the same status to the agent. Success means a user in a GitHub checkout with `gh` installed/authenticated can run `/pr`, see review/CI/comment status, and the agent can call a `github_pr_status` tool.

## Context

- The extension should live under `extensions/pi-github-pr/` and follow the existing package shape: `package.json`, `README.md`, `LICENSE`, `tsconfig.json`, `src/*.ts`, and `test/*.test.ts`.
- Keep the MVP on GitHub CLI (`gh`) instead of implementing OAuth or token storage.
- `pi-statusline` already displays extension statuses from `ctx.ui.setStatus`, so this extension only needs to set a compact `github-pr` status.

## Architecture

- `src/github-pr.ts` registers:
  - `/pr` command for manual status lookup and refresh.
  - `github_pr_status` tool for agent-triggered lookup.
  - Optional `agent_end` refresh only when a PR has already been selected in the session.
- Data flow:
  1. Resolve target from `/pr [target]`, tool input, or current branch.
  2. Execute `gh pr view <target> --json ...` through `pi.exec`.
  3. Normalize GitHub JSON into one `PullRequestStatus` object.
  4. Render compact status via `ctx.ui.setStatus("github-pr", ...)` and detailed output via notification/tool content.

## Tech Stack

- TypeScript only; no new runtime dependencies.
- Requires external `gh` CLI and `gh auth login`.
- Use `typebox` only for the tool schema, matching existing packages.

## Non-Goals

- Do not implement GitHub OAuth, token persistence, webhook server, or a dashboard UI.
- Do not support GitLab/Bitbucket.
- Do not poll continuously in the MVP.
- Do not precisely count unresolved review threads unless a later GraphQL pass is requested.

## Assumptions

- Users accept installing and authenticating `gh` themselves.
- `gh pr view --json statusCheckRollup,reviewDecision,reviews,comments` provides enough status for the first version.
- Repo-level GitHub Enterprise support can be delegated to `gh`.

## Plan

- [x] Create `extensions/pi-github-pr/` package files with package metadata, Pi extension entry, MIT license, and package `typecheck` script; verified with `npm --workspace @narumitw/pi-github-pr run typecheck` and `npm run check`.
- [x] Implement pure parsing/formatting helpers in `src/github-pr.ts` to normalize `gh pr view` JSON into `PullRequestStatus`; verified with unit tests covering approved, changes-requested, failed CI, pending CI, draft PR, and missing comments.
- [x] Implement `runGhPrView(pi, cwd, target)` using `pi.exec("gh", [...])`, with clear errors for missing `gh`, unauthenticated `gh`, non-GitHub repo, and no PR for branch; verified with mocked command-result tests.
- [x] Register `/pr` with subcommands `status`, `refresh`, `clear`, and optional target argument to update status/widget output; verified with mocked `/pr` command tests and `pi -e ./extensions/pi-github-pr --offline --no-session -p '/pr 112'` exit 0 in this GitHub repo.
- [x] Register `github_pr_status` tool with optional `target` parameter and compact text output plus structured `details`; verified with package typecheck and mocked tool execution test.
- [x] Add lightweight session state for the last selected PR target and refresh it on `agent_end` only when set; verified by testing that no refresh runs before `/pr` or tool selection.
- [x] Write `README.md` with install, prerequisites (`brew install gh`, `gh auth login`), commands, tool usage, and known MVP limits; verified by `just pack-github-pr` tarball contents.
- [x] Add root workspace conveniences for the new package only where this repo already has per-package shortcuts (`pack:github-pr`, `just pack-github-pr`, `try-github-pr`, `install-github-pr`, `publish-github-pr`); verified with `just --list | grep github-pr`.
- [x] Run repository gates: `npm run check` and `just pack-github-pr`; both passed.

## Risks

- `statusCheckRollup` shape can vary between GitHub check suites and statuses; mitigate with defensive parsing and fixture tests.
- `gh` error messages differ by version/auth state; mitigate by surfacing stderr instead of over-classifying every case.
- Comment counts from `gh pr view` are not the same as unresolved review threads; document this as an MVP limit.

## Completion Checklist

- [x] `@narumitw/pi-github-pr` package is present and discoverable by Pi, verified by `pi -e ./extensions/pi-github-pr --offline --list-models` starting without extension load errors.
- [x] `/pr` displays compact and detailed PR status, verified by the mocked `/pr` command test and `pi -e ./extensions/pi-github-pr --offline --no-session -p '/pr 112'` exit 0 in this GitHub repo.
- [x] `github_pr_status` returns PR status to the agent, verified by the mocked tool execution unit test.
- [x] Missing `gh`/auth/repo cases produce actionable messages, verified by mocked command-result tests.
- [x] Docs state `gh` is required and list MVP limits, verified in `extensions/pi-github-pr/README.md` and `just pack-github-pr` contents.
- [x] Code passes `npm run check` and package dry run passes `just pack-github-pr`.
