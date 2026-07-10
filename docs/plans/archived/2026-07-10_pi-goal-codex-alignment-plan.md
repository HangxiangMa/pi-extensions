## Goal

Bring `@narumitw/pi-goal` closer to the current Codex Goal contract without porting Codex's SQLite runtime. Success means continuation starts only from a safe idle boundary, stopped outcomes are distinguishable and resumable, budget usage is trustworthy, and every goal prompt applies the same evidence-based completion standard.

## Context

This is the entry plan for the improvement program. Execute the linked plans as separate, reviewable slices in this order:

1. [Idle continuation](./2026-07-10_pi-goal-idle-continuation-plan.md) — completed
2. [Stopped statuses](./2026-07-05_pi-goal-stopped-statuses-plan.md) — completed
3. [Budget accounting](./2026-07-10_pi-goal-budget-accounting-plan.md) — completed
4. [Prompt hardening](./2026-07-05_pi-goal-continuation-prompt-hardening-plan.md) — completed

The order is intentional: prompt text must describe states and controls that already exist, while accounting and continuation changes should land before wording claims Codex-like behavior.

## Architecture

Keep the implementation as a Pi extension with session-entry persistence and one `/goal` command. Preserve the UUID stale-turn guard and nonce-based continuation cancellation. Use Pi's settled/idle lifecycle for scheduling, add Codex-inspired stopped states locally, and define token/elapsed usage in extension-owned state rather than introducing a global database.

## Non-Goals

- Do not port Codex's SQLite goal store, app-server RPC API, analytics, or TUI.
- Do not modify `third_party/codex`.
- Do not remove `goal_complete({ goal_id, summary })` or weaken its stale-turn checks.
- Do not claim exact Codex parity where Pi lacks a hidden-context or runtime-reservation API.
- Do not update the external article unless its source is later added to this repository.

## Plan

- [x] Executed the idle-continuation plan: ordinary continuation now leaves `agent_end` and starts only after Pi is settled; verified by focused tests, the real `AgentSession` runtime smoke, `npm run check`, and `just pack-goal`.
- [x] Executed the stopped-statuses plan: `paused`, `blocked`, `usage_limited`, `budget_limited`, and `complete` now have distinct transitions and resume behavior; verified by state, tool, persistence, interruption, retry, and stale-call tests.
- [x] Executed the budget-accounting plan: provider-total/cache fallback semantics, active elapsed time, tool/compaction/turn boundary exhaustion, and one bounded wrap-up are implemented and documented; verified by 239 tests, the seven-scenario runtime smoke, Pi 0.79.10/0.80.3 checks, and `just pack-goal`.
- [x] Executed the prompt-hardening plan: kickoff, resume, edit, system, continuation, blocker, and budget prompts now share full-objective fidelity and evidence-based completion rules; verified by prompt, marker, escaping, lifecycle, and runtime tests.
- [x] Reconciled `extensions/pi-goal/README.md` with the final command surface, all statuses, interruption semantics, token definition, visible-versus-hidden continuation limitation, blocked audit, and completion contract; parser, formatter, state, prompt, and lifecycle tests cover the documented behavior.
- [x] Ran the CI-equivalent gate and package preview after all slices: `npm run check` passes with 240 tests, the seven-scenario runtime smoke passes, and `just pack-goal` contains only `src/goal.ts`, `README.md`, `LICENSE`, and `package.json`.

## Risks

- Moving continuation later can expose missed wake-ups unless every active, eligible goal reaches a settled callback.
- New stopped states change statusline text consumed by other extensions.
- Counting provider `totalTokens` can make existing budgets exhaust sooner than users expect.
- Stronger prompts increase recurring context cost; keep shared sections concise and tested.

## Rollback / Recovery

Land each linked plan as an independent change. If a slice regresses runtime behavior, revert that slice while preserving earlier completed slices. Keep persisted-state readers backward-compatible throughout so rollback does not make existing sessions unreadable.

## Completion Checklist

- [x] Safe continuation is verified by the completed and archived idle-continuation plan, 211 passing repository tests, and the four-scenario runtime smoke.
- [x] Distinct stopped statuses are verified by the completed and archived stopped-statuses plan, 221 passing repository tests, the runtime continuation smoke, and the package dry run.
- [x] Correct token and active-time accounting is verified by the completed and archived budget-accounting plan, boundary tests, runtime smokes, and Pi compatibility checks.
- [x] Consistent evidence-based prompts are verified by the completed and archived prompt-hardening plan plus prompt, marker, and adversarial escaping assertions.
- [x] Public documentation and package contents are verified by README review, `npm run check`, runtime smoke, and `just pack-goal` output.
- [x] All linked plans are archived under `docs/plans/archived/` after their own completion evidence was recorded.
