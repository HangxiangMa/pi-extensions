# Pi Subagents Capability Manifest and Audit-Only ExecutionPlan Plan

## Goal

Add versioned agent capability manifests and one deterministic transport-neutral `ExecutionPlan` that audits task fit, requested authority, effective policy, overgrant, mismatch, and unsupported guarantees without changing established launch behavior.

Establish package-specific capability and permission-precision baselines before enforcement is considered.

## Post-hoc Amendment

This section and every checklist item labelled **Post-hoc addition** were added after the initial plan in commit `07df6d8b`.

**Reason:** The later evidence audit and roadmap review found that capability fit alone does not answer whether delegation is worthwhile, and that every plan and future grant must be tied to the task generation that produced it.

Admission remains audit-only in this phase because the reviewed literature does not justify automatic routing or rejection from an unvalidated predictor.

## Context

`AgentConfig` currently describes agent name, description, tools, model, thinking level, timeout, prompt, source, and file path.

Automatic transport selection currently routes custom tools to subprocess, write-capable built-ins to RPC, and read-only built-ins to in-process execution.

That transport decision does not determine whether an agent can satisfy the task's declared objective, evidence, modality, verification, or authority requirements.

The research notes show that keyword routing can fail adversarial intent cases and that subagent managers frequently overgrant workspace access.

This phase must observe fit and overgrant without rejecting legacy definitions or introducing an additional model call.

## Architecture

A versioned optional capability manifest will extend built-in definitions and custom-agent frontmatter with capabilities, modalities, supported result contracts, authority needs, verification roles, and declared constraints.

Absent manifests will mean `unknown`, not unrestricted or incapable.

A new package-owned `ExecutionPlan` will normalize the delegation contract, selected agent definition, tool policy, cwd and trust audit, workspace mode, transport selection, model and thinking selection, budgets, resource policy, and enforceability matrix.

The first matcher will be deterministic and use explicit v2 contract requirements plus manifest identifiers.

It will not infer intent from keywords, call another LLM, or override the caller-selected agent.

The plan will distinguish requested, declared, available, effective, overgranted, missing, and unsupported capabilities.

**Post-hoc addition:** The plan will also record the immutable task generation, a bounded benefit hypothesis, and an audit-only admission recommendation of parent-owned direct work, one child, one child plus independent verification, bounded multi-child work, or insufficient evidence.

**Reason:** The roadmap promised to decide when delegation is justified, while the original `ExecutionPlan` only audited which selected agent and transport could perform an already delegated task.

Each transport will consume the same plan projection or prove parity with it rather than independently re-deriving policy.

Audit findings will appear in bounded tool details, retained inspection, diagnostics, and optional local benchmark output without exposing prompts or private context.

## Non-Goals

- Do not reject a launch because of capability mismatch in this phase.
- Do not auto-select another agent, model, transport, workspace, or tool set.
- **Post-hoc addition:** Do not let the admission recommendation launch, reject, or reroute work before Gate 4A produces paired evidence and a separate approval.
- Do not add task-string keyword heuristics or a classifier model request.
- Do not claim path, network, secret, credential, or process sandboxing.
- Do not add a WorkItem graph, adaptive scheduler, automatic retry, or independent verifier workflow.
- Do not make project-agent metadata available before existing trust and scope checks.

## Assumptions

- Handoff contract v2 is available as the authoritative source of explicit task requirements.
- Legacy free-text tasks can produce an incomplete audit but cannot prove a capability mismatch.
- Built-in manifests can be defined by package source, while custom manifests remain optional frontmatter.
- A capability identifier names a stable behavior or evidence role rather than a cosmetic persona.

## Risks

- Capability taxonomies can become large, subjective, or provider-specific.
- Unknown manifests can be mistaken for a pass if audit output is not explicit.
- Agent descriptions and capability identifiers can drift apart.
- Transport implementations can silently widen policy if they continue re-resolving tools or resources after planning.
- Audit metadata can leak sensitive paths or reveal project-authored prompt structure.
- Permission precision can be misleading unless requested scope and actual usage are measured consistently.

## Rollback / Recovery

- Keep all manifest fields optional and preserve existing frontmatter behavior when absent.
- Keep the caller-selected agent and current launch policy authoritative during audit-only operation.
- Make `ExecutionPlan` details additive and safe for older persisted records to ignore.
- Keep transport-specific policy code until parity tests prove the shared plan can replace duplicated derivation.
- Revert catalog and inspection additions independently if metadata size or provider compatibility is unacceptable.

## Plan

- [ ] Characterize current agent discovery, frontmatter normalization, built-in aliases, catalog bounds, tool overrides, transport selection, trust resolution, workspace selection, and inspection output; verify focused tests pass before manifest changes.
- [ ] Define a bounded capability vocabulary and versioned manifest schema covering task capabilities, modalities, result contracts, authority needs, verifier roles, and declared limitations; verify each admitted field has at least one current or planned consumer.
- [ ] Define an enforceability matrix for subprocess, in-process, RPC, automatic transport, worktree, consultation, cwd policy, tools, resources, filesystem paths, network, secrets, credentials, and process isolation; label each entry enforced, advisory, unsupported, or transport-dependent.
- [ ] Add failing discovery tests for valid manifests, absent manifests, explicit empty capabilities, duplicate identifiers, unknown future fields, malformed values, user/project overrides, untrusted project scope, bounded metadata discovery, and legacy frontmatter.
- [ ] Implement manifest parsing and safe projection in `agents.ts` or a focused capability module while preserving existing agent precedence, prompt loading, settings overrides, and catalog bounds.
- [ ] Add explicit capability manifests for built-in scout, planner, reviewer, worker, and aliases; verify aliases remain behaviorally compatible and do not claim unimplemented verification or sandbox guarantees.
- [ ] Define an immutable `ExecutionPlan` with version, task requirements, selected agent and source, manifest fit, requested and effective tools, cwd and trust, resources, workspace, transport, model, thinking, budgets, result contract, overgrant, mismatch, unknowns, and unsupported guarantees.
- [ ] **Post-hoc addition:** Add immutable task-generation, admission-recommendation, benefit-hypothesis, evidence-sufficiency, and bounded-reason fields without changing the selected agent or launch behavior.
- [ ] **Post-hoc addition:** Define deterministic admission inputs from explicit context pressure, declared dependencies and cohesion, specialist capability, verification need, budgets, and enforceability while prohibiting task-keyword matching and extra provider calls.
- [ ] Add failing plan tests for exact match, subset match, unknown manifest, missing capability, excess tools, unsupported network denial, untrusted resources, custom-tool subprocess routing, write-capable RPC routing, read-only in-process routing, and explicit transport overrides.
- [ ] **Post-hoc addition:** Add audit-only admission tests for explicit decomposability, dense coupling, missing verification, insufficient budget, unknown task requirements, stale generation, and no-benefit evidence; verify recommendations are inspectable and have zero launch side effects.
- [ ] Implement a deterministic planner that consumes explicit contract requirements and existing policy resolvers without task-keyword matching, additional provider work, side effects, or launch changes.
- [ ] Introduce one preflight seam before confirmation, worktree creation, child allocation, and provider work, then pass the immutable plan or its exact policy projection to subprocess, in-process, RPC, and automatic transports.
- [ ] Add parity tests proving every transport applies the plan's effective tools, cwd, trust, resources, workspace, model, thinking, and budgets without post-plan widening or hidden fallback.
- [ ] Add bounded plan summaries to blocking details, retained records, `subagent_inspect get_run`, status diagnostics, and renderers while omitting prompts, credentials, raw protected paths, private context, and unnecessary capability descriptions.
- [ ] Add an offline audit benchmark that compares requested versus effective capabilities and tools for representative lookup, review, implementation, multimodal, and unsupported-isolation contracts; record capability coverage, unknown rate, mismatch rate, and permission precision.
- [ ] **Post-hoc addition:** Extend offline evidence with admission recommendation coverage, insufficient-evidence rate, and unnecessary-delegation labels, but defer quality claims and production routing to Gate 4A's paired target-framework evaluation.
- [ ] Update README agent-frontmatter documentation, inspection documentation, compatibility guidance, package layout, and a minor Changeset with audit-only semantics and the enforceability matrix.
- [ ] Audit project trust, source precedence, metadata bounds, terminal sanitization, private text, settings preservation, transport parity, cancellation before launch, and session replacement against the extension guides.
- [ ] Run focused tests, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; inspect the tarball and record baseline audit evidence.

## Completion Checklist

- [ ] Old built-in and custom agent definitions remain valid without capability metadata.
- [ ] Every contracted launch produces one deterministic immutable ExecutionPlan before side effects.
- [ ] Audit-only mode never changes the selected agent or established effective launch policy.
- [ ] Unknown, missing, overgranted, and unsupported capability states remain distinct in data and rendering.
- [ ] All transports prove policy parity against the same plan and perform no silent widening or fallback.
- [ ] Project-authored capability metadata remains behind existing trust and scope controls.
- [ ] Permission precision and capability coverage have a reproducible package baseline without unsupported targets.
- [ ] **Post-hoc addition:** Every ExecutionPlan is tied to one task generation and exposes an audit-only admission recommendation whose reasons can be evaluated later without having changed the launch.
- [ ] Required checks and semantic audits pass, and the package has an appropriate Changeset without publication.
