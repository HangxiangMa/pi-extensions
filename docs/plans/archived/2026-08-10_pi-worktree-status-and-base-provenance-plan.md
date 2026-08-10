# pi-worktree status and base provenance plan

## Goal

Add an on-demand, read-only worktree status browser and make every Add confirmation identify the exact approved branch/base commit without weakening pi-worktree's existing mutation and session-safety boundaries.

## Context

- `packages/pi-worktree/src/command.ts` currently shows only registered count, current path, and root on the main menu.
- Switch and Remove reuse compact `formatWorktree()` labels, but there is no dedicated status view for staged, unstaged, untracked, conflict, upstream, or last-commit state.
- Add resolves a new branch's start point to an OID but confirms only its user-facing label, while attaching an existing branch confirms no OID.
- `@narumitw/pi-tui-kit` now provides a standard read-only `browse` screen, but `packages/pi-worktree/package.json` still declares a compatibility floor from before that API existed.
- This is a bounded menu surface rather than a product-wide navigation redesign.

## Architecture

- Keep `git worktree list --porcelain -z` and `WorktreeRecord` as the authoritative registered-worktree identity source.
- Add `packages/pi-worktree/src/status.ts` for read-only status collection, porcelain-v2 parsing, bounded-concurrency loading, and terminal-safe card formatting so `git.ts` remains below the repository's 1,000-line split threshold.
- Add one **Worktree status** action to the existing root menu.
- Load status only after that action is chosen, then transition to Pi TUI Kit's read-only `browse` screen.
- Represent each card with a semantic text summary and details for path, current/main/detached state, full HEAD OID, staged/unstaged/untracked/conflict counts, upstream ahead/behind when Git reports an upstream, and last commit timestamp/subject.
- Label absent upstream data as unavailable rather than claiming that a branch has no unpushed commits.
- Treat bare, missing, and prunable worktrees as visible cards with an explicit unavailable reason instead of probing them or hiding them.
- Let one worktree's read failure degrade only that card, while cancellation or session replacement aborts the entire load and prevents stale UI publication.
- Use a fixed small concurrency bound and existing Git timeouts; do not add a watcher, cache, timer, setting, or background refresh.
- Model Add provenance as one of: existing local branch, current symbolic branch used by a blank default, or explicit commit-ish.
- Show the provenance kind, source label, full resolved OID, branch mode (new or existing), and target path in the destructive preview.
- Pin new-branch creation to the already approved OID.
- Recheck existing-branch occupancy and OID immediately before mutation, then verify the created worktree's branch and HEAD against the approved preview.
- Preserve the current recovery rule: if Git mutation succeeds but post-verification fails, retain the worktree and report exact inspection guidance instead of attempting rollback.

## Non-Goals

- Do not add remote fetch, default-branch discovery, pull-request checkout, merge, rebase, branch deletion, force, setup hooks, ignored-file copying, agent orchestration, or automatic cleanup.
- Do not add textual `/worktree` subcommands, argument completion, an LLM tool, persistent statusline state, or support for print/JSON mode.
- Do not make informational status cards replace Remove's stricter inventory, submodule, index-flag, detached-history, or post-confirmation safety checks.
- Do not infer repository activity from filesystem timestamps or describe last commit time as last user activity.

## Assumptions

- The status action may take longer on repositories with many worktrees, so the main menu remains fast and the action exposes a cancellable busy state.
- Upstream ahead/behind comes only from Git's porcelain-v2 branch headers and requires no network access.
- Last-commit details are resolved from the status snapshot's exact HEAD OID so concurrent HEAD changes cannot mix two commits in one card.
- The published Pi TUI Kit release containing the `browse` screen is available before implementation raises the consumer floor.

## Risks

- `git status` output can be large in heavily modified repositories; defer collection to the explicit status action, retain timeouts, avoid retaining raw path inventories, and format only aggregate counts.
- Worktree state can change while a read-only card is displayed; identify it as a snapshot and never reuse it as mutation authorization.
- Existing branches can move between preflight and `git worktree add`; perform immediate preflight and post-mutation HEAD verification, but document that Git offers no atomic compare-and-add operation for this flow.
- Git-controlled paths, refs, upstreams, subjects, and errors are untrusted terminal input; sanitize each display value before filtering, wrapping, truncation, or rendering.
- Raising the Pi TUI Kit floor changes package compatibility; derive the minimum published version from the registry/manifest at execution time, update the lockfile, and verify the resolved consumer version before typechecking.

## Plan

- [x] Add focused failing tests in `packages/pi-worktree/test/status.test.ts` for porcelain-v2 clean, staged, unstaged, untracked, conflicted, renamed, detached, upstream ahead/behind, missing-upstream, malformed, and terminal-control cases; evidence: the new tests fail before production status parsing exists.
- [x] Add focused failing command tests in `packages/pi-worktree/test/status-command.test.ts` for the on-demand **Worktree status** action, semantic browse rows/details, partial per-worktree failures, cancellation, and session-replacement disposal; evidence: the tests failed without the status action and stale-publication guards.
- [x] Implement `packages/pi-worktree/src/status.ts` to collect `git status --porcelain=v2 --branch -z`, parse aggregate state without retaining displayed file names, resolve last-commit details from the parsed OID, sanitize display fields, and load cards with bounded concurrency; verify with `npm test -- packages/pi-worktree/test/status.test.ts`.
- [x] Extend `packages/pi-worktree/src/command.ts` with menu-owned status state, a cancellable busy action, and a Pi TUI Kit `browse` screen that returns to the unchanged main menu; evidence: narrow and wide TUI rendering plus deterministic RPC detail pagination pass in `packages/pi-worktree/test/status-command.test.ts`.
- [x] Add a deterministic real-Git case to `packages/pi-worktree/test/git.integration.test.ts` covering clean and changed linked worktrees without a remote; evidence: aggregate counts and exact-HEAD last-commit data match the temporary repository.
- [x] Add focused failing Add-flow tests in `packages/pi-worktree/test/add-command.test.ts` for new/default, new/explicit, and existing-branch provenance, full approved OIDs, terminal sanitization, branch movement before mutation, and post-add HEAD mismatch recovery; evidence: the tests failed against the previous label-only confirmation and branch/path-only verification.
- [x] Update the Add preflight and confirmation in `packages/pi-worktree/src/command.ts` so provenance is explicit, new branches remain pinned to the approved OID, existing branches are rechecked immediately before mutation, and created HEAD is verified against the approved OID; verify with the focused Add tests and existing add/switch/remove race tests.
- [x] Raise `packages/pi-worktree/package.json` to the minimum already-published `@narumitw/pi-tui-kit` version containing `browse`, run root `npm install`, and verify `package-lock.json` resolves that floor before typechecking; evidence: `npm ls @narumitw/pi-tui-kit --workspace @narumitw/pi-worktree` and the lockfile show a compatible published version.
- [x] Update `packages/pi-worktree/README.md` to document the status snapshot fields, no-upstream semantics, on-demand/no-network behavior, exact Add provenance, stale-snapshot limitation, and unchanged safety boundaries; update the package layout for `src/status.ts` and `test/status.test.ts`.
- [x] Add a minor Changeset for `@narumitw/pi-worktree` describing the new read-only status browser and exact Add provenance preview; evidence: the Changeset names only the behavior-changing package and uses no fixed/linked group.
- [x] Run focused formatting and checks for `packages/pi-worktree`, then rebuild Pi TUI Kit before consumer tests as required; evidence: package check, focused tests, and typecheck pass without concurrent Kit/root checks.
- [x] Run the CI-equivalent `npm run check`; evidence: formatting, boundaries, typechecks, and all active tests pass.
- [x] Run `just pack worktree` and inspect the tarball, then run `just try worktree` or an equivalent `pi -e ./packages/pi-worktree` TUI smoke when practical; evidence: published files include the new source and README, status browsing cancels cleanly, and Add shows exact provenance without mutating on cancellation.
- [x] Audit the final diff against `docs/extension-conventions.md` for command/menu, TUI/RPC, terminal sanitization, cancellation/disposal, session replacement, documentation, Changeset, and verification rules; evidence: the handoff names the audit, checks, smoke result, deviations, and any unverified path.

## Completion Checklist

- [x] **Worktree status** is a read-only, on-demand root-menu action with textual, width-safe cards in TUI and deterministic bounded details in RPC.
- [x] Status cards distinguish clean, staged, unstaged, untracked, conflict, upstream, detached, locked, prunable, missing, and partial-error states without overclaiming unpushed or activity state.
- [x] Status loading is cancellable, bounded, free of persistent background work, and cannot publish through a replaced session context.
- [x] Every Add confirmation identifies new/existing mode, provenance kind, source label, full approved OID, and target path.
- [x] New-branch creation uses the approved OID, while existing-branch movement is detected before mutation when observable and after mutation through exact HEAD verification.
- [x] Existing Remove, Prune, switch, no-argument command, and unsupported-mode behavior remains compatible.
- [x] Focused tests, integration tests, package checks, `npm run check`, pack inspection, and the practical Pi TUI smoke pass, or unavailable smokes remain explicitly open with a reason.
- [x] The published behavior has a Changeset and the completed plan is moved to `docs/plans/archived/` only after every item above has evidence.

## Execution Evidence

- TDD red states were observed for the missing status module, four missing status-menu behaviors, four Add provenance/race behaviors, and the three independent-review regressions before implementation.
- `npm run check --workspace @narumitw/pi-worktree` passed after formatting and typechecking 20 package files.
- All 88 pi-worktree tests passed across 10 test files after rebuilding Pi TUI Kit.
- `npm ls @narumitw/pi-tui-kit --workspace @narumitw/pi-worktree --depth=0` resolved the published `0.51.0` compatibility floor recorded in `package-lock.json`.
- Final `npm run check` passed Biome, boundaries, every workspace typecheck, and 2,811 tests across 260 files.
- The first root check exposed two unrelated pi-sync timing failures; both passed in isolation, and two subsequent full root checks passed.
- `just pack worktree` included `src/status.ts`, the updated README, and all expected package files in the dry-run tarball.
- A live `pi -e ./packages/pi-worktree --no-session` smoke in Herdr displayed searchable status cards and exact quoted Add provenance; cancelling Add created neither the branch nor target path.
- Independent Codex review found three issues (final filesystem revalidation, reversible preview quoting, and missing divergence uncertainty); regression tests and fixes were added, and the final re-review reported `No findings`.
- The final semantic audit covered command/menu compatibility, TUI/RPC behavior, cancellation and session replacement, terminal sanitization, Git mutation revalidation, package boundaries, documentation, Changeset, packaging, and the absence of new background resources or settings.
