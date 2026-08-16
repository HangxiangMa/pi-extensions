# Pi Subagents Autonomous Workflow Planning Plan

## Goal

Add an explicit opt-in mode that accepts one high-level objective and compiles it into the smallest justified, capability-matched, bounded workflow without requiring the caller to author every task and dependency.

Support versioned revisions to pending, rework-requested, or invalidated work while preserving accepted history and the verified-execution boundary.

## Plan Relationship

This plan owns only the explicit automation request, read-only planning turn, deterministic plan compiler, topology minimization, and graph-patch contract.

It depends on the verified execution loop merged in [PR #678](https://github.com/narumiruna/pi-extensions/pull/678) for acceptance and rework semantics.

It consumes the implemented capability, contract, `ExecutionPlan`, WorkItem, and workflow baselines tracked by the existing Pi Subagents plans in `docs/plans/` without reopening their original checklists.

The [minimal delegation admission evaluation plan](2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md) remains the sole owner of matched evidence required before a default change.

## Context

`executeSubagent()` currently requires exactly one caller-selected single, parallel, chain, workflow, or panel mode.

`evaluateDelegationAdmission()` can recommend parent-owned direct work, one child, one child plus verification, bounded two-child work, or abstention, but it consumes explicit metadata and normally remains audit-only.

`workflow.honorAdmission` can decline caller-authored tasks but cannot create tasks, choose a topology, add a verifier, or widen a workflow.

`routeByCapability()` can select an eligible agent after the caller declares capabilities, tools, verification role, side-effect class, and cost or latency hints.

The verified-execution loop from the preceding plan is a required dependency because broader autonomous planning must not rely on worker self-report for completion.

No matched repository evidence currently justifies a production default, learned router, wider mutating team, or recursive workflow.

## Architecture

Add one explicit automation request containing an objective, non-goals, required inputs, acceptance criteria, required evidence, authority ceiling, aggregate budget, and optional caller constraints.

A read-only planning turn will return a bounded `pi-subagents:workflow-plan:v1` proposal rather than execute repository mutations.

The proposal will contain typed tasks, dependencies, artifacts, side-effect policy, read and write scopes, ownership keys, capability requirements, acceptance criteria, integration ownership, verifier relationships, and per-task budget requests.

A deterministic `WorkflowPlanCompiler` will normalize the proposal, reject malformed or unsafe graphs, evaluate admission, minimize topology, route agents, create immutable `ExecutionPlan` records, and produce the existing explicit workflow representation.

The compiler, not the planner model, will enforce hard limits, trust, capability grants, result contracts, workspace policy, task generations, two-mutating-child width, and no-grandchild recursion.

The planner may propose one of direct, sequential, sparse parallel, implementation plus verification, or bounded two-child plus integration structures.

The admission owner may reduce or reject the proposed topology but may not silently widen authority, mutating width, recursion, or aggregate budget.

When admission returns parent-owned direct work or insufficient evidence, the automation call will return a typed non-launch result so the parent can continue directly or request missing information.

A bounded `pi-subagents:workflow-plan-patch:v1` format will support adding a task, replacing an unstarted task, adding a dependency, cancelling pending work, requesting verification, or invalidating downstream work.

Plan patches will include the workflow generation and may modify only pending, needs-input, rework-requested, stale, or invalidated nodes.

Accepted tasks, accepted artifacts, current verification receipts, and executor-owned identities remain immutable.

The first implementation will not learn from historical runs or use a learned router.

## Non-Goals

- Do not make automation the default or intercept every user prompt.
- Do not permit more than two concurrent mutating children or any workflow grandchildren.
- Do not add unrestricted debate, free-form multi-agent chat, or unbounded graph revision.
- Do not let planner output grant tools, trust, filesystem, network, secret, credential, sandbox, model, or budget authority.
- Do not infer successful verification from planner or worker prose.
- Do not add a learned router, reinforcement-learning policy, reward model, or permanent skill library in the first implementation.
- Do not expand inspection, status, dashboards, or telemetry beyond runtime fields required to compile and execute the plan safely.
- Do not change existing execution modes when the automation request is omitted.
- Do not publish, tag, release, or change package defaults.

## Assumptions

- The verified-execution loop is implemented and stable before mutating automatic plans are admitted.
- Existing delegation contract v2, capability manifests, `ExecutionPlan`, WorkItem ledger, semantic snapshots, and workflow executor remain the compilation targets.
- One read-only planning turn can access enough bounded repository context to propose a useful graph without mutating canonical state.
- The parent agent can handle a typed parent-owned or needs-input result after the automation tool returns.
- Existing provider schemas can carry a bounded automation request and plan result after compatibility tests.

## Resolved Decisions and Accepted Unknowns

- Automation uses a separate `subagent_auto` tool because its 2,635-byte one-field schema avoids expanding the existing 27,782-byte, 20-field compatibility schema.
- The planner uses trust-aware project context, only `read`, `grep`, `find`, and `ls`, at most 60 seconds, 8 turns, 16 tool calls, and an eight-task graph.
- Deterministic fixtures verify the proposal-to-admission mapping for parent-owned, one-child, sequential, verified-child, and bounded-parallel shapes.
- Only bounded reconnaissance, verified single-package changes, and sparse two-boundary changes are eligible for a separately authorized live evaluation.
- Model-family benefit remains intentionally unmeasured because no live-provider evaluation was authorized, and this release makes no quality or default claim.

## Risks

- A planning model can invent dependencies, capabilities, scopes, or acceptance criteria that appear valid but omit important work.
- A plan compiler can become a second wide orchestration interface instead of concentrating policy.
- Planner overhead can exceed the cost of direct work on small tasks.
- Automatic decomposition can create tightly coupled tasks whose handoffs lose necessary context.
- Graph patches can invalidate correct work or create loops if generation and ownership checks are incomplete.
- A benchmark can mistake extra model calls or aggregate budget for planning quality.
- A large public schema can reduce provider compatibility or make ordinary model tool use less reliable.

## Rollback / Recovery

- Keep automation behind one explicit request and compile to the existing workflow executor rather than adding a second execution engine.
- Preserve the caller-authored explicit workflow as the documented fallback and downgrade path.
- Return parent-owned direct work or abstention without launching children when the planner or compiler cannot establish benefit or safety.
- Reject unknown plan versions and unsafe graph patches before confirmation, workspace creation, child allocation, or provider work.
- Preserve the last accepted plan and WorkItem generation when a patch is rejected.
- Disable planner-driven revisions independently from initial plan compilation if patch quality is insufficient.
- Remove the automation schema without migrating legacy workflow records because all new fields are versioned and opt-in.

## Plan

- [x] Characterize existing schema, compatibility, routing, admission, workflow, execution-plan, WorkItem, verification, and prompt-resource boundaries; evidence is recorded in `docs/implementation-notes/pi-subagents-autonomous-workflow-planning.md` and focused baseline tests.
- [x] Select a separate `subagent_auto` tool after measuring 27,782 bytes for `subagent` versus 2,635 bytes for the dedicated schema; the rejected in-schema mode and downgrade consequences are documented.
- [x] Define strict bounded `pi-subagents:automation-request:v1`, `workflow-plan:v1`, and `workflow-plan-patch:v1` contracts in `src/automation-contract.ts`.
- [x] Add red-first parser coverage for malformed JSON, versions, identities, cycles, graph/text/path limits, ownership, guarantees, forgery, terminal controls, and private markers in `test/automation-contract.test.ts`.
- [x] Enforce a read-only, bounded, trust-aware, cancellable, non-recursive planner policy in `src/automation-planner.ts` and `src/automation.ts`.
- [x] Implement the exact-JSON planner prompt without hidden-reasoning requests and cover every required task field in planner tests.
- [x] Implement `WorkflowPlanCompiler` as the deterministic owner of graph validation, admission, routing, authority/budget limits, workspace support, generations, verification, and existing-workflow compilation.
- [x] Cover parent-owned, one-child, verified, sequential, bounded parallel, dense, missing verification, unsupported capability, insufficient budget, scope/integration conflicts, and recursion in compiler tests.
- [x] Prove compiler narrowing and rejection cannot widen tools, capabilities, path scope, side effects, aggregate budget, trust, mutating width, or recursion.
- [x] Synthesize one distinct verifier inside the remaining ceiling and require one authoritative integration path for every admitted mutating plan.
- [x] Implement current-generation graph patches, dependency closure, artifact invalidation, identity/generation rotation, revision limits, patched ledgers, and atomic combined plan/ledger persistence.
- [x] Cover completed-work, artifact, verifier, cancellation, authority, budget, cycle, replay, stale identity, and revision-exhaustion patch failures.
- [x] Add deterministic end-to-end fixtures for parent-owned, one child, verified child, bounded parallel, missing input, planner failure, compiler rejection, rework revision, and terminal exhaustion.
- [x] Freeze `pi-subagents:workflow-planning-benchmark:v1` with strong-single, one-child, caller-workflow, fixed-two-child, equal-budget best-of-N, and automation arms under matched information and resources.
- [x] Run the offline dry run and fixtures; only bounded reconnaissance, verified single-package changes, and sparse two-boundary changes remain eligible for separately authorized live evaluation.
- [x] Update the package README, capability/runtime notes, compatibility and downgrade guidance, package layout, and `.changeset/calm-autonomous-subagents.md`.
- [x] Audit cancellation, post-await ownership, replacement, shutdown, planner disposal, persistence ordering, trust, prompt resources, output bounds, terminal safety, invalid-state quarantine, and repeated cleanup against both extension guides; no settings schema changed.
- [x] Run 386 package tests, `npm test` with 2,934 tests, `npm run check`, `git diff --check`, and `just pack subagents`; deterministic explicit-automation smokes passed, while a live-provider smoke was intentionally not run because no live evaluation was authorized and model tool choice is not deterministic.

## Completion Checklist

- [x] One high-level request compiles to the smallest justified existing topology without caller-authored tasks.
- [x] Planner execution is read-only, bounded, trust-aware, cancellable, and unable to grant authority or descendants.
- [x] Compilation rejects malformed or unsafe plans before execution side effects and never silently widens authority, budget, width, or recursion.
- [x] Parent-owned and insufficient-evidence decisions start zero execution workers.
- [x] Every admitted mutating plan uses the verified-execution acceptance boundary.
- [x] Patches modify only eligible current-generation work and preserve accepted history, artifacts, and verification receipts.
- [x] Mutating width remains at most two and workflow grandchildren are rejected before planning.
- [x] Existing modes remain compatible with documented explicit-workflow fallback and downgrade guidance.
- [x] The matched protocol was frozen before live results, and no unsupported default-quality claim is made.
- [x] Focused tests, semantic audits, root CI gate, package dry run, and deterministic runtime fixtures pass; the intentionally unrun live-provider path is recorded.
- [x] Published behavior has a minor Changeset, and no publication, tag, release, or workflow dispatch occurred.
