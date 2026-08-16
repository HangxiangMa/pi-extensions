# @narumitw/pi-subagents

## 1.0.2

### Patch Changes

- df627e4: Reduce idle startup import work by lazily loading heavier subagent runtime modules.

## 1.0.1

### Patch Changes

- 5a14026: Reduce idle Pi startup imports by loading Subagents execution and selected transport implementations, plus Workflow manager and fresh-session handoff code, only when their registered routes first need them.

## 1.0.0

### Major Changes

- e4b96b3: Persist detached completion outbox records with stable completion, run, and generation identities, retry transient terminal writes before resolving, and acknowledge only IDs observed in parent context so unacknowledged results can be redelivered without rerunning child work.

  Move retained-run listing exclusively to `subagent_inspect` and remove the compatibility `list` action from `subagent_manage`.

## 0.54.0

### Minor Changes

- 1c117e4: Add an explicit verified-execution workflow contract with executor-owned deterministic checks, exact-state receipts, managed integration acceptance, and one bounded rework cycle.

## 0.53.0

### Minor Changes

- ae0677d: Add explicit bounded autonomous workflow planning with deterministic compilation, verified mutating execution, and generation-safe graph revisions.

### Patch Changes

- Updated dependencies [4a0358b]
- Updated dependencies [93b507b]
  - @narumitw/pi-tui-kit@0.53.0

## 0.52.0

### Minor Changes

- 9cb747f: Gate verification-required explicit workflow results on one distinct fresh-context verifier, an unchanged bounded Git-visible tree identity, and an executor-owned accept, rework, or reject receipt instead of trusting implementation-worker self-checks.

## 0.51.0

### Minor Changes

- 4d50d23: Add capability manifests, executor-owned execution plans, structured v2 outcomes, explicit dependency workflows with artifact provenance and adaptive scheduling, bounded retry and hedging policies, semantic continuation snapshots, and actionable retained lifecycle states.
- 0045392: Add a first-class blocking panel mode with independent reviewer contracts, bounded evidence artifacts, reserved synthesis and cleanup budgets, objection-preserving synthesis, failure-specific recovery, WorkItem inspection metadata, and disposable worktree isolation for write-capable reviewers.
- af98607: Add persistent RPC and automatic detached transports, execution profiles and per-agent defaults, main-agent-selected per-turn and whole-workflow execution budgets, deterministic timeout checkpoints with abort-then-summary recovery, bounded runtime telemetry, spawn idempotency, context preview, and opt-in structured completion metadata.

## 0.50.0

### Minor Changes

- c47a4cc: Add interactive detached-agent capacity, concurrency, depth, child, and persistence limit settings.
- d1e4ca7: Add a user-configurable maximum for blocking parallel subagent workers.
