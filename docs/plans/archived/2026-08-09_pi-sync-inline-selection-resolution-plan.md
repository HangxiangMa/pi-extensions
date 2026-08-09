# pi-sync inline selection resolution plan

## Goal

Keep an explicit local/remote included-content mismatch inside the user's current `/sync` flow.
Replace the dead-end error and Settings detour with a review-first choice that can adopt the remote
content list or open the existing reviewed local-wins push, while preserving every current privacy,
concurrency, confirmation, and no-silent-sync safeguard.

## Context

- `sync-operations.ts` intentionally throws `RemoteSelectionMismatchError` before sync or pull can
  mutate files, including for forced pulls.
- `sync-extension.ts` converts ordinary sync-direction conflicts into manager-owned structured
  decisions, but it currently treats `RemoteSelectionMismatchError` as a generic notification and
  returns `{ kind: "failed" }` to the manager.
- `remote-selection-ui.ts` already performs safe remote adoption by revalidating the remote head,
  expected storage, and expected local include list before an atomic settings update.
- The current **Keep local included content** action is a no-op that tells the user to find a
  reviewed force push later, and a successful adoption tells the user to leave Settings and start
  Sync now separately.
- `sync-resolution-ui.ts` and `runCancellableOperation()` already provide reviewed force-direction
  routing, confirmation cancellation, commit boundaries, RPC adaptation, and session-owned
  cancellation patterns that this flow should reuse rather than duplicate.
- `sync.include` is an ordered policy in the accepted ADR, snapshots, settings stale checks, and
  sync state, so this change must explain order-only differences rather than silently changing
  policy equality.
- `manager-ui.ts` and `sync-operations.ts` are currently 942 and 998 lines, so new coordination must
  remain in focused modules instead of pushing either file over the repository's 1,000-line review
  threshold.

## Architecture

### Structured decision boundary

Add a dedicated remote-selection decision result to the internal `RunRouteResult` contract.
It will carry the captured setup name plus normalized local and remote include lists without remote
credentials, file contents, or unsanitized display strings.

`executeCommand()` will classify only `RemoteSelectionMismatchError` into this result.
Malformed policy, authentication, transport, lock, secret-scan, stale-publication, and unknown
errors will remain ordinary failures and will never expose force actions.

The no-argument manager will pass the originating action (`sync`, `pull`, or `push`) and captured
setup to a focused remote-selection resolver.
Direct textual subcommands will remain deterministic and will report the exact local-only,
remote-only, or order-only difference plus an actionable `/sync` recovery instruction.
Automatic startup/shutdown sync will remain non-interactive and warning-only.

### Review-first TUI flow

Refactor the existing remote-selection review into one reusable TUI flow reached from both the
originating manager operation and **Settings → Compare synced content**.
The first screen will use the title **Synced content differs**, state that nothing changed, show a
bounded difference summary, and place **Review all paths (recommended)** first.

The remaining actions will be:

1. **Use remote content list**.
2. **Keep this device's content list and update remote…**.
3. **Cancel**.

The exact review will retain remote-only, device-only, and ordered lists.
When membership matches but order differs, the summary will explicitly say that only ordering
differs.
Terminal controls will be stripped at the display boundary, and all supported widths will remain
bounded.

### Remote adoption and explicit continuation

Adoption will retain the current session privacy acknowledgement, remote-head revalidation,
head/snapshot integrity check, expected-storage/include checks, cross-process settings lock, unknown
field preservation, and atomic settings publication.
Adoption itself will still save only `sync.include` and will not pull files or write sync state.

After a successful save, the same flow will show **Remote content list saved** and state that no
files were pulled.
It will offer an explicit **Continue …** action for the originating operation, or **Continue Sync
now…** when entered from Settings, plus **Done**.
Continuation will start a fresh production route and preview rather than resume stale snapshots or
locks from the failed attempt.
If the user stops after adoption, the reviewed settings change remains saved and no file operation
is implied.

### Local selection publication and result chaining

**Keep this device's content list and update remote…** will invoke the existing `push --force`
route for the captured setup without `--yes`.
The existing secret scan, exact publication preview, remote-head refresh and reconfirmation, backend
precondition, preserved-unmanaged-file handling, and commit boundary remain the final safety gates.
Cancelling preparation or confirmation will return to the selection screen with no remote mutation.

A small manager-owned result dispatcher will handle results returned by continuation or local-wins
publication.
A file-direction decision will transition to the existing `showSyncResolution()` flow, a repeated
selection mismatch will refresh the comparison, an ordinary failure will be reported once, and
successful apply/publication will close according to existing manager behavior.
The dispatcher will use explicit iteration or bounded state transitions rather than unbounded
recursive retries.

### Modes and compatibility

TUI manager and Settings flows will receive the interactive resolution experience.
RPC remote-selection review will remain read-only, and print/JSON behavior will remain rejected or
non-interactive as documented.
Existing slash-command names, flags, setup targeting, snapshot and settings schemas, ordered
selection semantics, legacy snapshot discovery, and backend formats will not change.

## Non-Goals

- Do not automatically choose local or remote selection.
- Do not automatically start a pull immediately after adoption.
- Do not allow `pull --force` to bypass an unadopted remote selection.
- Do not merge file contents, alter preserved-unmanaged-file policy, or weaken push/pull previews.
- Do not add a public command, flag, settings field, snapshot field, or migration.
- Do not make legacy snapshot discovery authoritative or adoptable.
- Do not change ordered `sync.include` equality in this work.

## Assumptions

- The approved experience covers the no-argument TUI manager and the existing TUI Settings entry.
- Direct subcommands and automatic sync preserve their current non-resolving behavior but receive
  clearer actionable output.
- An explicit Continue action after adoption satisfies the requirement that adoption itself never
  starts another network operation.
- Copy will prefer **synced content**, **this device**, and **update remote** over internal terms
  such as **remote policy** and **reviewed force push**, while exact technical wording remains
  available in detailed review and documentation.

## Risks

- **Unsafe classification:** A generic remote failure could accidentally expose local-wins push.
  Mitigation: classify only the existing typed selection mismatch and test representative malformed,
  transport, secret, and publication failures.
- **Stale review:** Remote or local settings can change while the decision is open.
  Mitigation: retain all existing freshness checks, refresh the displayed comparison after a stale
  result, and never continue from snapshots captured by the failed operation.
- **Partial user intent:** Adoption can succeed before the user cancels the subsequent file
  operation.
  Mitigation: label the settings save and continuation as separate steps and test the saved-policy,
  no-file-mutation state.
- **Nested-flow lifecycle leaks:** Review, adoption, and continuation add asynchronous transitions.
  Mitigation: propagate the session/action signals, dispose owned components, abort and drain
  pending work, and revalidate mutable state after every await.
- **Duplicate feedback or loops:** A continuation can return another selection or file-direction
  decision.
  Mitigation: centralize result dispatch, report each ordinary failure once, and require a fresh
  user action for every retry.
- **Source-size regression:** The two largest orchestration modules are already near 1,000 lines.
  Mitigation: keep the new decision and workflow coordination in descriptive focused modules and
  verify authored line counts before completion.

## Plan

- [x] Add red-first operation and command-boundary tests in
  `packages/pi-sync/test/sync-decision.test.ts` and `packages/pi-sync/test/sync.test.ts` that
  require a typed remote-selection result with setup/local/remote data, exact direct-command
  guidance, generic error isolation, automatic warning-only behavior, and zero
  local/remote/state mutation; run `npm test` and record that only the new contract assertions
  fail before production changes.
- [x] Extend the internal decision/result contract in focused `packages/pi-sync/src/` modules and
  update `sync-extension.ts` to classify only `RemoteSelectionMismatchError`; verify the new
  boundary tests and all existing decision tests pass with `npm test`.
- [x] Add red-first TUI tests in `packages/pi-sync/test/remote-selection-ui.test.ts` for
  manager entry, the **Synced content differs** no-mutation screen, review-first action order,
  exact remote/device lists, order-only wording, terminal-control sanitization, and bounded
  32/60/100-column rendering;
  run `npm test` and record the expected UI assertion failures.
- [x] Refactor `remote-selection-ui.ts` into the reusable review-first flow and update the
  Settings row in `settings-ui.ts` to **Compare synced content**; verify the new presentation
  tests, same-selection notice, empty-remote state, and legacy read-only discovery pass with
  `npm test`.
- [x] Add red-first adoption tests for session acknowledgement acceptance/refusal, successful
  settings-only save, the **Remote content list saved** state, explicit Continue versus Done,
  continuation of the captured route/setup, and cancellation after adoption with no file or
  sync-state mutation; run `npm test` and record the expected continuation failures.
- [x] Implement the post-adoption success state and fresh explicit continuation while retaining
  remote head/snapshot revalidation and `updateSyncSetup()` expected-storage/include checks;
  verify adoption, stale-remote, concurrent-local-edit, atomic-failure, and continuation tests
  pass with `npm test`.
- [x] Add red-first local-wins and manager-integration tests in
  `packages/pi-sync/test/sync-resolution-ui.test.ts` proving the action invokes `push --force`
  for the captured setup without `--yes`, confirmation cancellation returns to selection
  resolution, success closes correctly, repeated selection decisions refresh, and continued
  file conflicts hand off to
  `showSyncResolution()`; run `npm test` and record the expected routing failures.
- [x] Implement the local-wins action and a focused iterative manager result dispatcher without
  growing `manager-ui.ts` or `sync-operations.ts` past 1,000 lines; verify sync, pull, push,
  Settings, cancellation, repeat-decision, ordinary-failure, and success paths pass with
  `npm test`.
- [x] Extend lifecycle and mode tests for Escape/Back/Cancel, component disposal, operation
  cancellation before commit, non-cancellable publication after commit, session replacement,
  shutdown draining, stale setup identity, RPC read-only summaries, and unsupported print/JSON
  behavior; fix any discovered ownership or feedback defect and verify the focused suites with
  `npm test`.
- [x] Update `packages/pi-sync/README.md` and
  `docs/adr/pi-sync-portable-selection-policy.md` with the inline decision flow, separate
  adoption and continuation semantics, direct-command/automatic/RPC behavior, local-wins safety
  gates, order-only explanation, and recovery wording; verify every documented action and mode
  has a matching test.
- [x] Add a patch Changeset for `@narumitw/pi-sync`, run `just changeset-status`, and verify the
  release intent describes the user-visible selection-resolution improvement without changing
  schemas or compatibility claims.
- [x] Audit the final diff against `docs/extension-conventions.md`,
  `docs/extension-settings.md`, and the accepted portable-selection ADR for command/mode behavior,
  settings ordering/failure recovery, cancellation/disposal/session replacement/shutdown,
  post-`await` freshness, terminal sanitization, accessibility, source ownership, and test coverage;
  record any deviation in this plan and verify authored source files are at most 1,000 lines with
  `wc -l`.
- [x] Run `npm run check`, `git diff --check`, `just pack sync`, and a temporary-agent Pi RPC
  extension load smoke without real credentials or remote access; inspect the tarball manifest,
  record exact evidence in this plan, and leave every unavailable or failed verification
  unchecked.

## Execution Evidence

- Branch: `feat/pi-sync-inline-selection-resolution`.
- Red-first boundary evidence: the first test compile failed with `TS2554: Expected 2 arguments, but got 3` at the new typed mismatch constructor assertion before the production contract changed.
- TDD process deviation: the combined compile failure prevented the first UI test from reaching its runtime assertion, and the detailed adoption and routing cases were completed as regression tests during implementation rather than captured in separate red runs.
- Focused verification: all 38 pi-sync test files pass with 323 tests, and the final pull-request affected suite passes 40 files with 327 tests.
- Full-workspace exploratory verification: two standalone `npm test` runs passed 2,607 of 2,608 tests; the only failure was the unchanged macOS-path wrapping assertion in `packages/pi-chrome-devtools/test/menu.test.ts`.
- CI-equivalent verification: `PI_EXTENSIONS_TEST_BASE=main npm run check` passed build, Biome, boundaries, every workspace typecheck, and the complete affected pi-sync/root test selection.
- CI portability correction: the first GitHub run exposed three new direct-command tests that assumed the default agent directory already existed; the tests now create an isolated temporary state root, pass with `HOME` unset and a nonexistent agent path, and pass the complete affected gate.
- Changeset verification: `just changeset-status` reports one patch release for `@narumitw/pi-sync` from `.changeset/quiet-pandas-sync.md`.
- Package verification: `just pack sync` produced a 56-file dry-run manifest containing the canonical `src/index.ts`, the new `src/manager-result-dispatcher.ts`, all active source modules, README, license, and package manifest, with no tests or credentials.
- Runtime smoke: a temporary empty `PI_CODING_AGENT_DIR` plus offline `pi --mode rpc --no-session --no-extensions -e ./packages/pi-sync` returned a successful `get_commands` response containing `sync`; no provider, credentials, or remote storage was used.
- Source-size evidence: `manager-ui.ts` is 921 lines, `sync-operations.ts` is 1,000 lines, `remote-selection-ui.ts` is 658 lines, and `manager-result-dispatcher.ts` is 83 lines.
- Convention audit: command classification remains typed and deterministic, TUI-only work is mode-guarded, RPC stays read-only, print/JSON rejection remains observable, established routes and flags remain unchanged, and the patch Changeset records published behavior.
- Settings audit: adoption still uses the shared cross-process mutation lock, expected storage/include checks, latest valid document, unknown-field preservation, atomic replacement, and prior-value recovery; no schema, precedence, path, migration, or credential behavior changed.
- Lifecycle audit: nested tasks use combined owner/action signals, cancellable preparation drains before return, commit-aware operations keep existing non-cancellable publication behavior, stale remote/local/setup identities refresh or stop, and session replacement/shutdown retain existing abort boundaries.
- Display and accessibility audit: setup and path text is sanitized at the final display boundary, exact review uses cell-bounded Kit rendering at 32/60/100 columns, order-only meaning is textual, Review is first, and no destructive action is the default.
- Hardening review: the final pass added a credential-free hashed setup fingerprint, a 32-transition dispatcher bound, typed stale-settings classification, repeated-decision refresh, and no-duplicate generic failure routing.
- Residual scope: no live Git, WebDAV, S3, or R2 account was exercised; existing deterministic backend, publication, secret-scan, concurrency, snapshot, and settings tests cover the unchanged production gates.
- Final hygiene: `git diff --check`, package Biome, root Biome, boundary validation, focused tests, affected CI gate, pack inspection, and RPC load smoke pass.

## Completion Checklist

- [x] Sync now, pull, and push selection mismatches open the same review-first TUI resolution
  without requiring a Settings detour or a memorized force command.
- [x] Exact remote-only, device-only, and order-only differences are understandable, sanitized, and
  bounded, with Review first and no destructive default.
- [x] Remote adoption changes only the reviewed `sync.include`, preserves privacy and concurrency
  checks, and offers a separately explicit fresh continuation that can be declined.
- [x] Keeping the device selection opens the existing exact `push --force` preview without `--yes`,
  and cancellation leaves remote data unchanged.
- [x] Repeated selection decisions, file-direction decisions, stale remote/local state, generic
  failures, cancellation, disposal, replacement, shutdown, and commit boundaries have deterministic
  no-duplicate-feedback evidence.
- [x] Direct commands, automatic sync, RPC, print/JSON handling, legacy snapshots, ordered policy
  semantics, settings/snapshot/backend formats, and existing public routes remain compatible.
- [x] README, ADR, Settings copy, and the patch Changeset match the verified implementation.
- [x] The semantic audits, source-size check, `npm run check`, `git diff --check`, package dry run,
  and Pi/RPC load smoke pass with evidence recorded in the plan.
- [x] Every plan checkbox is complete, the final diff contains only approved scope, and the finished
  plan is moved to `docs/plans/archived/` before the objective is marked `DONE`.
