# pi-goal Codex-inspired wait hardening plan

## Goal

Harden `pi-goal`'s existing `goal_wait` deadline against model-driven busy polling by borrowing Codex's minimum-wait clamp, effective-timeout reporting, and longer-wait guidance.

Keep the existing quiet external-wait lifecycle, persistence, wake behavior, and Pi compatibility unchanged.

## Context

The inspected Codex evidence is recorded in [`docs/research/2026-08-10_codex-waiting-mechanisms.md`](../research/2026-08-10_codex-waiting-mechanisms.md).

Codex's `wait_agent` clamps requested timeouts below its configured minimum and reports the effective timeout to the model.

Codex currently defaults that minimum to 10,000 milliseconds and separately tells agents to prefer waits measured in minutes to avoid busy polling.

`pi-goal` currently accepts `resume_after_ms` from 1 through 2,147,483,647 milliseconds.

A model can therefore request repeated one-millisecond deadline wake-ups, and each new `goal_wait` tool call resets the existing tool-free no-progress heuristic.

`goal_wait` already handles external input through Pi lifecycle events and keeps at most one session-owned deadline timer, so it does not need a new event API or Pi Core change.

The deadline is a safety wake-up rather than a polling interval, and omitting it remains the preferred indefinite external-wait contract.

## Architecture

Add a package-owned minimum effective deadline of 10,000 milliseconds.

Keep accepting positive integer requests below that minimum for compatibility, but clamp their effective deadline to 10,000 milliseconds.

Persist and schedule the effective absolute deadline rather than the shorter requested deadline.

Return both requested and effective values when clamping occurs so the model and tests can observe the change.

Keep `resume_after_ms` in successful tool details as the effective delay, and add `requested_resume_after_ms` only when it differs.

Tell the model in tool output when clamping occurred.

Update the tool description, prompt guidance, Goal-mode rules, and README to state that deadlines below ten seconds are clamped and longer waits are preferred.

Do not add a setting for the minimum because the first change is a fixed safety boundary rather than user policy.

Do not change deadline-free waits, external-message wake-up, `/goal resume`, retry ownership, timer restoration, or waiting-time accounting.

## Non-Goals

- Add or modify a Pi Core API.
- Implement Codex's `clock.sleep`, `wait_agent`, mailbox protocol, or idle-turn reservation.
- Replace `goal_wait` with an in-turn sleep tool.
- Add periodic polling, repeated timers, or a background task scheduler.
- Add a configurable minimum, maximum, or default wait setting.
- Change the canonical active Goal status or managed-run RPC status.
- Remove the current continuation ownership and stale-session safeguards.
- Claim a live third-party monitor reproduction without running one.

## Assumptions

- Ten seconds is a safety floor, not a recommended polling interval.
- Existing persisted `resumeAt` values remain authoritative and must not be migrated or extended during reload.
- A request below ten seconds may come from an older stored tool call, so runtime clamping remains necessary even if prompt metadata documents the floor.
- Users needing an immediate manual wake can send input or run `/goal resume` instead of relying on a sub-ten-second deadline.

## Risks

- Clamping changes the documented timing of previously accepted short waits and therefore requires tests, README updates, and a Changeset.
- Reporting requested and effective values inconsistently can make restored deadlines or tool rendering misleading.
- Applying the floor during reload would incorrectly extend already-persisted deadlines.
- A ten-second floor reduces hot looping but cannot prevent a model from repeatedly waiting every ten seconds forever.
- Adding a wait-cycle circuit breaker in the same change could pause legitimate external workflows and would exceed this hardening scope.
- Prompt guidance alone is not enforcement, so runtime clamping must remain the authoritative boundary.

## Rollback / Recovery

Older sessions with deadline-free waits remain unchanged.

Older sessions with an absolute `resumeAt` continue using that timestamp without migration.

Reverting the clamp restores the previous accepted range because no new persisted field is required.

`/goal resume`, external input, pause, clear, edit, replace, and session shutdown remain recovery paths.

If ten seconds proves incompatible with real workflows, a follow-up can adjust the fixed constant with evidence or propose an explicit setting.

## Plan

- [x] Add failing focused tests in `packages/pi-goal/test/goal-wait.test.ts` for a one-millisecond request being clamped to ten seconds, effective `resumeAt`, requested-versus-effective tool details, bounded clamp text, and exactly-once deadline delivery at the effective time.
- [x] Add failing contract tests for unchanged requests at ten seconds and above, unchanged deadline-free waits, rejection of zero, negative, fractional, and oversized values, and unmodified restoration of an already-persisted deadline below the new floor.
- [x] Add `MIN_GOAL_WAIT_DELAY_MS` beside the existing wait limits in `packages/pi-goal/src/wait.ts`, and add one helper that returns requested and effective delay values without changing persisted `GoalWait` shape.
- [x] Update `packages/pi-goal/src/tools.ts` to create and report waits from the effective delay, preserve runtime validation for old tool calls, and mention clamping in bounded sanitized output only when it occurs.
- [x] Update `packages/pi-goal/src/prompts.ts` and tool guidance to say that `resume_after_ms` is a safety deadline, sub-ten-second requests are clamped, and waits measured in minutes are preferred over repeated short wakes.
- [x] Update `packages/pi-goal/README.md` with the requested-versus-effective contract, ten-second floor, deadline restoration behavior, and the recommendation to omit the deadline for true external-event waiting.
- [x] Add a Changeset for the published `@narumitw/pi-goal` hardening without changing unrelated package versions or metadata.
- [x] Audit every changed wait path for user cancellation, session replacement, shutdown, timer identity, reload, stale callbacks, pending messages, terminal sanitization, and every `await` boundary; verify no second timer or polling path was introduced.
- [x] Run the focused wait and contract tests, `npm run typecheck --workspace @narumitw/pi-goal`, and `npm run test:runtime --workspace @narumitw/pi-goal`; record exact passing counts and any unavailable live monitor path.
- [x] Run root `npm test`, root `npm run check`, `just pack goal`, `npm run changeset:status`, and `git diff --check`; inspect the package tarball and final diff for unintended settings, queue, dependency, or cross-package changes.
- [x] Recheck that Issue #661 remains solved when no deadline is supplied, when a clamped deadline wakes the Goal, and when external input arrives before the effective deadline; archive this plan only after every completion item has evidence.

## Verification Evidence

- The initial focused red run executed 54 tests and failed only the missing clamp behavior and missing anti-polling tool guidance, with 52 tests passing.
- Independent review identified missing clamped-deadline external-wake cancellation, negative and maximum bounds, and terminal-output safety coverage; all findings were addressed with deterministic tests.
- Focused wait, tool-policy, and contract verification passed 80 tests across three files after hardening.
- The complete `pi-goal` suite passed 342 tests across 20 files, package typechecking passed, and the real Pi runtime smoke passed.
- One repeated root test run hit an unrelated `pi-sync` condition-wait timeout; its focused 14-test file passed immediately, and the subsequent root `npm test` plus CI-equivalent `npm run check` each passed 2,792 tests across 256 files together with Biome, boundary validation, every workspace typecheck, and required builds.
- `just pack goal` inspected 24 published files including `src/wait.ts`, updated source, README, manifest, and license, and left no tarball artifact.
- `npm run changeset:status` recognized `.changeset/tidy-goals-wait.md`; the existing minor `goal_wait` Changeset remains the effective package bump.
- `git diff --check` passed, and the semantic audit found no new timer, polling path, setting, queue mutation, dependency, cross-package source change, asynchronous boundary, or Pi Core change.
- A live third-party monitor smoke was unavailable because no external monitor integration is present; deterministic extension-input, clamped-deadline, legacy-restore, cancellation, retry, lifecycle, and real Pi runtime coverage verifies the repository-owned contract.

## Completion Checklist

- [x] Requests from 1 through 9,999 milliseconds produce one effective ten-second deadline and visibly report the clamp.
- [x] Requests of ten seconds or longer preserve their requested value, and invalid or oversized requests retain current rejection behavior.
- [x] Deadline-free waits remain indefinitely quiet until external input or explicit resume.
- [x] Persisted absolute deadlines restore without being extended, restarted, or clamped during reload.
- [x] External input before a clamped deadline cancels timer ownership and does not produce a later stale continuation.
- [x] Tool output, details, prompts, README, status, and tests agree on requested and effective timing.
- [x] Only `pi-goal` source, tests, documentation, and its Changeset are changed.
- [x] Focused tests, runtime smoke, package typecheck, root tests, CI-equivalent checks, package inspection, Changeset status, semantic lifecycle audit, and final diff review pass with recorded evidence.
