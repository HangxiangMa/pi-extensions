# Pi Subagents WorkItem and Artifact Ledger Plan

## Goal

Add a bounded persistent orchestration ledger that owns WorkItem identity, dependencies, cohesive scope, assignment, artifacts, versions, ownership, acceptance, invalidation, and terminal state while leaving Pi and existing transports responsible for agent execution.

Reject cyclic and invalid explicit workflows before any child starts.

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

## Non-Goals

- Do not build a general workflow DSL, distributed scheduler, CI engine, or arbitrary durable job service.
- Do not move model turns, tool execution, provider retry, session persistence, compaction, or transport cleanup into the ledger.
- Do not add adaptive scheduling until the ledger proves deterministic ready and invalidation state.
- Do not persist raw chain-of-thought, credentials, full prompts, unbounded tool output, or arbitrary repository contents.
- Do not infer repository dependencies through an unbounded mandatory analysis pass.
- Do not automatically merge worktrees or resolve conflicting edits.

## Assumptions

- Handoff v2 provides task and result contracts, and capability enforcement provides acknowledged effective policy.
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
- [ ] Implement a deep `WorkItemLedger` module with deterministic transitions, graph validation, artifact provenance, ready-state calculation, and immutable inspection snapshots without transport or UI dependencies.
- [ ] Project blocking single, parallel, chain, and fan-in calls into ledger workflows while preserving current execution order, result content, failure behavior, status, and omitted-field compatibility.
- [ ] Link detached spawn and follow-up turns to optional WorkItems without treating `parentId` as a dependency automatically; verify subtree lifecycle and workflow invalidation remain distinct operations.
- [ ] Add a bounded explicit workflow schema only after a schema compatibility gate decides whether it belongs as a new `subagent` mode or another separately approved surface; record the decision and rejected alternative.
- [ ] Validate every explicit workflow, target, agent, contract, ExecutionPlan, dependency, artifact input, and ownership scope before project-agent confirmation or any child launch; verify an invalid or cyclic graph starts zero children.
- [ ] Add conservative cohesive-scope and ownership conflict checks using declared paths, artifacts, and integration boundaries without claiming complete static dependency inference.
- [ ] Add one integration-owner relationship and one verifier relationship whose executable evidence can satisfy acceptance criteria while only the WorkItem transition owner commits completion.
- [ ] Add artifact invalidation so changed upstream generation, superseded result, failed verification, or ownership conflict marks affected downstream work stale or invalidated transitively without deleting prior evidence.
- [ ] Add versioned bounded ledger persistence with serialized publication, redaction, corrupt-state quarantine, inert restore, ancestor and dependency closure, count projection, and recovery after partial or repeated cleanup.
- [ ] Add `subagent_inspect` workflow and WorkItem projections that return metadata, dependencies, artifact identities, state, provenance, transfer coverage, and invalidation without returning raw artifact bodies or acknowledging mailboxes.
- [ ] Add bounded TUI or existing-manager views for workflow state only if the standard Pi TUI Kit surface can present it without creating another lifecycle owner; verify cancellation, disposal, replacement, and shutdown.
- [ ] Add failure-injection and graph fixtures that measure missing transfers, cascade radius, delegation fidelity, ownership conflicts, invalidation reach, and zero-launch preflight failures across increasing graph depth.
- [ ] Update README, tool schema documentation, persistence and downgrade guidance, package layout, implementation notes, and a minor Changeset for any public workflow surface.
- [ ] Audit persistence ordering, state ownership, cancellation, session replacement, shutdown, worktree cleanup, settings neutrality, sanitization, output bounds, and all stale continuations against the extension guides.
- [ ] Run focused tests, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; run a local Pi smoke for one valid chain-shaped workflow and one rejected cycle when practical.

## Completion Checklist

- [ ] WorkItem and AgentRegistry responsibilities are distinct and documented with one owner for each state transition.
- [ ] Existing single, parallel, chain, fan-in, detached, mailbox, and subtree behavior remains compatible by omission.
- [ ] Invalid identifiers, dependencies, artifacts, ownership scopes, and cycles launch zero children.
- [ ] Artifact provenance and generation make missing, superseded, stale, and invalidated transfers observable.
- [ ] Integration and verification roles can attach evidence without creating multiple completion owners.
- [ ] Persisted workflows restore inertly, preserve bounded evidence, and never resume prior side effects automatically.
- [ ] Inspection remains side-effect-free and excludes raw artifact contents, private context, and credentials.
- [ ] Required checks, semantic audits, migration evidence, package inspection, and Changeset pass without publication.
