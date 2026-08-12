# pi-workflow linked Plan and Goal lifecycle plan

## Goal

Make `pi-workflow` express one clear execution contract: a ready Plan starts Goal when the user chooses Implement, and the exact linked Plan remains available until that Goal completes, is cleared, or is superseded.

## Context

The approved product model has three uses.

1. Plan alone produces a ready, saved, exported, or discarded planning artifact without execution.
2. Goal alone starts managed execution without requiring a Plan.
3. Plan followed by Implement starts Goal in the current or a fresh session and lets Goal run the approved Plan to completion.

`pi-workflow` already labels the ready actions **Run with Goal** and **Start fresh with Goal**, and `/plan implement` already routes to current-session Goal activation.

The remaining mismatch is inherited standalone Plan retention behavior, which can clear the exact Plan while its linked Goal is still active.

This plan records the approved substantial workflow proposal, so implementation does not require another product-design approval unless execution discovers a materially different migration or recovery decision.

## Architecture

- Keep Plan-only, Goal-only, and Plan-to-Goal as independent entry paths inside the one `pi-workflow` extension.
- Treat Implement as Goal activation rather than adding a non-Goal implementation path.
- Keep current-session and fresh-session choices as placement choices for the same linked Plan-to-Goal contract.
- Persist the exact approved Plan in `plan-mode-state.activeImplementation` with its linked Goal ID, and inject one canonical hidden Plan copy after the original handoff disappears from model context.
- Keep a linked Plan through active, paused, blocked, waiting, usage-limited, budget-limited, resumed, retried, and compacted Goal states.
- Clear the linked Plan only when its Goal completes, is cleared, or is successfully superseded by another objective or queue transition.
- Preserve Goal ID rotation by relinking the Plan before a resumed or edited Goal continues.
- Recover a persisted unlinked implementation as a ready Plan because no Goal owns execution, while an orphaned linked Plan without its Goal is cleared.
- Remove workflow-owned **After Implement** behavior from runtime and UI while retaining any legacy `plan.implementationPlanRetention` JSON field as ignored, preserved data during ordinary settings saves.
- Keep the package-owned Plan snapshot internals cohesive without creating a shared engine or changing `pi-plan-mode` behavior.

## Non-Goals

- Do not add **Implement normally** or any other non-Goal execution path to `pi-workflow`.
- Do not change standalone `pi-plan-mode` retention choices or standalone `pi-goal` behavior.
- Do not change the five registered Plan and Goal tool names, the `/plan`, `/goal`, or `/workflow` command names, or managed-run event channels.
- Do not automatically start Goal merely because a review-first Plan became ready.
- Do not copy source planning messages into a fresh implementation session.
- Do not create a shared workflow engine or an extension-to-extension dependency.

## Risks

- Clearing or converting state before the exact handoff reaches context can remove the only authoritative Plan from the first Goal request.
- A process can stop after unlinked Plan state is published but before Goal linkage is published, so reload recovery must return the Plan to ready state without claiming execution started.
- Goal resume, edit, priority, and queue transitions rotate IDs and can detach cleanup from the new Goal if relinking order regresses.
- Context hooks can duplicate the Plan or place it on the wrong side of compaction and branch summaries if canonical insertion rules change.
- Legacy workflow settings and session entries can contain shorter retention values, which must not reactivate early cleanup or make the whole settings file invalid after this behavior is retired.
- `/plan exit` and the active Plan menu currently allow Plan-only cleanup while Goal continues, which would recreate the missing-Plan failure after later compaction.

## Rollback / Recovery

- Retain the existing `plan-mode-state` and `goal-state` entry names and accepted legacy fields so reverting does not require a session-data migration.
- Ignore rather than delete legacy retention fields during reads and unrelated saves, preserving unknown-field and forward-compatibility guarantees.
- Restore the exact ready or saved Plan and clear provisional Goal state when current-session activation or delivery fails.
- Leave the source Plan unchanged when fresh-session replacement is cancelled or rejected.
- Keep the existing compensated fresh-session recovery when both destination states cannot be published.
- Require `/goal clear` or successful Goal supersession to end a linked execution; a rejected or cancelled action leaves both linked states unchanged.

## Plan

- [x] Add failing integration tests in `packages/pi-workflow/test/workflow.test.ts` proving ready, saved, direct `/plan implement`, review-first, automatic, current-session, and fresh-session Implement paths all start Goal and expose no non-Goal implementation branch; evidence: the new saved-Plan and linked-retention tests failed against the previous behavior, then all 567 package tests passed.
- [x] Add failing linked-context tests that remove the original handoff behind compaction or branch summaries, assert one exact hidden Plan copy across repeated contexts, retain it through stopped and resumed Goal states, and remove it only after Goal completion, clear, or supersession; evidence: `workflow.test.ts` and `linked-plan-lifecycle.test.ts` cover canonical reinjection, summary ordering, stopped states, ID rotation, and terminal cleanup.
- [x] Simplify the `packages/pi-workflow/src/plan/` active-implementation policy so workflow implementations always retain the exact Plan until an explicit linked-Goal terminal transition, while legacy persisted retention values restore without early cleanup; evidence: workflow composition forces `keep`, linked restore upgrades legacy short retention, and focused settlement tests pass.
- [x] Update `packages/pi-workflow/src/workflow.ts` and the Plan handle contract so current and fresh handoffs publish one linked Plan and Goal ownership transition, preserve rollback after partial failure, relink every committed Goal ID rotation, and revalidate session and request ownership after each `await`; evidence: activation, delivery, persistence-failure, replacement, shutdown, resume, edit, queue, and fresh-session suites pass.
- [x] Add reload recovery for interrupted unlinked handoffs by restoring their exact Plan as ready, keep entry-order conflict resolution deterministic, and continue clearing orphaned or superseded linked Plans; evidence: branch fixtures cover newer and older Plan/Goal entries, orphaned links, failed compensation, and ready-state recovery.
- [x] Change linked execution controls so `/plan exit` cannot silently detach an active Goal, and replace active-Plan menu actions that would clear or replace the Plan with **Manage linked Goal**; evidence: TUI cancellation and narrow rendering tests pass, and TUI plus print/JSON command tests preserve both states on rejection.
- [x] Remove **After Implement** from workflow Plan settings, workflow descriptions, Plan action previews, and workflow-owned setting patches, while accepting and preserving legacy `plan.implementationPlanRetention` content as ignored data; evidence: settings tests cover missing, arbitrary legacy, unknown-field preservation, malformed read-only files, atomic failure, TUI, and RPC behavior.
- [x] Update `packages/pi-workflow` menus, status text, help, and `README.md` to describe the three supported uses, define Implement as Goal execution, distinguish current versus fresh placement, explain compaction-safe Plan retention, and direct linked cancellation through Goal; evidence: menu tests and the package runtime smoke match the documented behavior while standard README sections remain intact.
- [x] Extend `packages/pi-workflow/test/workflow-runtime-smoke.mjs` with a deterministic Plan-ready-to-Goal scenario that observes the exact handoff, continued Goal ownership, terminal cleanup, and extension disposal through real Pi lifecycle ordering; evidence: `npm --workspace @narumitw/pi-workflow run test:runtime` passes.
- [x] Add a minor Changeset for `@narumitw/pi-workflow` describing the experimental settings and linked-lifecycle behavior change; evidence: `npm run changeset:status` reports only `@narumitw/pi-workflow` moving to `0.3.0`.
- [x] Audit and harden the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, the edge-case checklist, and the approved experience; evidence: a red regression exposed terminal Goal ID rotation leaving a stale Plan, the shared transition now clears it, all 567 package tests pass, and the final command-scoped-signing `npm run check` passes all 3,677 repository tests.
- [x] Stage only the intended paths and create focused signed commits; evidence: commit `613284553f769e735f303240b2217f155c75a60c` contains the reviewed feature boundary and an SSH signature, with no unrelated worktree changes.
- [x] Push `feat/pi-workflow-linked-plan-lifecycle` and open a pull request against `main` with behavior, checks, compatibility, risk, and plan evidence; evidence: the remote branch tracks origin and pull request `https://github.com/narumiruna/pi-extensions/pull/727` is open.

## Completion Checklist

- [x] All ready or saved Implement actions start linked Goal execution, while Plan-only save, export, stay, and discard actions remain available without execution.
- [x] The exact linked Plan survives repeated context assembly, retry, compaction, reload, pause, block, wait, limits, and resume until its Goal reaches an approved terminal or superseding transition.
- [x] No settings value or Plan-only command can silently remove a Plan from an active linked Goal.
- [x] Legacy workflow settings and session entries load safely, remain forward-compatible, and cannot restore early linked-Plan cleanup.
- [x] All 567 focused `pi-workflow` unit and integration tests pass.
- [x] `npm --workspace @narumitw/pi-workflow run test:runtime` passes.
- [x] The final `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false npm run check` passes the CI-equivalent gate, including all 3,677 tests; the command-scoped override only lets test fixtures commit without the unavailable signing agent.
- [x] `just pack workflow` succeeds with the manifest-listed README, license, package manifest, and 51 source files in the 54-file dry-run tarball.
- [x] The Changeset names only `@narumitw/pi-workflow` with a minor bump from `0.2.0` to `0.3.0`.
- [x] Every plan task and completion check has current evidence before this plan moves to `docs/plans/archived/`.
