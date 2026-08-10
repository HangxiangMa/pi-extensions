# Pi Subagents Workflow Verification Acceptance Gate Plan

## Goal

Make explicit `pi-subagents` workflows treat implementation-worker verification as an untrusted claim and accept verification-required work only after a distinct fresh-context verifier evaluates one exact repository state.

Persist an executor-owned verification receipt and keep downstream work blocked until the verifier accepts the producer result.

Preserve existing behavior for workflows that do not request independent verification and do not claim canonical patch integration while mutating workers still operate in the shared workspace.

## Context

The research in `docs/research/2026-08-10-coding-agent-subagents-architecture-deep-dive.md` supports fresh-context verification against the exact integrated state and rejects worker self-report as sufficient completion evidence.

The current workflow preflight requires a distinct dependent verifier for selected risk classes through `packages/pi-subagents/src/verification-policy.ts` and `packages/pi-subagents/src/execution.ts`.

The current settlement path nevertheless marks artifacts and WorkItems verified when the implementation worker's own `structured-v2.verification` array contains a passing item.

`WorkItemLedger.acceptIntegration()` validates a managed-integration candidate in isolation, but the production workflow execution path does not call it and does not own patch application.

The current repository-generation helper hashes Git status metadata rather than dirty file contents, so it cannot by itself prove that two dirty snapshots contain the same bytes.

The saved admission decision remains **Revise**, so this change must stay inside caller-selected explicit workflows and must not enable automatic routing, wider mutation, or recursion.

## Architecture

### Acceptance ownership

The executor, not either model, owns the verification state transition.

A producer that requires independent verification will stage its successful result as `awaiting-verification` instead of becoming `completed`.

Only its declared `verifierFor` task may consume that staged result before producer acceptance.

Ordinary dependent tasks remain blocked until the producer becomes `completed`.

The verifier task must be a different agent, depend directly on the producer, request `structured-v2`, and run in a fresh subprocess context.

### Verifier verdict protocol

Reuse `pi-subagents:result:v2` rather than adding another public result format.

The verifier prompt will require one exact decision encoding:

- `accept`: `status: "completed"`, `reasonCode: "verification-accepted"`, at least one passed verification item, no failed verification item, and no unresolved dependency.
- `rework`: `status: "partial"` or `"needs-input"`, with `reasonCode: "verification-rework"` and concrete limitations or unresolved dependencies.
- `reject`: `status: "failed"` or `"abstained"`, with `reasonCode: "verification-rejected"` and evidence explaining the blocker.

Malformed, contradictory, stale, or incomplete verifier output is `contract-invalid` and cannot accept the producer.

The executor will convert the valid result into a bounded `WorkflowVerificationReceipt` containing the decision, producer and verifier task IDs, both task generations, both accepted ExecutionPlan IDs, the verified tree identity, evidence summaries, timestamps, and truncation state.

Model output cannot provide or override executor-owned identities.

### Exact-tree verification

Add a workflow-specific tree-identity helper rather than silently strengthening retained semantic-snapshot behavior in the same change.

For a clean Git tree, the identity is the exact commit.

For a dirty Git tree, the identity hashes separately framed bounded staged and unstaged binary diffs plus length-framed untracked-file paths and bytes.

An oversized, non-Git, unreadable, or otherwise unsupported tree identity fails closed for exact-tree acceptance.

Capture the identity after the producer settles, immediately before verifier launch, and after verifier settlement.

All three identities must match.

A verification task must run alone relative to mutating tasks targeting the same canonical cwd so another worker cannot change the inspected tree during verification.

The post-verifier identity check detects verifier or external repository mutation and rejects acceptance.

This is repository-state integrity, not an operating-system sandbox, and it does not constrain network, process, credential, or external side effects.

### WorkItem transitions

Extend the workflow state machine with `awaiting-verification`.

A successful verification-required producer transitions from `running` to `awaiting-verification` and records unverified artifacts, its accepted ExecutionPlan ID, and staged tree identity.

An accepted verifier receipt transitions both the target producer and verifier task to `completed`, marks only executor-accepted artifacts verified, and releases ordinary downstream dependencies.

A rework verdict leaves no accepted result, records a bounded rework outcome, and stops the current workflow without automatically replaying potentially side-effecting work.

A reject or invalid verdict fails or invalidates the producer and transitively invalidates its downstream dependents while preserving staged evidence.

Cancellation, session replacement, or generation mismatch invalidates the staged result and makes every later verifier result stale.

### Integration boundary

This plan gates workflow acceptance but does not make the current shared-workspace mutation path into a manager-controlled patch integration engine.

`WorkItemLedger.acceptIntegration()` remains reserved for a later managed-worktree integration plan that can provide base, read-set, patch-digest, scope, and application evidence truthfully.

Documentation and result details must not describe a verifier acceptance as proof that the integration controller exclusively applied repository changes.

## Non-Goals

- Do not add mutating-task worktrees, patch extraction, patch application, automatic rebasing, or merge-conflict resolution.
- Do not enable verifier-driven automatic rework or replay a write-capable producer.
- Do not change legacy single, parallel, chain, fan-in, panel, detached, or unverified workflow behavior.
- Do not enable admission-selected execution by default, increase mutating concurrency above two, or permit workflow grandchildren.
- Do not treat a verifier model's confidence, agreement, or prose as proof without a valid executor-bound receipt.
- Do not claim filesystem, process, network, secret, credential, or external-effect sandboxing.
- Do not add a new user setting or another model-facing tool.
- Do not publish, tag, change npm visibility, or dispatch a release workflow.

## Assumptions

- Explicit workflow execution continues to use fresh `--no-session` subprocess workers in this scope.
- Verification-required workflow tasks are opt-in through existing contract admission metadata, security capability requirements, or mutating integration-owner policy.
- A distinct verifier agent and exact repository identity provide useful independent evidence even when producer and verifier use the same model family.
- Existing `structured-v2` bounds are sufficient for the model-authored portion of a verifier verdict.
- The executor may conservatively reject exact-tree verification when a truthful bounded identity cannot be produced.

## Unknowns

- Provider compliance with the exact verdict reason codes has not been measured in a live-provider matrix.
- The dirty-tree bound is resolved at 1 MiB with at most 256 non-ignored untracked files; larger or unsupported identities fail closed.
- Rework projects as `blocked` with explicit `replan` and `verify` recovery actions and no automatic retry.
- A same-model fresh verifier may share blind spots with the producer, and model diversity remains an unevaluated future benchmark variable.

## Risks

- Adding `awaiting-verification` can break persistence restore, readiness calculation, terminal-state assumptions, or workflow result ordering.
- A verifier barrier can increase wall-clock latency and reduce otherwise safe parallelism.
- Hashing dirty trees can be expensive or expose repository contents if bytes or diagnostics are not bounded and digests are not kept opaque.
- Existing callers may declare verifier relationships without requesting `structured-v2`, so the new preflight must fail before any child starts with an actionable error.
- A verifier can run arbitrary allowed tools before the final tree check, so unchanged repository bytes do not prove absence of external side effects.
- Treating every verifier rejection as worker failure would lose useful evidence, so execution success and target acceptance must remain separate concepts.

## Rollback / Recovery

- Keep the gate conditional on existing explicit verification requirements so omission preserves current workflow behavior.
- Store verification receipts and the new WorkItem state as additive versioned data with safe restore handling for older records.
- Restore an interrupted `awaiting-verification` record inertly and require a new explicitly requested workflow instead of resuming prior side effects.
- If provider verdict compliance is inadequate, retain the executor-owned staged state and disable acceptance rather than falling back to worker self-verification.
- Revert the acceptance gate and its Changeset together if compatibility cannot be preserved; do not migrate or delete existing agent state destructively.

## Plan

- [x] Install or restore repository dependencies with `npm install`, confirm the lockfile has no unintended change, and run the current focused workflow, ledger, persistence, result-contract, semantic-snapshot, and verification-policy tests to record a behavioral baseline. Evidence: `npm install` added local dependencies without changing the lockfile, and the seven-file focused baseline passed 37 tests.
- [x] Add characterization tests proving the current implementation worker can self-mark artifacts and its WorkItem verified, proving `acceptIntegration()` has no production caller, and recording existing verifier preflight, workflow ordering, persistence, inspection, and result-rendering behavior before changing it.
- [x] Define `WorkflowVerificationReceipt`, the exact `accept | rework | reject` mapping over `structured-v2`, byte and list bounds, executor-owned provenance fields, and safe projection rules in a focused `packages/pi-subagents/src/workflow-verification.ts`; verify parser tests reject malformed, contradictory, oversized, private, stale, and forged receipts.
- [x] Extend workflow preflight to require a distinct direct-dependent verifier with `resultFormat: "structured-v2"`, a current target generation, and no recursive workflow context; verify invalid verification graphs launch zero children and request no project-agent confirmation.
- [x] Change default integration-owner selection in `packages/pi-subagents/src/workflow-planning.ts` so an automatically selected owner is the final non-verifier task, or fail preflight when ownership is ambiguous; verify verifier tasks never silently become canonical integration owners.
- [x] Add `awaiting-verification` and executor-owned staged-result and receipt fields to `packages/pi-subagents/src/work-item-ledger.ts`; verify legal transitions, verifier-only readiness, ordinary-dependent blocking, terminal immutability, generation rotation, transitive invalidation, bounded snapshots, and copy isolation.
- [x] Add versioned persistence support for the new state and receipt in `packages/pi-subagents/src/work-item-persistence.ts`; verify old snapshots restore, new snapshots round-trip, malformed receipts are rejected or quarantined, interrupted staged work restores inertly, and no raw verifier output or repository bytes are persisted.
- [x] Implement a bounded workflow tree-identity helper that hashes clean commits or dirty tracked and untracked bytes without returning repository content; verify clean, staged, unstaged, untracked, same-path-different-content, symlink, oversized, non-Git, unreadable, cancellation, and command-failure cases.
- [x] Add a verification scheduling barrier to `packages/pi-subagents/src/adaptive-scheduler.ts` and workflow execution so a verifier runs alone relative to mutating tasks on the same cwd; verify independent read-only work remains schedulable only when it cannot alter the verified tree identity.
- [x] Refactor workflow settlement in `packages/pi-subagents/src/execution.ts` so a verification-required producer stages unverified artifacts instead of calling ordinary completion, and prove a producer's own passing verification array never sets `verified` or `verificationAccepted`.
- [x] Build the verifier prompt from the staged structured result, acceptance criteria, required evidence, exact tree identity, and executor-stamped target metadata while excluding sibling reasoning, unrelated dependency output, credentials, private text, and unbounded repository content; verify deterministic prompt bounds and source attribution.
- [x] Wire verifier settlement into workflow execution so pre-launch, post-producer, and post-verifier identities plus task generations and ExecutionPlan IDs must match before the executor records an acceptance receipt; verify stale, cancelled, replaced, mutated, malformed, rework, reject, timeout, crash, and late-result paths cannot release downstream work.
- [x] Preserve verifier execution success separately from target acceptance in workflow results, details, metrics, inspection, and persisted ledger projections; verify a valid reject receipt remains inspectable evidence while the overall workflow correctly reports failure.
- [x] Update orchestration metrics to distinguish worker-reported verification, executor-accepted verification, rework, rejection, invalid receipt, and exact-tree mismatch; verify metrics never count a self-reported pass as accepted evidence.
- [x] Add cancellation and lifecycle tests covering abort before staging, abort while staged, abort during verifier launch, abort after prompt acceptance, session replacement, shutdown, repeated cleanup, late verifier settlement, and persistence failure; verify generations rotate before signalling and every owned process, timer, listener, status, and temporary identity artifact is released.
- [x] Update `packages/pi-subagents/README.md` and the delegation roadmap implementation record to document the acceptance gate, verifier verdict protocol, exact-tree bounds, shared-workspace limitation, no-auto-rework rule, restore behavior, and the difference between worker claims, verifier verdicts, and executor acceptance.
- [x] Add an appropriate minor Changeset for the opt-in published workflow behavior without changing defaults, publishing, tagging, visibility, or release workflows.
- [x] Run `npx vitest run` for all affected `pi-subagents` tests, then run `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; inspect the tarball and record any unavailable live-provider verification without replacing it with a deterministic-test claim.
- [x] Run a bounded local Pi smoke for one accepted verifier, one rework verdict, one reject verdict, one tree-mutation rejection, and one cancellation-late-result case when practical; record exact commands and distinguish deterministic fake-provider evidence from any live-provider evidence.
- [x] Audit the final diff against `docs/extension-conventions.md`, package instructions, cancellation and session-generation rules, terminal and private-text boundaries, persistence ordering, output bounds, and the touched-area checklist; record every deviation or unverified path in this plan.

## Execution Evidence

- Focused characterization and TDD evidence: the pre-change seven-file baseline passed 37 tests, red tests then exercised forged receipts, private and oversized evidence, graph rejection, owner selection, staged readiness, persistence, exact-tree mutation, scheduler isolation, and executor acceptance before their production paths were completed.
- Acceptance-path evidence: `npx vitest run packages/pi-subagents/test/subagents.test.ts -t 'workflow verification'` covers accept, rework, reject, verifier tree mutation, verifier crash, verifier timeout, cancellation after verifier readiness, killed late settlement, and private-result exclusion with a deterministic fake Pi subprocess.
- Broader package evidence: `npx vitest run packages/pi-subagents/test` passed 42 files and 353 tests before final audit changes; the final CI-equivalent root gate below reruns the complete package and repository suites.
- Repository evidence: `npm test` passed 267 files and 2,876 tests; the first `npm run check` hit an unrelated 1Password signing-agent failure in a Git-fixture commit, then `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false npm run check` passed Biome, boundaries, all workspace typechecks, and all 2,876 tests using the repository-documented command-scoped recovery.
- Package evidence: `just pack subagents` included `workflow-verification.ts`, `workflow-tree-identity.ts`, the updated README, and the existing extension entrypoint in the dry-run tarball; an initial mistaken `just pack pi-subagents` invocation failed because that recipe already prefixes `pi-`.
- Runtime evidence: `pi --no-extensions -e ./packages/pi-subagents/src/index.ts --list-models` loaded the extension and exited successfully; live-provider verdict compliance remains unmeasured and is not claimed by the deterministic fake-provider tests.
- Convention audit: `docs/extension-conventions.md` and `docs/extension-settings.md` were read completely before editing; no command, menu, custom TUI, setting, status, or manifest behavior changed, and settings ordering is therefore not touched.
- Lifecycle audit: the blocking tool signal remains the single cancellation owner; generation rotation precedes late-result handling, the verifier subprocess receives the same abort signal, final persistence runs in `finally`, status clears in `finally`, and deterministic cancellation verifies that the late child marker is never written.
- Persistence and privacy audit: receipts contain only bounded redacted summaries and opaque digests, Git bytes never enter persistence or model-facing details, v1 ledgers restore into v2 with legacy self-reported verification trust cleared, `awaiting-verification` restores as inert `interrupted`, malformed cross-item receipt links fail closed, and atomic mode-0600 publication remains unchanged.
- Terminal and prompt audit: private tags are redacted before verifier transfer and receipt storage, receipt evidence has aggregate byte bounds, exact identity diagnostics do not echo paths or bytes, and workflow result content remains a bounded summary.
- Scope deviations and residuals: Git identity intentionally covers Git-visible tracked and non-ignored untracked state, rejects submodules, and does not cover ignored files, external side effects, or a transient repository mutation that is reverted before the post-verifier capture; manager-controlled patch application, live-provider quality, and model-diversity measurement remain deferred non-goals.
- File-size deviation: `execution.ts` remains over 1,000 lines under its existing explicit cohesion justification because all blocking-mode preflight, confirmation, cancellation generation, launch, and settlement retain one ordered lifecycle owner; the new receipt and tree-identity responsibilities were split into focused modules.
- Independent review evidence: three bounded reviewer attempts timed out or hit their tool budget without establishing a blocker; one partial review identified the generic `verificationAccepted` completion input as a potential bypass, so that input and its panel call-site values were removed before final verification.
- Release audit: only `.changeset/calm-verifiers-accept.md` was added; no publish, tag, npm visibility, release workflow, manifest, or version mutation occurred.

## Completion Checklist

- [x] A verification-required producer cannot become accepted or release ordinary downstream work from its own `verification: passed` claim.
- [x] Every accepted producer has one valid executor-owned receipt from its declared distinct verifier, current task generations, accepted ExecutionPlan IDs, and one unchanged exact tree identity.
- [x] Accept, rework, reject, contract-invalid, stale, interrupted, and tree-mismatch outcomes remain distinct and preserve bounded evidence.
- [x] Verifier execution success is not confused with producer acceptance, and rejected work cannot appear in the workflow success count.
- [x] Verification runs in a fresh context and is serialized against mutating work on the same canonical cwd.
- [x] Dirty-tree identities distinguish same-path content changes and fail closed when truthful bounded identity is unavailable.
- [x] Cancellation and session replacement rotate generations before signalling work, and zero late producer or verifier results enter acceptance.
- [x] Staged and receipt persistence is bounded, private-text-safe, backward compatible, and inert after interrupted restore.
- [x] Existing omitted-verification workflows and all unrelated execution modes preserve their established behavior.
- [x] Documentation states that this gate does not provide manager-controlled patch application or an operating-system sandbox.
- [x] Focused tests, repository tests, CI-equivalent checks, diff checks, package inspection, applicable smokes, semantic audits, and the Changeset all pass with evidence recorded.
- [x] No package publication, tag, npm visibility change, or release workflow occurs without separate explicit approval.
