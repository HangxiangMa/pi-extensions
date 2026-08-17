# Pi Subagents Minimal Delegation Admission Evaluation Plan

- **Status:** Active evidence gate; deterministic baseline complete and paired live-provider evaluation deferred.
- **Decision:** [`2026-08-10_pi-subagents-admission-gate-decision.md`](../benchmarks/2026-08-10_pi-subagents-admission-gate-decision.md).

## Plan Relationship

This plan is the sole owner of matched delegation-admission evidence and the **Admit**, **Revise**, or **Defer** decision required before any adaptive or default delegation-routing change.

The [verified execution loop plan](archived/2026-08-10_pi-subagents-verified-execution-loop-plan.md) owns fresh exact-tree acceptance and bounded rework behavior.

The archived autonomous workflow planning plan is historical only because `subagent_auto` and the built-in `planner` are removed.

Existing explicit workflow implementations and fixtures may contribute evidence, but they do not satisfy this plan's paired live-provider gate by themselves.

## Post-hoc Origin

This plan was added after commit `07df6d8b` created the initial delegation-intelligence roadmap and its five implementation plans.

**Reason:** A later AlphaXiv evidence audit found no general matched-model, matched-information, matched-budget, matched-harness coding advantage for dynamic subagents, while strong single-agent, equal-budget sampling, naive-team failure, cancellation, and stale-integration evidence required a small falsifiable gate before adaptive orchestration.

This post-hoc plan implements Roadmap Gate 4A only and does not authorize production routing or a default change.

## Goal

Evaluate an audit-only deterministic delegation-admission policy and a minimal fixed delegation architecture before adaptive scheduling is admitted.

Record an explicit **Admit**, **Revise**, or **Defer** decision using paired repeated evidence against credible simpler baselines.

## Context

Handoff v2, capability audit and enforcement, typed outcomes, generation-bound cancellation, and the WorkItem integration ledger are expected to provide the contracts and observations needed for a fair comparison.

The deeper research found that automatic multi-agent systems can lose to a strong single agent or equal-budget self-consistency and that wider teams can increase coordination failure.

The first experiment must therefore isolate admission, bounded parallelism, integration, and verification without recursive delegation or an adaptive learned scheduler.

## Architecture

An audit-only admission evaluator will consume immutable task, capability, dependency, budget, verification, and generation metadata and return one recommendation with bounded reasons.

The recommendation vocabulary will be parent-owned direct work, one child, one child plus independent verification, bounded two-child work, or abstain because evidence is insufficient.

The evaluator will not launch children, override a caller, call another model, inspect hidden reasoning, or infer intent from task keywords.

A benchmark harness will execute comparable arms with the same base model, issue and repository state, hints, tools, context policy, evaluator, aggregate token or dollar ceiling, wall-clock ceiling, retry allowance, and repeated paired seeds.

The minimal multi-child arm will permit at most two concurrent mutating children, prohibit recursive grandchildren, use one integration owner, and use one fresh-context verifier.

Every result will remain tied to its task generation, base state, accepted plan, capability grant, artifact versions, and verification evidence so cancellation and stale-result containment can be scored.

## Non-Goals

- Do not enable automatic production routing or change existing launch defaults.
- Do not add learned routing, task-keyword heuristics, reward models, or another admission-time model call.
- Do not test more than two concurrent mutating children or permit recursive grandchildren.
- Do not claim a universal delegation policy from one model, benchmark, task class, or provider.
- Do not weaken capability, trust, workspace, cancellation, integration, or verification controls to improve benchmark throughput.
- Do not publish, tag, or release from this evaluation plan.

## Assumptions

- Roadmap Phases 1 through 4 are complete and stable before this gate executes.
- The benchmark can represent parent-owned or equivalent strong single-agent work without making `pi-subagents` own Pi's parent agent loop.
- Provider and evaluator variability can be bounded with repeated paired tasks and preserved per-instance outcomes.
- A **Defer** result leaves completed contracts, capability audit, typed outcomes, and integration safety useful without admitting Phase 5.

## Unknowns

- Which repository task strata expose enough decomposability, context pressure, specialist value, or independent-verification value to justify delegation remains unknown.
- The minimum sample size and confidence interval required for an admission decision must be fixed before result inspection.
- A truthful equal-budget comparison may need both token or dollar and wall-clock ceilings when cached or local worker costs are not directly comparable.
- The benchmark may need an external harness adapter to represent parent-owned direct execution without coupling that adapter to extension production code.

## Risks

- Harness or prompt differences can be mistaken for delegation value.
- Equal per-agent limits can accidentally give multi-child arms more total compute.
- One-run wins can reverse under another seed or task sample.
- A verifier can add cost while sharing the implementation model's blind spots.
- Audit recommendations can be overfit to the benchmark even when they do not change production behavior.
- Cancellation or stale-result tests can appear successful if late workers are ignored but not actually stopped or quarantined.

## Rollback / Recovery

- Keep all admission output offline or audit-only and removable without changing existing execution behavior.
- Preserve raw paired outcomes and rejected policy variants so the decision can be reproduced without rerunning providers.
- Record **Defer** when matched execution, sample size, or cost accounting cannot be made truthful.
- Keep Phase 5 blocked after **Defer** and require a new explicitly approved evaluation plan before another admission attempt.
- Retain deterministic contract and lifecycle fixtures even when live-provider evidence is unavailable.

## Plan

- [ ] **Post-hoc addition:** Freeze the admission question, task strata, compared arms, primary outcomes, aggregate budgets, stopping rules, minimum sample size, and paired confidence method before observing results; verify the protocol against both deeper research reports.
- [x] **Post-hoc addition:** Define the bounded audit-only recommendation and reason schema for parent-owned direct work, one child, one child plus verification, bounded two-child work, and insufficient evidence; verify no recommendation can launch work.
- [x] **Post-hoc addition:** Add deterministic policy tests for context pressure, declared independent work, dense coupling, missing verification, unsupported capability, insufficient budget, stale generation, and ambiguous requirements without task-keyword matching or provider calls.
- [x] **Post-hoc addition:** Build benchmark adapter contracts and dry-run validation for a strong single-agent arm, one-child arm, equal-budget best-of-N arm, naive-parallel arm, fixed two-child arm, and admission-policy-selected arm with one shared model, tool, context, evaluator, retry, token or dollar, and wall-clock protocol.
- [x] **Post-hoc addition:** Enforce at most two concurrent mutating children and no recursive grandchildren in every experimental multi-child arm; verify attempted width or depth expansion is rejected before child allocation.
- [x] **Post-hoc addition:** Require one integration owner to check task generation, base commit, dependency or read-set versions, accepted-plan identity, scope, patch digest, and evidence before applying experimental artifacts.
- [ ] **Post-hoc addition:** Run verification in a fresh context against the exact integrated tree and preserve accept, bounded rework, and reject outcomes separately from worker self-reports.
- [ ] **Post-hoc addition:** Inject cancellation, session replacement, stale dependency, merge conflict, verifier disagreement, transient tool failure, worker crash, timeout, and late completion; measure propagation latency, leaked owned work, stale-result rejection, and accepted late results.
- [ ] **Post-hoc addition:** Run paired repeated repository tasks and preserve per-instance quality, token, dollar, wall-clock, retry, handoff, conflict, integration, verification, cancellation, and failure outcomes for every arm.
- [ ] **Post-hoc addition:** Report verified success, verified success per dollar, wall-clock critical path, unnecessary delegation, transfer coverage, conflict and rework rates, permission precision, false completion, stale acceptance, and confidence intervals without selecting only favorable task strata.
- [x] **Post-hoc addition:** Record **Admit**, **Revise**, or **Defer** with the admitted task strata, policy bounds, failed criteria, limitations, and exact Phase 5 consequence; require explicit user approval before executing an admitted Phase 5 plan.
- [x] **Post-hoc addition:** Update the roadmap, implementation notes, and benchmark guidance with the decision and evidence while keeping provider data bounded, redacted, and free of credentials or private repository content.
- [ ] **Post-hoc addition:** Run focused deterministic tests, the benchmark's dry-run validation, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; record unavailable live-provider evidence without substituting simulation claims.

## Completion Checklist

- [ ] **Post-hoc gate:** Every compared arm uses the same declared model, information, harness, evaluator, aggregate compute ceilings, and paired task sample, or the decision is **Defer**.
- [ ] **Post-hoc gate:** The first multi-child architecture uses no more than two concurrent mutating children and no recursive grandchildren.
- [ ] **Post-hoc gate:** Admission remains audit-only and cannot allocate a child or change an established launch.
- [ ] **Post-hoc gate:** Cancellation and replacement invalidate old generations before signalling workers, and zero old-generation results enter integration or acceptance.
- [ ] **Post-hoc gate:** Integration and fresh-context verification evaluate the exact current state rather than trusting worker completion prose.
- [ ] **Post-hoc gate:** Per-instance outcomes and paired uncertainty support the recorded **Admit**, **Revise**, or **Defer** decision.
- [ ] **Post-hoc gate:** Phase 5 remains blocked unless the decision and subsequent execution receive explicit user approval.
- [ ] **Post-hoc gate:** Required checks pass, limitations are recorded, and no package is published.
