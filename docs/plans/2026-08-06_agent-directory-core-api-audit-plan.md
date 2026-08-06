# Agent directory core API audit plan

## Goal

Audit every active extension, including experimental packages, for the same class of Pi agent-directory
resolution bug as issue #573, and replace confirmed manual agent-root reconstruction with Pi core's
public path API without changing unrelated path behavior.

## Context

The repository currently contains 25 active extensions, including 6 under `experimental/`. The
initial source scan covered every `extensions/*/src` and `experimental/*/src` runtime tree for direct
`PI_CODING_AGENT_DIR` reads, `HOME`-based `~/.pi/agent` reconstruction, hard-coded agent-root path
fragments, and core `settings.json` readers.

The scan found two runtime instances in this failure class:

- `pi-statusline` reconstructed the global package settings path from `HOME`; PR #574 already replaces
  it with `getAgentDir()` and has regression coverage.
- `pi-goal` reconstructs the deprecated global state cleanup path from `PI_CODING_AGENT_DIR` and
  `HOME`. It honors an absolute override but bypasses Pi's tilde normalization and platform-safe
  fallback.

The existing global settings readers in `pi-image-drop` and experimental `pi-webui` already use
`getAgentDir()` and `CONFIG_DIR_NAME`. Other agent-owned paths found by the scan already use
`getAgentDir()` or receive an agent directory from a Pi-backed composition root. Remaining `homedir()`
uses are presentation, home-relative worktree defaults, or arbitrary sync-path expansion rather than
agent-root reconstruction, so changing them would be a different behavior class.

Applicable guidance: `docs/extension-conventions.md`, `docs/extension-settings.md`, and the
hardening-code-path edge-case checklist. The reachable risk dimensions are environment/path
representation, tilde normalization, platform fallback, filesystem isolation, and regression-test
environment cleanup; no asynchronous or UI lifecycle path is touched.

## Plan

- [ ] Add a focused `pi-goal` regression test that imports the production persistence path in an
  isolated subprocess with `PI_CODING_AGENT_DIR=~/custom-agent`; verify legacy cleanup updates the
  expanded home-owned file and preserves unrelated entries, and first confirm failure on the manual
  path implementation.
- [ ] Replace `pi-goal`'s direct environment and HOME reconstruction with `getAgentDir()` at the shared
  legacy cleanup boundary; verify the focused test and all compiled `pi-goal` tests pass.
- [ ] Repeat the bounded sibling scan across all production and experimental runtime sources, classify
  every remaining direct environment, hard-coded agent path, and core settings reader, and confirm no
  same-pattern implementation remains.
- [ ] Run package checks and `npm run check`, audit the final diff against the guides, update PR #574's
  scope and verification notes, push the focused commits, and record any unrelated external CI
  failure separately rather than expanding this fix into a different compatibility change.

## Risks

- The legacy goal path is evaluated during module import today. Use a subprocess so the regression
  controls its environment before loading production code and cannot leak process-wide state.
- Broad path searches can produce false positives such as display text or generic home-relative
  paths. Change only code that independently reconstructs Pi's agent root; report the rest by class.
- GitHub's latest-Pi CI currently reports unrelated `ProviderHeaders` compatibility errors in
  `pi-btw` and experimental `pi-codex-compact`. Keep that failure visible but out of this path-resolution
  patch unless a separate requirement authorizes the materially different API migration.

## Completion Checklist

- [ ] Every active extension source tree, including all 6 experimental packages, is covered by the
  same-pattern scan.
- [ ] No active runtime code directly reads `PI_CODING_AGENT_DIR` or reconstructs `~/.pi/agent`.
- [ ] `pi-statusline` and legacy `pi-goal` paths both use Pi core's `getAgentDir()` contract with
  deterministic regression coverage.
- [ ] Focused tests, applicable package checks, and the pinned repository gate pass.
- [ ] PR #574 contains the audit fix and accurately reports local checks plus any unrelated CI state.
