# Pi Subagents Event-Driven Workflow Runtime Plan

## Goal

Replace batch-barrier workflow execution with one rolling event-driven runtime that schedules after every task settlement, performs bounded typed recovery, and safely reconciles persisted workflows after interruption.

Keep uncertain mutating work from being replayed or accepted while allowing current safe work to continue automatically.

## Plan Relationship

This plan owns only rolling dispatch, active-task state, bounded recovery execution, persistence reconciliation, and explicit resume behavior.

It depends on the [verified execution loop plan](archived/2026-08-10_pi-subagents-verified-execution-loop-plan.md) for acceptance-state and rework transitions.

It depends on the [autonomous workflow planning plan](archived/2026-08-10_pi-subagents-autonomous-workflow-planning-plan.md) for bounded graph patches.

It continues the implemented dependency scheduler and semantic snapshot baseline documented in the [delegation-intelligence roadmap](../roadmaps/2026-08-10_pi-subagents-delegation-intelligence-roadmap.md) without re-owning that baseline.

The [minimal delegation admission evaluation plan](2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md) remains the sole owner of matched evidence required before a default change.

## Context

`AdaptiveScheduler.decide()` already evaluates dependency readiness, critical-path depth, capacity, remaining budget, declared scopes, ownership keys, and a two-mutating-child ceiling.

The blocking workflow loop currently passes `activeCount: 0`, starts a selected batch with `mapWithConcurrencyLimit()`, waits for the complete batch, and only then schedules again.

This batch barrier can leave capacity idle when a fast task unlocks downstream work while an unrelated sibling remains slow.

`WorkItemLedger` provides `rerun()` and `invalidate()`, while typed outcomes provide recovery actions such as retry, reroute, supply input, revalidate, replan, verify, or stop.

The runtime currently performs only caller-configured transient retries or read-only hedging and otherwise settles blocked dependents before returning.

Workflow persistence saves snapshots, but blocking execution does not load and reconcile a previous snapshot for continuation.

The verified-execution and autonomous-planning plans provide the acceptance and graph-revision boundaries required before automatic recovery can safely become a closed loop.

## Architecture

Add one session-owned `WorkflowRuntime` that owns the active-task map, completion queue, scheduler invocation, task launches, aggregate deadline, remaining budgets, active scopes, ownership, cancellation tree, persistence publication, recovery decisions, and terminal settlement.

Keep `AdaptiveScheduler` pure.

Call it whenever the ledger changes, capacity changes, a task settles, a task becomes stale, a recovery action completes, or the aggregate deadline expires.

The runtime will launch selected tasks without waiting for all currently active tasks and will consume settlement through a completion queue or equivalent `Promise.race()` loop.

Every scheduling call will receive truthful active counts, mutating counts, read and write scopes, ownership keys, transport capacity, and remaining aggregate budget.

A deterministic `WorkflowRecoveryController` will translate typed outcomes into bounded executor actions.

Transient pre-acceptance transport or tool failures may retry within the declared aggregate budget.

Capability mismatch may reroute only before uncertain side effects and only to an agent satisfying the accepted authority ceiling.

Missing inputs may request one bounded planner patch.

Stale read-only evidence may revalidate against the current semantic snapshot.

Verifier rejection may invoke the verified-execution rework path.

Unsupported guarantees, ambiguous mutation, exhausted revision or retry bounds, repeated unchanged failures, and stale integration state will stop without replay.

Persistence will use one serialized publication owner and include enough current-generation runtime state to reconcile pending, ready, active, settled, invalidated, and terminal WorkItems.

Restore will never assume an in-flight process survived.

Persisted running tasks will restore as interrupted and require classification before any rerun.

Pending current work may resume after semantic compatibility and dependency revalidation.

Read-only or proven idempotent interrupted work may rerun under a new generation after current-state revalidation.

Mutating interrupted work may rerun only when the runtime can prove that prior side effects did not occur or when an explicit idempotency contract and current integration state make repetition safe.

Otherwise the workflow stops with an actionable non-success outcome.

## Non-Goals

- Do not maximize worker count or treat configured concurrency as a target.
- Do not exceed two concurrent mutating children or enable workflow grandchildren.
- Do not automatically replay accepted, ambiguous, or potentially side-effecting work.
- Do not build a distributed queue, remote worker service, cron scheduler, or general workflow engine.
- Do not add a learned scheduler, reward model, or provider-time classifier in the first implementation.
- Do not expand dashboards, inspection, status, or telemetry beyond runtime metadata required for correctness and persisted reconciliation.
- Do not change parallel result ordering or omitted-field behavior for existing non-automation modes.
- Do not publish, tag, release, or change a package default.

## Assumptions

- The verified-execution loop supplies authoritative acceptance and bounded rework.
- The autonomous planner supplies versioned graph patches for missing-input and semantic replanning.
- WorkItem generations, capability grants, semantic snapshots, artifacts, and persistence remain the authoritative workflow data.
- A session-owned runtime can cancel every task, timer, completion waiter, persistence operation, status owner, and disposable workspace it creates.
- A deterministic fake transport and virtual clock can exercise scheduling and recovery without live-provider variance.

## Unknowns

- The public resume selector, idempotency key, or workflow identity required to choose a persisted workflow must be decided before exposing continuation.
- The exact supported restore behavior for dirty repositories and non-Git targets may remain needs-revalidation or unsupported.
- Transport capacity may require a normalized runtime adapter because subprocess, RPC, in-process, and retained agents have different settlement semantics.
- Fairness and starvation bounds must be selected without weakening critical-path or scope safety.
- The first eligible task classes for automatic resume require failure-injection evidence before live evaluation.

## Risks

- Concurrent settlement and cancellation can double-complete a WorkItem or publish state out of order.
- A false active-scope release can allow conflicting writes.
- Recovery can loop between reroute, replan, and verification without making progress.
- Restored state can describe side effects that the runtime cannot observe or undo.
- A fast downstream task can consume budget needed by a critical-path verifier if budget reservation is incomplete.
- Changing launch timing can expose tests or tools that were accidentally relying on batch barriers.
- Persistence loading can create a second state owner if registry, ledger, and runtime responsibilities are not explicit.

## Rollback / Recovery

- Keep current batch workflow execution as an explicit fallback until rolling execution passes deterministic and representative evidence.
- Put rolling execution and resume behind the explicit automation contract, with versioned persisted runtime records.
- Preserve declared result ordering even when launch and settlement order changes.
- On corrupt, unsupported, semantically incompatible, or ambiguous persisted state, quarantine the record and return needs-revalidation or rejected without launching work.
- Stop the workflow when recovery cannot prove safe continuation instead of falling back to blind replay.
- Allow automatic resume to be disabled independently from rolling scheduling and bounded recovery.
- Restore the legacy batch executor without migrating legacy records by keeping the WorkItem snapshot compatible and versioning new runtime metadata.

## Plan

- [ ] Characterize current batch launch order, result order, scheduler decisions, `mapWithConcurrencyLimit()`, task start and settlement, retry and hedge behavior, aggregate deadlines, cancellation, persistence publication, restore projection, workspace cleanup, and transport settlement; preserve focused baseline tests.
- [ ] Define the `WorkflowRuntime` ownership boundary against `executeSubagent()`, `AdaptiveScheduler`, `WorkItemLedger`, registry, transports, persistence, completion controller, UI status, and session lifecycle; reject designs with more than one transition or cleanup owner.
- [ ] Define the event vocabulary and deterministic ordering for task selected, launch accepted, tool or transport failure, child settled, verification settled, invalidation, recovery requested, cancellation, deadline, persistence completion, and shutdown.
- [ ] Add a virtual-clock deterministic harness and failing fixtures proving a fast task can unlock and start downstream work while an unrelated slow sibling remains active.
- [ ] Implement an active-task registry that tracks task and workflow generation, agent, transport, side-effect policy, read and write scopes, ownership, budget, cancellation controller, workspace, and settlement promise without storing private prompts.
- [ ] Replace workflow batch waiting with a completion queue or bounded `Promise.race()` event loop that invokes the pure scheduler after each authoritative state change and preserves declared result ordering.
- [ ] Pass truthful active counts, mutating counts, active scopes, ownership, transport capacity, and remaining budget into every scheduling decision, and add tests for no overcommit, no scope conflict, critical-path progress, fairness, and aggregate deadline exhaustion.
- [ ] Define a bounded recovery matrix for transient retry, capability reroute, missing-input planner patch, stale read-only revalidation, verifier-directed rework, contract repair, unsupported guarantee, ambiguous mutation, repeated unchanged failure, and terminal stop.
- [ ] Implement `WorkflowRecoveryController` with aggregate retry, reroute, revision, revalidation, rework, provider-call, token or cost when available, and wall-clock ceilings; prevent model output from increasing any bound.
- [ ] Add tests proving capability reroute cannot occur after ambiguous side effects, planner repair cannot alter completed work, verification rework uses a new generation, and repeated identical failures terminate.
- [ ] Decide the explicit persisted workflow identity and resume request surface, including compatibility, trust, project scope, branch behavior, idempotency, missing record, duplicate request, and downgrade semantics.
- [ ] Implement serialized load, reconcile, and save so in-flight records restore as interrupted, completed evidence remains immutable, stale generations stay quarantined, and publication cannot regress to an older snapshot.
- [ ] Implement restore classification for pending, ready, read-only interrupted, idempotent interrupted, mutating interrupted, awaiting verification, accepted, stale, invalidated, and terminal work with a default stop for uncertain mutation.
- [ ] Add crash and restart fixtures for pre-launch, launch-accepted, mid-tool, post-side-effect ambiguous, worker-settled pre-persist, verifier-running, persistence-failing, cancellation, replacement, timeout, and late completion states.
- [ ] Prove session replacement and shutdown cancel or release every runtime-owned child, timer, waiter, queue entry, persistence lease, status, and disposable workspace, and revalidate generation and context after every `await`.
- [ ] Add a deterministic makespan comparison between legacy batch and rolling scheduling with identical tasks, capacities, and budgets, while preserving zero-conflict and zero-duplicate-side-effect invariants.
- [ ] Freeze a matched live-provider evaluation protocol for eligible task classes against legacy batch, explicit workflow, and simpler single-agent baselines before observing provider results; keep rolling mode explicit until a separate decision.
- [ ] Update `packages/pi-subagents/README.md`, runtime and persistence guidance, compatibility and downgrade notes, package layout, and an appropriate Changeset for rolling execution and any resume surface.
- [ ] Audit lifecycle, settings if added, file-mutation serialization, fork-sensitive state, cancellation, stale continuations, non-TUI behavior, terminal safety, output bounds, persistence failure recovery, invalid-file protection, and repeated cleanup against the extension guides.
- [ ] Run focused scheduler, execution, recovery, WorkItem, persistence, semantic snapshot, verification, registry, transport, cancellation, and shutdown tests; then run `npm test`, `npm run check`, `git diff --check`, `just benchmark-subagents`, `just pack subagents`, and representative local interruption and resume smokes when practical.

## Completion Checklist

- [ ] One session-owned runtime is the sole owner of rolling workflow transitions, active work, recovery, persistence publication, and cleanup.
- [ ] Newly ready safe work starts after any settlement without waiting for unrelated active siblings.
- [ ] Every scheduler call receives truthful active capacity, scopes, ownership, generations, and remaining budget.
- [ ] Typed recovery is bounded, deterministic, generation-aware, and cannot replay uncertain mutating work.
- [ ] Persisted workflows load through semantic and side-effect reconciliation, and corrupt or unsupported state launches zero children.
- [ ] Restored running work is never assumed complete or safely repeatable merely from persisted state.
- [ ] Cancellation, replacement, timeout, crash, shutdown, and late settlement produce zero accepted old-generation artifacts and no leaked runtime-owned resources.
- [ ] Declared result order, omitted-field compatibility, two-mutating-child limit, and no-grandchild rule remain intact.
- [ ] Deterministic evidence demonstrates reduced batch-barrier makespan without conflicts or duplicate side effects.
- [ ] Focused tests, semantic audits, root CI-equivalent gate, benchmark, package dry run, and representative runtime smokes pass or unavailable paths are explicitly recorded.
- [ ] Published behavior has an appropriate Changeset, and no publication or release action has occurred.
