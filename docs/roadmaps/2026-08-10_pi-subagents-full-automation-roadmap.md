# Pi Subagents Full Automation Roadmap

- **Status:** Phases 1 and 2 implemented; rolling runtime and production qualification remain planned or deferred.
- **Audience:** `@narumitw/pi-subagents` maintainers and contributors.
- **Planning horizon:** Evidence-qualified phases without delivery dates.
- **Baseline:** [`Pi Subagents Delegation Intelligence Roadmap`](2026-08-10_pi-subagents-delegation-intelligence-roadmap.md).
- **Research basis:** The three AlphaXiv reports under [`docs/research/`](../research/) covering orchestration, collaboration, and verification.

## Vision

Let a user provide one high-level objective while `pi-subagents` selects the smallest justified execution topology, executes dependency-ready work, verifies the exact integrated result independently, performs bounded recovery, and stops with a truthful terminal outcome.

Keep Pi as the owner of model sessions, provider behavior, and tool execution.

Keep `pi-subagents` as the owner of delegation planning, workflow state, authority, integration admission, verification acceptance, recovery bounds, and terminal completion.

## Objectives

- **Make completion evidence-owned** — Success: no opted-in mutating workflow can complete from worker self-report alone, and every accepted result has a current independent verification receipt for the exact integrated state.
- **Automate topology selection** — Success: one high-level objective can produce parent-owned, one-child, verified-one-child, or bounded two-child execution without requiring the caller to author a complete workflow graph.
- **Automate bounded replanning** — Success: failed assumptions, missing inputs, stale evidence, and verifier rejection can revise only unstarted, rework-requested, or invalidated work without blindly replaying side effects.
- **Keep capacity productive** — Success: newly ready safe work can start after any task settles instead of waiting for an unrelated batch sibling.
- **Resume safely** — Success: restored workflows reconcile generations and side-effect state before continuing, with zero automatic replay of uncertain mutating work.
- **Preserve the smallest useful team** — Success: delegation remains conditional, mutating width stays bounded, and recursive grandchildren remain disabled until separate matched evidence supports expansion.

## Current State

- Structured delegation contracts, typed outcomes, capability manifests, `ExecutionPlan`, capability grants, WorkItem state, artifacts, semantic snapshots, cancellation generations, explicit workflows, panels, retries, hedging, and persistence already exist.
- Caller-authored `subagent.workflow` remains available for exact graph, scope, verifier, retry, and topology control.
- The explicit `subagent_auto` surface accepts one bounded objective, uses one read-only planning turn, and deterministically compiles the smallest admitted existing workflow.
- Explicit `workflow.verifiedExecution` separates execution from acceptance, synthesizes or validates one distinct least-authority verifier, runs executor-owned checks against the exact submitted tree, and permits at most one bounded rework cycle.
- The blocking verified-workflow path uses `verifyManagedIntegration()` and `WorkItemLedger.acceptIntegration()` before terminal success; worker self-verification cannot satisfy acceptance.
- The workflow scheduler still selects a batch with `activeCount: 0`, waits for that batch to settle, and then schedules again.
- Workflow persistence saves and inertly restores ledger snapshots, but the blocking execution path does not reconcile and resume an interrupted workflow.
- The admission decision remains opt-in because no paired live-provider repository benchmark has established a general quality, cost, or latency advantage over strong simpler baselines.

## Plan Ownership

| Concern | Current owner | Relationship to earlier plans |
| --- | --- | --- |
| Independent acceptance, immutable verification, and bounded rework | [`Verified Execution Loop Plan`](../plans/archived/2026-08-10_pi-subagents-verified-execution-loop-plan.md) | Implemented as the explicit `workflow.verifiedExecution` surface and archived with its verification record. |
| Objective-to-DAG compilation and graph revision | [`Autonomous Workflow Planning Plan`](../plans/archived/2026-08-10_pi-subagents-autonomous-workflow-planning-plan.md) | Implemented as the explicit `subagent_auto` surface without reopening earlier baselines. |
| Rolling scheduling, recovery, persistence reconciliation, and resume | [`Event-Driven Workflow Runtime Plan`](../plans/2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md) | Continues the dependency scheduler and semantic snapshot baseline without duplicating it. |
| Matched evidence before a default change | [`Minimal Delegation Admission Evaluation Plan`](../plans/2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md) | Remains the sole active admission evidence gate. |

The original implementation plans were removed after their durable decisions and remaining obligations moved to the owners above; Git preserves their design history.

## Guiding Principles

- **Verification before autonomy:** increase autonomous action only after completion requires independent current evidence.
- **One completion owner:** workers, reviewers, and integrators submit evidence, but only the executor-owned controller declares terminal success.
- **External evidence over agreement:** tests, type checks, builds, runtime smokes, artifact digests, and acceptance criteria outrank confidence or agent consensus.
- **Smallest justified topology:** use parent-owned or one-child execution unless decomposition, isolation, parallelism, specialization, or independent verification provides a concrete benefit.
- **No blind side-effect replay:** accepted, ambiguous, stale, interrupted, or potentially mutating work is never replayed merely because settlement was not observed.
- **Patch the graph, not history:** replanning changes only pending, rework-requested, or invalidated nodes and preserves accepted artifacts and provenance.
- **Compatibility by omission:** existing single, parallel, chain, panel, detached, and explicit workflow calls retain their behavior unless the new automation contract is selected.
- **Evidence before defaults:** full automation remains explicit and bounded until matched evaluation supports a separate default-change decision.

## Roadmap

### Phase 1: Make verified completion authoritative

- [x] Every explicitly verified mutating or integration workflow receives a distinct verifier when the verified-execution policy requires one.
- [x] The verifier cannot mutate the submitted state, and executor-owned before-and-after identities reject any verification-time drift.
- [x] Verification runs in a fresh context against the exact integrated state and returns an executor-validated receipt bound to task generation, `ExecutionPlan`, repository identity, patch digest, and required evidence.
- [x] WorkItem execution completion and acceptance are distinct versioned states, so verification and rework do not depend on the legacy terminal `completed` state.
- [x] The blocking verified-workflow path uses managed integration admission before terminal success and rejects worker self-verification as sufficient acceptance.
- [x] Verifier rejection can trigger at most the configured bounded rework cycle, after which the workflow returns rework, rejected, or failed without claiming success.
- [x] Stale, cancelled, replaced, or mismatched verification evidence cannot complete current work.

**Outcome:** Autonomous execution has a trustworthy stopping condition and a bounded correction loop.

**Completed plan:** [`2026-08-10_pi-subagents-verified-execution-loop-plan.md`](../plans/archived/2026-08-10_pi-subagents-verified-execution-loop-plan.md).

### Phase 2: Accept one objective and construct the workflow

- [x] An explicit automation mode accepts one objective, constraints, acceptance criteria, and aggregate budget without requiring a caller-authored task graph.
- [x] A read-only planning turn proposes a bounded typed DAG, while deterministic compilation validates dependencies, scopes, authority, capabilities, artifacts, verification, and hard limits before any mutating child starts.
- [x] Admission selects the smallest justified topology and can return parent-owned direct work or abstention without allocating an execution child.
- [x] Capability routing assigns agents and tools from enforceable manifests without silently widening authority.
- [x] Versioned graph patches can revise pending, rework-requested, or invalidated work after new evidence without replacing accepted history.

**Outcome:** One high-level request can become a safe executable workflow with no manual topology authoring.

**Completed plan:** [`2026-08-10_pi-subagents-autonomous-workflow-planning-plan.md`](../plans/archived/2026-08-10_pi-subagents-autonomous-workflow-planning-plan.md).

### Phase 3: Run a rolling recoverable workflow runtime

- [ ] The workflow runtime maintains active work, safe scopes, ownership, budget, and transport capacity continuously and reschedules after every settlement.
- [ ] Newly ready work starts without waiting for an unrelated slow sibling when capacity and scope safety permit it.
- [ ] Typed outcomes drive bounded executor actions for transient retry, capability rerouting, input repair, read-only revalidation, verifier-directed rework, or terminal stop.
- [ ] Persisted workflows can be loaded and reconciled after interruption without accepting stale generations or replaying uncertain mutating work.
- [ ] Session replacement, shutdown, timeout, cancellation, and late completion leave no accepted old-generation artifacts or leaked owned tasks.

**Outcome:** Automation continues productively through ordinary failures and interruptions while retaining one authoritative workflow state machine.

**Execution plan:** [`2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md`](../plans/2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md).

### Phase 4: Qualify production use

- [ ] Repeated paired repository tasks compare full automation with a strong single agent, one child, equal-budget best-of-N, fixed two-child execution, and explicit workflow execution under matched information, model, tools, evaluator, aggregate budget, and wall-clock ceilings.
- [ ] Results separately report verified success, false completion, unnecessary delegation, rework, conflicts, stale acceptance, duplicate side effects, tokens, cost, and critical-path duration by task class.
- [ ] A recorded **Admit**, **Revise**, or **Defer** decision identifies eligible task classes and preserves explicit opt-in behavior when evidence is insufficient.
- [ ] Any default change, recursion expansion, wider mutating team, publication, tag, or release remains a separate explicitly approved action.

**Outcome:** Production behavior changes only when representative evidence shows where automation is safer or more effective than simpler alternatives.

## Success Metrics

| Indicator | Current baseline | Required invariant or decision |
| --- | --- | --- |
| Mutating workflow accepted from worker self-report alone | Rejected in explicit verified-execution mode | 0 in full-automation mode |
| Verifier-caused state drift accepted | Rejected by exact-tree before-and-after checks | 0 |
| Executed but unaccepted work treated as terminal success | Rejected by versioned acceptance state in verified-execution mode | 0 in full-automation mode |
| Accepted stale or old-generation verification receipts | Rejected end to end in verified-execution tests | 0 end to end |
| Managed integration checks exercised by workflow execution | Wired for explicit verified execution | Every automated mutating acceptance |
| Unrelated ready work blocked by a slow selected sibling | Possible under batch scheduling | 0 when safe capacity is available |
| Uncertain mutating work replayed after restore | Not resumed automatically today | 0 |
| Automated rework cycles | Zero or one in explicit verified-execution mode | Hard bounded with no unbounded loop |
| Automatic topology quality against matched simpler baselines | Unknown | Decision by task class before any default change |
| Concurrent mutating children | Hard cap available | At most two until separately approved |
| Recursive workflow grandchildren | Rejected | Remain rejected until separately evaluated |

## Risks and Dependencies

| Risk or dependency | Impact | Mitigation or decision |
| --- | --- | --- |
| A verifier repeats the worker's blind spot | False confidence can become automated acceptance | Require fresh context, original requirements, raw artifacts, deterministic evidence, and a distinct agent identity. |
| A verifier mutates the state under review | The receipt can attest to verifier-authored state and bypass the integration owner | Run checks under executor ownership, constrain verifier authority, compare before-and-after state identity, and reject drift. |
| Planner output invents unsafe dependencies or scopes | Incorrect topology can race writes or omit required evidence | Compile model output through deterministic graph, capability, scope, authority, and artifact validation before allocation. |
| Replanning loops consume budget without progress | Automation can become slower and less reliable than direct work | Bound plan revisions, rework cycles, model calls, total budget, and unchanged-state repetitions. |
| Rolling scheduling introduces cancellation races | Late results or duplicate work can enter acceptance | Keep one event-loop owner, generation-bound grants, active-task cancellation, and stale-result quarantine. |
| Restore cannot prove prior side effects | Automatic continuation could duplicate mutations | Resume only current unstarted work or safely revalidated read-only/idempotent work, and stop uncertain mutation. |
| More automation is mistaken for better outcomes | Extra calls can hide a quality or cost regression | Preserve simpler baselines and require matched repeated evidence before defaults change. |

## Non-Goals

- Expand inspection, dashboards, status rendering, telemetry, or other observability surfaces beyond metadata required for runtime correctness and verification receipts.
- Maximize agent count, debate rounds, recursion depth, or configured concurrency.
- Build a general distributed workflow engine, CI service, unrestricted patch-merging system, or operating-system sandbox.
- Treat consensus, confidence, persuasive prose, exit code, `agent_end`, or `agent_settled` as sufficient correctness evidence.
- Automatically replay uncertain write-capable work.
- Replace Pi's model loop, session runtime, provider retry, or tool execution.
- Change package defaults, publish, tag, or dispatch a release workflow without separate evidence and explicit approval.

## Assumptions and Unknowns

- The first implementation remains opt-in through an explicit automation contract or mode.
- The existing two-mutating-child limit and no-grandchild rule remain hard boundaries.
- The exact public automation schema, planner model budget, rework bound, and persisted resume selector require provider-compatibility decisions in the owning implementation plans.
- It remains unknown which repository task classes justify automatic planning after coordination overhead is included.
- It remains unknown whether a fresh verifier should always use a different model family or whether distinct context, role, and evidence are sufficient for specific task classes.

## Decisions and Changes

- **2026-08-10 — Prioritize verified completion over broader autonomy:** automatic planning must not precede an executor-owned independent acceptance boundary.
- **2026-08-10 — Exclude observability expansion:** this roadmap changes execution behavior and correctness gates only, except for bounded evidence required by those gates.
- **2026-08-10 — Keep full automation explicit:** no default routing change is proposed before matched representative evaluation.
- **2026-08-10 — Preserve narrow concurrency:** the first automated architecture keeps at most two mutating children and no workflow grandchildren.
- **2026-08-10 — Complete explicit workflow planning:** `subagent_auto`, deterministic compilation, verified mutating topology, bounded graph patches, and the frozen offline protocol complete Phase 2 without changing defaults or making a live-quality claim.
- **2026-08-10 — Complete authoritative verified execution:** explicit verified workflows now require executor-owned exact-tree checks, managed integration acceptance, current independent receipts, and at most one bounded rework cycle without changing omitted workflow behavior.
