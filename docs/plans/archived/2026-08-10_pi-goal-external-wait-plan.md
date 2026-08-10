# pi-goal External Wait Plan

## Goal

Fix [Issue #661](https://github.com/narumiruna/pi-extensions/issues/661) by letting an active Goal explicitly become quiet while it waits for an external event, without completing, blocking, pausing, or repeatedly starting automatic model turns.

## Context

- Issue #661 is open and now carries the repository's `bug` label.
- The reported workflow starts a detached monitor that later injects a user message through Pi's `sendUserMessage()` channel.
- `packages/pi-goal/src/lifecycle.ts` currently records continuation intent after every eligible active-goal `agent_end`.
- `packages/pi-goal/src/runtime.ts` dispatches that intent at `agent_settled` as soon as Pi is idle and has no pending messages.
- `packages/pi-goal/src/safety.ts` resets no-progress tracking after any attempted tool call, so a polling turn does not accumulate the existing repeat guard.
- Focused tests at repository HEAD `a729d002e6a3f91fed1d4c52ee61574fac97eb06` confirmed both causal mechanics.
- The exact third-party background-monitor session was not reproduced end to end, so deterministic extension tests will define and verify the accepted interoperability contract.
- The existing continuation-lease plan concerns an optional public supervisor protocol and does not solve an agent-declared wait, so this fix must not depend on or implement that protocol.

## Architecture

Add an optional wait record to the active Goal while retaining the canonical `status: "active"` value:

```ts
interface GoalWait {
	reason: string;
	resumeAt?: number;
}

interface ActiveGoal {
	waiting?: GoalWait;
}
```

Keeping the Goal status active preserves the existing managed-run RPC status contract and avoids treating waiting as a terminal run outcome.

Entering a wait checkpoints active elapsed time, clears `activeStartedAt`, preserves the objective and all cumulative counters, cancels owned continuation intent or delivery, persists the wait record, updates status, and schedules at most one session-owned deadline timer.

Leaving a wait removes the wait record, restarts active elapsed-time accounting, cancels the exact owned timer, persists the transition, updates status, and lets the waking message's turn follow the existing manual or automatic ownership rules.

Register a third Goal tool with this public shape:

```text
goal_wait({ goal_id, reason, resume_after_ms? })
```

`goal_id` uses the established stale-turn guard, `reason` is required and bounded to 1,000 characters, and `resume_after_ms` is an optional positive integer bounded to the safe Node timer range.

An accepted `goal_wait` call returns bounded sanitized output with `terminate: true` and tells the model to call the tool alone because Pi only guarantees early termination when every finalized result in a parallel tool batch terminates.

`requestContinuation()` and `dispatchContinuationIfSettled()` remain the single continuation authorities and reject work while the matching active Goal has a wait record.

A non-owned interactive, RPC, or extension `input` event clears the wait before its turn starts, while cancelled, stale, kickoff, resume, edit, and continuation prompts owned by pi-goal do not count as external wake-ups.

The existing custom-message and agent-start boundaries provide a fallback for non-goal work that starts without an ordinary `input` event.

`/goal resume` gains a waiting-specific path that clears the wait and sends one owned manual resume prompt without resetting cumulative usage or the safety epoch.

When `resume_after_ms` is present, persist an absolute `resumeAt` deadline so reload does not restart the full delay.

A deadline callback revalidates the session generation, Goal ID, exact wait record, current time, idle state, and pending-message state before clearing the wait and requesting one continuation through the normal dispatcher.

If the deadline expires while Pi is busy or messages are pending, retain the due wait and let the next `agent_settled` boundary perform the same revalidation instead of polling with repeated timers.

`session_start` restores a future deadline timer, immediately schedules an already-due deadline for settled dispatch, and leaves a deadline-free wait quiet.

`session_shutdown`, session replacement, clear, pause, edit, replace, completion, blocking, usage or budget stop, tool loss, and queue displacement cancel timer ownership and remove or supersede wait metadata as appropriate.

A waiting Goal displaced by the experimental priority queue loses its wait before shelving, so later reactivation performs a fresh external-state check instead of relying on a notification that may have fired while another Goal was current.

The compact footer status shows a sanitized bounded waiting reason, the full status includes the reason and optional deadline, and the Goal manager makes Resume the primary waiting action while retaining existing clear, edit, replace, status, settings, and help paths.

`goal_wait` joins the existing Goal tool visibility policy so `always` and `after-first-goal` treat all three Goal tools consistently.

## Non-Goals

- Detect another extension's private monitor, process, task, or notification registry.
- Add a public continuation-lease, claim, release, or supervisor protocol.
- Add continuation pacing or a new continuation setting.
- Change Pi core or require changes from background-task extensions that already use `sendUserMessage()`.
- Change the managed-run RPC status enum or make waiting terminal.
- Guarantee immediate termination when the model emits `goal_wait` in a parallel batch with non-terminating sibling tools.

## Assumptions

- Any non-goal-owned message is a valid wake signal because Pi does not identify which extension called `sendUserMessage()`.
- A wait without `resume_after_ms` may remain quiet indefinitely until external input, `/goal resume`, another Goal transition, reload cleanup, or clear occurs.
- Waiting time is excluded from the existing `Active elapsed` measurement because no Goal work is running during that period.
- Direct `/goal status` and menu inspection do not wake a Goal, while `/goal resume` does.
- Existing restrictive tool allowlists may need to add `goal_wait`, and the README will state that compatibility requirement.

## Risks

- A stale timer can inject work into a replacement session unless every callback checks both session generation and exact wait identity.
- Clearing a wait before a pending external message actually starts can race with cancellation, so the transition must remain idempotent and the normal prompt-ownership guards must still win.
- A deadline that sends directly can bypass tool availability, safety, queue, idle, and pending-message checks, so it must re-enter the existing continuation dispatcher.
- Persisting malformed wait data can wedge or unexpectedly wake restored sessions, so runtime validation must reject invalid reasons, deadlines, and container shapes without discarding otherwise valid legacy Goal entries.
- Treating all extension input as a wake signal can awaken a Goal for an unrelated extension message, but this matches the issue's requested non-goal-message contract and Pi exposes no sender identity.
- Runtime and lifecycle files already contain ordering-sensitive state, so wait ownership should remain cohesive and source files over 1,000 lines must retain or update their responsibility justification.

## Rollback / Recovery

- Older persisted Goals omit `waiting` and retain their current behavior without migration.
- Reverting the feature leaves the optional wait field unknown to older code, which already validates required Goal fields and spreads compatible extra fields.
- Clearing, pausing, replacing, editing, or resuming a waiting Goal provides a user-controlled recovery path.
- Session shutdown always destroys the in-memory timer, while the persisted absolute deadline allows a newer runtime to restore the intended state safely.
- If deterministic tests cannot prove at-most-once deadline delivery and stale-session cleanup, ship explicit waiting without `resume_after_ms` rather than ship an unsafe timer.

## Plan

- [x] Add failing persistence and formatting tests in `packages/pi-goal/test/persistence.test.ts`, `packages/pi-goal/test/goal-contracts.test.ts`, and `packages/pi-goal/test/menu.test.ts` for valid legacy Goals, valid waits, malformed waits, paused active time, sanitized reasons, deadline display, and the waiting Resume action; verify each new test fails for the intended missing behavior before implementation.
- [x] Extend `packages/pi-goal/src/persistence.ts`, `packages/pi-goal/src/runtime.ts`, and the smallest applicable menu/status helpers with validated wait metadata, active-time checkpointing, status formatting, and idempotent enter/leave operations; verify the first focused behavior slice turns green without changing existing status or RPC enums.
- [x] Add failing tool-contract tests in `packages/pi-goal/test/goal-contracts.test.ts` for registration, lazy and always visibility, exact `goal_id`, active-run ownership, reason and timer validation, pending queue transitions, bounded details, persistence, status, continuation cancellation, and `terminate: true`; verify failures identify the absent `goal_wait` contract.
- [x] Register `goal_wait` in `packages/pi-goal/src/tools.ts` and `packages/pi-goal/src/tool-policy.ts`, then update shared prompt guidance in `packages/pi-goal/src/prompts.ts`; verify accepted waits become active-but-quiet and all rejection paths preserve the previous Goal and timer state.
- [x] Add failing continuation tests in `packages/pi-goal/test/goal-continuation.test.ts` for `agent_end`, repeated `agent_settled`, manual compaction, owned prompt races, interactive input, RPC input, another extension's `sendUserMessage()` input, custom follow-ups, and a waking turn that either continues normally or calls `goal_wait` again; verify the original hot-loop path fails before lifecycle changes.
- [x] Make `packages/pi-goal/src/lifecycle.ts` and continuation methods wait-aware, clear waits only at verified non-owned work boundaries, and route wake-up through existing run ownership; verify no waiting path calls `sendUserMessage()` merely because Pi became idle.
- [x] Add failing fake-timer tests for future deadlines, already-due restored deadlines, busy expiry, pending-message expiry, exactly-once settled dispatch, external-message races, replacement, reload, repeated shutdown, and stale callbacks; verify time, session generation, Goal identity, and pending state are deterministic test inputs.
- [x] Implement one session-owned wait timer in `GoalRuntime`, restore it only from `session_start` or an accepted wait, clear it idempotently on every lifecycle exit, and route due wake-up through `requestContinuation()` plus `dispatchContinuationIfSettled()`; verify no timer callback sends a prompt directly.
- [x] Add failing command and queue tests for `/goal resume`, pause, clear, edit, replace, completion, blocker acceptance, budget or usage stop, tool loss, priority displacement, shelving, later queue activation, and queue freeze or unfreeze; verify every superseding transition leaves no stale wait or timer.
- [x] Update `packages/pi-goal/src/commands.ts`, queue transitions, and the bounded Goal manager flow so waiting recovery is visible and unrelated behavior remains unchanged; verify cancellation, stale dialogs, session replacement, and non-TUI status behavior against the extension conventions.
- [x] Update `packages/pi-goal/README.md` with the tool schema, external-message wake contract, timeout semantics, status examples, active-time behavior, reload behavior, parallel-tool limitation, allowlist compatibility, and recovery commands; add a Changeset for the published bug fix.
- [x] Audit the complete diff against `docs/extension-conventions.md`, especially tool failures, prompt ownership, timer cleanup, user cancellation, component disposal, session replacement, shutdown, terminal sanitization, queue ordering, and every `await` boundary; record any intentional deviation beside its owner.
- [x] Run focused Vitest files after each red-green slice, `npm run typecheck --workspace @narumitw/pi-goal`, `npm run test:runtime --workspace @narumitw/pi-goal`, root `npm test`, root `npm run check`, `just pack goal`, and `git diff --check`; inspect the package tarball and record any unavailable live third-party monitor smoke explicitly.
- [x] Recheck every Issue #661 acceptance criterion against current files and command evidence, inspect the final diff for unrelated changes, archive this plan only when all checks are complete, and summarize remaining platform limitations without claiming the unperformed third-party end-to-end reproduction.

## Verification Evidence

- The initial `goal-wait.test.ts` red run executed three tests and failed because `goal_wait` was not registered.
- Focused pi-goal verification passed 331 tests across 20 files after implementation and hardening.
- `npm run test:runtime --workspace @narumitw/pi-goal` passed the real Pi runtime smoke.
- The final CI-equivalent `npm run check` passed Biome, package boundaries, every workspace typecheck, and 2,781 tests across 256 files.
- `just pack goal` inspected a 24-file dry-run package containing `src/wait.ts`, updated source, README, manifest, and license with no generated tarball left behind.
- `npm run changeset:status` recognized `.changeset/quiet-goals-wait.md` as a minor `@narumitw/pi-goal` release.
- Independent review found and re-reviewed two lifecycle risks: deadline delivery failure now restores waiting with one bounded retry, and quoted Goal markers now require exact accepted prompt ownership before they can suppress a wake.
- `git diff --check` passed, and the final semantic audit covered cancellation, disposal, session replacement, shutdown, timer identity, queue ordering, active-time accounting, terminal sanitization, prompt framing, and every changed asynchronous boundary.
- A live third-party background-monitor smoke was not run because the reporter's extension and external GitLab workflow are unavailable; deterministic `sendUserMessage`-equivalent extension-input, RPC, custom-follow-up, deadline, compaction, and reload tests cover the repository-owned contract.

## Completion Checklist

- [x] A successful `goal_wait` leaves the Goal active and persisted but produces no continuation at `agent_end`, `agent_settled`, or manual compaction while the wait remains owned.
- [x] Non-goal interactive, RPC, extension, and supported custom follow-up work clear the wait once and run normally, while pi-goal-owned or cancelled prompts do not wake it.
- [x] `/goal resume` clears waiting through an observable manual recovery path without resetting objective, cumulative usage, or safety counters.
- [x] A valid deadline survives reload as an absolute time, dispatches at most one continuation through the normal settled gates, and leaves no stale timer after any superseding transition or shutdown.
- [x] Waiting excludes idle wall time from active elapsed accounting and preserves token, iteration, automatic-turn, no-progress, queue, and managed-run ownership state.
- [x] Footer, full status, menu, README, tool guidance, and tool visibility agree on waiting semantics and sanitize untrusted reasons before terminal display.
- [x] Legacy sessions and default behavior remain compatible when `goal_wait` is never used.
- [x] Focused tests, package typecheck, runtime smoke, root tests, CI-equivalent checks, package inspection, semantic lifecycle audit, and final diff review all pass or have an explicitly accepted disposition.
