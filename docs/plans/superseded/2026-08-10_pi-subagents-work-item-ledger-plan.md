# Pi Subagents WorkItem and Artifact Ledger Plan

> **Superseded as an executable plan on 2026-08-10.**
> The implemented WorkItem and artifact-ledger baseline is documented in the [delegation-intelligence roadmap](../../roadmaps/2026-08-10_pi-subagents-delegation-intelligence-roadmap.md).
> Acceptance-state migration and managed verification are owned by the [verified execution loop plan](../2026-08-10_pi-subagents-verified-execution-loop-plan.md).
> Rolling persistence and resume are owned by the [event-driven workflow runtime plan](../2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md).
> Detached-agent projection remains intentionally deferred and requires a separately approved plan.
> Unchecked boxes below preserve the original design sequence and are not current executable work.

## Goal

Add a bounded persistent orchestration ledger that owns WorkItem identity, dependencies, cohesive scope, assignment, artifacts, versions, ownership, acceptance, invalidation, and terminal state while leaving Pi and existing transports responsible for agent execution.

Reject cyclic and invalid explicit workflows before any child starts.

## Post-hoc Amendment

This section and every checklist item labelled **Post-hoc addition** were added after the initial plan in commit `07df6d8b`.

**Reason:** The later evidence audit and roadmap review found that observable artifact versions and Worktree isolation are insufficient unless one integration controller rejects stale premises, while cancellation must rotate generations and quarantine late results before Gate 4A can measure a trustworthy minimal architecture.

The additions make Phase 4 the owner of fail-closed integration and lifecycle provenance without adding adaptive scheduling.

## Context

`AgentRegistry` currently owns retained agent records, parent relationships, history, mailboxes, a FIFO turn queue, concurrency, persistence callbacks, and subtree lifecycle operations.

Blocking orchestration separately owns single, parallel, chain, and fan-in topology without one durable task model.

The research notes show that dependency-aware cohesion can improve quality, latency, and cost, while naive file partitioning can increase cost and coordination risk.

They also show that missing transfers and latent failures can grow sharply with workflow size and depth.

A ledger is required before adaptive scheduling because the scheduler needs authoritative ready state, artifact versions, ownership, and invalidation.

## Architecture

A `WorkItemLedger` will be a package-owned delegation-state module beside `AgentRegistry`, not a replacement for Pi sessions, the model loop, or transport lifecycle.

A WorkItem will contain workflow and task identity, objective reference, dependencies, assigned agent, cohesive scope, requested capabilities, input artifact versions, output artifacts, acceptance criteria, verifier relationship, state, generation, provenance, timing, and terminal outcome.

Artifacts will be bounded metadata references with type, producer, generation, content hash or stable identity, location policy, verification state, and invalidation state.

The ledger will not persist arbitrary artifact bodies or raw model output by default.

Existing modes will project into the ledger first, with single as one node, parallel as independent nodes, chain as sequential dependencies, and fan-in as a node depending on all workers.

Detached parent relationships will remain lifecycle ownership unless an explicit WorkItem dependency links them.

An explicit DAG surface will be admitted only after the internal projection, schema size, provider compatibility, and usability evidence pass.

Graph validation will resolve identifiers, bounds, missing dependencies, self-edges, duplicate edges, cycles, ownership conflicts, and invalid artifact references before launch.

One integration owner and independently contextualized verifier can be represented without allowing multiple completion owners.

**Post-hoc addition:** Within an opted-in managed-integration WorkItem, the integration owner will be the only component allowed to update canonical integration state and will validate task generation, base commit, declared dependency or read-set versions, accepted-plan identity, capability compliance, scope, patch digest, and required evidence before applying an artifact.

**Reason:** Separate worktrees prevent direct overwrites but do not prevent stale assumptions, incompatible interfaces, or late patches from corrupting the assembled result.

**Post-hoc addition:** Cancellation will operate on a WorkItem subtree by rotating affected generations, revoking or observing prior grant revocation, signalling owned work, quarantining later artifacts, and preserving diagnostic provenance without accepting them.

**Reason:** The initial ledger model contained generation and invalidation but did not define the race between cancellation, detached settlement, and integration.

## Non-Goals

- Do not build a general workflow DSL, distributed scheduler, CI engine, or arbitrary durable job service.
- Do not move model turns, tool execution, provider retry, session persistence, compaction, or transport cleanup into the ledger.
- Do not add adaptive scheduling until the ledger proves deterministic ready and invalidation state.
- Do not persist raw chain-of-thought, credentials, full prompts, unbounded tool output, or arbitrary repository contents.
- Do not infer repository dependencies through an unbounded mandatory analysis pass.
- Do not automatically merge worktrees or resolve conflicting edits.
- **Post-hoc addition:** Do not let any worker, verifier, or late completion update canonical integration state outside the single integration controller for opted-in managed-integration WorkItems, while preserving legacy omitted-field execution behavior.

## Assumptions

- Handoff v2 provides task and result contracts, and capability enforcement provides acknowledged effective policy.
- **Post-hoc addition:** Handoff, `ExecutionPlan`, and capability grants share one immutable task generation, and enforcement exposes revocation state before ledger integration begins.
- Existing persistence can add a separate versioned ledger record or state file without making older retained agent records unreadable.
- Explicit workflows remain bounded by current task, output, agent, depth, and storage limits.
- An artifact reference can identify evidence without making the ledger the artifact-content store.

## Risks

- A ledger can duplicate agent history or Pi session state and create two owners for completion.
- WorkItem and agent lifecycle states can diverge during cancellation, timeout, crash, or restore.
- Explicit DAG schemas can become too large or difficult for model providers to generate reliably.
- Dependency and ownership declarations can be wrong even when the graph is acyclic.
- Persistence migration can strand retained agents or partially written workflows.
- Artifact hashes and locations can expose sensitive paths or create expensive repository scans.

## Rollback / Recovery

- Introduce ledger projection behind existing modes before exposing an explicit workflow mode.
- Keep AgentRegistry and existing tool behavior authoritative until ledger parity tests pass.
- Store ledger data under a separately versioned optional envelope that old readers can ignore.
- Restore incomplete workflows inertly and require explicit continuation rather than resuming prior side effects.
- Keep explicit DAG execution opt-in and removable without invalidating ordinary retained agents.
- Preserve prior evidence when invalidating work so diagnosis does not require replay.

## Plan

- [ ] Characterize current blocking topology, registry queue, parent tree, history, mailbox, persistence, completion, subtree close, worktree ownership, timeout, and restore behavior; verify focused tests pass before ledger changes.
- [ ] Define WorkItem, workflow, dependency edge, cohesive scope, artifact reference, artifact version, verifier relationship, generation, state, outcome, and invalidation schemas with explicit bounds and one terminal owner.
- [ ] Map existing agent lifecycle and typed result states to WorkItem transitions, including starting, ready, running, blocked, needs-input, completed, failed, interrupted, stale, invalidated, and closed or archived projections.
- [ ] Add failing pure-ledger tests for creation, transition legality, monotonic generations, idempotent updates, duplicate identifiers, missing dependencies, self-edges, duplicate edges, cycle detection, terminal immutability, invalidation, and bounded projection.
- [ ] **Post-hoc addition:** Add cancellation-tree and race tests for generation rotation, grant revocation observation, repeated cancellation, session replacement, detached late result, timeout settlement, quarantined artifacts, inert restore, and zero old-generation acceptance.
- [ ] Implement a deep `WorkItemLedger` module with deterministic transitions, graph validation, artifact provenance, ready-state calculation, and immutable inspection snapshots without transport or UI dependencies.
- [ ] Project blocking single, parallel, chain, and fan-in calls into ledger workflows while preserving current execution order, result content, failure behavior, status, and omitted-field compatibility.
- [ ] Link detached spawn and follow-up turns to optional WorkItems without treating `parentId` as a dependency automatically; verify subtree lifecycle and workflow invalidation remain distinct operations.
- [ ] Add a bounded explicit workflow schema only after a schema compatibility gate decides whether it belongs as a new `subagent` mode or another separately approved surface; record the decision and rejected alternative.
- [ ] Validate every explicit workflow, target, agent, contract, ExecutionPlan, dependency, artifact input, and ownership scope before project-agent confirmation or any child launch; verify an invalid or cyclic graph starts zero children.
- [ ] Add conservative cohesive-scope and ownership conflict checks using declared paths, artifacts, and integration boundaries without claiming complete static dependency inference.
- [ ] Add one integration-owner relationship and one verifier relationship whose executable evidence can satisfy acceptance criteria while only the WorkItem transition owner commits completion.
- [ ] **Post-hoc addition:** Implement an integration admission check that fails closed on stale generation, base commit, declared dependency or read-set versions, accepted-plan identity, revoked capability, scope, patch digest, or missing evidence; verify no rejected artifact mutates canonical integration state.
- [ ] **Post-hoc addition:** Require the integration controller to apply admitted artifacts in dependency order and record the exact decision inputs, while a fresh-context verifier evaluates only the resulting current state and evidence receipts.
- [ ] Add artifact invalidation so changed upstream generation, superseded result, failed verification, or ownership conflict marks affected downstream work stale or invalidated transitively without deleting prior evidence.
- [ ] Add versioned bounded ledger persistence with serialized publication, redaction, corrupt-state quarantine, inert restore, ancestor and dependency closure, count projection, and recovery after partial or repeated cleanup.
- [ ] Add `subagent_inspect` workflow and WorkItem projections that return metadata, dependencies, artifact identities, state, provenance, transfer coverage, and invalidation without returning raw artifact bodies or acknowledging mailboxes.
- [ ] Add bounded TUI or existing-manager views for workflow state only if the standard Pi TUI Kit surface can present it without creating another lifecycle owner; verify cancellation, disposal, replacement, and shutdown.
- [ ] Add failure-injection and graph fixtures that measure missing transfers, cascade radius, delegation fidelity, ownership conflicts, invalidation reach, and zero-launch preflight failures across increasing graph depth.
- [ ] **Post-hoc addition:** Add a Gate 4A fixture profile limited to two concurrent mutating children with no grandchildren, one integration owner, and one fresh-context verifier; verify attempts to widen or recurse are rejected in the profile before child allocation.
- [ ] **Post-hoc addition:** Export bounded per-instance generation, integration, verification, cancellation, late-result, handoff, conflict, timing, and usage evidence required by the post-hoc minimal-delegation evaluation plan without adding production admission policy.
- [ ] Update README, tool schema documentation, persistence and downgrade guidance, package layout, implementation notes, and a minor Changeset for any public workflow surface.
- [ ] Audit persistence ordering, state ownership, cancellation, session replacement, shutdown, worktree cleanup, settings neutrality, sanitization, output bounds, and all stale continuations against the extension guides.
- [ ] Run focused tests, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; run a local Pi smoke for one valid chain-shaped workflow and one rejected cycle when practical.

## Completion Checklist

- [ ] WorkItem and AgentRegistry responsibilities are distinct and documented with one owner for each state transition.
- [ ] Existing single, parallel, chain, fan-in, detached, mailbox, and subtree behavior remains compatible by omission.
- [ ] Invalid identifiers, dependencies, artifacts, ownership scopes, and cycles launch zero children.
- [ ] Artifact provenance and generation make missing, superseded, stale, and invalidated transfers observable.
- [ ] Integration and verification roles can attach evidence without creating multiple completion owners.
- [ ] **Post-hoc addition:** Only the integration controller can mutate canonical integration state for opted-in managed-integration WorkItems, stale or revoked inputs fail closed before application, and legacy omitted-field execution remains compatible.
- [ ] **Post-hoc addition:** Cancellation and replacement rotate generations and produce zero accepted late artifacts while preserving bounded diagnostic provenance.
- [ ] **Post-hoc addition:** The ledger exposes the bounded two-child, no-grandchild experimental evidence required for Gate 4A without admitting adaptive scheduling.
- [ ] Persisted workflows restore inertly, preserve bounded evidence, and never resume prior side effects automatically.
- [ ] Inspection remains side-effect-free and excludes raw artifact contents, private context, and credentials.
- [ ] Required checks, semantic audits, migration evidence, package inspection, and Changeset pass without publication.
