# pi-starship native GitHub PR plan

## Goal

Remove pi-starship's runtime integration with the `github-pr` extension status and add an independent
native `$github_pr` module. This is an explicitly approved breaking change: do not retain a
`$git_branch.$pr` compatibility alias or perform automatic migration.

## Architecture

- Root module: `$github_pr`.
- Settings table: `[github_pr]`.
- Data source: `gh pr view` for the current branch, using GitHub CLI authentication and repository
  host resolution, including GitHub Enterprise Server.
- `github_pr` owns querying, parsing, caching, and presentation. `git_branch` owns only local Git
  branch/upstream data.
- Query only in TUI sessions when `github_pr` is reachable and enabled.
- Keep `render()` pure: it reads a cached immutable snapshot and performs no subprocess, network,
  filesystem, timer, or environment work.

Default configuration shape:

```toml
format = "$directory$git_branch$github_pr$git_status"

[git_branch]
format = "[ $symbol $branch ]($style)"

[github_pr]
format = "[ $symbol$link( · $status) ]($style)"
symbol = "PR "
style = "fg:git_fg bg:git"
disabled = false
```

Variable contract:

- `$number`: plain digits, for example `123`.
- `$link`: terminal-safe OSC 8 `#123` link, falling back to plain text when the URL is invalid.
- `$state`: `open`, `draft`, `merged`, or `closed`.
- `$checks`: `checks passing`, `<n> failing`, `<n> pending`, or `no checks`.
- `$review`: `approved`, `changes requested`, `review required`, or empty when unknown.
- `$status`: the compact priority-selected summary: merged → closed → draft → failing → changes
  requested → pending → approved → review required → passing → no checks.

Lifecycle contract:

- Refresh at session start, after branch changes, after agent runs, after accepted settings changes,
  and every 60 seconds while reachable.
- Clear stale PR state immediately on branch change, then query the new branch.
- Cancel or release every owned request and timer on module disable, footer disposal, session
  replacement, reload, and shutdown.
- Suppress stale publication with request and session-generation ownership checks after every await.
- Missing `gh`, missing authentication, no current PR, timeout, malformed output, and network failure
  degrade to an empty module without exposing raw errors or credentials.
- Closed or merged pull requests remain visible for 24 hours, matching the current user-facing
  behavior.

## Non-Goals

- Do not modify, deprecate, or remove `extensions/pi-github-pr`.
- Do not provide a `$git_branch.$pr` compatibility alias or automatic migration.
- Do not call the GitHub API directly or manage GitHub tokens.
- Do not read comments, review bodies, inline comments, or review-thread content.
- Do not add package dependencies solely for this feature.
- Do not bump versions, publish packages, or create a release.

## Plan

- [ ] Add failing behavior tests under `extensions/pi-starship/test/` for the `$github_pr` module
  variables, status priority, terminal-state expiry, OSC 8 safety, GitHub Enterprise URLs, no-PR and
  failure degradation, and the removal of `$git_branch.$pr`; verify the intended red state with
  `npm test`.
- [ ] Add a native PR snapshot type plus `extensions/pi-starship/src/modules/github-pr.ts`, register
  `github_pr` immediately after `git_branch`, and update the built-in root/default module formats;
  verify module and configuration behavior with the focused Starship tests.
- [ ] Remove `$pr` and `prContextFromStatuses()` from
  `extensions/pi-starship/src/modules/git/branch.ts`; rely on the existing generic unknown-variable
  diagnostic for old `$pr` settings and add a regression assertion proving no compatibility alias is
  retained.
- [ ] Add `extensions/pi-starship/src/runtime/github-pr.ts` to execute a cancellable, 10-second
  `gh pr view --json number,isDraft,url,state,closedAt,mergedAt,reviewDecision,statusCheckRollup`,
  infer the repository host without mutating process environment, validate bounded JSON fields, and
  build the immutable native snapshot; verify with mocked argv/result tests for POSIX, Windows,
  GitHub Enterprise, malformed output, missing `gh`, missing auth, and no PR.
- [ ] Integrate a PR refresh controller into `extensions/pi-starship/src/pi-starship.ts` for initial,
  branch-change, agent-end, settings-apply, and 60-second refreshes; verify immediate stale clearing,
  coalescing, cancellation, session replacement, footer disposal, shutdown, non-TUI behavior, and
  unreachable/disabled no-exec behavior in lifecycle tests.
- [ ] Extend `extensions/pi-starship/src/runtime/refresh-controller.ts` with AbortSignal-aware
  cancellation for started/stopped generations without weakening latest-request coalescing; verify
  abort and stale-publication behavior in controller tests.
- [ ] Remove `consumedExtensionStatusKeys`, `hiddenExtensionStatusKeys`, the renderer's `github-pr`
  suppression, and the built-in `github-pr` icon mapping so `extension_status` treats every external
  status generically; verify an independently supplied `github-pr` status remains visible rather than
  being consumed.
- [ ] Update `extensions/pi-starship/README.md` with the `$github_pr` module, variables and TOML
  example; document `gh auth login`, GitHub Enterprise setup, network/privacy/refresh behavior, the
  accepted breaking migration, and that `pi-github-pr` is no longer required. Remove documentation
  that claims `$git_branch.$pr` consumes an extension status.
- [ ] Audit the final diff against `docs/extension-conventions.md` and
  `docs/extension-settings.md`, covering module/settings ownership, package independence, subprocess
  trust boundaries, cancellation, footer disposal, session replacement, shutdown, and post-await
  generation checks; record any accepted deviation in the handoff.
- [ ] Run `npm test`, `npm run check --workspace @narumitw/pi-starship`, `npm run check`, and
  `just pack-starship`; inspect the dry-run tarball for the new runtime/module source and no unintended
  files.
- [ ] After every item and completion check has evidence, move this plan to
  `docs/plans/archived/2026-08-01_pi-starship-native-github-pr-plan.md` without overwriting an existing
  archive and report the archived path.

## Risks

- The default `$github_pr` module introduces an external `gh` network query. Reachability gating,
  cached refresh, timeout, coalescing, and cancellation bound the cost.
- If `pi-github-pr` remains installed, its independent status may also appear under
  `$extension_status`. Do not add special suppression; document that users should disable or remove
  it when adopting the native module.
- Existing TOML containing `$git_branch.$pr` stops rendering PR data. This breaking change is
  explicitly accepted and must be documented clearly.
- GitHub CLI output and URLs cross a terminal-display boundary. Strict schema checks, HTTP(S)-only
  OSC 8 links, control-character stripping, and bounded parsing prevent terminal injection.

## Completion Checklist

- [ ] No pi-starship production path reads, parses, consumes, hides, or otherwise coordinates the
  `github-pr` extension status.
- [ ] `git_branch` no longer exposes `$pr`, and no compatibility alias or migration remains.
- [ ] `$github_pr` displays the current branch PR without installing `pi-github-pr`.
- [ ] `$github_pr` exposes the documented variables and preserves compact checks/review semantics.
- [ ] Unreachable, disabled, and non-TUI paths execute no `gh` command.
- [ ] Branch, settings, footer, replacement, reload, and shutdown paths cancel owned work and reject
  stale publication.
- [ ] README behavior, prerequisites, privacy, failures, and breaking migration match implementation.
- [ ] Focused tests, root tests, package check, CI-equivalent check, and package dry-run all pass.
- [ ] The completed plan is archived with verification evidence and no open checklist items.
