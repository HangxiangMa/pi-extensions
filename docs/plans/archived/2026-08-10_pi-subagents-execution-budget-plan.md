# Pi Subagents Execution Budget Plan

## Goal

Make subagent termination predictable and useful by combining main-agent-selected execution budgets with an overall blocking-workflow deadline and bounded, transport-neutral timeout checkpoints that survive failed model finalization.

## Context

The current extension supports per-turn wall-clock deadlines and an abort-then-summary recovery turn.
Fresh subprocess recovery only receives partial assistant text and tool names, so useful completed tool evidence can be lost.
Blocking chains and fan-in workflows also lack one overall deadline, allowing total duration to multiply by the number of steps.
Mainstream agent runtimes additionally bound turns and tool calls, preserve cancellation state, and distinguish completed evidence from optional model-generated recovery summaries.

## Architecture

`turn-budget.ts` owns validated per-turn limits and a small event-driven monitor for idle timeout, assistant turns, and tool calls, while each transport retains its existing work-timeout owner.
`timeout-checkpoint.ts` will own bounded, redacted progress journals and the public termination report shared by subprocess, in-process, and RPC transports.
Blocking orchestration will compute one absolute deadline and cap each child or aggregator budget by the remaining time.
Stateful spawn limits will persist as retained defaults, while follow-up limits will override only one turn like `timeoutMs`.
Model finalization remains optional recovery enhancement; deterministic checkpoint text remains available when finalization fails.

## Non-Goals

- Do not claim a cooperative soft wrap-up phase because blocking subprocess mode cannot steer an already running print-mode child.
- Do not add automatic retries for timed-out write-capable agents because side effects may already have occurred.
- Do not add provider-specific token or monetary budgets in this change.
- Do not change Pi core or pretend prompt-only tool denial is an enforcement boundary for retained sessions.

## Risks

- Budget enforcement must not turn a terminal answer at the exact turn limit into a failure.
- Idle monitoring must reset only on completed meaningful events rather than token deltas.
- Tool evidence may contain private or large output and must be redacted and bounded before persistence or display.
- Overall deadlines must distinguish orchestration exhaustion from an ordinary child work timeout.
- Stateful current-turn overrides must clear after completion and must not leak into later turns or persisted state.

## Plan

- [x] Add failing focused tests for bounded timeout checkpoints, deterministic fallback output, side-effect metadata, and cross-transport report consistency; verify the intended failures with package tests.
- [x] Add failing focused tests for `idleTimeoutMs`, `maxTurns`, and `maxToolCalls` across subprocess, in-process, and RPC turn execution; verify terminal-at-limit success and over-budget abort behavior.
- [x] Add failing orchestration tests for `totalTimeoutMs` across chains, queued parallel tasks, and aggregators; verify each launch receives only the remaining budget and exhausted work is not started.
- [x] Add failing registry and persistence tests for retained spawn budgets and one-turn follow-up overrides; verify ephemeral fields are cleared and not persisted.
- [x] Implement bounded progress journals and versioned termination reports in `packages/pi-subagents/src/timeout-checkpoint.ts`; verify redaction, UTF-8 limits, completed tool evidence, changed-file hints, and deterministic formatting.
- [x] Implement reusable turn-budget validation and monitoring in `packages/pi-subagents/src/turn-budget.ts`; verify idle, turn, and tool-call reasons without timer leaks.
- [x] Integrate budgets, checkpoints, and finalization status into subprocess, in-process, and RPC transports while preserving exit `124`, explicit-abort behavior, bounded cleanup, and existing text fallback.
- [x] Add blocking `totalTimeoutMs` deadline propagation and main-agent-selected turn limits to schemas, execution, renderers, descriptions, and documentation without breaking existing `timeoutMs` precedence.
- [x] Add retained/default and follow-up-override turn limits to registry state, persistence, idempotency, inspection, renderers, and lifecycle cleanup.
- [x] Update the package README, RPC implementation note, and changeset with exact semantics and limitations.
- [x] Audit cancellation, session replacement, shutdown, stale continuations, persisted state, unknown-field preservation, and all timeout/limit cleanup paths against the extension guides.
- [x] Run focused package tests, package check, root `npm run check`, `git diff --check`, and `just pack subagents`; inspect the dry-run package contents.

## Completion Checklist

- [x] Every new observable execution-budget behavior has deterministic regression coverage with recorded red-state evidence.
- [x] Timeout results always retain a bounded deterministic checkpoint even when summary finalization fails.
- [x] Explicit user or parent abort never starts finalization.
- [x] No timer, listener, child process, retained session, or current-turn override survives its owning flow.
- [x] Existing calls that omit the new fields preserve prior behavior.
- [x] The source diff remains within package boundaries and touched source files remain below 1,000 lines or are split by responsibility.
- [x] Required checks and semantic audits pass with no unreported deviations.
