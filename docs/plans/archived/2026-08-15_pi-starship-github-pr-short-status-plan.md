# pi-starship GitHub PR short-status plan

## Goal

Make the existing `$checks`, `$review`, and `$status` variables render a compact, font-safe summary by default, following Starship's symbol-plus-count Git style without adding parallel short variables.

## Context

The existing GitHub PR variables expose fixed English text such as `checks passing`, `2 failing`, and `approved`.

The existing `git_status` module emits compact values such as `$1`, `!14`, and `?7`.

This proposal intentionally changes the published values of the existing GitHub PR variables, so custom formats using them will also adopt the short output.

## Architecture

Keep the existing variable names and default module format:

```toml
[github_pr]
format = "[ $symbol$link( · $status) ]($style)"
```

Change their values to:

| Variable | Compact contract | Examples |
| --- | --- | --- |
| `$checks` | All non-zero check counts in passed/failed/pending order | `✓12`, `✓12 ×2 …7`, or `-` when no checks |
| `$review` | Current review decision | `R✓`, `R×`, `R?`, or empty when unknown |
| `$status` | One highest-priority compact result | `M`, `C`, `D`, `×2`, `R×`, `…7`, `R✓`, `R?`, `✓12`, or `-` |

Use the existing `$status` precedence:

```text
merged > closed > draft > failing checks > changes requested > pending checks > approved > review required > passing checks > no checks
```

Use `✓`, `×`, and `…` instead of Git's `$`, `!`, and `?` check markers.

Prefix review decisions with `R` so check and review outcomes remain distinguishable.

Keep `M`, `C`, and `D` for merged, closed, and draft because the default presentation retains the blue `PR #<number>` context.

The default output becomes:

```text
PR #123 · ×2
PR #123 · R✓
PR #123 · M
```

A user who wants checks and review together can keep using the existing variables:

```toml
[github_pr]
format = "[$symbol$link( $checks)( $review) ]($style)"
```

```text
PR #123 ✓12 ×2 …7 R×
```

Derive passed checks as `total - failed - pending`, preserving the current classification where successful, skipped, and neutral checks pass.

Keep the existing immutable `checks`, `review`, and `status` snapshot fields so rendering remains pure and performs no subprocess or network work.

## Non-Goals

- Do not add `$checks_short`, `$review_short`, `$status_short`, or verbose replacement variables.
- Do not add a global short-mode setting or user-configurable status symbols in the first version.
- Do not change `$number`, `$link`, or `$state`.
- Do not change the default module format, only the values supplied to it.
- Do not change GitHub queries, refresh timing, expiry, authentication, or failure behavior.
- Do not change `pi-github-pr` or `pi-statusline` in this implementation.

## Risks

Changing existing variable values is a deliberate breaking display change for custom `pi-starship.toml` files.

The README and Changeset must show the old-to-new value mapping and explain that the previous English forms are no longer available from the native `github_pr` module.

## Execution Context

- Branch: `narumiruna/feat/pi-starship-pr-short-status`.
- Base: `origin/main` at `ed9d3e0e`.
- Preserved pre-existing work: this plan was the only untracked path before execution.
- Touched areas: native GitHub PR snapshot formatting, its stable TOML format-variable contract, focused tests, package README, and Changeset.
- Applicable MUST gates: deterministic changed-behavior tests, CI-equivalent `npm run check`, package smoke, Changeset coverage, and final review against `docs/extension-conventions.md` and `docs/extension-settings.md`.
- Unchanged areas: settings persistence and validation mechanics, commands, TUI flows, asynchronous lifecycle ownership, cancellation, session replacement, shutdown, GitHub queries, and dependencies.

## Plan

- [x] Update `packages/pi-starship/test/github-pr.test.ts` with focused expected values for all-pass, mixed checks, no checks, every review decision, terminal/draft states, and `$status` precedence; focused Vitest failed on the old English `checks`, `review`, and `status` values after rebuilding `pi-tui-kit`, establishing the intended red state.
- [x] Add pure compact-format helpers in `packages/pi-starship/src/runtime/github-pr.ts` that derive passed counts from the existing validated summary and populate the existing `checks`, `review`, and `status` snapshot fields; focused and full tests pass with compact mixed, terminal, and review values.
- [x] Add a regression assertion that `packages/pi-starship/src/modules/github-pr.ts` exposes no new variables and that its default format remains unchanged while rendering the new compact values; the focused contract test passes.
- [x] Update `packages/pi-starship/README.md` with the compact contracts, symbol legend, precedence, default output, custom combined example, and old-to-new migration table; the package Biome and typecheck gate passes.
- [x] Add a minor Changeset for `@narumitw/pi-starship` that explicitly identifies the breaking display change while the package remains on the `0.x` line; `npm run changeset:status` resolves it to `0.51.0`.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`; the change preserves settings parsing, validation, unknown-field handling, atomic persistence, commands, TUI ownership, asynchronous lifecycle, cancellation, session replacement, shutdown, query bounds, terminal-safe links, and failure-to-empty behavior.
- [x] Run `npm test`, `npm run check`, and `npm run pack:starship`; both full gates passed 375 files and 3,769 tests, and the dry-run tarball contained the expected README and source files.

## Verification Evidence

- TDD red: focused Vitest executed the changed contract and failed on the prior English values.
- Focused green: GitHub PR and lifecycle coverage passed 30 tests after hardening.
- Hardening: deterministic cases cover empty, singleton, mixed, zero-omission, every review decision, terminal states, priority branches, and the accepted 1,000-check boundary.
- Package gate: `npm run check --workspace @narumitw/pi-starship` passed Biome and TypeScript.
- Release intent: `npm run changeset:status` resolves `@narumitw/pi-starship` to minor `0.51.0`.
- Repository tests: `npm test` passed 375 files and 3,769 tests.
- CI-equivalent gate: `npm run check` passed Biome, boundaries, all workspace typechecks, and 3,769 tests.
- Package smoke: `npm run pack:starship` inspected a 78-file dry-run tarball containing the changed README and runtime source.
- Live TUI/GitHub smoke was not run because it would require an interactive Pi session and external current-branch PR; deterministic runtime, render, lifecycle, and packaging tests cover the changed path.

## Completion Checklist

- [x] `$checks`, `$review`, and `$status` use only the documented compact forms.
- [x] No parallel short or verbose variables are added.
- [x] The default `github_pr` module format renders the compact `$status` without a settings migration.
- [x] Check output omits zero-count categories and does not reuse Git's `$`, `!`, or `?` check markers.
- [x] Review output remains distinguishable from check output without relying only on color.
- [x] Every documented compact value and precedence branch has deterministic test coverage.
- [x] README migration guidance and the Changeset clearly disclose the existing-variable behavior change.
- [x] Required tests, CI-equivalent checks, package smoke, semantic convention audit, and handoff evidence are complete.
