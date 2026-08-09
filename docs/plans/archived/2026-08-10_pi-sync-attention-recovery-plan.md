# pi-sync attention recovery plan

## Goal

Let TUI users resolve an explicit local/remote synced-content-list mismatch at the point where
pi-sync detects it, without requiring them to remember `/sync` or search Settings, while preserving
every existing no-mutation default, exact review, privacy acknowledgement, force-push confirmation,
remote freshness check, atomic settings write, cancellation, and non-TUI compatibility guarantee.

## Context

- The current package is `@narumitw/pi-sync` version 0.49.7, and the exact historical error
  **Remote included content differs from this sync setup** no longer exists in current source.
- The completed inline-selection work already routes no-argument manager operations into
  **Synced content differs**, with review-first remote adoption and the existing reviewed local-wins
  push.
- `packages/pi-sync/test/sync.test.ts` deliberately proves that automatic selection mismatch is
  warning-only and never opens recovery UI.
- Direct `/sync sync`, `/sync pull`, and `/sync push` routes still convert a typed selection mismatch
  into an actionable notification rather than continuing into the existing resolution flow.
- `packages/pi-sync/src/manager-state.ts` always reports **Remote status: Not checked** because opening
  the manager intentionally avoids remote I/O and cannot currently receive a mismatch already
  observed by automatic sync.
- Pi notifications, statuses, and widgets are not actionable controls, so copy-only changes cannot
  remove the command-and-search step.
- Pi TUI Kit supports lifecycle-owned menus using `ExtensionContext`, but the current pi-sync review,
  cancellable-operation, dispatcher, and resolution APIs are typed around `ExtensionCommandContext`.
- `sync-operations.ts` is already 1,000 lines and `manager-ui.ts` is above 900 lines, so new state and
  orchestration must live in focused modules.
- The worktree currently lacks installed test dependencies, and the research-time focused Vitest
  command could not start because `vitest` was unavailable.
- Implementation remains unauthorized until the user explicitly approves it; this plan creation does
  not authorize product changes.

## Architecture

### Session-owned attention state

Add a focused `sync-attention.ts` domain/presentation module that owns only in-memory state for the
current session.

The state will contain the typed `RemoteSelectionDecision`, the originating route, whether the
startup offer has already been shown, and a generation or owner identity needed to reject stale
continuations.

The state will never contain credentials, file contents, unsanitized terminal text, mutable backend
objects, or a captured stale context.

The state will reset on `session_start`, abort on replacement or shutdown, and never be serialized to
`pi-sync.json`, sync state, session entries, or snapshot metadata.

Every resolution action will still reload and revalidate the setup, remote head, immutable snapshot,
and local include list before mutation, so the in-memory decision is a navigation aid rather than an
authority.

### Automatic TUI recovery

When startup automatic sync catches exactly `RemoteSelectionMismatchError`, it will retain the typed
decision instead of reducing it immediately to a generic warning.

In TUI mode, the session will open the existing **Synced content differs** flow once, with
**Review all paths (recommended)** first and **Later** as the no-side-effect exit.

The automatic offer will not appear for authentication, network, malformed settings, lock,
secret-scan, publication, ordinary file-direction conflict, or unknown errors.

Selecting **Later**, pressing Escape, cancelling a nested confirmation, or encountering an ordinary
failure will return control to the Pi editor and preserve attention for later recovery.

Session shutdown will never open a dialog because Pi is exiting, and shutdown mismatch will retain
warning-only behavior for compatibility and lifecycle safety.

### Persistent non-modal attention presentation

After deferral or a non-resolving TUI route, pi-sync will show one compact, width-safe widget above
the editor and the aggregated `sync` footer status.

The widget will name the setup, show remote-only/device-only counts or the order-only condition, say
that nothing changed, and identify `/sync` as the fallback route.

The widget is informational rather than pretending to be clickable, and it will use textual meaning
rather than color alone.

The widget and attention status will clear only after a successful resolution, a fresh check proving
that the lists match, a setup change that invalidates the decision, session replacement, or shutdown.

Temporary activity text such as checking or pushing must restore the pending attention status rather
than accidentally clearing it.

### Manager priority and disabled state

Pass current in-memory attention into the manager state projection without adding remote I/O to
ordinary manager loading.

When attention is current, the main screen will show **Sync status: Review needed**, place
**Review synced content (recommended)** first, and keep **Sync now** visible but unavailable with the
reason **Choose which content list to use first**.

The main screen remains one flat group of at most seven actions and uses Pi TUI Kit's existing
disabled-row reason presentation.

Back from the review returns to the manager with attention intact, while successful resolution
refreshes the manager and removes the disabled state.

### Direct command behavior

Interactive TUI invocations of `/sync sync`, `/sync pull`, and `/sync push` without `--yes` will feed
a typed selection mismatch into the same dispatcher and review flow instead of ending at a
notification.

Established command names, flags, completions, setup targeting, exact previews, and force semantics
will remain unchanged.

TUI routes that explicitly use `--yes` will remain deterministic and non-resolving, but will show the
exact mismatch and leave visible attention for manual recovery.

RPC will remain read-only for remote-selection review and will not receive an unsolicited startup
dialog.

Print and JSON will retain their current observable rejection, and shutdown automation will retain
warning-only behavior.

### Shared context and route boundary

Generalize only the UI and production-route surfaces needed by lifecycle recovery from
`ExtensionCommandContext` to the smallest common `ExtensionContext`-compatible contract.

Do not cast a lifecycle context to `ExtensionCommandContext` and do not expose command-only session
replacement methods through a fake interface.

Reuse `push()`, `pull()`, and `syncBoth()` production paths, the cross-process operation lock,
`runCancellableOperation()`, `showRemoteSelectionReview()`, and the iterative manager dispatcher.

If current Pi cannot safely host a `ctx.ui.custom()` interaction during `session_start`, stop after the
qualification test and request approval for a deferred-idle or banner-only fallback rather than
silently changing the approved experience.

## Non-Goals

- Do not automatically adopt the remote list or publish the device list.
- Do not make the widget clickable or register a global keyboard shortcut.
- Do not add `/sync review`, a new flag, a new settings field, or a stored snooze preference.
- Do not persist a mismatch decision across processes or sessions.
- Do not change ordered `sync.include` equality, snapshot selection format, sync state, backend wire
  format, or the version 3 settings schema.
- Do not make legacy snapshot discovery authoritative or adoptable.
- Do not broaden interactive recovery to ordinary file-direction conflicts during automatic startup.
- Do not weaken `--yes`, force-push, forced-pull, secret scan, backup, publication precondition, or
  commit-boundary behavior.

## Assumptions

- The proposed startup interruption is acceptable only for a typed content-list mismatch that has
  already blocked automatic sync.
- **Later** means defer for the current interaction, not suppress the condition permanently.
- The existing remote-adoption and local-wins implementations remain the sole mutation paths.
- Direct routes without `--yes` are already interactive workflows, so continuing into reviewed TUI
  recovery is compatible with their user intent.
- A patch Changeset is required because the work changes published package behavior.

## Unknowns

- A real Pi smoke must confirm that a lifecycle-owned standard menu can safely open during
  `session_start` without racing another startup UI or retaining stale focus.
- The current test fixtures must be checked for a reliable way to distinguish automatic startup,
  direct TUI, and shutdown contexts without source-text assertions.
- The final widget height and copy must be validated at constrained terminal heights so persistent
  recovery does not crowd the editor.

## Risks

- **Startup interruption:** A modal recovery screen may surprise users who only wanted to start Pi.
  Mitigation: trigger only for the typed blocking mismatch, show it once per session, keep **Later**
  immediate, and never trigger for generic failures.
- **UI contention:** Another extension may also request startup interaction.
  Mitigation: qualify the real lifecycle behavior first, retain one owner signal, and stop for an
  approved fallback if Pi cannot safely serialize the interaction.
- **Stale decision:** The setup or remote head can change after detection or deferral.
  Mitigation: keep decisions in memory only and retain every existing local/remote revalidation before
  settings or remote mutation.
- **Status loss:** Existing operations clear the shared `sync` status in many completion paths.
  Mitigation: centralize activity-versus-attention publication and test restoration after success,
  failure, cancellation, and stale refresh.
- **Unsafe over-classification:** A generic failure could accidentally expose a force action.
  Mitigation: enter attention and resolution only from `RemoteSelectionMismatchError` or its typed
  internal result.
- **Automation regression:** RPC or `--yes` callers could unexpectedly block on a dialog.
  Mitigation: keep those routes non-resolving and add explicit negative tests for every supported
  mode.
- **Lifecycle leak:** Startup prompt, widget, nested loader, or direct-route continuation could outlive
  its session.
  Mitigation: combine owner/action signals, abort and drain owned work, revalidate after every await,
  and clear exact UI keys on replacement and shutdown.
- **Source-size regression:** Changes could push large orchestration modules beyond the repository
  boundary.
  Mitigation: add a focused attention module and keep `sync-operations.ts` unchanged unless code is
  first moved along a clear responsibility boundary.

## Plan

- [x] Install the locked workspace dependencies with `npm install`, verify no intended manifest or
  lockfile change with `git diff -- package.json package-lock.json`, and run the four current focused
  pi-sync suites to establish a green baseline before behavior changes.
- [x] Add a narrow lifecycle qualification test and temporary local Pi smoke for opening and
  cancelling an `ExtensionContext`-owned Pi TUI Kit menu during `session_start`; verify the test first
  fails because automatic mismatch remains warning-only, and stop for user approval if the real
  runtime cannot safely host the interaction.
- [x] Add red-first tests in `packages/pi-sync/test/sync.test.ts` for a typed automatic selection
  mismatch opening exactly one TUI recovery offer, **Later** returning without mutation, generic
  automatic failures remaining notification-only, and shutdown remaining non-interactive; record the
  intended assertion failures before production edits.
- [x] Implement session-owned attention state in a focused `packages/pi-sync/src/sync-attention.ts`
  module and connect only typed startup mismatch detection in `sync-extension.ts`; verify the new
  automatic-flow tests pass without changing settings, files, sync state, or remote data.
- [x] Add TUI presentation tests for the deferred attention widget and footer state,
  terminal-control sanitization, remote/device counts, order-only wording, stable rendering at
  32/60/100 columns and constrained heights, and exact cleanup on resolution, replacement, and
  shutdown.
- [x] Implement the compact attention widget and centralized activity/attention status restoration;
  verify temporary checking/pushing states restore pending attention after cancellation or failure
  and clear it only after a verified resolution or invalidation.
- [x] Add red-first manager tests in `packages/pi-sync/test/menu-wording.test.ts` and
  `packages/pi-sync/test/sync-resolution-ui.test.ts` for **Review synced content (recommended)** as
  the first action, visible disabled **Sync now** with a reason, Back preserving attention, and
  success refreshing the ordinary manager state.
- [x] Pass attention into a structured manager-state projection and connect the existing
  remote-selection dispatcher without remote I/O during ordinary manager loading; verify the action
  group stays flat, bounded, sanitized, and at most seven rows.
- [x] Add red-first command-boundary tests for direct TUI `sync`, `pull`, and `push` continuing into
  resolution without `--yes`, while TUI `--yes`, RPC, print, and JSON remain non-resolving and
  observable; verify setup targeting, completions, and ordinary error routing remain unchanged.
- [x] Generalize the smallest shared context and route contracts needed by startup/direct recovery,
  reuse existing locked production push/pull/sync paths, and make the direct-route tests pass without
  casts to command context or duplicate feedback.
- [x] Extend existing remote-selection tests for adoption, sessions acknowledgement refusal, local-wins
  force-push preparation, stale remote refresh, concurrent local include change, continuation,
  ordinary failure, and cancellation after deferral; verify every side effect still passes through
  existing expected-storage/include and remote-revision checks.
- [x] Extend lifecycle tests for Escape, Later, Back, Ctrl+C, component disposal, session replacement,
  reload, repeated `session_start`, owner abort during loading, pre-commit cancellation, post-commit
  non-cancellability, and pending-work draining; verify no stale context or widget survives shutdown.
- [x] Update `packages/pi-sync/README.md` with automatic TUI attention, Later recovery, manager
  priority, direct-route mode behavior, no-mutation guarantees, and accessibility limits; verify
  every documented mode and action has matching deterministic test evidence. The Changesets release
  workflow owns `CHANGELOG.md`, so no manual unreleased section was added.
- [x] Add a patch Changeset for `@narumitw/pi-sync` and run `just changeset-status`; verify the release
  intent names the user-visible recovery improvement and states that settings and snapshot schemas do
  not change.
- [x] Audit the complete diff against `docs/extension-conventions.md`,
  `docs/extension-settings.md`, the touched-area checklist, and the accepted portable-selection ADR;
  record command compatibility, settings concurrency, invalid-file protection, unknown-field
  preservation, cancellation/disposal/replacement/shutdown, post-await freshness, terminal safety,
  accessibility, source-size, and any deviation in this plan.
- [x] Run focused Vitest suites, all pi-sync tests, `npm test`, `npm run check`, `git diff --check`,
  `just pack sync`, and a temporary-agent TUI/RPC extension smoke without real credentials or remote
  storage; inspect the tarball and leave every unavailable or failing verification unchecked.
- [x] Compare the final implementation against every acceptance item below, inspect the selected diff
  for unrelated changes, record exact evidence and unverified live-backend paths in this plan, and
  move the fully completed plan to `docs/plans/archived/` only after all checks pass.

## Evidence

- Baseline: `npm install` resolved the lockfile, the intended Kit floor was then raised to the
  registry-visible `@narumitw/pi-tui-kit@0.52.0`, and the four baseline suites passed 73 tests.
- TDD: automatic recovery, direct recovery, manager priority, lock release, stale-attention cleanup,
  and completed-force-push regressions each failed for the intended missing behavior before the
  production fix and passed afterward.
- Lifecycle: deterministic Pi TUI Kit harness tests cover startup opening, Later, Back, Ctrl+C,
  replacement, shutdown, loader disposal, pre-commit cancellation, post-commit settlement, repeated
  mismatch transitions, and concurrent state-directory access while the startup menu remains open.
- Presentation: `sync-attention.test.ts` proves sanitized, cell-bounded 32/60/100-column rendering,
  order-only wording, status restoration, and exact status/widget cleanup.
- Modes: command-boundary tests prove direct interactive TUI recovery, non-interactive TUI `--yes`,
  read-only RPC mismatch behavior, and shutdown warning-only behavior.
- Safety: existing and extended tests prove remote-head and local-config revalidation, sessions privacy
  refusal, atomic settings adoption, unknown-field preservation, force-push confirmation, and stale
  refresh behavior.
- Hardening: review fixed an unsolicited startup menu holding the state-directory migration guard,
  stale attention after local setup changes or successful force push, non-current setup attention,
  current-setup Sync-now gating, and stale callback identity races.
- Package verification: all 39 pi-sync files passed 335 tests, `npm test` passed 2,651 tests in 232
  files, and the final `npm run check` passed build, Biome, boundaries, all typechecks, and all tests.
- Release verification: `just changeset-status` reports only a patch for `@narumitw/pi-sync`, and
  `just pack sync` includes both new attention modules in a 58-file dry-run tarball.
- Runtime verification: a temporary-agent Pi RPC process loaded the local extension and returned the
  registered `/sync` command without credentials or remote storage.
- Interactive TUI verification used the repository's real Pi TUI Kit harness because repository
  execution policy forbids launching an interactive TUI command; no live-provider backend smoke was
  run because this recovery path has deterministic backend doubles and needs no credentials.
- Semantic audits found no settings or snapshot schema change, no migration, no extension-boundary
  violation, no terminal-control leak, and no changed source file over 1,000 lines.
- Documentation deviation: this repository's Changesets workflow owns release notes, so the README and
  patch Changeset were updated instead of adding a manual `CHANGELOG.md` entry.

## Rollback / Recovery

The change adds no stored migration, so code rollback restores the prior warning-only automatic
behavior without transforming settings, sync state, or remote snapshots.

If the startup interaction proves disruptive after deterministic verification, revert the lifecycle
entry while retaining existing inline manager recovery and remove its widget/attention state in the
same focused rollback.

Never roll back by automatically choosing a content list, deleting remote snapshots, rewriting
`pi-sync.json`, or clearing an operation lock.

## Completion Checklist

- [x] A typed automatic content-list mismatch opens one immediate, review-first TUI recovery flow with
  **Later**, while generic automatic failures and shutdown never open it.
- [x] Deferral leaves settings, files, sync state, and remote data unchanged and leaves a compact,
  sanitized, width-safe attention state visible until verified resolution or invalidation.
- [x] The manager makes recovery the first action, explains why Sync now is unavailable, preserves
  Back and Close behavior, and performs no extra remote I/O merely to open.
- [x] Direct interactive TUI sync/pull/push routes resolve inline without `--yes`, while `--yes`, RPC,
  print, JSON, command names, flags, completions, and setup targeting remain compatible.
- [x] Remote adoption, sessions privacy acknowledgement, local-wins force push, stale refresh,
  secrets, backups, publication preconditions, atomic settings writes, and commit boundaries retain
  their existing production safeguards.
- [x] Loading, empty, partial, success, error, disabled, cancellation, recovery, replacement, reload,
  and shutdown states have deterministic behavior and test evidence.
- [x] TUI output is keyboard-operable, textually meaningful without color, focus-safe, control-safe,
  and bounded at tested widths and constrained heights.
- [x] No settings, snapshot, sync-state, backend, or session-entry schema changes or migrations were
  introduced, and unknown settings fields remain preserved.
- [x] README, Changeset-managed release notes, semantic audits, focused tests, repository gate, package
  dry run, and deterministic TUI/RPC smokes all match the final diff with unverified live-provider
  paths recorded.
- [x] Every plan task and completion item is checked with evidence, the final diff contains only the
  approved scope, and the completed plan is archived before implementation is declared complete.
