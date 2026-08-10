# pi-subagents autonomous workflow planning

## Decision

Automation is a separate `subagent_auto` tool rather than another field in `subagent`.

The existing `subagent` TypeBox schema is 27,782 serialized UTF-8 bytes with 20 top-level fields.
The dedicated automation schema is 2,635 bytes with one top-level `request` field.
The separate tool keeps the established five-mode compatibility schema unchanged, makes opt-in intent discoverable, and gives the planner/compiler lifecycle one cancellation owner.
Both schemas use provider-compatible JSON Schema objects and `StringEnum` values, and focused registration tests preserve strict `additionalProperties: false` for automation.

The rejected alternative was an `automation` field inside `subagent`.
It would have increased the already large schema shown on ordinary delegation turns, complicated exactly-one-mode validation, mixed caller-authored and compiler-authored workflow ownership, and made rollback less independent.
Migration cost for the selected design is additive: existing calls need no change, while automation callers use `subagent_auto({ request })` and can downgrade to caller-authored `subagent.workflow`.

## Baseline characterization

| Boundary | Existing owner | Focused evidence |
| --- | --- | --- |
| Mode validation and preflight | `src/execution.ts` requires exactly one explicit mode, preflights all targets/contracts, and disables nested workflow/panel calls | `test/subagents.test.ts` |
| Capability routing | `src/capability-router.ts` filters manifests, effective tools, verification roles, filesystem class, cost, and latency | `test/capability-router.test.ts` |
| Admission | `src/admission-policy.ts` returns parent-owned, one-child, verified-child, bounded-two-child, or abstention recommendations | `test/admission-policy.test.ts` |
| Execution plans | `src/execution-plan.ts` hashes executor-owned agent, authority, target, workspace, transport, budget, generation, and admission records | `test/execution-plan.test.ts` |
| WorkItems and persistence | `src/work-item-ledger.ts` owns dependency/artifact/generation state; `src/work-item-persistence.ts` atomically publishes bounded mode-0600 snapshots | WorkItem tests |
| Verified completion | `src/verification-policy.ts` and `src/workflow-verification.ts` require one distinct current-tree `structured-v2` receipt | workflow-verification tests |
| Prompt resources | `src/consult-resources.ts` and `src/prompt-resources.ts` disable extensions and gate project resources by effective trust | consultation and prompt-resource tests |

The automation implementation reuses those boundaries rather than adding another execution engine.

## Versioned contracts and limits

- `pi-subagents:automation-request:v1` requires an objective, non-goals, required inputs, acceptance criteria, required evidence, authority ceiling, aggregate budget, and constraints.
- `pi-subagents:workflow-plan:v1` allows 1 through 8 tasks, strict unknown-field rejection, relative path scopes, typed artifacts, dependencies, side effects, capabilities, evidence, integration ownership, verifier links, and per-task budgets.
- `pi-subagents:workflow-plan-patch:v1` allows at most 8 add, replace, dependency, cancel, verification, or downstream-invalidation operations against one current plan identity and workflow generation.
- Text is bounded by UTF-8 bytes, identifiers by a conservative grammar, and terminal controls plus explicit private markers are rejected before persistence or display.
- Planner output cannot contain plan IDs, workflow generations, execution-plan IDs, selected agents, trust, workspace grants, or descendant authority.
- Path ceilings constrain compilation and conflict scheduling rather than the host OS; non-`unspecified` network or secrets guarantees fail closed as unenforceable.
- Aggregate request limits allow at most 8 tasks, 3 revisions, 2 concurrent mutating workers, 1,000 turns, 2,000 tool calls, and the runtime timer ceiling.

The first public automation tool supports `workspaceMode: "shared"` only.
A worktree request fails closed because the blocking workflow executor does not yet create manager-owned task worktrees.

## Planner and compiler boundary

The built-in planner receives only `read`, `grep`, `find`, and `ls`.
Extensions, retained sessions, and workflow descendants are disabled.
Trusted current projects receive bounded project context; untrusted targets receive no inherited project resources and cannot pass compiler trust admission.
Planner work reserves at most 60 seconds and one quarter of the request's aggregate timeout, turns, and tool calls.
Cancellation, session replacement, and shutdown abort the planning subprocess and revalidate ownership after every await.

`WorkflowPlanCompiler` alone owns normalization, admission, scope containment, capability routing, agent selection, aggregate budgets, mutating width, integration ownership, verifier synthesis, executor contracts, task generations, and compilation to `subagent.workflow`.
It may reject or narrow a proposal and may synthesize one verifier only inside the caller's remaining authority, task count, and aggregate budget.
It never adds tools, capabilities, path scope, side-effect class, trust, recursion, or budget beyond the request.

Parent-owned, missing-input, planner-failed, persistence-failed, and compiler-rejected outcomes launch zero execution workers.
A read-only planning turn may already have occurred before these typed non-launch results.

## Revision and recovery boundary

Automation plan persistence atomically stores the compiled plan and WorkItem snapshot in one mode-0600 file.
A patch must match the current plan ID and workflow generation.
Only pending, ready-to-start, needs-input, verification-rework, stale, or invalidated records can change.
Completed work, accepted artifacts, current verification receipts, executor task IDs, and settled non-rework side effects are immutable.
Accepted patches rotate plan identity, workflow generation, and affected task generations, preserve a bounded accepted-history record, invalidate dependency closure, and stop at the request revision limit.
Rejected patches leave the last accepted record unchanged.

## Frozen matched evaluation protocol

`pi-subagents:workflow-planning-benchmark:v1` was frozen before any live-provider run.
It compares these paired arms:

1. strong single agent;
2. one child;
3. caller-authored workflow;
4. fixed two-child workflow;
5. equal-budget best-of-N;
6. automation-compiled workflow.

Every adapter must use identical repository information, model, evaluator, authority ceiling, aggregate token/dollar ceiling, wall-clock ceiling, two-mutating-child maximum, and zero recursion.
The deterministic offline dry run uses three task classes and three paired seeds for nine paired instances.
Focused fixtures pass for direct parent ownership, one child, one verified child, bounded parallel integration, missing input, planner failure, compiler rejection, one rework revision, and terminal revision exhaustion.

The only task classes eligible for a separately authorized live-provider evaluation are bounded repository reconnaissance, a single-package implementation with independent verification, and sparse two-boundary implementation with one integration owner.
No live-provider evaluation was authorized or run.
The offline result proves contract and harness determinism only; it does not establish quality, benefit, or a production default.

## Compatibility and rollback

Existing `subagent` payloads and omitted behavior are unchanged.
Disable blocking delegation to remove both `subagent` and `subagent_auto`, or use caller-authored `subagent.workflow` when exact deterministic task control is required.
Older package versions do not register the new tool and ignore the separate versioned automation records.
No settings migration, publication, package default change, learned router, release, or recursive team behavior is included.
