# Pi Subagents Verified Execution Loop Plan

## Goal

Make independent verification and managed integration authoritative runtime gates for opt-in mutating workflows.

Allow one bounded rework cycle after verifier rejection while preventing worker self-report, stale evidence, or uncertain side effects from becoming successful completion.

## Context

`packages/pi-subagents/src/verification-policy.ts` identifies work that requires independent verification, but the workflow caller must explicitly provide the verifier task.

`packages/pi-subagents/src/execution.ts` currently maps any worker-reported structured verification with status `passed` to `verificationAccepted` during ordinary WorkItem completion.

`packages/pi-subagents/src/integration-controller.ts` and `WorkItemLedger.acceptIntegration()` already define generation, repository, dependency, read-set, plan, scope, patch, evidence, fresh-context, and exact-tree checks.

The blocking workflow runtime does not currently call that managed integration boundary.

`createBlockingWorkLedger()` can infer the final workflow task as integration owner, while preflight verification policy checks only the caller's explicit `integrationOwner` field.

The first implementation must remain explicit and opt-in, retain the two-mutating-child and no-grandchild limits, and avoid a new settings surface.

## Architecture

Add one executor-owned `WorkflowCompletionController` that alone can move an opted-in mutating workflow from executed to accepted.

The controller will synthesize or validate one distinct dependent verifier for every task selected by `requiresIndependentVerification()`.

A versioned executor-owned verification receipt will bind the verifier decision to the target task ID and generation, accepted `ExecutionPlan` ID, repository or exact-tree identity, patch digest, acceptance criteria, required evidence IDs, executed checks, and verifier identity.

Model output may propose evidence, but it cannot author or override executor-owned generation, plan, tree, digest, or verifier identity fields.

The verifier will receive the original objective, acceptance criteria, exact integrated state, relevant raw artifacts, and deterministic check results through a fresh context rather than through the implementer's narrative alone.

`WorkItemLedger.complete()` will record execution output without treating worker self-verification as final acceptance for a gated task.

`WorkItemLedger.acceptIntegration()` and `verifyManagedIntegration()` will become the authoritative acceptance path for an integration owner.

Verifier rejection may create one new task generation and one bounded rework turn in the first implementation.

A second rejection, exhausted aggregate budget, stale state, unsupported guarantee, ambiguous side-effect state, or missing current evidence will stop with a typed non-success outcome.

The controller will not implement a general patch-merging engine.

It will use the selected workspace policy and require the integration owner to produce the exact state that the verifier evaluates.

## Non-Goals

- Do not enable automatic objective decomposition or topology selection in this plan.
- Do not add more than one automated rework cycle in the first implementation.
- Do not accept majority vote, confidence, consensus, worker prose, or an exit code as verification.
- Do not replay uncertain mutating work after timeout, crash, cancellation, or ambiguous settlement.
- Do not add inspection, dashboard, status, or telemetry features beyond bounded receipt fields required for execution correctness.
- Do not add a general Git patch application, merge-conflict resolution, or operating-system sandbox layer.
- Do not change existing behavior when the verified-execution contract is omitted.
- Do not publish, tag, release, or change a package default.

## Assumptions

- Structured result v2, task generations, capability grants, WorkItem artifacts, semantic snapshots, and workflow persistence remain available.
- A fresh verifier can run in a distinct child context with the original requirements and exact target workspace.
- Repository identity is truthful only to the precision supported by the selected target and semantic snapshot.
- The package can distinguish worker evidence from executor-owned verification receipts without breaking legacy result formats.

## Unknowns

- The exact public opt-in field and receipt schema must be finalized against TypeBox provider compatibility before implementation.
- The exact-tree identity for dirty non-Git targets may require an explicit unsupported or needs-revalidation outcome.
- The first supported integration workspace mode must be chosen from shared workspace, disposable worktree, or both after characterization.
- Whether a different model family is required for selected risk classes remains an evaluation question rather than an assumed guarantee.

## Risks

- A verifier with the same evidence and failure mode can repeat the implementer's mistake.
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
- Revert the completion-controller integration without changing stored legacy WorkItem records by versioning new receipt fields.

## Plan

- [ ] Map current workflow preflight, inferred and explicit integration ownership, `settleWorkItem()`, structured verification parsing, WorkItem completion, persistence, cancellation, timeout, worktree cleanup, and terminal rendering; record characterization tests before behavior changes.
- [ ] Decide the explicit opt-in request field, `pi-subagents:verification-receipt:v1` schema, executor-owned fields, size bounds, status vocabulary, unknown-field policy, exact-tree identity, and compatibility behavior; verify the schema with provider-compatible TypeBox tests.
- [ ] Define one completion state machine covering executed, awaiting integration, awaiting verification, accepted, rework requested, rejected, stale, interrupted, and failed; prove one owner controls terminal acceptance and every transition has a bounded cause.
- [ ] Add failing tests proving a worker's own `passed` verification cannot accept a gated mutating task, while legacy omitted-field behavior remains unchanged.
- [ ] Reconcile inferred integration ownership in `workflow-planning.ts` with preflight verification policy so the final inferred mutating integration owner cannot bypass a distinct verifier in the opt-in mode.
- [ ] Implement verifier synthesis and validation before child allocation, including distinct agent identity, dependency on the target task, fresh context, required result contract, accepted scopes, aggregate budget, and zero workflow grandchildren.
- [ ] Build the verifier prompt from the original objective, acceptance criteria, current artifacts, exact integrated state, and deterministic evidence without treating upstream summaries as instructions or proof.
- [ ] Implement executor-owned receipt construction and validation, binding task generation, `ExecutionPlan`, repository or tree identity, patch digest, required evidence, executed checks, verifier identity, and acceptance status.
- [ ] Wire `verifyManagedIntegration()` and `WorkItemLedger.acceptIntegration()` into the blocking workflow execution path, and reject missing, stale, mismatched, out-of-scope, self-issued, or non-exact-tree receipts before terminal success.
- [ ] Implement one bounded rework cycle that rotates the target generation, revokes the prior grant, invalidates dependent evidence, passes only verifier findings and current requirements, and refuses replay when prior side effects are ambiguous.
- [ ] Add end-to-end fixtures for accept, rework then accept, rework then reject, deterministic-check failure, stale verifier, cancelled verifier, late worker completion, missing evidence, patch mismatch, scope mismatch, wrong plan, wrong tree, and budget exhaustion.
- [ ] Add session replacement, shutdown, timeout, partial initialization, repeated cleanup, and every-post-`await` generation tests for the completion controller, verifier child, integration owner, status owner, persistence owner, and disposable workspace.
- [ ] Add a matched deterministic benchmark fixture comparing worker self-report, independent verifier, and deterministic exact-tree verification for false acceptance and added cost without claiming a provider-quality advantage.
- [ ] Update `packages/pi-subagents/README.md`, tool schema guidance, compatibility and downgrade notes, package layout, and an appropriate Changeset for the new opt-in public behavior.
- [ ] Audit the final diff against `docs/extension-conventions.md`, including bounded failures, cancellation, fork-sensitive state, non-TUI behavior, resource disposal, terminal sanitization, persistence ordering, and output limits.
- [ ] Run focused tests for execution, verification policy, integration controller, WorkItem ledger, workflow persistence, and lifecycle behavior; then run `npm test`, `npm run check`, `git diff --check`, `just pack subagents`, and one representative local `pi -e` or `just try subagents` smoke when practical.

## Completion Checklist

- [ ] One executor-owned controller is the only terminal acceptance owner for opt-in verified workflows.
- [ ] Every gated mutating integration has a distinct fresh-context verifier on the exact integrated state.
- [ ] Worker self-verification, confidence, consensus, prose, and exit status cannot independently satisfy acceptance.
- [ ] Every accepted receipt is bound to current task generation, `ExecutionPlan`, tree identity, patch digest, evidence, and verifier identity.
- [ ] Stale, cancelled, replaced, late, mismatched, out-of-scope, and incomplete evidence produces zero successful acceptance.
- [ ] Automated rework is bounded to one cycle and never blindly replays uncertain mutating work.
- [ ] Existing omitted-field workflows remain compatible, and the opt-in mode has downgrade guidance.
- [ ] Focused tests, lifecycle audit, root CI-equivalent gate, package dry run, and representative runtime smoke pass or any unavailable smoke remains explicitly recorded.
- [ ] Published behavior has an appropriate Changeset, and no publication or release action has occurred.
