## Goal
Prevent retryable Codex backend failures from pausing an active `/goal`, while preserving the paused-goal stale tool-call safety guard. Success means the observed `Codex error: An error occurred... You can retry...` path is auto-retried instead of turning into a paused goal and post-compaction tool dead-end.

## Context
- The observed failure started with a Codex transient error that explicitly said the request could be retried.
- `extensions/pi-retry/src/retry.ts` already normalizes selected provider errors by appending `provider returned error`, which Pi and `pi-goal` already treat as retryable.
- `extensions/pi-goal/src/goal.ts` pauses active goals on non-retryable agent errors and blocks stale tool calls while paused; this block is a safety guard and should not be weakened.

## Architecture
- Keep provider-error classification in `pi-retry`.
- Keep goal state, pause semantics, and stale tool-call blocking in `pi-goal`.

## Non-Goals
- Do not whitelist `read`, `bash`, `goal_complete`, or any other tool while a goal is paused.
- Do not change npm/package verification commands or add new dependencies.
- Do not clear the stale tool-call guard on compaction alone.

## Plan
- [x] Add a failing `extensions/pi-retry/test/retry.test.ts` case for the Codex generic retryable message (`An error occurred while processing your request` plus `You can retry your request`) to prove it should receive a single retry hint; verified red with focused compiled `retry.test.js` before the production change.
- [x] Update `extensions/pi-retry/src/retry.ts` to append a dedicated retry tag and existing `provider returned error` hint for that Codex generic retryable message, without duplicating the tag on replay; verified with `npm test`.
- [x] Add or extend an `extensions/pi-goal/test/goal.test.ts` case proving a Codex error message containing the retry hint keeps the goal `active`, does not call `abort()`, and does not enable stale tool-call blocking; verified with `npm test`.
- [x] Inspect the Pi extension API/types for the `tool_call` event return shape to see whether a blocked stale tool call can also terminate the stale turn; local `ToolCallEventResult` only exposes `block?: boolean` and `reason?: string`, and docs say return values from `tool_call` only control blocking.
- [x] Not applicable: the API does not support terminating a stale turn from `tool_call`; kept the paused stale-block guard unchanged.
- [x] Run the repository gate after code changes; verified with `npm run check` from the repository root.

## Risks
- Matching the Codex generic error too broadly could retry non-transient failures; keep the matcher tied to the explicit retry wording.
- Weakening stale tool blocking could let old paused-goal turns keep running tools; do not relax the block.

## Completion Checklist
- [x] Codex generic retryable backend errors are normalized by `pi-retry`, verified by a passing retry test in `extensions/pi-retry/test/retry.test.ts`.
- [x] `pi-goal` remains active and does not stale-block tools when the error has the retry hint, verified by a passing goal test in `extensions/pi-goal/test/goal.test.ts`.
- [x] Paused-goal stale tool-call safety is preserved, verified by existing `pi-goal` tests that still block tool calls after `/goal pause`.
- [x] The full repository remains healthy, verified by `npm run check`.
