# Pi Subagents Panel Workflow Plan

## Goal

Add a first-class blocking panel mode to `@narumitw/pi-subagents` that runs at least two independent reviewer instances over one shared task and snapshot, preserves objections and dissent, and asks one synthesizer to reconcile valid evidence without treating majority vote as truth.

The panel must remain bounded, cancellation-safe, provider-compatible, and compatible with existing single, parallel, chain, fan-in, workflow, detached, consultation, inspection, and settings behavior.

## Context

The existing `subagent` tool can approximate a panel with parallel tasks and an aggregator, but it does not enforce a shared review contract, minimum valid-review count, objection preservation, dissent reporting, or a panel-specific synthesis contract.

The package already owns the required execution primitives through blocking parallel execution, structured results, capability planning, WorkItems, target preflight, output bounds, timeout checkpoints, usage accounting, and rendering.

`packages/pi-subagents/src/execution.ts` is already over 1,000 lines, so panel execution must be added through responsibility-focused modules instead of extending that file with another large branch.

This plan intentionally excludes benchmark work because the requested product priority is tool construction.

The failed research panel exposed five concrete product gaps: reviewer budgets were consumed before finalization, useful evidence existed only in truncated failure payloads, broad semantic stalls were treated like generic timeouts, no synthesis barrier ever formed, and retained children required manual closure.

The design therefore adopts research-backed safeguards rather than claiming benchmark gains: MAST motivates explicit progress and termination controls, Software Delegation Contracts and Proof-or-Stop motivate evidence-bearing completion, OrchestraBench motivates failure-specific recovery instead of blind retries, OrchBench motivates complete transfer artifacts, and CooperBench motivates bounded panels rather than adding agents without coordination controls.

## Architecture

### Public surface

Add an optional top-level `panel` mode to the existing `subagent` tool instead of registering an eighth tool.

Exactly one of `agent` plus `task`, `tasks`, `chain`, `workflow`, or `panel` remains valid per call.

The proposed panel request contains:

- An optional bounded panel id.
- A preset selected with `StringEnum`: `code-review`, `research`, `security-review`, or `custom`.
- One required shared task and one optional bounded shared-context block.
- Two through the configured blocking worker limit reviewer entries.
- One required synthesizer entry.
- A `minValidReviews` value whose default is two and whose maximum cannot exceed the reviewer count.
- Existing per-child model, thinking, timeout, idle, turn, and tool-call controls where they remain semantically valid.

Each reviewer entry contains a stable unique id, agent name, and optional bounded focus instructions.

Reviewer entries do not receive separate tasks or cwd values, so every instance receives the same shared task, shared context, agent scope, canonical target, and repository generation.

The synthesizer receives only validated bounded review envelopes plus explicit failed or invalid reviewer metadata.

The first version runs one review round followed by at most one synthesis turn.

### Phase budgets and progress

Panel preflight divides the total budget into explicit review, evidence-finalization, synthesis, and cleanup reserves before launching any child.

Reviewer execution cannot borrow the synthesis or cleanup reserve, so an overlong reviewer cannot make a valid panel impossible to reconcile or release.

Each reviewer receives a bounded soft evidence deadline before its hard deadline and must publish its latest valid evidence artifact at that boundary even when the requested review remains incomplete.

Semantic progress is measured from accepted artifact revisions, newly supported findings, resolved missing checks, or explicit completion rather than raw assistant turns, tool calls, or output volume.

A reviewer that reaches a configurable internal no-progress threshold is finalized once with its latest evidence and classified as `semantic-stall` instead of being blindly retried.

The first version may retry only explicitly transient launch, transport, or tool-provider failures within the reviewer allocation, and it never retries invalid contracts, exhausted budgets, semantic stalls, permission failures, or deterministic task errors.

### Incremental evidence artifacts

Add a bounded executor-owned evidence ledger keyed by panel id, reviewer id, task generation, and monotonically increasing artifact revision.

A reviewer artifact records claims, source or repository evidence, checks performed, unresolved objections, limitations, and completion state without requiring a polished final narrative.

The executor validates and stores only the newest valid revision, stamps provenance, rejects stale generations, and exposes artifact status through the existing WorkItem and inspection surfaces.

Artifacts are durable for the blocking call and bounded diagnostic result, but panel v1 does not create a new cross-session memory store or persist unrestricted research bodies.

Synthesis consumes validated final artifacts rather than raw transcripts or ad hoc failure payloads.

### Contracts

Add `pi-subagents:panel-review:v1` and `pi-subagents:panel-synthesis:v1` contracts in a focused `panel-contract.ts` module.

A review envelope records reviewer id, disposition, blocking status, severity-ranked findings, evidence, missing checks, limitations, and provenance.

A synthesis envelope records the valid and failed reviewer ids, agreements, disagreements, every original blocking objection and its resolution state, evidence for any resolution, residual limitations, and final disposition.

The executor validates identifiers and bounds, stamps actual agent/model/task-generation provenance, and rejects synthesizer attempts to invent reviewers or silently omit objections.

Corroboration means multiple independent reports agree; it must not be labelled verified unless the synthesis includes concrete verification evidence.

A vote count never clears a correctness, safety, security, or explicit-requirement objection.

### Execution and isolation

Preflight resolves every reviewer and synthesizer, target, scope, trust decision, budget, and capability plan before starting any child.

Reviewer instances run independently and never receive sibling outputs.

Reviewers whose effective tool surface is proven read-only may share the canonical target.

Conservatively write-capable reviewers run in separate disposable Git worktrees created from the same clean base snapshot.

A panel with write-capable reviewers fails before any launch when safe worktree isolation cannot be prepared.

Worktrees isolate repository writes but are not presented as process, network, credential, secret, or filesystem sandboxes.

The synthesizer starts only after all reviewer instances settle and the minimum valid-review threshold is met.

If fewer than `minValidReviews` valid envelopes remain, synthesis does not start, the tool returns a structured `insufficient-panel` error with every validated partial artifact and failure classification, and no consensus claim is produced.

If the threshold is met, failed reviewers and their latest valid partial artifacts remain visible and synthesis proceeds with the surviving complete envelopes.

A panel call owns one explicit child group containing reviewers, synthesizer, timers, generations, transports, and disposable worktrees.

Normal completion, degraded completion, insufficient evidence, cancellation, orchestration timeout, session replacement, shutdown, and initialization failure all close that group child-first through one idempotent cleanup path.

Late results are rejected by generation and group state, and blocking panel children are never retained for follow-up after the parent call settles.

### Result and presentation

Extend blocking details with panel metadata rather than flattening panel output into ordinary fan-in text.

The collapsed row shows preset, completed and valid reviewer counts, synthesis state, final disposition, blocking-objection count, and dissent count.

The expanded row shows the shared task preview, reviewer identities, actual models, individual dispositions, failures, objections, disagreements, synthesis evidence, usage, and limitations.

All model-facing and terminal-facing fields use the package's existing UTF-8, line, byte, private-text, path, and terminal-control boundaries.

JSON, print, and RPC observers receive the same bounded tool result and details without ad hoc output.

## Non-Goals

- Run live benchmarks or decide whether panels outperform single agents.
- Add learned routing, task-keyword routing, recursive reviewer teams, or more than one review round.
- Implement automatic fixes, patch application, commits, pushes, or review-fix loops.
- Treat agreement, model confidence, or reviewer count as proof.
- Add panel settings, a panel manager screen, or another registered tool.
- Promise operating-system, network, secret, credential, or process isolation.
- Change the default delegation workflow or detached-agent lifecycle.

## Assumptions

- A generic panel may use independent instances of the same agent and model unless the caller deliberately selects different agent definitions.
- Two valid reviews are the smallest panel that can expose agreement or disagreement.
- Existing blocking concurrency and configured worker limits remain authoritative ceilings.
- Existing agent scope and project-agent confirmation rules apply once per panel call and cannot be bypassed by reviewer entries.
- A minor package release is appropriate because the new mode is additive public behavior.

## Risks

- A larger `subagent` schema may increase prompt cost or reduce provider tool-call reliability.
- Dedicated compact schemas, strict bounds, and provider compatibility tests mitigate that risk.
- A synthesizer may erase dissent, fabricate consensus, or resolve objections without evidence.
- Executor-owned reconciliation and immutable preservation of reviewer objections mitigate that risk.
- Write-capable reviewers may modify shared state despite review instructions.
- Conservative classification and isolated disposable worktrees prevent concurrent canonical-repository writes.
- Partial failures may be mistaken for consensus.
- The minimum-valid threshold, failed-reviewer list, preserved evidence artifacts, and `insufficient-panel` outcome keep the degraded state explicit.
- Reviewers may exhaust the total budget before synthesis or cleanup can run.
- Executor-owned phase reserves and non-borrowable synthesis and cleanup allocations guarantee bounded finalization.
- Turn or tool-call activity may conceal semantic stagnation.
- Artifact-based progress revisions and explicit failure classes stop unproductive work without treating all failures as retryable.
- Incremental artifacts may leak private text or grow without bound.
- Existing redaction, provenance, generation, byte, line, and result-retention limits apply before any artifact enters the ledger or synthesis input.
- Panel execution may duplicate existing parallel and workflow logic.
- A panel planner and executor adapter must reuse existing runners, budgets, targets, ledgers, and cleanup owners rather than create a second orchestration runtime.
- `execution.ts` refactoring may regress established modes.
- Characterization tests and behavior-preserving extraction must precede panel integration.

## Rollback / Recovery

Omitting `panel` preserves every existing payload and execution path.

The implementation must keep panel-specific parsing, contracts, execution, and rendering in removable modules with a small dispatch seam.

An invalid or partially created panel performs idempotent child and worktree cleanup and retains bounded diagnostic evidence.

Rollback removes the panel schema and dispatch while leaving persisted legacy workflow and detached records readable because panel v1 adds no settings or retained-agent state format.

Graceful parent cancellation, session replacement, and session shutdown are lifecycle-tested and await panel cleanup.

An externally forced host-process termination did not dispatch Pi lifecycle cleanup during the local smoke, so the README records the unavoidable manual `git worktree` recovery path for that unsupported condition.

## Applicable Conventions and Verification

- Tool schemas must use provider-compatible `StringEnum`, reject mixed modes and unknown fields, throw observable failures, honor cancellation, and bound output.
  Verification is focused schema, execution, provider-shape, cancellation, and truncation tests.
- Session-owned processes, timers, generations, and worktrees must be released on abort, timeout, replacement, shutdown, partial initialization, and repeated cleanup.
  Verification is lifecycle and failure-injection tests plus semantic review after every asynchronous boundary.
- Tool rendering must sanitize terminal input, respect supplied width, preserve compact and expanded states, and remain safe in non-TUI modes.
  Verification is rendering tests at narrow widths and JSON/RPC-compatible execution tests.
- Public package behavior requires README updates and a package-specific minor Changeset.
  Verification is Changesets review and `just pack subagents` tarball inspection.
- No settings are added or changed, so `pi-subagents.json`, settings precedence, persistence, and manager screens remain untouched.
- The final implementation must run the repository CI-equivalent gate and a representative local Pi smoke.

## Completion Evidence

- TDD red state: focused panel tests initially failed because the panel modules and mode did not exist.
- Focused package verification: all 39 `pi-subagents` test files passed with 332 tests.
- Repository verification: the final `npm run check` gate passed 258 test files and 2,807 tests together with Biome, boundaries, builds, and all workspace typechecks.
- Package verification: `just pack subagents` included all panel modules, README, manifest, and license in the dry-run tarball.
- Live Pi verification: `pi --no-extensions -e ./packages/pi-subagents` produced completed, degraded, and `insufficient-panel` outcomes with cleanup complete.
- Lifecycle verification: deterministic parent-abort and `session_shutdown` tests cancel active subprocesses and remove owned worktrees.
- Unsupported environment path: an externally forced host-process termination did not dispatch graceful Pi lifecycle cleanup, so the README documents manual generated-worktree recovery.
- Semantic audit: the change adds no settings, preserves all seven registered tools, constrains shared reviewers and synthesis to read-only effective tools, isolates write-capable reviewers in clean-base worktrees, redacts panel artifacts and rendering, and persists metadata without raw review bodies.

## Plan

- [x] Record characterization tests for current single, parallel, fan-in, chain, and workflow mode selection, target preflight, result ordering, partial failure, cancellation, timeout, and rendering; verify the focused suite passes before refactoring.
- [x] Specify the exact bounded `panel` TypeBox schema, defaults, mode exclusivity, reviewer-count limits, unique-id rules, shared-context limit, and provider-compatible enums in a package-local design comment or contract test; verify invalid mixed and oversized payloads fail before discovery or launch.
- [x] Define `pi-subagents:panel-review:v1` and `pi-subagents:panel-synthesis:v1` types and parsers in `src/panel-contract.ts`; verify malformed, unknown-field, duplicate-finding, oversized, private-text, terminal-control, fabricated-id, and omitted-objection cases fail or sanitize deterministically.
- [x] Add preset-owned prompt builders in `src/panel-prompts.ts` that keep one byte-identical shared task and context block across reviewers while appending only the reviewer id and bounded focus; verify reviewers never receive sibling identities, outputs, or focus instructions.
- [x] Define executor-owned panel reconciliation in `src/panel-reconciliation.ts`; verify it preserves every blocking objection and dissent item, distinguishes corroborated from verified claims, rejects fabricated reviewer ids, and produces `insufficient-panel` with bounded partial artifacts below the valid-review threshold.
- [x] Define deterministic panel failure classes for transient launch or transport errors, invalid contracts, semantic stalls, permission failures, exhausted budgets, cancellations, and deterministic task failures; verify only explicitly transient classes are retryable and every class appears in details and diagnostics.
- [x] Add phase-budget planning to `src/panel-planning.ts` with non-borrowable evidence-finalization, synthesis, and cleanup reserves; verify invalid or unsatisfiable allocations fail before launch and no reviewer can consume a reserved phase budget.
- [x] Add a bounded generation-aware evidence ledger in a focused `src/panel-evidence.ts` module; verify monotonically revised reviewer artifacts survive timeout or stall, reject stale or fabricated provenance, redact private text, remain within line and byte limits, and become the only review content accepted by synthesis.
- [x] Add artifact-based semantic-progress accounting and one bounded soft-finalization request before each reviewer hard deadline; verify repeated turns, repeated tools, duplicate claims, and larger prose do not reset progress while new supported evidence does.
- [x] Characterize effective tool classification, target trust, clean-Git worktree creation, and cleanup for every built-in and custom-agent path used by panels; record unsupported isolation guarantees without widening existing authority.
- [x] Implement panel preflight in `src/panel-planning.ts` by reusing agent discovery, capability planning, target policy, budget resolution, configured parallel limits, and project-agent confirmation inputs; verify all reviewers and the synthesizer are validated before any confirmation, worktree, child, or provider side effect.
- [x] Extend `WorkspaceManager` with bounded blocking-panel ownership or a focused adapter that creates one worktree per conservatively write-capable reviewer from the same clean base; verify partial creation rollback, symlink/canonical-path handling, dirty-repository rejection, repeated cleanup, cancellation, replacement, and shutdown.
- [x] Extract the blocking mode dispatch or parallel execution responsibility from `src/execution.ts` into a descriptively named module before adding panel logic; verify the file-size rule is satisfied or document a concrete cohesion reason for any remaining file over 1,000 lines.
- [x] Implement `src/panel-execution.ts` as review, evidence-finalization, conditional synthesis, and cleanup phases using existing runners, status updates, deadlines, timeout checkpoints, usage accounting, generation revocation, and result bounds; verify reserved synthesis runs only after the barrier and never after abort, total timeout, or insufficient valid reviews.
- [x] Introduce an executor-owned blocking panel child group that registers reviewers, synthesizer, timers, transports, generations, and worktrees under one lifecycle owner; verify every terminal path closes children child-first, blocks follow-up retention, and rejects late settlements.
- [x] Project panel reviewers and synthesis into the existing WorkItem ledger with deterministic ids, dependencies, generations, provenance, and terminal states; verify inspection and workflow persistence expose metadata without persisting raw review bodies or creating a second lifecycle owner.
- [x] Extend `SubagentDetails` and orchestration metrics with panel-specific valid, failed, blocking-objection, dissent, and synthesis state fields; verify partial evidence and usage survive reviewer or synthesizer failure without being presented as success.
- [x] Add compact and expanded panel rendering in focused rendering helpers; verify preset, counts, disposition, objections, dissent, failures, actual models, usage, limitations, terminal sanitization, and widths from narrow supported layouts through ordinary terminal widths.
- [x] Update `subagent` description, prompt snippet, and guidelines to explain when panel mode is justified, that it is blocking, that two independent instances are required, that agreement is not proof, and that simple or latency-sensitive work should not use a panel; verify the catalog refresh path preserves the guidance.
- [x] Add integration tests for same-agent independent instances, mixed agents/models, project scope and confirmation, untrusted targets, read-only shared execution, write-capable worktree isolation, configured parallel ceilings, minimum valid reviews, one failed reviewer, invalid contracts, unresolved blockers, synthesizer failure, and deterministic result ordering.
- [x] Add lifecycle failure-injection tests for parent abort, total timeout, reviewer soft finalization, semantic stall, synthesis timeout, session replacement, shutdown, late settlement, partial worktree creation, cleanup failure, and repeated cleanup; verify no stale generation enters synthesis and no owned child, timer, transport, or worktree remains active.
- [x] Add recovery-policy tests that inject transient transport, deterministic task, invalid-contract, permission, and no-progress failures; verify bounded transient retry behavior, zero blind semantic retries, stable failure classification, and preservation of the newest valid evidence artifact.
- [x] Add provider-schema and output-bound tests for Google-compatible enums, maximum reviewer count, bounded shared context, bounded fan-in payload, 50 KiB or 2,000-line result limits, and raw-output fallback diagnostics without accepting invalid panel contracts.
- [x] Update `packages/pi-subagents/README.md` with the panel request shape, presets, lifecycle, partial-failure semantics, objection and dissent rules, isolation limits, examples, compatibility notes, and package layout.
- [x] Add a minor Changeset for `@narumitw/pi-subagents` describing the additive first-class panel mode without claiming quality improvements or benchmark evidence.
- [x] Audit the complete diff against `docs/extension-conventions.md`, including tool failure semantics, cancellation, resource disposal, terminal safety, non-TUI behavior, package boundaries, documentation, and verification; record every deviation or unverified path.
- [x] Run focused panel tests, all `packages/pi-subagents` tests, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; inspect the tarball and record exact command evidence.
- [x] Run a local `pi -e ./packages/pi-subagents` smoke with one successful two-reviewer panel, one degraded panel that still meets the threshold, one insufficient panel, and one cancellation; record unsupported provider or environment paths without substituting simulations.

## Completion Checklist

- [x] `subagent` accepts exactly one bounded panel mode without registering another tool or changing omitted-field behavior.
- [x] Every reviewer receives the same shared task, context, target snapshot, and scope while remaining isolated from sibling outputs.
- [x] At least two valid independent review envelopes are required before synthesis.
- [x] Review, evidence-finalization, synthesis, and cleanup have explicit allocations, and reviewers cannot consume the synthesis or cleanup reserve.
- [x] Every reviewer can publish bounded provenance-stamped evidence incrementally, and the newest valid artifact remains available after timeout, stall, or failure.
- [x] Semantic progress depends on accepted evidence revisions rather than activity volume, and only explicitly transient failures receive bounded retries.
- [x] Failed or invalid reviewers remain visible and can never be counted as valid consensus participants.
- [x] Every original blocking objection and disagreement survives synthesis unless a bounded evidence-backed resolution remains attached to it.
- [x] Majority vote, model confidence, and reviewer count are never presented as verification.
- [x] Write-capable reviewers cannot concurrently mutate the canonical repository, and worktree isolation is not misrepresented as an OS sandbox.
- [x] Cancellation, timeout, replacement, shutdown, partial initialization, late settlement, and repeated cleanup close the panel-owned child group, release all owned work, and reject stale generations.
- [x] An insufficient panel returns structured partial evidence and failure classes while making no synthesis, consensus, success, or verification claim.
- [x] Compact and expanded rendering remains width-safe, sanitized, and informative in success, degraded, insufficient, failed, cancelled, and running states.
- [x] JSON, print, RPC, and TUI paths preserve the same bounded model-facing result semantics without ad hoc protocol output.
- [x] Existing single, parallel, fan-in, chain, workflow, detached, inspection, consultation, command, and settings tests retain their established behavior.
- [x] README, package layout, compatibility notes, and the minor Changeset accurately describe the implemented public surface and limitations.
- [x] Required focused tests, repository checks, package inspection, semantic audits, and representative Pi smokes pass with evidence and no publication.
