# pi-goal Tool Policy Ownership Refactor Plan

## Goal

Move Goal terminal-tool visibility state and policy out of the broad `GoalRuntime` state bag into one
cohesive internal owner with a smaller interface, while preserving lazy visibility, restrictive
third-party policies, activation rollback, settings transactions, session isolation, and all public
behavior.

## Context

- This is plan 2 of the KISS refactor sequence and starts only after
  `2026-08-05_pi-goal-transition-ownership-refactor-plan.md` is complete and archived.
- `extensions/pi-goal/src/runtime.ts` currently owns `goalToolsUnlocked`,
  `goalToolsHiddenByPolicy`, availability checks, hide/reveal/restore operations, activation
  preparation, and visibility snapshots alongside unrelated continuation, queue, budget, menu, and
  persistence state.
- `commands.ts`, `goal.ts`, and `settings-ui.ts` must understand parts of the tool-policy rollback
  protocol. The dense coverage near the start of `test/goal.test.ts` shows this is a real policy
  boundary rather than a hypothetical abstraction.
- Pi's active-tool list is global mutable runtime state. The owner must preserve exact snapshots and
  restore only tools previously hidden by pi-goal without fighting a restrictive external policy.

## Architecture

Introduce one package-internal tool-policy module that owns:

- the unlocked flag and exact set of Goal tools hidden by pi-goal;
- active-tool inspection, availability assertions, lazy hide, reveal, and exact restore;
- activation preparation against idle/busy state;
- JSON-safe or clone-safe snapshots used by activation and settings rollback; and
- per-factory isolation through an instance created from the same `ExtensionAPI`.

The module may expose goal-tool names as stable constants, but it must not own Goal status,
persistence, command notifications, queue transitions, or settings files. `GoalRuntime` may expose
one readonly policy instance and retain high-level stop behavior for unavailable tools; it must not
retain pass-through wrappers for every extracted method. Callers should know whether they are asking
to prepare activation, apply a settings visibility change, inspect availability, or restore an exact
snapshot—not how hidden sets and tool-list rollback are implemented.

Apply the deletion test: removing the module should redisperse ownership of the hidden-tool set,
exact restore rules, and restrictive-policy compatibility. Reject the extraction if it only renames
existing runtime methods.

## Non-Goals

- Change `toolVisibility` values, defaults, settings paths, README promises, or active-tool behavior.
- Claim ownership of tools hidden by another extension or override a restrictive external policy.
- Move stopped Goal transitions, lifecycle registration, queue behavior, or managed-run behavior into
  the policy module.
- Add dynamic tool registration, new settings, or public exports.
- Split other `GoalRuntime` responsibilities in the same change.

## Risks

- A naive restore can add tools that pi-goal did not remove or erase external changes made after a
  snapshot.
- Applying visibility while Pi is busy can widen or narrow an in-flight tool schema.
- Settings rollback and failed kickoff/resume/edit activation require exact pre-operation restoration;
  two independent snapshot formats would create divergent ownership.
- Leaving compatibility wrappers on `GoalRuntime` would preserve the existing wide interface and
  provide little architectural benefit.

## Rollback / Recovery

This is an internal behavior-preserving refactor with no settings or session migration. Migrate one
caller family at a time and keep the old implementation only until its focused tests pass. If the
new policy cannot preserve exact external-tool behavior, revert the extraction rather than shipping
parallel state owners.

## Plan

- [x] Inventory every read and write of Goal tool names, `goalToolsUnlocked`,
      `goalToolsHiddenByPolicy`, visibility snapshots, and activation preparation across
      `extensions/pi-goal/src` and map each operation to the existing tool-policy tests; verify the
      inventory identifies any uncovered settings rollback, session replacement, or failed-delivery
      path before edits.
- [x] Establish the post-plan-1 baseline with the mapped tool-policy tests,
      `npm run check --workspace @narumitw/pi-goal`, and
      `npm run test:runtime --workspace @narumitw/pi-goal`; record exact passing evidence in this
      plan.
- [x] Add a focused tool-policy test file for any missing policy-level cases, including exact hidden
      ownership, external restrictive sets, failed `setActiveTools()`, snapshot restore, busy
      activation, and two-factory isolation; verify characterization cases pass before moving
      production ownership.
- [x] Implement the package-internal tool-policy owner with one per-factory instance, one canonical
      snapshot shape, and deep activation/settings operations; verify focused tests prove exact
      restore and that deleting the module would redisperse real policy rather than only forwarding
      calls.
- [x] Replace `GoalRuntime` visibility fields and low-level methods with the policy instance, retaining
      only unavailable-tool Goal-state behavior that belongs to runtime transitions; verify runtime
      and settings snapshots contain the policy snapshot once and restore it atomically.
- [x] Migrate activation and rollback callers in `commands.ts`, session lifecycle callers in
      `goal.ts`, and settings application callers in `settings-ui.ts` to the narrow policy interface;
      after every `await`, verify the same Goal, session generation, and snapshot still own the
      continuation before restoring or publishing state.
- [x] Remove superseded runtime wrappers, duplicated Goal-tool name checks, and duplicate snapshot
      types, then audit dependency direction so the policy module depends on Pi APIs but not commands,
      settings UI, persistence, or lifecycle adapters; verify repository search finds one mutable
      owner for unlocked/hidden policy state.
- [x] Review the final diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`, separately auditing busy tool-schema changes, failed activation,
      user cancellation, menu disposal, session replacement, shutdown, and settings save rollback;
      record every accepted deviation or unverified path.
- [x] Run mapped focused tests, `npm run test:runtime --workspace @narumitw/pi-goal`, root
      `npm test`, root `npm run check`, `just pack goal`, and `git diff --check`; verify all checks
      pass and inspect the dry-run tarball for the new internal source module.

## Execution Evidence

- Added `src/tool-policy.ts`; `GoalToolPolicy` now exclusively owns unlocked/hidden mutable state,
  Goal-tool names, availability, hide/reveal/restore, activation preparation, settings application,
  and one snapshot format.
- `GoalRuntime` owns one readonly policy instance and no longer exposes low-level visibility wrappers
  or mutable hidden-tool fields. Commands, lifecycle, and settings call the policy's domain operations.
- Red evidence: `tool-policy.test.ts` initially failed because `src/tool-policy.ts` did not exist; its
  exact ownership, rollback, and busy-activation cases now pass.
- Existing tests caught a failed always-mode restore regression during extraction. Splitting unlock
  from hidden-ownership release restored the established retry behavior, after which the full
  tool-policy, settings, factory-isolation, and package suites passed.
- Search confirms every production `getActiveTools()`/`setActiveTools()` call and every
  `goalToolsUnlocked`/`goalToolsHiddenByPolicy` field now lives in `tool-policy.ts`.
- Final evidence: pi-goal workspace check, runtime smoke, 293 focused pi-goal tests, root 2,406-test
  `npm test` and `npm run check`, 23-file package dry run, and `git diff --check` all passed.
- Semantic audit covered busy schema changes, restrictive external policies, failed activation,
  settings rollback, session replacement/shutdown, and per-factory isolation; no deviation remains.

## Completion Checklist

- [x] One per-factory module owns Goal tool availability, unlocked/hidden mutable state, exact restore,
      activation preparation, and visibility snapshots.
- [x] `GoalRuntime` and callers no longer reproduce hidden-set or active-tool rollback policy.
- [x] Lazy mode, always mode, restrictive external policies, failed delivery, settings rollback,
      reload, replacement, shutdown, and factory isolation remain behaviorally compatible.
- [x] The extracted interface is smaller than the removed runtime surface and passes the deletion
      test without pass-through wrappers.
- [x] Focused tests, runtime smoke, root test/check gates, package dry run, semantic audits, and
      `git diff --check` pass with all exceptions documented.
