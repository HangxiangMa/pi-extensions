# Pi Subagents Adaptive Scheduling and Semantic Snapshot Plan

## Goal

Add deterministic dependency-aware scheduling and semantic resource snapshots so `pi-subagents` starts only current, ready, safely independent work, adapts effective concurrency below hard ceilings, detects semantic skew before continuation, and invalidates stale downstream evidence.

Prove value against matched single-agent and orchestration baselines before changing defaults.

## Context

The WorkItem ledger provides authoritative dependencies, artifacts, generations, ownership, acceptance state, and invalidation.

Current retained turns use a FIFO queue bounded by `maxActiveTurns`, while blocking parallel execution starts a fixed maximum of four workers at once.

Current retained state records agent identity and selected runtime controls but does not bind every continuation to immutable identities for agent definition, prompt resources, tool policy, model resolution, repository generation, dependency artifacts, or scheduler policy.

The research notes show that raw agent count is weakly related to quality, that dependency-ready cohesion-aware scheduling can improve quality and cost, and that missing transfers and latent-failure cascade radius can grow with depth.

This phase must keep concurrency limits as safety ceilings and make semantic mismatch visible without storing secrets or full prompts.

## Architecture

A deterministic scheduler will consume immutable WorkItem and ExecutionPlan snapshots and emit explicit decisions with ready, blocked, unsafe, stale, budget-limited, capacity-limited, or selected reasons.

Effective concurrency will be the minimum of configured hard limits, dependency-ready work, safe ownership and workspace capacity, transport capacity, remaining budget, and bounded policy constraints.

The first scheduler will not call another model and will not optimize raw agent count.

Optional critical-path and cohesion hints will affect ordering only when they are explicit or computed by a bounded deterministic adapter.

A versioned semantic snapshot will store allowlisted identities or hashes for agent definition, role prompt, result contract, effective tool and resource policy, resolved model and thinking, transport protocol, cwd trust decision, repository generation, dependency artifacts, workflow generation, and scheduler policy.

Snapshots will never persist credentials, provider headers, environment values, full prompts, raw protected files, or unrestricted absolute paths.

A compatibility evaluator will classify current state as compatible, warning, needs-revalidation, or rejected before a restored or retained turn begins.

Invalidation will propagate through dependency edges and preserve prior evidence while preventing stale acceptance.

Independent verifier evidence will be required only for configured risk classes or WorkItems whose acceptance contract demands it.

## Non-Goals

- Do not maximize worker count, recurse without bounds, or launch every ready task immediately.
- Do not add a learned scheduler, reinforcement-learning policy, or orchestration reward model in the first implementation.
- Do not build full static repository dependency analysis or require a repository index for every task.
- Do not persist raw prompts, source files, credentials, provider headers, secrets, or model reasoning in snapshots.
- Do not automatically replay stale or invalidated work that may have produced side effects.
- Do not change default scheduling or semantic-isolation policy before benchmark and soak evidence supports a separate decision.

## Assumptions

- Handoff v2, ExecutionPlan enforcement, typed outcomes, and the WorkItem ledger are complete and stable.
- Existing concurrency settings remain hard safety limits regardless of scheduler mode.
- Repository generation can use a bounded truthful identity that distinguishes clean commits, worktrees, and unsupported dirty-state precision.
- Semantic compatibility rules can begin conservative and become stricter only with evidence.

## Risks

- Adaptive ordering can make runs harder to reproduce if decisions are not deterministic and recorded.
- Cohesion hints can be wrong and serialize work unnecessarily or allow unsafe overlap.
- Repository or resource hashing can add startup latency and expose sensitive identities.
- Benign prompt, model alias, or settings changes can cause excessive revalidation.
- Strict snapshot enforcement can strand restored work after package upgrades.
- Benchmark improvements can be caused by extra tokens, models, retries, or budget rather than scheduling.
- New settings can violate persistence, precedence, rollback, or downgrade expectations.

## Rollback / Recovery

- Keep current FIFO and fixed blocking scheduling as the default and documented rollback path during the first release.
- Add dependency-aware scheduling and semantic-isolation policy as explicit settings or contracted options with exact previews and downgrade instructions.
- Treat unknown old snapshots as warning or needs-revalidation rather than silently compatible.
- Restore stale workflows inertly and require explicit revalidation, replacement, or closure.
- Preserve prior WorkItem, artifact, and verification evidence when invalidating downstream state.
- Revert scheduler policy independently from semantic snapshot recording if benchmark value is not demonstrated.

## Plan

- [ ] Characterize FIFO queue order, blocking parallel concurrency, queue telemetry, budget precedence, write-conflict checks, worktree isolation, transport capacity, retained restore, model resolution, agent discovery, prompt resources, and current persistence; verify focused tests pass before scheduling changes.
- [ ] Define deterministic scheduler inputs, decision reasons, tie-breaking, hard ceilings, critical-path hints, cohesion hints, ownership conflicts, workspace conflicts, transport capacity, budget handling, and starvation bounds; verify the policy never treats configured maximum as a target.
- [ ] Add failing pure-scheduler tests for dependency readiness, equal-priority determinism, critical path, cohesion grouping, write conflicts, worktree independence, capacity, budget exhaustion, stale inputs, blocked verification, cancellation, fairness, and no-ready-work behavior.
- [ ] Implement a scheduler module that returns decisions without launching work, then integrate it behind the WorkItem ready queue while preserving legacy FIFO mode and existing hard limits.
- [ ] Add blocking workflow scheduling only after retained scheduling parity is proven; verify existing explicit parallel input ordering remains stable in results even when launch order differs under the opt-in scheduler.
- [ ] Define the semantic snapshot schema, allowlist, hash algorithms, path projection, versioning, and compatibility rules for agent definition, prompt resources, tool policy, model resolution, transport protocol, trust, repository, artifacts, workflow, and scheduler.
- [ ] Add failing snapshot tests for unchanged state, agent prompt change, tool change, model alias re-resolution, resource change, trust change, clean commit change, dirty repository, worktree, artifact supersession, package protocol upgrade, unknown old snapshot, private text, and unsupported resource identity.
- [ ] Implement bounded snapshot capture before launch and before persistence without reading secrets, storing full prompts, exposing unrestricted paths, or performing unbounded repository scans.
- [ ] Implement compatibility evaluation before restored or retained continuation with compatible, warning, needs-revalidation, and rejected outcomes plus exact bounded reason codes.
- [ ] Propagate upstream artifact, repository generation, accepted ExecutionPlan, or semantic-resource invalidation through downstream WorkItems and verifier evidence without automatic replay or evidence deletion.
- [ ] Add an explicit revalidation operation that can refresh safe read-only evidence or request a new verifier turn, while requiring user or orchestrator approval before repeating side-effecting implementation work.
- [ ] Add risk-based independent verification policy for contracted implementation, security-sensitive, cross-owner integration, and stale-result acceptance, while allowing low-risk lookups to omit the extra cost.
- [ ] Add bounded scheduler and snapshot metadata to inspection, diagnostics, completion details, status, and manager views with decision reason, effective concurrency, snapshot compatibility, invalidation count, and verification state.
- [ ] If user-facing settings are added, implement them through the existing `/subagents` manager with current-versus-configured values, exact preview, cancellation, serialized latest-document save, invalid-file protection, unknown-field preservation, atomic publication, rollback, reload semantics, and non-TUI behavior.
- [ ] Build a deterministic orchestration simulation suite covering graph width, depth, context pressure, transfer loss, cohesion, stale resources, and injected failures; record transfer coverage, cascade radius, permission precision, delegation fidelity, makespan, tokens, and decision reproducibility.
- [ ] Run repeated target-framework comparisons against a strong single agent, equal-budget best-of-N, naive parallelism, fixed scheduling, and orchestrator ablation with matched model, tools, context, budgets, and verification; report confidence and limitations rather than one-run wins.
- [ ] Decide from evidence whether dependency-aware scheduling or stricter semantic isolation should remain experimental, become recommended, or be proposed as a new default; require separate approval for a default change.
- [ ] Update README, settings and downgrade guidance, help, inspection docs, implementation notes, package layout, and separate Changesets for public scheduler and snapshot behavior.
- [ ] Audit timers, queues, cancellation, stale generation after every `await`, session replacement, shutdown, restore, settings ordering, hashing bounds, private data, terminal safety, and cleanup against both extension guides.
- [ ] Run focused tests, `npm test`, `npm run check`, `git diff --check`, `just benchmark-subagents`, and `just pack subagents`; run representative local Pi smokes for scheduling, restore mismatch, revalidation, and shutdown when practical.

## Completion Checklist

- [ ] Scheduler decisions are deterministic, bounded, inspectable, and constrained by existing hard limits.
- [ ] Effective concurrency is derived from ready safe work and never optimized toward raw agent count.
- [ ] Legacy FIFO and fixed scheduling remain available until a separately approved default change.
- [ ] Snapshots contain only allowlisted identities or hashes and no credentials, full prompts, provider headers, or raw private resources.
- [ ] Restored and retained continuations evaluate semantic compatibility before model work begins.
- [ ] Stale or invalidated evidence cannot satisfy current acceptance without explicit revalidation.
- [ ] Potentially side-effecting work is never replayed automatically because of scheduling or snapshot mismatch.
- [ ] Independent verification is required by risk or contract rather than applied indiscriminately.
- [ ] Matched benchmark evidence distinguishes scheduler value from extra models, tokens, retries, context, or budget.
- [ ] Settings, lifecycle, persistence, terminal safety, package checks, smokes, and Changesets pass without publication.
