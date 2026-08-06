# pi-goal Transition Ownership Refactor Plan

## Goal

Make stopped Goal transitions easier to understand and change by giving their shared cleanup,
persistence, status, stale-tool, and terminal-detail invariants one internal owner, while preserving all
current commands, tools, settings, queue behavior, session data, prompts, notifications, and managed
run events.

## Context

- `packages/pi-goal/src/commands.ts`, `runtime.ts`, and `goal.ts` currently assemble stopped
  transitions independently. Callers repeat subsets of continuation cancellation, recovery and budget
  cleanup, usage accounting, stale-tool policy, abort, status mutation, terminal details, persistence,
  and status publication.
- `GoalRuntime` already owns the mutable per-factory state and the canonical persistence/publication
  boundary, so a narrow runtime operation can enforce this protocol without adding another manager or
  store.
- `packages/pi-goal/src/settings-ui.ts` can freeze a queue while retaining an `active` Goal. That is
  a suspension protocol, not a stopped Goal transition, and should remain outside this refactor.
- Existing focused tests and the runtime smoke cover explicit pause, safety limits, budgets, tool
  loss, blocker reports, provider errors, queue transitions, rollback, reload, stale prompts, and
  managed-run publication. They provide the behavioral baseline for a structure-only change.
- This is plan 1 of the KISS refactor sequence. It precedes
  `2026-08-05_pi-goal-tool-policy-ownership-refactor-plan.md`,
  `2026-08-05_pi-goal-composition-root-refactor-plan.md`, and
  `2026-08-05_pi-goal-test-matrix-refactor-plan.md` so later moves build on one authoritative stopped
  transition boundary.
- This plan is intentionally narrower than splitting `goal.ts`, extracting tool policy from
  `GoalRuntime`, or reorganizing the large integration test files; the later plans own those changes.

## Architecture

Add one internal stopped-transition operation owned by `GoalRuntime`. Before fixing its final shape,
record a transition matrix covering every current caller and these observable decisions:

- exact expected Goal identity and source status;
- target status and optional `safetyPauseCause`;
- whether usage is recorded before transition;
- continuation, recovery, and budget-wrap-up cleanup;
- whether the current run is aborted and stale Goal tool calls are blocked or cleared;
- terminal reason, canonical persistence, status publication, and caller-owned notification/result;
- rollback behavior when activation or prompt delivery fails.

Prefer a discriminated request keyed by a small internal transition kind when that lets the runtime
own policy. Do not replace repeated statements with a wide bag of booleans that every caller must
still coordinate. Notifications and tool/command return payloads remain with their adapters unless
moving them is required to enforce state consistency.

The operation must reject a stale expected Goal ID before mutating state. It must publish a stopped
state only after the matching in-memory transition and terminal details are coherent. Existing
`transitionGoal()` remains the pure timestamp/accounting primitive for active, queued, complete, and
other non-owned transformations.

Apply the deletion test before accepting the seam: deleting the new operation should necessarily
redisperse real transition ordering and invariants into callers. Do not introduce a pass-through
controller, generic state-machine framework, event-sourcing layer, or second persistence path.

## Non-Goals

- Change public command, tool, prompt, setting, session-entry, status, notification, or managed-run
  event behavior.
- Add transition provenance, supervisor resume, blocked-proposal review, continuation leases, or any
  other active roadmap capability.
- Move the experimental queue or managed-run protocol into another extension.
- Centralize queue freeze, active/queued activation, completion, clear, or ordinary resume when they
  do not enter a stopped status.
- Split files solely to meet a line target or rename existing concepts without reducing caller
  knowledge.
- Rewrite the established integration-test harness beyond extracting a small helper needed by the
  focused transition matrix.

## Assumptions

- The refactor executes without another `pi-goal` architecture or supervision plan changing the same
  transition paths concurrently. Re-audit the matrix if the package diff changes before execution.
- Current behavior is the compatibility contract even where a different transition policy might look
  simpler; policy changes require a separate approved task.

## Risks

- Treating all stopped transitions as identical could alter budget wrap-up, unavailable-tool restore,
  queue advancement, or prompt-delivery rollback semantics.
- A helper with many caller-selected flags would move syntax without moving ownership and make the
  architecture worse.
- Persistence and managed-run events are synchronously re-entrant. The refactor must preserve current
  post-publication ownership checks and must not continue mutating a superseded Goal.
- Tests may assert notifications while missing state, cleanup, or publication order. The transition
  matrix must pair adapter-visible assertions with canonical state and runtime-ownership evidence.

## Rollback / Recovery

This is a behavior-preserving internal refactor with no settings, session-data, or public API
migration. Keep each migration step independently testable. If a transition family cannot use the
new owner without widening its interface or changing behavior, revert that family to its existing
implementation, document the exception in this plan, and leave the corresponding completion item
open rather than maintaining two partially authoritative paths.

## Plan

- [x] Record the complete stopped-transition matrix in this plan from
      `packages/pi-goal/src/{commands,runtime,goal}.ts`, including explicit pause, continuation and
      no-progress safety pauses, token-budget exhaustion, unavailable tools, accepted blocker report,
      terminal agent error, exhausted retry recovery, and failed activation/edit/resume/queue prompt
      rollback; verify repository search finds every direct transition to `paused`, `blocked`,
      `usage_limited`, or `budget_limited` and maps each one to an existing deterministic test or an
      explicitly missing case.
- [x] Establish the unchanged baseline with the mapped focused pi-goal tests plus
      `npm run check --workspace @narumitw/pi-goal` and
      `npm run test:runtime --workspace @narumitw/pi-goal`; record command output or exact passing test
      names in this plan before production edits.
- [x] Add only the missing characterization cases to a focused transition test surface, asserting
      matching Goal ID, target state, cleanup ownership, abort/stale-tool behavior, canonical session
      entry, status text, and managed-run terminal publication where applicable; verify the new cases
      pass against the pre-refactor implementation and do not duplicate equivalent coverage.
- [x] Add the narrow stopped-transition operation to `packages/pi-goal/src/runtime.ts`, with a
      discriminated request or equally deep interface derived from the matrix, stale expected-ID
      rejection, and one ordered implementation of shared cleanup, state mutation, terminal details,
      persistence, and status publication; verify focused unit tests prove each supported transition
      recipe and the deletion test confirms the operation concentrates policy rather than renaming
      calls.
- [x] Migrate runtime-owned budget, safety, exhausted-recovery, and unavailable-tool transitions to
      the new operation and delete their superseded cleanup sequences; verify the focused runtime
      tests and runtime smoke preserve budget wrap-up, abort, retry, tool-policy, and stale-call
      behavior.
- [x] Migrate command-owned explicit pause and prompt-delivery rollback transitions in
      `packages/pi-goal/src/commands.ts` to the same operation, leaving confirmation, prompt
      delivery, notifications, and command results in the adapter; verify command, queue, menu, and
      settings rollback tests preserve exact state and user-visible behavior after every `await`.
- [x] Migrate accepted `goal_blocked`, terminal agent interruption, and other stopped lifecycle paths
      in `packages/pi-goal/src/goal.ts` to the same operation, then remove obsolete bound aliases and
      duplicated transition statements made unnecessary by this refactor; verify tool and lifecycle
      tests preserve termination, usage classification, retry exhaustion, managed-run events, and
      stale-goal rejection.
- [x] Audit the final source for direct stopped-status writes and repeated transition protocols,
      allowing only documented cases that cannot enter the shared operation without changing current
      behavior; verify `rg` results are recorded in this plan and every exception names its distinct
      owner and invariant.
- [x] Review the final diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`, separately auditing user cancellation, component disposal,
      session replacement, shutdown, synchronous event re-entry, settings rollback, and every
      post-`await` continuation; verify no new captured stale context, unowned task, persistence path,
      or public contract appears.
- [x] Run the mapped focused tests, `npm run test:runtime --workspace @narumitw/pi-goal`, root
      `npm test`, root `npm run check`, `just pack goal`, and `git diff --check`; verify all checks pass
      and inspect the dry-run tarball to confirm published contents remain aligned with
      `packages/pi-goal/package.json`.

## Execution Evidence

Implemented on branch `refactor/pi-goal-kiss`.

| Transition family | Authoritative recipe / exception | Verification |
| --- | --- | --- |
| Explicit `/goal pause` and managed-run cancellation | `explicit_pause` | command, continuation, and managed-run tests |
| Automatic-turn and no-progress safety pauses | `safety_pause` | hard-cap, no-progress, retry-boundary, and settings tests |
| Token-budget exhaustion | `budget_limit` | budget wrap-up, reload, compaction, and queue tests |
| Missing terminal tools | `tools_unavailable` | restore, kickoff/resume/edit, continuation, and queue tests |
| Accepted `goal_blocked` | `blocker_report` | blocker validation, ownership, queue, and managed-run tests |
| Terminal abort/error/quota interruption | `agent_interruption` | provider classification and managed-run terminal tests |
| Exhausted retry recovery | `retry_exhausted` | settled recovery, replacement, priority, and compaction tests |
| Failed kickoff/edit/priority/queued activation | `activation_rollback` | exact-state, stale-ID, visibility rollback, and queue tests |
| Already-exhausted queued activation | `queue.ts` pure exception | `activateQueuedGoal()` returns `budget_limited` before runtime publication; queue reload tests cover it |
| Loading or preserving an existing stopped status | persistence/edit exception | no new stopped transition occurs; restore and stopped-edit tests cover it |

- Red evidence: the new `goal-transition.test.ts` initially failed compilation because
  `GoalRuntime.stopActiveGoal` did not exist; its three focused ownership tests now pass.
- Repository search leaves stopped `transitionGoal()` ownership only in `GoalRuntime.stopActiveGoal`;
  `queue.ts` retains the documented pure activation exception.
- Baseline and final checks passed: pi-goal workspace check, runtime smoke, 293 focused pi-goal tests,
  root `npm test` and `npm run check` with 2,406 tests, `just pack goal` with 23 expected files, and
  `git diff --check`.
- Semantic audit covered cancellation, session replacement/shutdown, synchronous managed-run event
  re-entry, stale expected IDs, settings rollback, and post-`await` activation ownership. No public
  command, tool, prompt, settings, persistence, status, or event contract changed.

## Completion Checklist

- [x] Every transition to `paused`, `blocked`, `usage_limited`, or `budget_limited` is owned by the
      narrow runtime operation or has one documented, behavior-backed reason to remain outside it.
- [x] Callers no longer coordinate the shared cleanup, persistence, status, stale-tool, and terminal
      detail ordering themselves.
- [x] The new interface hides policy rather than exposing a generic flag bag, passes the deletion
      test, and does not create a second state or persistence authority.
- [x] Commands, tools, prompts, settings, queue behavior, session restoration, status text,
      notifications, managed-run events, and persisted data remain compatible.
- [x] Focused transition evidence covers success, stale identity, rollback, cancellation, reload,
      replacement, shutdown, re-entrant publication, and applicable failure paths.
- [x] Focused tests, runtime smoke, root test/check gates, package dry run, semantic audits, and
      `git diff --check` pass with every accepted exception or unverified path documented.
