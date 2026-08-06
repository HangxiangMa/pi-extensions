# pi-sync menu conflict resolution plan

## Goal

Keep every user-resolvable sync-direction conflict inside the `/sync` manager: explain what changed,
let the user review exact path-level differences, and offer clearly worded local-wins or remote-wins
actions that retain pi-sync's existing previews, confirmations, backups, publication guards, and
cancellation behavior.

## Context

- The approved scope is the full flow: push conflicts, pull conflicts, `Sync now` conflicts,
  first-sync divergence, and pull-from-empty-remote recovery.
- `packages/pi-sync/src/sync-operations.ts` currently throws ordinary English-message errors for
  these conditions. `packages/pi-sync/src/sync.ts` catches and converts them to notifications, so
  `packages/pi-sync/src/manager-ui.ts` cannot present contextual recovery actions.
- Existing forced push and pull production paths already provide the required safeguards: exact
  summaries, confirmation, pull backups, protected live sessions, secret scanning, refreshed-head
  confirmation for forced push, backend publication preconditions, and state persistence.
- The manager already uses `@narumitw/pi-tui-kit`; standard action and review screens provide bounded
  rendering, injected keybindings, TUI/RPC adaptation, Back/Close semantics, and selection
  restoration.
- Applicable convention areas are commands/menus, TUI and non-interactive modes, factory/session
  lifecycle, deterministic tests, and documentation. No extension-owned setting or persistence
  schema changes are planned, so `docs/extension-settings.md` is not in scope.

## Architecture

### Domain result

Add an extension-owned structured decision contract instead of matching error text. A typed
`SyncDecisionRequiredError` will carry only sanitized/display-safe metadata needed by the workflow:

- decision kind: remote-or-policy-changed, both-changed, first-sync-settings-diverged,
  first-sync-sessions-diverged, or remote-empty;
- current sync setup name and a reviewed config/storage identity;
- cause flags for local, remote, and included-content-policy changes;
- prior/current included-content summaries when policy changed;
- exact path-level comparison text produced from the snapshots already observed by the failed
  operation;
- allowed resolution directions (`push`, `pull`, or both) and context-appropriate labels.

The typed error retains an actionable direct-command message for compatibility, but menu behavior
will branch on its class/kind rather than its wording. Authentication, transport, invalid settings,
secret-scan, lock, partial-publication, and unknown failures remain ordinary errors and must not gain
force actions.

### Command and menu boundary

Refactor internal route execution so a structured decision can reach the manager without duplicate
error notifications. Direct `/sync ...` invocations will still report the existing actionable text
and never open an interactive recovery flow. Automatic startup/shutdown sync remains non-interactive
and warning-only.

The manager will delegate a decision to a new, focused resolution UI module rather than growing the
already-large manager and sync-operation files past 1,000 lines. The nested standard menu will have:

1. **Resolve sync conflict** action screen with setup, causes, and a no-mutation statement.
2. **Review differences (recommended)** read-only review screen; Back restores the resolution
   selection.
3. Contextual direction actions:
   - **Keep local content and replace remote…** / **Use local as initial source…**
   - **Use remote content and replace local…** / **Use remote as initial source…**
   - **Push local content…** when the remote is empty.
4. **Back**, which returns to the originating manager screen without changing local, remote, or sync
   state.

Direction actions call the existing `push --force` or `pull --force` route for the captured setup.
They do not set `--yes`; therefore the existing exact production preview and confirmation remain the
final safety gate. Cancellation returns to the resolution screen. Success closes the resolution flow
and the outer manager. A newly returned structured decision replaces the displayed decision; an
ordinary failure is reported and leaves recovery available for retry or Back.

### Freshness and lifecycle

- Revalidate session ownership and the reviewed config/storage identity after every await before
  using mutable workflow state.
- Allow the forced push path to refresh a changed remote head and require its existing second
  confirmation; do not treat an expected remote refresh as stale config.
- Abort and drain loaders and nested menus on user cancellation, component disposal, session
  replacement, and shutdown. Once apply/publication commits, retain the existing non-cancellable
  boundary and warning.
- Sanitize setup names, policy text, paths, snapshot metadata, and errors at the display boundary.
- Use textual cause/status markers; color remains supplementary. Escape means Back and Ctrl+C closes
  the complete menu flow according to injected keybindings.

## Non-Goals

- Automatically merge file contents or choose a winner.
- Automatically chain pull-then-push or push-then-pull after review.
- Add new settings, persistence fields, command flags, or remove existing direct routes.
- Offer force recovery for credentials, networking, secrets, malformed settings, locks, ambiguous
  publication outcomes, or other non-directional failures.
- Change snapshot, backend, settings-file, or wire formats.

## Risks

- **Unsafe over-classification:** ordinary failures could accidentally expose destructive choices.
  Mitigation: only explicit typed decision errors enter the resolution UI; test representative
  generic and partial-publication errors.
- **Stale review:** remote or configuration state can change while the user reads the review.
  Mitigation: bind decisions to config identity, rerun the production operation, and retain refreshed
  push confirmation/backend preconditions.
- **Duplicate or missing feedback:** the current command layer owns notification side effects.
  Mitigation: introduce one typed internal route result and test manager, direct command, and
  automatic-sync boundaries independently.
- **Lifecycle leaks:** a nested resolution flow adds async ownership. Mitigation: use pi-tui-kit menu
  ownership plus the existing session signal, and add disposal/replacement tests that prove work is
  aborted and drained.
- **File-size regression:** `manager-ui.ts` and `sync-operations.ts` are already near 1,000 lines.
  Mitigation: put the decision contract and resolution UI in descriptive modules and audit final
  authored source lengths.

## Plan

- [x] Add focused failing operation tests under `packages/pi-sync/test/` for all five structured
      decision kinds, asserting setup/cause/direction/review data and proving detection makes no local,
      remote, or state mutation; run `npm test` and record that the new assertions fail because only
      ordinary errors exist.
- [x] Add a small domain module under `packages/pi-sync/src/` for the typed decision error,
      decision metadata, direct-message formatting, and safe path/policy review construction; replace
      only the five manual-direction error sites in `sync-operations.ts`, then run `npm test` and
      verify the new operation tests pass while generic error tests remain unchanged.
- [x] Add failing command-boundary tests proving manager routes receive structured decisions while
      direct `push`, `pull`, and `sync` routes still emit actionable notifications, unknown failures
      are reported once, and automatic sync never opens recovery UI; refactor `sync.ts`,
      `cancellable-operation.ts`, and their route result types until those focused behaviors pass.
- [x] Add failing TUI workflow tests with `@narumitw/pi-tui-kit/testing` for conflict entry, textual
      causes, recommended Review, exact path-level review, Back with restored selection, initial-sync
      labels, remote-empty actions, terminal-control sanitization, and 32/60/100-column rendering;
      implement the nested standard action/review flow in a new resolution UI module and connect it
      from `manager-ui.ts` until the tests pass.
- [x] Add failing resolution-action tests proving local-wins invokes `push --force`, remote-wins
      invokes `pull --force`, the captured setup is addressed without switching, no action adds
      `--yes`, confirmation cancellation returns to the same resolution, success closes the outer
      manager, a repeated structured decision refreshes the screen, and an ordinary retry failure
      remains recoverable; implement the smallest routing/state changes and rerun the focused tests.
- [x] Extend lifecycle and RPC tests to cover resolution-screen Back/Close behavior, scripted RPC
      review and direction choices, user cancellation before commit, non-cancellable commit behavior,
      external disposal, session replacement, and shutdown draining; run `npm test` and verify no
      stale continuation uses the old context or mutates state.
- [x] Strengthen deterministic production-path tests with the memory backend for forced push head
      refresh/reconfirmation, forced pull backup/apply, protected live sessions, secret-scan refusal,
      backend precondition failure, and config identity changes during resolution; reuse existing
      fixtures and confirm unsafe or partial failures never become decision screens with `npm test`.
- [x] Update `packages/pi-sync/README.md` to document the in-menu recovery workflow, exact meanings
      of local-wins/remote-wins, confirmation and backup guarantees, direct-route compatibility,
      automatic-sync behavior, and terminal accessibility; verify command documentation remains
      complete through `npm test`.
- [x] Audit the final diff against `docs/extension-conventions.md` for commands/menus, TUI/RPC and
      unsupported modes, cancellation/disposal/session replacement/shutdown, status cleanup,
      sanitization, compatibility, tests, and documentation; verify every authored source file stays
      below 1,000 lines or document and resolve any justified deviation.
- [x] Run `npm run check` as the CI-equivalent gate and perform a non-interactive Pi load/RPC smoke for
      the `/sync` manager without real credentials or network access; record exact commands and any
      intentionally unverified live-backend path in the plan before completion.


## Execution Evidence

- TDD process deviation: the production contract skeleton preceded the new test files, so an
  authentic red-first run was not captured. The residual regression risk was mitigated with focused
  production-boundary tests, existing-suite regressions, and the complete standalone repository gate.
- Structured decision and production-safety tests: current compiled
  `sync-decision.test.js` passes 10/10, covering all five decision kinds, no-mutation detection,
  forced pull backup/apply, forced-push secret refusal, direct-command compatibility, automatic-sync
  warning-only behavior, and push-confirmation cancellation.
- Menu, RPC, freshness, and lifecycle tests: current compiled `sync-resolution-ui.test.js` passes
  8/8, covering bounded/sanitized review, Back/Close, both directions, captured setup routing without
  `--yes`, confirmation cancellation, repeated decisions, stale config, session replacement, RPC,
  and manager integration.
- Focused regressions: compiled `custom-lifecycle`, `menu-wording`, `review-feedback`, and
  `settings-management` tests all pass.
- Source-size audit: `manager-ui.ts` is 942 lines, `sync-operations.ts` is 964 lines, and the new
  `sync-decision.ts` / `sync-resolution-ui.ts` modules are 113 / 166 lines.
- Documentation: `packages/pi-sync/README.md` describes conflict review, local/remote winner
  semantics, safety gates, cancellation, direct routes, automatic sync, and accessibility behavior.
- Runtime smoke: an empty temporary agent directory plus
  `pi -e ./packages/pi-sync --mode rpc --no-session` answered `get_commands` with `success: true`
  and the registered `sync` command; no credentials or remote network were used.
- Worktree CI-equivalent run: all build, Biome, boundary, and typecheck gates passed; the test gate's
  sole failure was the documented linked-worktree `GIT_DIR` injection in `git-runner.test.ts`. The
  final repository snapshot in a standalone Git checkout passed `npm run check` with 2,293/2,293
  tests. Its first run exposed the existing `pi-btw` rapid-update timing flake; the immediate complete
  rerun passed every gate and test.

## Completion Checklist

- [x] Push, pull, `Sync now`, both first-sync divergence variants, and empty-remote pull all enter an
      actionable manager-owned recovery flow.
- [x] Review shows causes and exact affected paths, returns predictably, and never mutates state.
- [x] Local-wins and remote-wins reuse existing force production paths with exact confirmation,
      backup, secret, refreshed-head, and backend concurrency safeguards intact.
- [x] Cancellation, Back, Close, disposal, session replacement, shutdown, repeated conflict, success,
      generic error, and partial-publication states have deterministic evidence.
- [x] TUI and RPC manager behavior is usable and bounded; print/JSON rejection, direct commands,
      automatic sync, settings/wire formats, and existing public routes remain compatible.
- [x] README behavior and safety guidance matches the implementation.
- [x] `npm run check` passes, the non-interactive Pi/RPC smoke is recorded, and no required verification
      remains open.
