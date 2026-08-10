# Pi Subagents Verified Execution Loop Plan

## Goal

Make independent verification and managed integration authoritative runtime gates for opt-in mutating workflows.

Allow one bounded rework cycle after verifier rejection while preventing worker self-report, verifier-caused mutation, stale evidence, or uncertain side effects from becoming successful completion.

## Plan Relationship

This plan owns the acceptance-state migration, immutable verification boundary, managed integration wiring, and bounded rework loop.

It continues the implemented WorkItem, capability, and semantic-snapshot baseline recorded in the [delegation-intelligence roadmap](../roadmaps/2026-08-10_pi-subagents-delegation-intelligence-roadmap.md).

The original WorkItem implementation plan is preserved as non-executable provenance under [`docs/plans/superseded/`](superseded/).

The [minimal delegation admission evaluation plan](2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md) remains the sole owner of matched evidence required before a default change.

## Context

`packages/pi-subagents/src/verification-policy.ts` identifies work that requires independent verification, but the workflow caller must explicitly provide the verifier task.

`packages/pi-subagents/src/execution.ts` currently maps any worker-reported structured verification with status `passed` to `verificationAccepted` during ordinary WorkItem completion.

`packages/pi-subagents/src/integration-controller.ts` and `WorkItemLedger.acceptIntegration()` already define generation, repository, dependency, read-set, plan, scope, patch, evidence, fresh-context, and exact-tree checks.

The blocking workflow runtime does not currently call that managed integration boundary.

`createBlockingWorkLedger()` can infer the final workflow task as integration owner, while preflight verification policy checks only the caller's explicit `integrationOwner` field.

The first implementation must remain explicit and opt-in, retain the two-mutating-child and no-grandchild limits, and avoid a new settings surface.

## Architecture

Add one executor-owned `WorkflowCompletionController` that alone can move an opted-in mutating workflow from executed to accepted.

The WorkItem ledger will separate execution progress from acceptance with a versioned `acceptanceState` such as `not-required`, `pending`, `accepted`, `rework-requested`, or `rejected`.

For gated work, worker execution may become complete while acceptance remains pending.

Verifier dependencies may become ready from execution completion, while downstream integration and terminal workflow success require accepted evidence.

Legacy v1 `completed` records will restore with their existing terminal meaning, while new gated records use the explicit acceptance state.

The controller will synthesize or validate one distinct dependent verifier for every task selected by `requiresIndependentVerification()`.

The verifier will receive no mutable repository authority.

Deterministic commands will run under an executor-owned verification harness, and any command that requires a mutable build environment will run in a disposable verification copy rather than the submitted integration state.

The executor will capture the submitted state identity before verification, capture it again afterward, and reject the receipt if tracked or acceptance-relevant state drifts.

A versioned executor-owned verification receipt will bind the verifier decision to the target task ID and generation, accepted `ExecutionPlan` ID, before-and-after repository or exact-tree identity, patch digest, acceptance criteria, required evidence IDs, executed checks, and verifier identity.

Model output may propose evidence, but it cannot author or override executor-owned generation, plan, tree, digest, check result, or verifier identity fields.

The verifier will receive the original objective, acceptance criteria, immutable submitted state, relevant raw artifacts, and executor-owned deterministic check results through a fresh context rather than through the implementer's narrative alone.

`WorkItemLedger.complete()` will record execution output without treating worker self-verification as final acceptance for a gated task.

`WorkItemLedger.acceptIntegration()` and `verifyManagedIntegration()` will atomically move current gated work to accepted only after the independent receipt passes.

Verifier rejection will move the target to `rework-requested`, rotate its task generation, revoke the prior grant, invalidate dependent evidence, and permit one bounded rework turn in the first implementation.

A second rejection, exhausted aggregate budget, stale state, unsupported guarantee, verifier-caused drift, ambiguous side-effect state, or missing current evidence will stop with a typed non-success outcome.

The controller will not implement a general patch-merging engine.

It will use the selected workspace policy and require the integration owner to produce the exact immutable state that the verifier evaluates.

## Non-Goals

- Do not enable automatic objective decomposition or topology selection in this plan.
- Do not add more than one automated rework cycle in the first implementation.
- Do not accept majority vote, confidence, consensus, worker prose, or an exit code as verification.
- Do not allow the verifier to mutate the submitted integration state or supply its own machine-check results.
- Do not replay uncertain mutating work after timeout, crash, cancellation, or ambiguous settlement.
- Do not add inspection, dashboard, status, or telemetry features beyond bounded receipt fields required for execution correctness.
- Do not add a general Git patch application, merge-conflict resolution, or operating-system sandbox layer.
- Do not change existing behavior when the verified-execution contract is omitted.
- Do not publish, tag, release, or change a package default.

## Assumptions

- Structured result v2, task generations, capability grants, WorkItem artifacts, semantic snapshots, and workflow persistence remain available.
- A fresh verifier can run in a distinct child context with the original requirements and an immutable view of the exact target state.
- Executor-owned deterministic checks can use a disposable environment without changing acceptance-relevant state.
- Repository identity is truthful only to the precision supported by the selected target and semantic snapshot.
- The package can distinguish worker evidence from executor-owned verification receipts without breaking legacy result formats.

## Unknowns

- The exact public opt-in field and receipt schema must be finalized against TypeBox provider compatibility before implementation.
- The exact-tree identity for dirty non-Git targets may require an explicit unsupported or needs-revalidation outcome.
- The first supported integration workspace mode must be chosen from shared workspace, disposable worktree, or both after characterization.
- Whether a different model family is required for selected risk classes remains an evaluation question rather than an assumed guarantee.

## Risks

- A verifier with the same evidence and failure mode can repeat the implementer's mistake.
- A verifier with shell or write authority can mutate the state under review and bypass the integration owner.
- Automatically synthesized verifier tasks can increase cost for changes with cheap deterministic verification.
- Incorrect tree or patch identity can reject valid work or accept stale work.
- A rework turn can overwrite a correct result if rejection evidence is weak or stale.
- Wiring integration admission into execution can expose lifecycle races that isolated helper tests do not cover.
- The inferred integration-owner discrepancy can change which legacy workflows require verification if compatibility is not explicitly gated.

## Rollback / Recovery

- Keep verified execution behind an explicit per-call contract and preserve existing explicit workflow behavior by omission.
- Keep the current workflow result projection as the compatibility path while the new controller owns only opted-in acceptance.
- Reject or return needs-revalidation when exact-tree or side-effect state cannot be proved.
- Preserve worker outputs, rejected receipts, and prior task generations as bounded evidence without accepting them as current.
- Disable automated rework independently from independent verification if rework evidence is unsafe or provider behavior is unstable.
- Version the new acceptance state and receipt fields, and preserve a backward reader that gives legacy `completed` records their existing terminal meaning.
- Revert the completion-controller integration without rewriting stored legacy WorkItem records.

## Plan

- [ ] Map current workflow preflight, inferred and explicit integration ownership, `settleWorkItem()`, structured verification parsing, WorkItem completion, persistence, cancellation, timeout, worktree cleanup, and terminal rendering; record characterization tests before behavior changes.
- [ ] Decide the explicit opt-in request field, `pi-subagents:verification-receipt:v1` schema, executor-owned fields, size bounds, status vocabulary, unknown-field policy, before-and-after exact-tree identity, and compatibility behavior; verify the schema with provider-compatible TypeBox tests.
- [ ] Define a versioned WorkItem acceptance state that is separate from execution progress, including legacy-v1 restore mapping, terminal-state rules, verifier-ready dependency rules, accepted downstream dependency rules, and atomic executed, accepted, rework, rejected, stale, interrupted, and failed transitions.
- [ ] Add failing ledger and persistence tests proving a worker's own `passed` verification cannot accept a gated mutating task, a verifier can start from executed work, rejected work can enter one new generation, accepted work remains terminal, and legacy omitted-field records retain their existing meaning.
- [ ] Reconcile inferred integration ownership in `workflow-planning.ts` with preflight verification policy so the final inferred mutating integration owner cannot bypass a distinct verifier in the opt-in mode.
- [ ] Implement verifier synthesis and validation before child allocation, including distinct agent identity, read-only effective authority, no mutable shell or custom tools, dependency on the target task, fresh context, required result contract, accepted scopes, aggregate budget, and zero workflow grandchildren.
- [ ] Implement an executor-owned verification harness that runs declared deterministic checks, isolates mutable build output from the submitted state, captures bounded raw results, and fails closed when a check cannot be run safely.
- [ ] Build the verifier prompt from the original objective, acceptance criteria, current artifacts, immutable integrated state, and executor-owned deterministic evidence without treating upstream summaries as instructions or proof.
- [ ] Implement executor-owned receipt construction and validation, binding task generation, `ExecutionPlan`, before-and-after repository or tree identity, patch digest, required evidence, executed checks, verifier identity, and acceptance status.
- [ ] Wire `verifyManagedIntegration()` and `WorkItemLedger.acceptIntegration()` into the blocking workflow execution path as one atomic acceptance transition, and reject missing, stale, mismatched, out-of-scope, self-issued, drifted, or non-exact-tree receipts before terminal success.
- [ ] Implement one bounded rework cycle that moves executed work to `rework-requested`, rotates the target generation, revokes the prior grant, invalidates dependent evidence, passes only verifier findings and current requirements, and refuses replay when prior side effects are ambiguous.
- [ ] Add end-to-end fixtures for accept, rework then accept, rework then reject, verifier mutation, generated build files, unsafe verification command, deterministic-check failure, stale verifier, cancelled verifier, late worker completion, missing evidence, patch mismatch, scope mismatch, wrong plan, wrong tree, legacy snapshot restore, and budget exhaustion.
- [ ] Add session replacement, shutdown, timeout, partial initialization, repeated cleanup, and every-post-`await` generation tests for the completion controller, verifier child, integration owner, status owner, persistence owner, and disposable workspace.
- [ ] Add a matched deterministic benchmark fixture comparing worker self-report, independent verifier, and deterministic exact-tree verification for false acceptance and added cost without claiming a provider-quality advantage.
- [ ] Update `packages/pi-subagents/README.md`, tool schema guidance, compatibility and downgrade notes, package layout, and an appropriate Changeset for the new opt-in public behavior.
- [ ] Audit the final diff against `docs/extension-conventions.md`, including bounded failures, cancellation, fork-sensitive state, non-TUI behavior, resource disposal, terminal sanitization, persistence ordering, and output limits.
- [ ] Run focused tests for execution, verification policy, integration controller, WorkItem ledger, workflow persistence, and lifecycle behavior; then run `npm test`, `npm run check`, `git diff --check`, `just pack subagents`, and one representative local `pi -e` or `just try subagents` smoke when practical.

## Completion Checklist

- [ ] One executor-owned controller is the only terminal acceptance owner for opt-in verified workflows.
- [ ] Every gated mutating integration has a distinct fresh-context verifier over an immutable view of the exact integrated state.
- [ ] Verifiers have no mutable repository authority, deterministic checks are executor-owned, and before-and-after state drift invalidates the receipt.
- [ ] Execution completion and acceptance are distinct persisted states with backward-compatible legacy restoration and legal verifier and rework transitions.
- [ ] Worker self-verification, confidence, consensus, prose, and exit status cannot independently satisfy acceptance.
- [ ] Every accepted receipt is bound to current task generation, `ExecutionPlan`, before-and-after tree identity, patch digest, evidence, executed checks, and verifier identity.
- [ ] Stale, cancelled, replaced, late, mismatched, out-of-scope, and incomplete evidence produces zero successful acceptance.
- [ ] Automated rework is bounded to one cycle and never blindly replays uncertain mutating work.
- [ ] Existing omitted-field workflows remain compatible, and the opt-in mode has downgrade guidance.
- [ ] Focused tests, lifecycle audit, root CI-equivalent gate, package dry run, and representative runtime smoke pass or any unavailable smoke remains explicitly recorded.
- [ ] Published behavior has an appropriate Changeset, and no publication or release action has occurred.
