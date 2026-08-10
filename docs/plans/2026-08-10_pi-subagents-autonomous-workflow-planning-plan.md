# Pi Subagents Autonomous Workflow Planning Plan

## Goal

Add an explicit opt-in mode that accepts one high-level objective and compiles it into the smallest justified, capability-matched, bounded workflow without requiring the caller to author every task and dependency.

Support versioned revisions to pending or invalidated work while preserving completed history and the verified-execution boundary.

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

Plan patches will include the workflow generation and may modify only pending, needs-input, stale, or invalidated nodes.

Completed tasks, accepted artifacts, current verification receipts, and executor-owned identities remain immutable.

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

## Unknowns

- Whether automation should be a new `subagent` mode or a separately named tool requires a schema-size, discoverability, and provider-compatibility decision.
- The exact planner context policy and maximum graph size require measured token and latency baselines.
- The best deterministic mapping from proposal metadata to admission inputs remains unverified by representative repository tasks.
- The initial task classes eligible for automatic planning must be selected before live evaluation rather than after observing favorable results.
- The benefit of different model families for planner, implementer, and verifier remains unknown.

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

- [ ] Characterize existing tool schema size, provider compatibility, mode validation, capability routing, admission decisions, workflow preflight, `ExecutionPlan` construction, WorkItem creation, verified completion, and prompt-resource boundaries; record focused baseline tests.
- [ ] Decide whether automation is a new `subagent` mode or a separate tool by comparing schema size, provider compatibility, prompt burden, lifecycle ownership, backwards compatibility, and discoverability; record the rejected alternative and migration consequences.
- [ ] Define bounded `pi-subagents:automation-request:v1`, `workflow-plan:v1`, and `workflow-plan-patch:v1` schemas with exact limits, unknown-field policy, executor-owned fields, provenance, generation, authority ceiling, aggregate budget, acceptance criteria, and result outcomes.
- [ ] Add failing parser tests for malformed JSON, unsupported version, duplicate or missing IDs, cycles, excessive graph size, oversized text, invalid paths, conflicting ownership, unsupported guarantees, forged generation, forged authority, terminal controls, and private data.
- [ ] Define planner resource and tool policy as read-only, bounded, trust-aware, cancellation-aware, and incapable of delegating grandchildren or mutating the repository.
- [ ] Implement a planner prompt that requests tasks, dependencies, artifacts, scopes, side effects, capabilities, acceptance criteria, risks, integration ownership, verifier needs, and budgets without asking for hidden reasoning.
- [ ] Implement `WorkflowPlanCompiler` as the single deterministic owner of normalization, graph validation, admission, topology minimization, capability routing, authority enforcement, workspace selection, task generations, hard limits, and compilation to the existing workflow shape.
- [ ] Add compiler tests for parent-owned direct work, one child, one child plus verifier, sequential dependency, two safe mutating children, dense coupling, missing verification, unsupported capability, insufficient budget, scope conflict, no integration owner, and attempted grandchildren.
- [ ] Ensure the compiler may narrow or reject a model proposal but cannot silently add authority, exceed aggregate budget, raise mutating width, or relax verification and trust requirements.
- [ ] Integrate verified-execution synthesis so every compiled risk-selected mutating plan contains one distinct verifier and one authoritative integration path before any mutating child starts.
- [ ] Implement graph patch validation and application for pending or invalidated nodes only, with current workflow generation, dependency closure, artifact invalidation, plan identity rotation, bounded revision count, and atomic persistence.
- [ ] Add tests proving plan patches cannot rewrite completed work, forge artifacts, remove required verification, revive cancelled generations, widen authority, exceed budget, create cycles, or trigger side-effect replay.
- [ ] Add end-to-end deterministic fixtures for objective to direct result, objective to one child, objective to verified child, objective to bounded parallel workflow, missing-input abstention, planner failure, compiler rejection, one revision after failed assumption, and terminal stop after revision exhaustion.
- [ ] Define a frozen matched evaluation protocol against strong single-agent, one-child, caller-authored workflow, fixed two-child, and equal-budget best-of-N arms with identical model information, tools, evaluator, aggregate token or dollar ceiling, wall-clock ceiling, and repeated paired tasks.
- [ ] Run the offline protocol and deterministic fixtures, then record which task classes remain eligible for a separately authorized live-provider evaluation without making a production-quality claim.
- [ ] Update `packages/pi-subagents/README.md`, tool documentation, compatibility and downgrade guidance, package layout, and an appropriate Changeset for the new explicit automation surface.
- [ ] Audit cancellation, every post-`await` generation check, session replacement, shutdown, planner disposal, persistence ordering, project trust, prompt resources, output bounds, terminal sanitization, invalid-file protection if configuration changes, and repeated cleanup against `docs/extension-conventions.md` and `docs/extension-settings.md` when applicable.
- [ ] Run focused parser, planner, compiler, routing, admission, workflow, verification, persistence, and lifecycle tests; then run `npm test`, `npm run check`, `git diff --check`, `just pack subagents`, and representative local explicit-automation smokes when practical.

## Completion Checklist

- [ ] One high-level automation request can compile to the smallest justified existing workflow topology without caller-authored tasks.
- [ ] Planner execution is read-only, bounded, trust-aware, cancellable, and unable to grant itself authority or descendants.
- [ ] Deterministic compilation rejects unsafe or malformed plans before side effects and never silently widens authority, budget, width, or recursion.
- [ ] Parent-owned and insufficient-evidence decisions start zero children.
- [ ] Every admitted mutating plan uses the verified-execution acceptance boundary.
- [ ] Plan patches modify only eligible current-generation work and preserve completed history, accepted artifacts, and verification receipts.
- [ ] Mutating width remains at most two and workflow grandchildren remain rejected.
- [ ] Existing omitted-field modes remain compatible with a documented fallback and downgrade path.
- [ ] Matched evaluation protocol is frozen before live results, and no unsupported default-quality claim is made.
- [ ] Focused tests, semantic audits, root CI-equivalent gate, package dry run, and representative runtime smokes pass or unavailable paths are explicitly recorded.
- [ ] Published behavior has an appropriate Changeset, and no publication or release action has occurred.
