# Pi Subagents Delegation Intelligence Roadmap

- **Status:** Proposed strategic direction; not an implementation or release commitment.
- **Audience:** `@narumitw/pi-subagents` maintainers and contributors.
- **Planning horizon:** Evidence-qualified phases without delivery dates.
- **Research basis:** [`2026-08-10-coding-agent-subagents-arxiv-survey.md`](../research/2026-08-10-coding-agent-subagents-arxiv-survey.md) and [`2026-08-10-coding-agent-subagents-engineering-notes.md`](../research/2026-08-10-coding-agent-subagents-engineering-notes.md).

## Vision

Evolve `pi-subagents` from a reliable process and lifecycle manager into a verifiable delegation system that decides when delegation is justified, transfers the information required for success, grants bounded authority, schedules only dependency-ready work, preserves provenance, and accepts results only through explicit evidence.

Keep Pi as the owner of model execution, tools, sessions, provider behavior, and extension runtime mechanics.

Keep `pi-subagents` as the owner of delegation contracts, execution planning, subagent lifecycle, orchestration state, handoff integrity, task-scoped policy, and delegation observability.

## Objectives

- **Preserve handoff fidelity** — Success: every opted-in delegation has a versioned request and result contract whose required inputs, outputs, evidence, limitations, and acceptance state survive chain, fan-in, detached completion, persistence, and inspection.
- **Make authority reviewable** — Success: every contracted launch exposes requested, available, and effective capabilities and identifies overgrant, mismatch, and unsupported guarantees before side effects begin.
- **Make inability actionable** — Success: capability mismatch, missing input, insufficient authority, unavailable verification, and ambiguous work produce typed outcomes that support clarification, rerouting, fallback, or safe termination rather than blind retry.
- **Make orchestration dependency-aware** — Success: bounded WorkItem graphs own task identity, dependencies, artifacts, versions, ownership, invalidation, and terminal state, and cyclic graphs launch zero children.
- **Use parallelism selectively** — Success: the scheduler treats configured concurrency as a ceiling, starts only ready and safely independent work, and records why delegation or parallel execution was selected.
- **Reject stale evidence** — Success: changed semantic resources, repository generations, dependencies, or artifact versions cannot be silently combined with retained state or accepted as current verification.
- **Measure orchestration quality** — Success: deterministic and representative evaluations report transfer coverage, delegation fidelity, permission precision, cascade radius, verification quality, cost, tokens, latency, and quality against credible non-orchestrated baselines.

## Current State

- `pi-subagents` already supports blocking single, parallel, chain, and fan-in execution plus detached reusable agents, mailboxes, inspection, read-only consultation, multiple transports, worktrees, recursion limits, work deadlines, bounded timeout finalization, idempotent spawn, persistence, and completion delivery.
- `structured-v1` is an opt-in stateful result shape with `summary`, `evidence`, `changes`, `verification`, and `risks`, while blocking task, chain, and fan-in handoffs remain primarily free-form text.
- Blocking chain execution substitutes raw previous output into `{previous}`, and fan-in composes bounded Markdown from worker outputs.
- `AgentConfig` describes tools, model, thinking level, timeout, and prompt but has no versioned capability or result-format manifest.
- Automatic transport selection distinguishes custom tools, write-capable built-ins, and read-only built-ins but does not evaluate task intent or capability fit.
- Stateful lifecycle states distinguish starting, running, idle, completed, interrupted, failed, and closed but do not represent acknowledgement, blocked work, missing input, abstention, stale evidence, or revalidation.
- `AgentRegistry` owns a bounded parent tree, FIFO turn queue, mailbox, persistence, and concurrency limits but not an explicit task-dependency or artifact graph.
- Current trust, tool, cwd, and worktree policies are valuable controls but are not an operating-system filesystem, network, secret, or credential sandbox.
- The package has no established benchmark baseline for handoff fidelity, permission precision, missing transfers, cascade radius, or the marginal value of orchestration over matched alternatives.

## Guiding Principles

- **Contracts before automation:** define requests, results, evidence, acknowledgement, and rejection before allowing policy to route or reject work.
- **Audit before enforcement:** collect mismatches and overgrant evidence before changing established launches, and enforce only where the requested guarantee is technically real.
- **Authority must be truthful:** distinguish enforced tool and runtime policy from advisory prompt scope and unsupported OS-level isolation.
- **Dependencies before parallelism:** infer or declare task dependencies and cohesion before increasing worker count or selecting dynamic concurrency.
- **Artifacts before conversation:** transfer bounded versioned artifacts and provenance rather than relying on unconstrained summaries or copied dialogue.
- **Verification must be independent:** an implementation worker's report is evidence input, not sufficient acceptance proof for its own change.
- **Recovery must match failure:** retry transient transport or tool failures, request missing inputs explicitly, and replan semantic or stale-state failures.
- **No automatic side-effect replay:** uncertain or accepted write-capable work is never replayed solely because orchestration did not observe completion.
- **Compatibility by omission:** existing payloads retain current behavior when new contract, capability, ledger, scheduler, and semantic-isolation fields are absent.
- **Evidence before defaults:** new enforcement and scheduling behavior remains opt-in or audit-only until deterministic and representative measurements justify a default change.

## Roadmap

### Phase 1: Establish delegation contracts and structured handoffs

- [ ] A versioned delegation-request contract covers task identity, objective, non-goals, dependencies, required inputs, requested authority, acceptance criteria, required evidence, and bounded budgets without claiming those requests are already enforced.
- [ ] A versioned result contract preserves status, evidence-backed claims, artifact references, changed paths, verification results, limitations, unresolved dependencies, provenance, usage, and truncation metadata across every supported execution and delivery path.
- [ ] Blocking single, parallel, chain, fan-in, and detached execution can opt into the same contract while existing text and `structured-v1` behavior remain compatible.
- [ ] Chain and fan-in transfer validated structured envelopes when available and retain bounded raw text only as an explicit compatibility fallback.
- [ ] Contract levels or profiles let small lookup tasks avoid the measured token, latency, and tool-call overhead of a full software delegation contract.
- [ ] Deterministic contract tests cover malformed, partial, oversized, private, stale-version, unknown-field, and fallback behavior without silently presenting invalid structured data as successful evidence.

**Outcome:** Every opted-in subagent boundary has a reviewable request, result, and evidence surface that later policy can safely inspect and enforce.

### Phase 2: Add capability manifests and audit-only ExecutionPlan

- [ ] Built-in and custom agent definitions can declare versioned capabilities, modalities, supported result contracts, authority needs, and verification roles while old definitions remain valid.
- [ ] One transport-neutral `ExecutionPlan` records task requirements, selected agent, declared capability fit, requested and effective tools, cwd and trust decision, workspace mode, transport, model and thinking selection, budgets, and unsupported guarantees.
- [ ] The first planner is deterministic and uses explicit contract requirements rather than task-keyword heuristics or an additional classifier model call.
- [ ] Audit-only planning does not change the caller-selected agent, tools, transport, workspace, or launch result, but it reports mismatch, overgrant, omission, and unsupported-policy findings through bounded details and inspection.
- [ ] Agent catalogs and inspection expose only safe manifest metadata and never expose system prompts, credentials, raw protected paths, or private context.
- [ ] Baseline evaluation measures capability coverage and permission precision before any enforcement default is considered.

**Outcome:** Maintainers can observe whether a launch is appropriately matched and minimally authorized without breaking existing workflows.

### Phase 3: Enforce capabilities and make inability actionable

- [ ] Contracted calls can explicitly request capability enforcement, while legacy and uncontracted calls retain audit-only behavior unless a separately approved compatibility change says otherwise.
- [ ] Preflight acknowledgement returns a typed accepted or rejected decision before project-agent confirmation, worktree creation, child allocation, provider work, or other side effects.
- [ ] Runtime results distinguish completed, partial, blocked, needs-input, abstained, failed, interrupted, stale, and contract-invalid outcomes with bounded reason codes and actionable recovery metadata.
- [ ] Enforceable controls cover actual agent capability, tool allow-lists, cwd and trust policy, resource policy, workspace mode, result-contract support, concurrency, and budgets consistently across subprocess, in-process, RPC, and automatic transport.
- [ ] Requested filesystem, network, secret, or credential guarantees fail closed when no real sandbox or policy provider can enforce them, rather than being represented as prompt-only protection.
- [ ] Recovery policy retries only classified transient failures, requests exact missing inputs for dependency failures, reroutes capability mismatch, and never blindly replays work whose side effects may already have occurred.

**Outcome:** The system can safely refuse, clarify, reroute, or stop unsuitable work without turning every inability into an opaque failure or repeated prompt.

### Phase 4: Introduce a WorkItem and artifact ledger

- [ ] A bounded WorkItem model owns workflow identity, task identity, dependencies, assignment, cohesive scope, artifact inputs and outputs, acceptance criteria, state, provenance, and terminal outcome without replacing Pi's agent loop.
- [ ] Existing single, parallel, chain, fan-in, parent-child, and mailbox behavior projects into the ledger before an explicit DAG execution surface is admitted.
- [ ] Explicit workflow graphs validate identifiers, dependencies, limits, ownership conflicts, and cycles before any child starts or project-authored agent confirmation appears.
- [ ] Artifact versions and dependency generations make missing transfers, superseded inputs, conflicting ownership, and downstream invalidation observable.
- [ ] One integration owner can assemble compatible artifacts, and one independently contextualized verifier can attach machine-executed acceptance evidence without becoming another completion owner.
- [ ] Ledger state is bounded, redacted, branch-aware where applicable, versioned for persistence, recoverable after partial writes, and inspectable without exposing artifact contents by default.

**Outcome:** Delegation becomes a reproducible state machine over tasks and artifacts rather than a collection of loosely related agent transcripts.

### Phase 5: Add adaptive scheduling and semantic isolation

- [ ] A dependency-aware ready queue starts only work whose required artifacts are current and whose effective scopes do not create known write, ownership, or integration conflicts.
- [ ] Configured parallel limits remain hard ceilings, while effective concurrency adapts deterministically to ready work, cohesion, critical path, remaining budget, transport capacity, and workspace safety.
- [ ] Semantic resource snapshots bind retained work to bounded identities or hashes for agent definition, role prompt, tool policy, model resolution, protected resources, repository generation, dependency artifacts, and scheduler policy without persisting secrets or full prompts.
- [ ] Restore and continuation detect semantic skew and apply an explicit compatible, warn, needs-revalidation, or reject decision before new model work begins.
- [ ] Upstream artifact or policy changes invalidate affected downstream work transitively, preserve prior evidence for diagnosis, and never auto-replay side effects.
- [ ] Orchestration observability records decision reasons, transfers, acknowledgements, failures, retries, cancellations, invalidations, verification, cost, timing, and cascade radius through bounded safe metadata.
- [ ] Matched evaluations compare the adaptive system with a strong single agent, equal-budget best-of-N, naive parallelism, fixed scheduling, and an orchestrator ablation before any default scheduling change.

**Outcome:** `pi-subagents` uses concurrency and retained context only when the task graph and semantic state justify them, and it can prove when evidence remains current.

## Cross-Cutting Verification Strategy

- Every phase begins with deterministic characterization or failing behavior tests at the public contract and ends with focused tests, package checks, root `npm run check`, `git diff --check`, and `just pack subagents`.
- Every changed asynchronous flow is audited for user cancellation, component disposal, session replacement, shutdown, stale generation after each `await`, partial creation, and repeated cleanup.
- Every changed setting follows `docs/extension-settings.md` for side-effect-free loads, validation, latest-document reads, ordered writes, unknown-field preservation, atomic rename, rollback, reload behavior, and non-TUI handling.
- Every model-facing and terminal-facing field is bounded, redacted, and sanitized before transfer, persistence, rendering, inspection, or completion delivery.
- Representative live-provider smokes stop after one clear external failure and fall back to deterministic transport and fake-provider evidence unless a retry is explicitly requested.
- Every published behavior change receives an independent package Changeset, while publication, tags, visibility changes, and release workflow dispatch remain separately approved actions.

## Success Metrics

| Indicator | Baseline | Target or invariant | Evidence source |
| --- | --- | --- | --- |
| Contract-valid opted-in completions | Not established | Baseline in Phase 1, then no silent contract-invalid success | Contract and provider-compatibility tests |
| Required handoff transfer coverage | Not measured | Baseline in Phase 1, improvement target decided from evidence | Chain, fan-in, and workflow benchmark |
| Capability mismatch detected before launch | Not represented | Every enforced mismatch | ExecutionPlan preflight tests |
| Permission precision | Not measured | Baseline in Phase 2, target TBD | Requested-versus-effective authority audit |
| Unsupported guarantees reported as enforced | Current docs warn globally | 0 | Policy matrix and inspection tests |
| Blind retries for semantic or stale failures | No typed policy | 0 | Recovery-classification tests |
| Cyclic workflow children started | No explicit workflow DAG | 0 | Graph preflight tests |
| Downstream results silently accepted after dependency invalidation | Not represented | 0 | Generation and invalidation tests |
| Independent acceptance evidence for contracted implementation work | Optional and unmeasured | Baseline in Phase 4, target TBD | Verifier and integration benchmark |
| Agent count used as a scheduling objective | Fixed ceiling only | 0 policies that maximize count | Scheduler policy review |
| Existing omitted-field behavior regressions | Current package behavior | 0 unapproved regressions | Compatibility suites and Pi smoke |
| Orchestrated quality advantage over matched alternatives | Unknown | TBD from repeated target-framework evaluation | Benchmark matrix |

Unsupported numeric improvement targets remain TBD until the package establishes repeatable baselines.

## Risks and Dependencies

| Risk or dependency | Impact | Mitigation or decision |
| --- | --- | --- |
| Contract detail increases cost and latency | Small tasks could become slower and more verbose | Support bounded contract levels, keep text compatibility, and measure overhead by task class before changing defaults. |
| Capability metadata becomes cosmetic | Incorrect manifests could create false confidence | Keep audit-only first, expose requested versus effective policy, and require deterministic enforcement evidence. |
| Intent inference becomes another unreliable model call | Routing cost and failure could exceed its value | Start from explicit requirements and deterministic matching, and gate learned routing on a later benchmark decision. |
| Tool policy is mistaken for OS sandboxing | Users could believe paths, network, or secrets are protected when they are not | Represent enforceability explicitly and fail closed for requested unsupported guarantees. |
| Result states proliferate without one owner | Callers could handle outcomes inconsistently | Give one versioned result contract and one recovery-policy owner across transports and orchestration modes. |
| WorkItem ledger duplicates Pi session or agent execution | The package could become a second workflow runtime | Limit the ledger to delegation tasks, artifacts, policy, and orchestration state while Pi and existing transports retain execution ownership. |
| Explicit DAG support widens tool schemas | Provider compatibility and prompt cost could regress | Project existing modes into the ledger first, bound graph size, and add an explicit mode only after schema compatibility tests. |
| Semantic snapshots capture private material | Persistence could leak prompts, paths, or credentials | Store allowlisted identities and hashes only, redact paths, and never persist raw secrets or full prompts. |
| Snapshot mismatches block useful restored work | Benign changes could produce unnecessary revalidation | Begin with warn and explicit compatibility rules, then enforce only mismatch classes proven unsafe. |
| Adaptive scheduling obscures predictable ordering | Debugging and compatibility could become harder | Keep deterministic policy, preserve a legacy scheduler rollback, and expose every decision reason. |
| Independent verification doubles work | Cost can rise without improving simple tasks | Require it only for selected risk classes and measure marginal value against executable acceptance evidence. |
| New settings can be invalid to older releases | Downgrade can strand user configuration | Keep defaults compatible, document downgrade edits, and preserve unknown fields and old state readers. |

## Non-Goals

- Maximize subagent count, recursion depth, or configured concurrency.
- Replace Pi's agent loop, provider retry, tool execution, session storage, compaction, or extension runtime.
- Build a general-purpose distributed workflow engine, CI system, cron service, or unrestricted DAG scheduler.
- Claim filesystem, process, network, secret, or credential isolation without a concrete enforcing runtime.
- Parse hidden chain-of-thought or persist raw model reasoning as orchestration evidence.
- Infer successful verification from assistant prose, terminal status, `agent_end`, `agent_settled`, or an exit code alone.
- Automatically retry uncertain write-capable work or merge conflicting worktrees without explicit integration policy.
- Make project-authored agents available without existing trust and confirmation protections.
- Publish a package, change npm visibility, create a tag, or dispatch a release workflow without separate explicit approval.

## Assumptions and Unknowns

- The five-phase direction is approved for planning, while each implementation phase still requires its saved plan to be executed explicitly.
- Existing text payloads, tool names, workflow modes, settings defaults, retained records, and transport choices remain compatible by omission.
- `structured-v2` is expected to be additive, but its exact public field names remain subject to provider-schema and compatibility tests in Phase 1.
- Capability requirements are expected to be explicit before learned or heuristic intent inference is considered.
- It is unknown which requested path, network, credential, or sandbox controls Pi or a future public policy provider can enforce uniformly across all transports.
- It is unknown which task classes justify full contracts, independent verification, adaptive scheduling, or multi-agent execution after overhead is included.
- It is unknown whether explicit workflow DAGs belong in the existing `subagent` tool or a later separately named surface, so Phase 4 must decide from schema and usability evidence.
- No delivery dates, staffing, publication schedule, or adoption target were provided.

## Decisions and Changes

- **2026-08-10 — Adopt research-grounded sequencing:** Build contracts before planning, audit before enforcement, dependency state before adaptive scheduling, and semantic snapshots before accepting restored evidence.
- **2026-08-10 — Keep enforcement truthful:** Enforce only controls available through the selected runtime and report unsupported guarantees instead of treating prompt instructions as security boundaries.
- **2026-08-10 — Treat verification and observability as cross-cutting:** Every phase carries independent-evidence and bounded-diagnostic requirements rather than deferring correctness measurement to the final scheduler.
- **2026-08-10 — Keep defaults compatible:** New public behavior remains explicit, audit-only, or opt-in until package-specific evidence supports a separately approved default change.
