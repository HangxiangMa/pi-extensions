# Pi Subagents Typed Abstention and Capability Enforcement Plan

## Goal

Turn audited capability and authority findings into an explicit opt-in enforcement and recovery protocol that can acknowledge suitable work, reject unsuitable work before side effects, request missing inputs, abstain safely, and avoid blind retries.

Preserve audit-only behavior for legacy and uncontracted calls unless a separate compatibility decision changes the default.

## Context

The capability-manifest phase provides explicit requirements, declared agent capabilities, an enforceability matrix, and one immutable `ExecutionPlan`.

Current lifecycle and result contracts do not distinguish missing context, capability mismatch, unsupported policy, unavailable verification, ambiguous delegation, stale input, or ordinary execution failure.

The research notes report strong recovery for transient tool faults but weak or absent recovery for ambiguous delegation, context pollution, conflicting outputs, and premature action.

A useful enforcement system must therefore classify inability and choose failure-specific recovery rather than map every outcome to failed or retry.

## Architecture

A preflight acknowledgement will evaluate the ExecutionPlan before confirmation, worktree creation, child allocation, or provider work.

The acknowledgement will be either accepted or rejected and will include bounded reason codes, missing requirements, unsupported guarantees, and allowed recovery actions.

Contracted runtime results will use one typed outcome vocabulary including completed, partial, blocked, needs-input, abstained, failed, interrupted, stale, and contract-invalid.

A bounded reason-code registry will distinguish capability, authority, dependency, ambiguity, verification, policy, transport, timeout, cancellation, semantic, and stale-state classes.

Enforcement will apply only to controls proven enforceable through the active transport and runtime.

An explicit request for an unsupported filesystem, network, secret, credential, or process guarantee will fail closed instead of degrading to prompt guidance.

A deterministic recovery policy will map classified outcomes to retry, clarify, supply-input, reroute, replan, revalidate, fallback, or stop.

No policy action will replay accepted or uncertain write-capable work automatically.

## Non-Goals

- Do not enable enforcement for legacy free-text calls by default.
- Do not claim OS sandboxing or enforce advisory path and network policy through prompts.
- Do not let an agent self-grant missing capabilities, tools, trust, secrets, or workspace access.
- Do not add a WorkItem dependency graph or adaptive scheduler in this phase.
- Do not automatically choose a new worker through a hidden model call.
- Do not treat self-reported completed status as independent verification.

## Assumptions

- Handoff contract v2 and audit-only ExecutionPlan are implemented and stable.
- The caller can explicitly request enforcement through a provider-compatible field or contracted mode.
- The package can reject unsupported guarantees before launch even when it cannot enforce the guarantee itself.
- Recovery actions can be represented as recommendations before later WorkItem automation consumes them.

## Risks

- Enforcement can reject useful work because manifests or task requirements are incomplete.
- Too many outcome or reason codes can create inconsistent caller handling.
- A model can return an invalid abstention payload or falsely claim missing capability.
- Recovery can duplicate side effects if acceptance and settlement boundaries are confused.
- Settings or per-call precedence can make enforcement state unclear.
- Prompt-only scope can be mistaken for enforcement if advisory controls appear beside real controls.

## Rollback / Recovery

- Keep audit-only as the compatibility default and require explicit enforcement for contracted calls.
- Preserve raw bounded output and existing failed/interrupted states for legacy callers.
- Fail enforcement closed before side effects when the requested guarantee is unsupported or ambiguous.
- Disable automated recovery actions independently while retaining typed outcome reporting.
- Keep current timeout finalization and explicit-abort behavior authoritative, and preserve deterministic timeout checkpoints when that separately planned capability is present at execution time.

## Plan

- [ ] Characterize current preflight, confirmation, worktree creation, registry spawn, transport startup, prompt acceptance, settlement, timeout, abort, completion, and retry boundaries; verify focused tests pass before enforcement changes.
- [ ] Define the versioned acknowledgement, typed outcome, reason-code, and recovery-action schemas with one owner and bounded forward-compatible parsing; verify every code has a distinct caller action or diagnostic purpose.
- [ ] Decide the provider-compatible enforcement request and precedence rules for blocking tasks, chain steps, aggregators, detached spawn, and follow-up turns; preserve audit-only omitted behavior and document any setting interaction.
- [ ] Add failing preflight tests for accepted work, unknown manifest, missing capability, unsupported guarantee, unavailable result contract, trust denial, resource denial, transport mismatch, insufficient workspace isolation, and malformed enforcement request.
- [ ] Implement acknowledgement before project-agent confirmation, worktree creation, registry insertion, child process or session allocation, and provider work; verify rejected plans produce zero side effects and stable bounded details.
- [ ] Add failing cross-transport tests for enforceable tool, cwd, trust, resource, workspace, model, result-contract, concurrency, and budget policy; verify subprocess, in-process, RPC, and automatic transport cannot widen the accepted plan.
- [ ] Implement enforcement for proven controls and fail closed for requested unsupported filesystem, network, secret, credential, approval, sandbox, or provider-header guarantees.
- [ ] Extend result parsing, registry state, completion metadata, inspection, rendering, and persistence with typed outcomes and reason codes while preserving legacy lifecycle projections.
- [ ] Add constrained agent instructions for acknowledgement, missing-input requests, limitations, and abstention without allowing model output to override executor-owned policy or preflight facts.
- [ ] Add malformed, contradictory, oversized, private, and unrecognized abstention tests; verify invalid self-reported outcomes become contract-invalid or ordinary partial output rather than trusted policy decisions.
- [ ] Define and implement a deterministic recovery classifier that retries only bounded transient pre-acceptance transport or tool failures, recommends clarification for ambiguity, supplies exact missing dependencies, reroutes capability mismatch, revalidates stale state, and stops unsupported guarantees.
- [ ] Add tests proving ambiguous acceptance, successful prompt acceptance, write-capable partial side effects, available timeout checkpoint or finalization evidence, and stale evidence never trigger automatic replay.
- [ ] Add parent-facing recovery metadata and guidance to completion delivery and inspection without automatically launching a replacement agent in this phase.
- [ ] Add an offline failure-injection suite for transient transport, tool, ambiguous delegation, missing context, capability mismatch, conflicting result, invalid contract, premature action, timeout, and stale input; record recovery accuracy and false-retry count.
- [ ] Update README, tool descriptions, status/help, compatibility and downgrade notes, enforceability matrix, package layout, and a minor Changeset with exact audit-versus-enforce behavior.
- [ ] Audit settings ordering if any setting is added, project trust, cancellation, stale session generation, partial initialization, settlement, timeout finalization, completion batching, redaction, and repeated cleanup against both extension guides.
- [ ] Run focused tests, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; run one representative local Pi smoke for accept, reject, abstain, and stop behavior when practical.

## Completion Checklist

- [ ] Every enforced launch receives a typed preflight acknowledgement before side effects.
- [ ] Legacy and uncontracted calls preserve audit-only behavior unless an explicitly approved compatibility change says otherwise.
- [ ] Enforced, advisory, unsupported, and unknown controls are distinct and truthfully documented.
- [ ] Typed inability carries enough information for clarification, rerouting, fallback, revalidation, or stop.
- [ ] No accepted, ambiguously accepted, or potentially side-effecting turn is automatically replayed.
- [ ] Failure-injection evidence distinguishes transient recovery from semantic and stale-state containment.
- [ ] All transports enforce the same accepted ExecutionPlan without silent widening or fallback.
- [ ] Required checks, lifecycle and settings audits, compatibility evidence, and Changeset pass without publication.
