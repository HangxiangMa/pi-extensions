# Codex waiting and idle-continuation reference

## Purpose

This document records Codex mechanisms relevant to quiet external waiting and race-safe automatic continuation.

It supports the archived [`docs/plans/archived/2026-08-10_pi-goal-codex-wait-hardening-plan.md`](../plans/archived/2026-08-10_pi-goal-codex-wait-hardening-plan.md), and it is not a claim that Codex has an exact equivalent of `pi-goal`'s `goal_wait`.

A separate future Pi Core proposal may cite the core-owned admission findings, but that proposal is not part of the `pi-goal` hardening plan.

## Evidence snapshot

The source was inspected in a clean local checkout of `openai/codex` at commit `33e365b19e4a7023b9b3ed74b57aa11748165a53`.

The findings below are source-level observations rather than runtime reproduction evidence.

Permalinks use that commit so later Codex changes do not silently change the cited behavior.

## Findings

### Codex has no exact `goal_wait` tool

Codex exposes `get_goal`, `create_goal`, and `update_goal` in [`codex-rs/ext/goal/src/spec.rs`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/ext/goal/src/spec.rs).

The model-facing `update_goal` schema only accepts `complete` and `blocked`.

It cannot set a Goal to waiting, pause it, resume it, or attach an external-wake deadline.

Therefore Codex does not directly solve Issue #661 through its Goal tool surface.

### `clock.sleep` provides interruptible bounded waiting

[`codex-rs/core/src/tools/handlers/sleep.rs`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/core/src/tools/handlers/sleep.rs) implements `clock.sleep`.

The tool validates a duration between one millisecond and twelve hours.

It subscribes to input-queue activity and uses `tokio::select!` to finish on either the deadline or new input.

Already-pending activity interrupts the sleep immediately.

This avoids polling, but the tool call and current agent turn remain active while sleeping.

It is suitable for a bounded in-turn delay but does not provide a quiet, persisted, turn-ending wait.

The tool was introduced by [`08901fc8e1`](https://github.com/openai/codex/commit/08901fc8e1), titled `[codex] Add interruptible sleep tool (#28429)`.

### `wait_agent` reacts to mailbox and steering activity

[`codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs) implements `wait_agent` for subagent workflows.

It subscribes to an input-queue watch channel and completes because of mailbox activity, steering input, or timeout.

It reports whether the wait timed out.

A requested timeout below the configured minimum is clamped upward, and the result explains the clamp.

[`codex-rs/core/src/config/mod.rs`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/core/src/config/mod.rs) currently sets the default minimum to 10,000 milliseconds and tells agents to prefer longer waits measured in minutes.

That minimum reduces very short repeated waits that behave like busy polling.

Like `clock.sleep`, `wait_agent` keeps the current tool call and turn alive.

The minimum-timeout hardening was added by [`4d7e3e90d9`](https://github.com/openai/codex/commit/4d7e3e90d9), titled `Clamp short wait_agent timeouts to the configured minimum (#37357)`.

### Automatic idle work uses a core-owned admission gate

[`codex-rs/core/src/session/inject.rs`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/core/src/session/inject.rs) implements `Session::try_start_turn_if_idle()`.

The method rejects empty work, pending trigger-turn mailbox items, an active task, and automatic work disallowed by the current mode.

It reserves the idle turn under the active-turn lock.

It checks pending trigger-turn work again after reservation and again after asynchronous turn preparation.

If user work appears, it clears the reservation and starts the pending user work instead.

It also verifies that the same reservation still exists before starting the task.

This core-owned transaction is stronger than an extension separately calling `isIdle()`, `hasPendingMessages()`, and `sendUserMessage()`.

The Goal runtime calls this gate from [`codex-rs/ext/goal/src/runtime.rs`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/ext/goal/src/runtime.rs).

A rejected automatic continuation is logged and is not inserted ahead of user work.

Relevant history includes [`f1b1b64005`](https://github.com/openai/codex/commit/f1b1b64005), titled `Add goal extension idle continuation (#25060)`, and [`c4f509101b`](https://github.com/openai/codex/commit/c4f509101b), titled `Make goal idle continuation start idle turns only`.

### Idle lifecycle callbacks run after user-triggered work checks

[`codex-rs/core/src/tasks/lifecycle.rs`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/core/src/tasks/lifecycle.rs) emits the thread-idle lifecycle only when no active turn exists and no trigger-turn mailbox work is pending.

This ordering reduces unnecessary automatic continuation attempts.

The admission gate is still necessary because new work can arrive after an idle callback begins.

### Codex persists a Goal continuation deferral marker

[`codex-rs/state/goals_migrations/0002_thread_goal_continuation_deferrals.sql`](https://github.com/openai/codex/blob/33e365b19e4a7023b9b3ed74b57aa11748165a53/codex-rs/state/goals_migrations/0002_thread_goal_continuation_deferrals.sql) creates one continuation-deferral row per thread.

The Goal runtime checks that marker before trying to continue an idle Goal.

The marker is a persisted suppression mechanism, but it has no model-facing wait tool, reason, deadline, external-wake contract, or waiting-time accounting.

It should not be copied as a generic global Pi deferral table without a broader use case.

## Comparison with `pi-goal`

| Capability | Codex mechanism | Current `pi-goal` |
| --- | --- | --- |
| Model explicitly declares an external wait | No exact Goal tool. | `goal_wait({ goal_id, reason, resume_after_ms? })`. |
| Current turn ends while waiting | `clock.sleep` and `wait_agent` do not end it. | A successful `goal_wait` returns `terminate: true`. |
| Wait survives reload | Goal deferral is persisted but is not an external-wait record. | Wait reason and absolute deadline are persisted in Goal state. |
| New input wakes waiting work | Sleep and agent waits subscribe to input activity. | Non-Goal-owned input clears the wait before its turn. |
| User work wins an idle-start race | Core-owned `try_start_turn_if_idle()`. | Extension checks and prompt ownership contain the race but cannot reserve the turn atomically. |
| Very short wait protection | `wait_agent` clamps to a configured minimum. | `goal_wait` currently validates a positive timer but does not impose a minimum above one millisecond. |
| Goal-specific wait reason and deadline | Not present. | Present and visible in status. |

## Design lessons applicable to current `pi-goal`

- Clamp unsafe short deadline requests and report the requested and effective values.
- Tell the model to prefer longer waits and to treat a deadline as a safety wake-up rather than a polling interval.
- Keep external-message wake-up event-driven instead of creating repeated timer checks.
- Persist the domain-owned absolute deadline so reload does not restart a relative delay.
- Keep one timer owner and revalidate Goal and session identity before deadline delivery.

## Core-only observations outside the hardening plan

- Atomic idle-turn admission belongs in the runtime that owns active-turn and message-queue state.
- A core reservation should recheck pending user work around asynchronous preparation boundaries.
- User and client input should have priority over synthetic automatic continuation.
- These observations cannot be fully implemented inside `pi-goal` through current public extension APIs.

## Behaviors not to copy directly

- Do not replace `goal_wait` with `clock.sleep` because that would keep the agent turn and model workflow active.
- Do not make Codex's subagent mailbox protocol a prerequisite for Pi extension waiting.
- Do not add a hidden automatic-input path that bypasses Pi extension input hooks without an explicit compatibility design.
- Do not make a Goal-specific database table part of Pi core merely to support one extension.
- Do not silently clamp a public API timeout unless the contract and returned result make the effective timeout observable.

## Planned `pi-goal` mapping

`goal_wait` should keep its existing turn-ending, persisted, external-message-driven design.

Requests below ten seconds should be accepted for compatibility but clamped to an effective ten-second safety deadline.

Tool output and details should expose the clamp, while prompt guidance should recommend waits measured in minutes and deadline omission for true external-event waiting.

Persisted absolute deadlines must remain unchanged during reload, including deadlines originally created by older versions below the new floor.

The plan intentionally makes no Pi Core change.

## Verification limits

No Codex runtime tests or live sessions were executed for this reference.

The cited behavior was verified by reading the source files and relevant commit history at the recorded snapshot.

Any upstream Pi proposal should recheck Codex and Pi against their then-current heads before relying on these details.
