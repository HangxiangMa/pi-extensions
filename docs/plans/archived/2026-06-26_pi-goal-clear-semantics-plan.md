## Goal

Make `/goal clear` in `@narumitw/pi-goal` mean “clear goal bookkeeping” only: remove the current goal state, statusline value, persisted/session state, and pending continuation tracking without aborting the active agent turn. Keep abort/interrupt behavior on `/goal pause`.

## Context

Current `clearGoal()` called `blockStaleGoalToolCalls()` and `abortCurrentTurn(ctx)` before clearing state. That made `/goal clear` behave like cancel/stop, while third-party references separate clear/state reset from interrupt/pause.

## Non-Goals

- Do not add `/goal stop` in this change.
- Do not change `/goal pause`, `/goal resume`, token budgets, or `goal_complete` semantics beyond preserving the new clear behavior.

## Plan

- [x] Update `extensions/pi-goal/src/goal.ts` so `clearGoal()` only clears active/persisted goal state, status, and pending continuations; verified by inspecting `clearGoal()` and confirming it no longer calls `abortCurrentTurn(ctx)` or `blockStaleGoalToolCalls()`.
- [x] Update `extensions/pi-goal/test/goal.test.ts` so pause still aborts and blocks stale tool calls, while clear does not abort and does not enable stale-tool-call blocking; verified with `npm test` and `npm run check`.
- [x] Update `extensions/pi-goal/README.md` wording so `/goal clear` is documented as state clearing only and `/goal pause` owns aborting/stopping goal work; verified with `rg -n "pause/clear|paused or cleared|cancelled-goal|cancels the current goal" extensions/pi-goal/README.md extensions/pi-goal/src/goal.ts extensions/pi-goal/test/goal.test.ts` returning no output.
- [x] Run the smallest useful project checks for this TypeScript extension; verified with `npm test`, `npm run typecheck`, and `npm run check` from the repository root.

## Risks

- Mitigated: An in-flight assistant turn may continue after `/goal clear`; the updated test verifies stale `goal_complete` calls reject with “no active goal”.

## Completion Checklist

- [x] `/goal clear` no longer aborts the active turn, verified by the updated clear test expecting zero abort calls and `npm run check` passing.
- [x] `/goal clear` still clears goal state/status/persistence/pending continuation, verified by tests checking null goal state, cleared status, and cancelled continuation handling.
- [x] `/goal pause` still aborts and blocks stale tool calls, verified by updated pause tests and `npm run check` passing.
- [x] Documentation matches behavior, verified by `extensions/pi-goal/README.md` review and grep for obsolete “pause/clear”, “paused or cleared”, “cancelled-goal”, and “cancels the current goal” wording returning no output.
- [x] TypeScript/tests pass, verified by `npm test`, `npm run typecheck`, and `npm run check`.
