# Pi Subagents Delegation Intelligence Roadmap

- **Status:** Revised opt-in implementation complete; matched live admission evidence and any default change remain deferred.
- **Audience:** `@narumitw/pi-subagents` maintainers and contributors.
- **Planning horizon:** Evidence-qualified phases without delivery dates.
- **Research basis:** [`2026-08-10-coding-agent-subagents-arxiv-survey.md`](../research/2026-08-10-coding-agent-subagents-arxiv-survey.md) and [`2026-08-10-coding-agent-subagents-engineering-notes.md`](../research/2026-08-10-coding-agent-subagents-engineering-notes.md).
- **Post-hoc research addition (2026-08-10):** Also use [`2026-08-10-coding-agent-subagents-evidence-audit.md`](../research/2026-08-10-coding-agent-subagents-evidence-audit.md) and [`2026-08-10-coding-agent-subagents-architecture-deep-dive.md`](../research/2026-08-10-coding-agent-subagents-architecture-deep-dive.md).
  **Reason:** The deeper audit added strong single-agent counterevidence, stricter matched-baseline requirements, cancellation-generation requirements, and a smaller falsifiable architecture that the initial roadmap did not cover.
- **Post-hoc status clarification (2026-08-10):** This direction remains proposed until an explicit approval records otherwise.
  **Reason:** The original assumptions called the direction approved for planning even though the document header and repository evidence only established a proposal.

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
- **Post-hoc objective — Decide whether to delegate** — Success: an audit-first admission policy distinguishes parent-owned direct work, one child, one child plus independent verification, and bounded multi-child work, records its benefit hypothesis, and never treats subagent count as success.
  **Reason:** The deeper evidence found that strong single-agent and equal-budget sampling baselines often match or beat automatic multi-agent systems.
- **Post-hoc objective — Quarantine cancelled and replaced generations** — Success: task-version-bound authority is revoked on cancellation or replacement, and no result from an old generation can enter integration or satisfy current acceptance.
  **Reason:** The initial roadmap audited cancellation but did not make late-result rejection an orchestration invariant.

## Implemented State

- `pi-subagents` preserves blocking single, parallel, chain, fan-in, detached reusable agents, mailboxes, inspection, read-only consultation, transports, worktrees, recursion limits, deadlines, timeout finalization, idempotent spawn, persistence, and completion delivery.
- Opt-in delegation v2 and structured result v2 contracts carry bounded authority requests, evidence-backed claims, artifacts, verification, limitations, provenance, task generation, and actionable outcomes while text and `structured-v1` remain compatible.
- Built-in and custom definitions can publish capability manifests, and deterministic capability routing plus executor-owned `ExecutionPlan` and capability-grant metadata make fit, authority, admission, lifetime, and unsupported guarantees reviewable.
- Explicit blocking workflow mode validates bounded dependency graphs, routes by capability when requested, tracks WorkItems and versioned artifacts, limits mutating width to two, rejects recursive workflows, and exposes deterministic scheduling decisions and metrics.
- Stateful outcomes include blocked, needs-input, abstained, stale, interrupted, failed, and contract-invalid projections, while cancellation rotates generations and revokes active grants before stale completions can be accepted.
- Privacy-safe semantic snapshots hash prompts, policies, resources, repository state, artifact contracts, and scheduler policy, and retained follow-up requires explicit revalidation after incompatible changes.
- Verification-required explicit workflows stage producer results without trusting worker self-checks, run one distinct fresh-context verifier behind an exclusive barrier, bind acceptance to an unchanged bounded Git-visible tree identity and both ExecutionPlans, persist executor-owned accept/rework/reject receipts, and reject cancelled or late generations.
- The WorkItem ledger, integration-controller validator, verifier acceptance gate, strict persistence validation, invalidation, crash recovery, orphan cleanup, bounded retries, and read-only hedging are covered by deterministic tests; manager-controlled patch application remains deferred.
- Current trust, tool, cwd, worktree, capability, and grant policies remain task and runtime controls rather than an operating-system filesystem, network, secret, or credential sandbox.
- Gate 4A recorded a revised opt-in scope and an offline matched-protocol dry-run, while representative paired live-provider quality and overhead baselines remain explicitly deferred before any recommendation or default change.

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
- **Post-hoc principle — Single-agent first:** keep parent-owned or one-child execution as the default recommendation unless explicit context, decomposition, specialist, or verification value exceeds coordination cost.
  **Reason:** The deeper audit did not find a general matched-budget coding advantage for dynamic subagents.
- **Post-hoc principle — Generation before side effects:** bind requests, plans, grants, artifacts, results, cancellation, and integration decisions to one immutable task generation before enforceable work begins.
  **Reason:** Capability enforcement without generation identity cannot safely revoke authority or reject late results after replacement.

## Roadmap

### 2026-08-10 implementation record

The revised opt-in architecture is implemented in `packages/pi-subagents` and covered by the package compatibility suite.

The saved Gate 4A decision is **Revise** in [`2026-08-10_pi-subagents-admission-gate-decision.md`](../benchmarks/2026-08-10_pi-subagents-admission-gate-decision.md).

That decision admits only caller-selected explicit workflows, audit-only admission with an explicit decline opt-in, two concurrent mutating children, no workflow grandchildren, and semantic revalidation.

Unchecked matched-provider and measured-overhead items remain intentionally deferred because no paired repository sample, fixed provider budget, or live evaluation authorization was supplied.

Detached parent trees and mailboxes also remain solely AgentRegistry-owned instead of being projected into WorkItems, because the revised scope avoids introducing a second lifecycle owner without an admitted detached-workflow use case.

They are gates or separately scoped follow-ups, not evidence that may be replaced with deterministic simulation.

No package publication, default scheduling change, tag, or release workflow is part of this implementation.

### Phase 1: Establish delegation contracts and structured handoffs

- [x] A versioned delegation-request contract covers task identity, objective, non-goals, dependencies, required inputs, requested authority, acceptance criteria, required evidence, and bounded budgets without claiming those requests are already enforced.
- [x] **Post-hoc addition:** The executor attaches an immutable task generation and cancellation lineage to the request and stamps the normalized structured result with that generation without trusting model output or claiming enforcement.
  **Reason:** Generation provenance must exist before later phases can revoke grants or quarantine results from cancelled and replaced work.
- [x] A versioned result contract preserves status, evidence-backed claims, artifact references, changed paths, verification results, limitations, unresolved dependencies, provenance, usage, and truncation metadata across every supported execution and delivery path.
- [x] Blocking single, parallel, chain, fan-in, and detached execution can opt into the same contract while existing text and `structured-v1` behavior remain compatible.
- [x] Chain and fan-in transfer validated structured envelopes when available and retain bounded raw text only as an explicit compatibility fallback.
- [ ] Contract levels or profiles let small lookup tasks avoid the measured token, latency, and tool-call overhead of a full software delegation contract.
- [x] Deterministic contract tests cover malformed, partial, oversized, private, stale-version, unknown-field, and fallback behavior without silently presenting invalid structured data as successful evidence.

**Outcome:** Every opted-in subagent boundary has a reviewable request, result, and evidence surface that later policy can safely inspect and enforce.

### Phase 2: Add capability manifests and audit-only ExecutionPlan

- [x] Built-in and custom agent definitions can declare versioned capabilities, modalities, supported result contracts, authority needs, and verification roles while old definitions remain valid.
- [x] One transport-neutral `ExecutionPlan` records task requirements, selected agent, declared capability fit, requested and effective tools, cwd and trust decision, workspace mode, transport, model and thinking selection, budgets, and unsupported guarantees.
- [x] The first planner is deterministic and uses explicit contract requirements rather than task-keyword heuristics or an additional classifier model call.
- [x] **Post-hoc addition:** Audit-only `ExecutionPlan` records a delegation-admission recommendation, benefit hypothesis, task generation, and one of parent-owned direct work, one child, one child plus verification, or bounded multi-child work without changing launch behavior.
  **Reason:** The original planner audited capability fit but did not answer the roadmap's core question of whether delegation was justified.
- [x] Audit-only planning does not change the caller-selected agent, tools, transport, workspace, or launch result, but it reports mismatch, overgrant, omission, and unsupported-policy findings through bounded details and inspection.
- [x] Agent catalogs and inspection expose only safe manifest metadata and never expose system prompts, credentials, raw protected paths, or private context.
- [ ] Baseline evaluation measures capability coverage and permission precision before any enforcement default is considered.

**Outcome:** Maintainers can observe whether a launch is appropriately matched and minimally authorized without breaking existing workflows.

### Phase 3: Enforce capabilities and make inability actionable

- [x] Contracted calls can explicitly request capability enforcement, while legacy and uncontracted calls retain audit-only behavior unless a separately approved compatibility change says otherwise.
- [x] Preflight acknowledgement returns a typed accepted or rejected decision before project-agent confirmation, worktree creation, child allocation, provider work, or other side effects.
- [x] **Post-hoc addition:** Every enforceable capability grant is bound to the accepted task generation and `ExecutionPlan` identity, has an explicit lifetime, and is revocable before cancellation signals are delivered.
  **Reason:** Phase 3 otherwise enforces authority before Phase 4 introduces enough version identity to prevent stale grants and late-result races.
- [x] Runtime results distinguish completed, partial, blocked, needs-input, abstained, failed, interrupted, stale, and contract-invalid outcomes with bounded reason codes and actionable recovery metadata.
- [x] Enforceable controls cover actual agent capability, tool allow-lists, cwd and trust policy, resource policy, workspace mode, result-contract support, concurrency, and budgets consistently across subprocess, in-process, RPC, and automatic transport.
- [x] Requested filesystem, network, secret, or credential guarantees fail closed when no real sandbox or policy provider can enforce them, rather than being represented as prompt-only protection.
- [x] Recovery policy retries only classified transient failures, requests exact missing inputs for dependency failures, reroutes capability mismatch, and never blindly replays work whose side effects may already have occurred.
- [x] **Post-hoc addition:** For contracted generation-aware work, cancellation or session replacement rotates the generation, revokes matching grants, classifies later completions as stale, and prevents them from triggering recovery or acceptance while legacy omitted-field behavior remains unchanged.
  **Reason:** Logging cancellation is insufficient when detached or slow workers can settle after their owner has moved on.

**Outcome:** The system can safely refuse, clarify, reroute, or stop unsuitable work without turning every inability into an opaque failure or repeated prompt.

### Phase 4: Introduce a WorkItem and artifact ledger

- [x] A bounded WorkItem model owns workflow identity, task identity, dependencies, assignment, cohesive scope, artifact inputs and outputs, acceptance criteria, state, provenance, and terminal outcome without replacing Pi's agent loop.
- [ ] Existing single, parallel, chain, fan-in, parent-child, and mailbox behavior projects into the ledger before an explicit DAG execution surface is admitted.
- [x] Explicit workflow graphs validate identifiers, dependencies, limits, ownership conflicts, and cycles before any child starts or project-authored agent confirmation appears.
- [x] Artifact versions and dependency generations make missing transfers, superseded inputs, conflicting ownership, and downstream invalidation observable.
- [x] One distinct fresh-context verifier can evaluate a staged structured result, while only the executor can bind an accept, rework, or reject receipt to current task generations, ExecutionPlans, and an unchanged bounded Git-visible tree identity.
- [ ] **Post-hoc clarification:** The pure managed-integration validator rejects stale generation, base commit, dependency or read-set version, accepted-plan identity, scope, patch digest, or missing evidence, but no production workflow path yet gives one integration controller exclusive patch-application authority.
  **Reason:** The current verification gate truthfully controls acceptance over shared-workspace results, while manager-controlled worktree patch application remains a separately scoped implementation.
- [x] **Post-hoc addition:** Cancellation forms a WorkItem subtree operation that rotates affected generations, quarantines late artifacts, preserves their diagnostic provenance, and never treats quarantine as successful completion.
  **Reason:** The deeper research identified cancellation propagation and accepted late results as important unmeasured correctness risks.
- [x] Ledger state is bounded, redacted, branch-aware where applicable, versioned for persistence, recoverable after partial writes, and inspectable without exposing artifact contents by default.

**Outcome:** Delegation becomes a reproducible state machine over tasks and artifacts rather than a collection of loosely related agent transcripts.

### Post-hoc Gate 4A: Qualify minimal delegation admission before Phase 5

**Post-hoc addition (2026-08-10):** This gate and its corresponding [`2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md`](../plans/2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md) were added after the initial five-phase roadmap.

**Reason:** The deeper evidence showed that building adaptive orchestration before comparing it with strong simpler baselines could turn extra models, tokens, or harness differences into a false delegation advantage.

- [ ] An audit-only deterministic admission policy is evaluated on paired repeated repository tasks against parent-owned or equivalent strong single-agent execution, one-child execution, equal-budget best-of-N, naive parallelism, and a fixed two-child architecture with the same model, information, harness, evaluator, token or dollar ceiling, and wall-clock ceiling.
- [x] The first multi-child experiment permits at most two concurrent mutating children and no recursive grandchildren, and it uses one integration owner plus one fresh-context verifier.
- [ ] Outcomes report verified task success, cost, tokens, wall-clock time, unnecessary delegation, handoff coverage, conflicts, stale-result rejection, cancellation latency, leaked work, and accepted late results with paired confidence intervals.
- [x] A recorded **Admit**, **Revise**, or **Defer** decision determines whether Phase 5 may implement adaptive admission and scheduling, while contracts, capability audit, typed outcomes, and fail-closed integration remain useful independently.

**Outcome:** Adaptive orchestration proceeds only if a small falsifiable architecture demonstrates value or a precisely bounded research gap justifies continued experimental work.

### Phase 5: Add adaptive scheduling and semantic isolation

- [x] **Post-hoc admission dependency:** Phase 5 implementation begins only after Gate 4A records **Admit** or a separately approved **Revise** scope.
  **Reason:** The original roadmap postponed matched comparison until the end of adaptive-scheduler implementation.
- [x] A dependency-aware ready queue starts only work whose required artifacts are current and whose effective scopes do not create known write, ownership, or integration conflicts.
- [x] **Post-hoc addition:** The scheduler consumes the admitted audit policy and can recommend parent-owned direct work, one child, one child plus verification, or bounded multi-child work before allocating children.
  **Reason:** Dependency-aware scheduling alone decides when work is ready, not whether spawning subagents is worthwhile.
- [x] **Post-hoc addition:** Multi-child mutation remains capped at the Gate 4A bound and recursive delegation remains disabled until a separate matched evaluation and approval justify expansion.
  **Reason:** Wider teams and recursion would confound the first admission-policy evidence and can reduce success as coordination width grows.
- [x] Configured parallel limits remain hard ceilings, while effective concurrency adapts deterministically to ready work, cohesion, critical path, remaining budget, transport capacity, and workspace safety.
- [x] Semantic resource snapshots bind retained work to bounded identities or hashes for agent definition, role prompt, tool policy, model resolution, protected resources, repository generation, dependency artifacts, and scheduler policy without persisting secrets or full prompts.
- [x] Restore and continuation detect semantic skew and apply an explicit compatible, warn, needs-revalidation, or reject decision before new model work begins.
- [x] Upstream artifact or policy changes invalidate affected downstream work transitively, preserve prior evidence for diagnosis, and never auto-replay side effects.
- [x] Orchestration observability records decision reasons, transfers, acknowledgements, failures, retries, cancellations, invalidations, verification, cost, timing, and cascade radius through bounded safe metadata.
- [ ] Matched evaluations compare the adaptive system with a strong single agent, equal-budget best-of-N, naive parallelism, fixed scheduling, and an orchestrator ablation before any default scheduling change.

**Outcome:** `pi-subagents` uses concurrency and retained context only when the task graph and semantic state justify them, and it can prove when evidence remains current.

## Cross-Cutting Verification Strategy

**Post-hoc simplification (2026-08-10):** Keep strategic evidence invariants here and leave exact commands, test matrices, lifecycle audits, settings procedures, smokes, packaging, and Changeset tasks in each corresponding implementation plan.

**Reason:** The original roadmap duplicated implementation checklists and blurred the boundary between strategic milestones and executable plans.

- Every phase must preserve omitted-field compatibility, bound and sanitize model-facing data, and prove cancellation, replacement, stale-generation, partial-creation, restore, and repeated-cleanup behavior for its changed asynchronous flows.
- Every phase must provide deterministic public-contract evidence and the smallest representative runtime evidence that its owning plan requires, while unavailable live-provider paths remain explicitly unverified rather than replaced with unsupported claims.
- Every default, release, publication, tag, visibility, or workflow-dispatch change remains a separate evidence-backed and explicitly approved decision.

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
| **Post-hoc:** Unnecessary delegation rate | Not measured | Baseline at Gate 4A, then no admitted policy without a task-stratified decision rule | Paired admission benchmark |
| **Post-hoc:** Old-generation results accepted | Not represented | 0 | Cancellation, replacement, restore, and integration race tests |
| **Post-hoc:** Stale integration inputs accepted | Not represented | 0 across generation, base, dependency, plan, scope, digest, and evidence checks | Integration-controller tests |
| **Post-hoc:** Cancellation containment | Not measured | Baseline propagation latency and 0 accepted late results or leaked owned work in deterministic tests | Lifecycle failure-injection matrix |

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
| **Post-hoc:** Admission policy cannot predict delegation value | A router can add cost or reject work without improving verified success | Keep admission audit-only through Gate 4A, compare it with simpler baselines, and defer adaptive execution when paired evidence is absent. |
| **Post-hoc:** Capability grants outlive their task generation | Cancelled or replaced work can retain authority or race a late result into integration | Bind grants to generation and accepted-plan identity, revoke before signalling cancellation, and fail closed at integration. |

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

- **Post-hoc correction (2026-08-10):** The direction remains proposed, and neither a phase nor Gate 4A is admitted for implementation until the user explicitly approves its saved plan.
  **Reason:** The original statement claimed planning approval without an approval record and conflicted with the roadmap's proposed status.
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
- **Post-hoc addition, 2026-08-10 — Add a delegation-admission evidence gate:** Add Gate 4A, keep its router audit-only, constrain the first experiment to two mutating children without grandchildren, and require a recorded admission decision before adaptive scheduling.
  **Reason:** The later AlphaXiv evidence audit found no general matched-budget coding advantage for dynamic subagents and identified strong single-agent, self-consistency, harness-confound, cancellation, and stale-integration counterevidence.
- **Post-hoc addition, 2026-08-10 — Move generation and fail-closed integration earlier:** Carry task generation from the handoff contract through plans and grants, revoke it on cancellation, and reject stale integration inputs in Phase 4.
  **Reason:** The original sequence treated cancellation mainly as an audit concern and deferred semantic rejection until Phase 5, leaving late-result and stale-patch races under-specified.
