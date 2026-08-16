# Remove Experimental Goals Plan

## Goal

Remove `pi-goal`'s experimental ordered-goal queue from the stable package while preserving the single-objective Goal workflow.

Keep affected legacy users safe by warning when `experimental.goals` or persisted queue state is present, and by documenting `/goal edit` as the replacement for reprioritizing work.

## Context

`@narumitw/pi-goal` is a stable extension, but the ordered queue is documented as opt-in experimental behavior.

The queue touched slash parsing, command routing, settings normalization and UI, session persistence, lifecycle settlement, completion tools, menu screens, status text, README copy, runtime smoke coverage, and a large dedicated test matrix.

Single-objective reprioritization is supported through `/goal edit`, which rotates the Goal ID and sends an update prompt that says the updated objective supersedes previous objectives.

A focused smoke confirmed that editing `task b/c/d` into `task b complete; do task a next; then task c/d` persists the new objective, rotates `goal_id`, and includes the updated-objective prompt.

Relevant convention gates were command-surface compatibility and migration, settings validation and unknown-field preservation, session-state restore safety, status cleanup, documentation, deterministic tests, root `npm run check`, package pack smoke, and a Changeset for published behavior.

## Architecture

The runtime model now has one active Goal plus single-goal continuation, safety, budget, wait, tool-policy, and managed-run ownership.

The ordered queue implementation was removed from active control flow, including queue transitions, pending queue actions, queue menu actions, queue command kinds, queue persistence writes, queue automatic advancement, and the pure `queue.ts` transition module.

A small legacy-queue guard remains only to detect old persisted queue state and stop it from running automatically.

Legacy `experimental.goals` settings are accepted as ignored legacy data, do not make the settings file invalid, and are preserved as unknown fields on later saves.

When a legacy queue command is typed by a user who has `experimental.goals: true` or detected legacy queue state, the command rejects with a migration warning instead of silently replacing the active Goal.

When the same words are typed by users without legacy setting or state, they remain ordinary objective text, matching the previous default behavior.

Persisted queue state does not auto-continue or auto-advance after reload.

A user with legacy queue state receives an observable warning that says to merge priorities into one objective with `/goal edit`, or use `/goal clear` to discard the old state.

## Non-Goals

- [x] Do not build a new task scheduler, dependency graph, or replacement queue; verified by deletion of `src/queue.ts`, deletion of queue tests, and `rg "from \"./queue|queuedGoals|pendingQueueAction|queueFrozen" packages/pi-goal/src` showing no active queue runtime fields.
- [x] Do not remove single-goal `/goal`, `/goal edit`, `/goal pause`, `/goal resume`, `/goal clear`, `/goal status`, token budgets, waits, safety limits, or managed-run RPC; verified by `npx vitest run packages/pi-goal/test`, `npm run test:runtime --workspace @narumitw/pi-goal`, README command coverage, and root `npm test`.
- [x] Do not automatically convert old multi-goal queues into a generated single objective; verified by `packages/pi-goal/test/persistence.test.ts` and `packages/pi-goal/test/goal-command-transitions.test.ts` legacy queue cases.

## Risks

- [x] Avoid accidental replacement for affected queue users by rejecting removed queue commands when legacy setting or state is detected; verified by `legacy queue commands warn affected users without replacing the goal` in `packages/pi-goal/test/goal-command-transitions.test.ts`.
- [x] Avoid losing unknown settings fields by keeping settings saves based on the latest valid raw document; verified by `packages/pi-goal/test/settings.test.ts` preserving `experimental.goals` and future nested fields.
- [x] Avoid stale queue auto-work after reload by making old `queue`, `pendingAction`, `queued` head, and legacy `goals-state` inert; verified by `packages/pi-goal/test/persistence.test.ts`, `legacy persisted queue state is inert and shows migration guidance`, and `npm run test:runtime --workspace @narumitw/pi-goal`.
- [x] Avoid documentation drift by updating README and maintained implementation notes that describe active queue behavior; verified with `rg "experimental.goals|ordered goal|goal queue|queuedGoals|pendingQueueAction" packages/pi-goal docs/implementation-notes docs/roadmaps`, leaving only intentional legacy-removal references.
- [x] Avoid under-signaling a published behavior change by adding a Changeset for `@narumitw/pi-goal`; verified by `npm run changeset:status`, which reports a minor bump to `0.52.0` from `.changeset/remove-experimental-goals.md`.

## Plan

- [x] Add or update focused failing tests for settings normalization and saving so legacy `experimental.goals` is ignored as active configuration, remains non-invalid, and preserves unknown fields; initial focused run failed against old expectations, and final evidence is `npx vitest run packages/pi-goal/test/command.test.ts packages/pi-goal/test/settings.test.ts packages/pi-goal/test/persistence.test.ts` passing with 21 tests.
- [x] Add or update focused failing tests for command parsing and command registration so queue words are ordinary objective text for unaffected users, but legacy-affected users receive a removed-queue warning with a `/goal edit` example and no Goal replacement; verified by `packages/pi-goal/test/command.test.ts` and `packages/pi-goal/test/goal-command-transitions.test.ts`.
- [x] Add or update focused failing tests for session restore and persistence so old canonical queue fields, `queued` heads, pending queue actions, and legacy `goals-state` data are inert and produce migration guidance instead of automatic queue work; verified by `packages/pi-goal/test/persistence.test.ts` and `legacy persisted queue state is inert and shows migration guidance`.
- [x] Add or update focused failing menu tests so `/goal` no longer exposes a Queue screen or Ordered goal queue setting, and affected legacy state shows migration guidance that mentions `/goal edit`; verified by `packages/pi-goal/test/menu.test.ts`, `packages/pi-goal/test/settings-ui.test.ts`, and command-transition legacy guidance tests.
- [x] Remove queue command kinds, queue completions, direct queue command handlers, queue menu actions, queue advancement dispatch, and completion-tool queue advancement paths from `packages/pi-goal/src`; verified by `npm run check --workspace @narumitw/pi-goal` and focused tests.
- [x] Remove active queue runtime state and persistence writes while retaining only the minimal legacy detection or warning state needed for safe migration; verified by workspace typecheck and `rg "queuedGoals|pendingQueueAction|queueFrozen|queueFreezeAwaitingSettle" packages/pi-goal/src` returning no active queue runtime fields.
- [x] Remove the pure ordered-queue module and queue-specific tests that no longer describe supported behavior; verified by deleting `packages/pi-goal/src/queue.ts`, `packages/pi-goal/test/queue.test.ts`, and `packages/pi-goal/test/goal-queue.test.ts`.
- [x] Update `packages/pi-goal/README.md`, package metadata, and maintained implementation notes to describe single-objective Goal mode, the removal of experimental ordered goals, and the `/goal edit` migration example; verified by README package-layout review and `just pack goal` showing no `src/queue.ts` in the tarball.
- [x] Add a Changeset for `@narumitw/pi-goal` describing removal of the experimental ordered queue and the `/goal edit` migration path; verified by `npm run changeset:status`.
- [x] Run focused verification in dependency order: command tests, settings tests, persistence/lifecycle tests, menu tests, tool tests, and `npm run test:runtime --workspace @narumitw/pi-goal`; verified by `npx vitest run packages/pi-goal/test` with 18 files and 277 tests passing, plus runtime smoke passing.
- [x] Run package and repository gates with `npm run check --workspace @narumitw/pi-goal`, root `npm test`, root `npm run check`, and `just pack goal`; all passed, and the pack dry run listed 23 files without `src/queue.ts`.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, and `packages/pi-goal/AGENTS.md`; verified command compatibility, settings preservation, stale session handling, user cancellation paths, shutdown cleanup, and removed queue references during final diff review.

## Rollback / Recovery

- [x] Keep the implementation in a reversible sequence where tests are changed before each behavior slice, and revert the last slice if its focused verification fails unexpectedly; verified by focused red/green runs before full gates.
- [x] Preserve old session data until the user explicitly clears or replaces it, so rollback to a queue-capable version can still read prior queue entries if needed; verified by legacy queue state being detected without being overwritten at session start.
- [x] If removal exposes an unplanned dependency from managed-run RPC, waits, budgets, or tool policy on queue fields, stop implementation and update this plan for approval before continuing; not needed because focused tests, runtime smoke, root tests, and root check passed.

## Completion Checklist

- [x] The only supported user-facing Goal model is one active objective, and `/goal edit` is documented and tested as the reprioritization path.
- [x] `experimental.goals`, `/goal add`, `/goal prioritize`, `/goal drop-last`, `/goal skip`, and hidden queue aliases no longer activate ordered queue behavior.
- [x] Affected legacy users get an observable warning that includes a concrete `/goal edit` migration example, while unaffected users are not warned.
- [x] Old persisted queue state cannot dispatch automatic work, cannot advance after completion, and can be cleared or superseded by explicit user action.
- [x] Settings remain side-effect-free on missing files, invalid files are protected, unknown fields are preserved, and TUI settings no longer expose an Ordered goal queue control.
- [x] README, package metadata, maintained implementation notes, and package layout references no longer describe active ordered queue support.
- [x] Focused tests, runtime smoke, workspace check, root tests, root check, package pack dry run, Changeset status, and final semantic audit all pass.
