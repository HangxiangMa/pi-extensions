# Pi Workflow Engine Roadmap

- **Status:** Proposed strategic direction; not an implementation or release commitment
- **Audience:** Pi extension and library maintainers
- **Planning horizon:** Evidence-qualified phases without delivery dates
- **Selected package name:** `@narumitw/pi-workflow-engine`

## Vision

Create one reusable workflow engine that owns the lifecycle logic currently embedded separately in
`pi-plan-mode` and `pi-goal`. The engine manages workflow state, stages, persistence, context
handoffs, continuation, completion, blocking, cancellation, stale-run protection, compaction, and
terminal settlement. Extensions become thin product adapters that retain their commands, menus,
settings, status language, and compatibility surfaces.

The first composed workflow is:

```text
planning → plan ready → approved implementation → managed execution → verification → complete
```

`pi-plan-mode` can run that workflow without requiring the `pi-goal` extension to be installed, while
`pi-goal` uses the same managed-execution engine for direct `/goal` runs. Future debugging, review,
migration, release, and other agent workflows should reuse the same stage engine only when concrete
consumer evidence supports their semantics.

## Objectives

- **Centralize workflow behavior** — Success: planning and managed-execution state transitions,
  persistence, lifecycle guards, continuation, and terminal settlement have one implementation in
  `@narumitw/pi-workflow-engine`, not extension-local copies.
- **Keep extensions thin and independent** — Success: `pi-plan-mode` and `pi-goal` depend on the
  library but never import or inspect one another; each remains installable and functional alone.
- **Compose planning and execution atomically** — Success: approving a plan moves one persisted
  workflow from planning to managed execution without an event-channel handoff, duplicate objective,
  or two completion owners.
- **Preserve public behavior during migration** — Success: existing `/plan`, `/goal`, tool names,
  settings, session restoration, statuses, and supported non-TUI behavior remain compatible unless a
  separately approved migration explicitly changes them.
- **Generalize from proven stages** — Success: broader workflow primitives enter the public engine
  only after at least two compatible consumers prove shared transition and lifecycle behavior.

## Current State

- No `pi-workflow-engine` package or shared workflow engine exists.
- `pi-plan-mode` owns planning, approval, restrictive tools, exact plan persistence,
  compaction-safe active-plan context, and manual implementation clearing. Its accepted plan can be
  up to 50,000 characters.
- `pi-goal` owns direct and queued Goal state, continuation, explicit completion and blocking,
  budgets, no-progress protection, persistence, tool policy, interruption recovery, compaction, and
  terminal publication. Goal objectives are limited to 4,000 characters.
- `pi-goal` also exposes a default-off package-specific managed-run protocol. Under the selected
  direction, that protocol is a compatibility adapter around the shared engine rather than the
  architecture used to connect Plan mode to Goal mode.
- Pi exposes one process-wide active-tool array. Restrictive Plan mode currently wins, and pi-goal
  pauses rather than re-adding its terminal tools over another extension's selection.
- Repository policy prohibits extension-to-extension dependencies and extension-specific runtime
  assumptions. Both extensions may depend on a publishable non-extension library.
- The repository's existing publishable library pattern requires emitted JavaScript and declarations
  and forbids `pi.extensions` in library manifests.

## Target Ownership

```text
@narumitw/pi-workflow-engine
├─ workflow identity, stages, transitions, and terminal states
├─ session/branch persistence and restoration
├─ lifecycle ownership, cancellation, and stale guards
├─ context artifacts and compaction-safe handoff
├─ managed continuation and no-progress protection
├─ completion, blocked, pause/resume, and budget transitions
├─ planning stage implementation
├─ managed-execution stage implementation
└─ planning → managed-execution composition

pi-plan-mode
├─ /plan and --plan public interfaces
├─ Plan-mode menus, settings, wording, and status presentation
├─ compatibility tool names and result rendering
└─ workflow configuration using planning and managed-execution stages

pi-goal
├─ /goal public interface and queue manager
├─ Goal menus, settings, wording, and status presentation
├─ compatibility tool names and managed-run RPC adapter
└─ workflow configuration using the managed-execution stage
```

The engine owns workflow policy and invariants. Extensions own product-specific interaction and
compatibility. A policy belongs in an extension only when it is genuinely specific to that product
and cannot be represented as stage configuration or an engine-owned transition.

## Guiding Principles

- **Engine, not broker:** Plan mode does not submit work to an installed Goal provider. Both products
  instantiate the same engine-owned stages.
- **One state machine:** an approved Plan implementation is one workflow transition, not two
  extension states synchronized by events.
- **One completion owner:** the active execution stage alone can complete the workflow; completion
  clears its accepted-plan artifact and presentation state atomically.
- **Thin adapters:** commands, UI, settings, labels, and compatibility aliases stay outside the
  engine; lifecycle and state-transition policy stay inside.
- **Explicit completion:** prose, `agent_end`, and idle settlement never prove completion.
- **Restrictive tools win:** the engine never widens an active restrictive policy or treats Pi's
  whole active-tool array as independently owned slots.
- **Behavior before extraction:** characterize existing Plan and Goal behavior before moving it, then
  migrate one stage at a time without combining unrelated product changes.
- **Evidence before generalization:** support sequential stages and bounded loops first; avoid a
  speculative universal workflow language.

## Roadmap

### Phase 1: Build the workflow engine foundation

- [ ] `@narumitw/pi-workflow-engine` exists as a publishable non-extension library with a bounded API
  for workflow definitions, stage transitions, run/stage identities, persistence snapshots, context
  artifacts, cancellation, observation, and terminal settlement.
- [ ] The engine defines a deterministic base state machine covering idle, active stage, paused,
  blocked, failed, complete, and cleared outcomes with exactly-once terminal publication and stale
  run/stage rejection.
- [ ] Session replacement, fork restoration, shutdown, synchronous event re-entry, delayed
  continuations, and repeated cleanup have explicit engine contracts and deterministic tests.
- [ ] Runtime instances do not rely on accidental module singleton behavior; ownership and any
  cross-adapter coordination remain correct when package versions are independently installed or
  resolved.
- [ ] The package emits JavaScript and declarations, exposes only supported root exports, declares no
  Pi extension entrypoint, passes focused checks, and produces an inspected dry-run tarball.

**Outcome:** A small but real workflow engine can host one migrated stage without embedding Plan or
Goal product UI and without reducing the package to shared types or event strings.

### Phase 2: Move managed execution from pi-goal into the engine

- [ ] The engine's managed-execution stage owns the run identity, continuation intent, completion and
  blocked audits, stale-tool guards, pause/resume/cancel transitions, interruption recovery,
  compaction behavior, no-progress protection, usage accounting, optional budgets, and terminal
  settlement currently coordinated by pi-goal.
- [ ] `pi-goal` constructs and presents engine workflows through a thin adapter while preserving
  direct `/goal`, queue behavior, public `goal_complete` and `goal_blocked` contracts, settings,
  statuses, session migration, and supported TUI/RPC/non-interactive behavior.
- [ ] The existing package-specific managed-run RPC either remains as a compatibility adapter over the
  engine or follows a separately approved migration; it is no longer the owner of Goal lifecycle
  semantics.
- [ ] Characterization, migration, restore, queue, tool-policy, retry, compaction, budget, no-progress,
  and runtime smoke evidence show no Goal behavior regression and no duplicate implementation left
  behind in the extension.

**Outcome:** `pi-goal` becomes the first thin product adapter, and the production-proven autonomous
execution engine is reusable without installing or calling the pi-goal extension.

### Phase 3: Move planning from pi-plan-mode into the engine

- [ ] The engine's planning stage owns planning/ready transitions, accepted-plan normalization,
  planning completion, question/approval lifecycle, restrictive tool-mode restoration, exact plan
  artifact persistence, compaction-safe context, and stale workflow protection.
- [ ] `pi-plan-mode` constructs and presents the engine planning workflow while preserving `/plan`,
  `--plan`, `plan_mode_question`, `plan_mode_complete`, saved plans, export, settings, menus, statuses,
  and supported TUI/RPC/non-interactive behavior.
- [ ] Ready, saved, active implementation, clear, replace, resume, reload, fork, compaction, and failed
  delivery behavior are reconstructed through engine state rather than parallel extension-local
  lifecycle logic.
- [ ] Focused and runtime smoke evidence proves byte-exact accepted-plan preservation and confirms the
  extension no longer owns a second planning state machine.

**Outcome:** Both existing extensions use the same engine architecture while retaining their public
product surfaces and independent installation.

### Phase 4: Compose Plan-to-Execution as one workflow

- [ ] Approving implementation transitions the same engine-owned workflow from planning into the
  managed-execution stage; no pi-goal installation, provider discovery, package-specific event, or
  copied Goal objective is required.
- [ ] The accepted plan remains an engine-owned workflow artifact, avoiding pi-goal's 4,000-character
  objective limit and preserving the exact plan across implementation turns and compaction.
- [ ] Managed execution uses one completion and blocked lifecycle internally while pi-plan-mode
  exposes phase-appropriate compatibility tools; models never receive two valid completion owners for
  the same run.
- [ ] Successful execution atomically clears the active plan context, persistence, widget, and footer;
  paused, blocked, usage-limited, budget-limited, interrupted, and failed states retain a resumable
  workflow according to one documented state table.
- [ ] Installing both pi-plan-mode and pi-goal preserves independent commands while the engine safely
  rejects or sequences overlapping autonomous workflows without widening restrictive tool policy.
- [ ] End-to-end tests and an isolated Pi smoke prove planning, approval, long implementation,
  compaction, verification, explicit completion, and automatic Plan footer cleanup.

**Outcome:** The original user journey is complete: Plan mode gains pi-goal-grade execution behavior
through shared code, not extension integration, and execution completion closes the plan exactly once.

### Phase 5: Qualify broader workflow composition

- [ ] A second composed workflow—such as review/fix/re-review, reproduce/fix/regression, migration with
  rollback, or approval-gated release—proves which stage, approval, artifact, retry, and resume
  semantics are reusable beyond Plan and Goal.
- [ ] Only primitives demonstrated by at least two compatible consumers become public; domain prompts,
  findings, migration checkpoints, release authorization, UI, and settings remain with their owning
  adapters or stage modules.
- [ ] Sequential stages and bounded loops receive a stable composition contract before any broader
  graph model; arbitrary DAG scheduling, parallel jobs, and distributed execution remain excluded
  unless later evidence justifies a separate product.
- [ ] Engine health, compatibility, package boundaries, and consumer migrations are verified through
  package tests, affected extension suites, root `npm run check`, package dry runs, and representative
  Pi smokes before any separately approved stable publication.

**Outcome:** `pi-workflow-engine` evolves from a shared Plan/Goal engine into a broader agent-workflow
engine through demonstrated reuse rather than speculative orchestration features.

## Success Metrics

| Indicator | Baseline | Target / invariant | Evidence source |
| --- | --- | --- | --- |
| Workflow state-machine owners for managed execution | pi-goal extension | 1 engine implementation | Ownership audit and migration tests |
| Workflow state-machine owners for planning | pi-plan-mode extension | 1 engine implementation | Ownership audit and migration tests |
| Extension-to-extension imports or assumptions | Forbidden | 0 | Boundary checks and source review |
| Terminal outcomes per workflow | Extension-local | At most 1 | Runtime race and lifecycle tests |
| Stale stage clearing newer workflow state | Not centrally covered | 0 | Replacement, reload, and re-entry tests |
| Plan fidelity after implementation compaction | Plan-mode-specific support | Byte-exact engine artifact | End-to-end smoke and context assertions |
| Valid completion owners for one active phase | Potentially separate Plan/Goal concepts | Exactly 1 | Tool-schema and transition tests |
| Existing `/plan` and `/goal` behavior lost during migration | Current baseline | 0 unapproved losses | Characterization and compatibility suites |
| Broader public primitives without two consumers | No engine | 0 | API review and roadmap evidence |

Adoption and task-completion-rate targets remain TBD because the repository has no telemetry or
validated usage baseline.

## Risks and Dependencies

| Risk or dependency | Impact | Mitigation / decision |
| --- | --- | --- |
| “All logic” turns the engine into a monolith | A shared package could become harder to change than the extensions | Separate core lifecycle, planning stage, managed-execution stage, accounting, persistence, and composition by responsibility; keep product UI outside. |
| pi-goal behavior is large and lifecycle-sensitive | A big-bang extraction could regress retries, budgets, queues, or stale guards | Establish characterization tests and migrate managed execution in bounded, reversible slices before Plan adoption. |
| Public tools and commands belong to extensions | Moving logic could accidentally break names, schemas, or rendering | Keep adapter-owned registrations and map them onto engine operations with exact compatibility tests. |
| Pi's global active-tool array has no composable ownership | Two workflows could widen or erase another policy | Keep restrictive-wins semantics, activate only at safe boundaries, and centralize exact snapshot/rollback behavior in the engine. |
| Plan and Goal persisted schemas already exist | Runtime state could strand resumed sessions or forks | Define explicit import/migration adapters and test legacy, current, clear-marker, and malformed branch states. |
| Plan and Goal have different size and context contracts | A naïve common objective could truncate plans or inflate every continuation | Model accepted plans as workflow artifacts distinct from bounded execution objectives. |
| Multiple installed copies cannot safely share module globals | Cross-extension coordination could become version- or resolver-dependent | Make engine ownership explicit through Pi/session surfaces; never require one process-global JavaScript singleton for correctness. |
| Existing managed-run RPC is documented behavior | Extraction could create an unapproved breaking change | Preserve it as a pi-goal adapter until a separately approved compatibility decision says otherwise. |
| Source modules already contain dense lifecycle logic | Extraction could create files over repository size limits or shallow wrappers | Design deep stage modules with bounded interfaces and audit every source file over 1,000 lines during migration. |

## Non-Goals

- Make pi-plan-mode call an installed pi-goal extension through package-specific events, commands,
  tools, settings, or persisted state.
- Create a third extension that duplicates or coordinates the two existing extensions.
- Keep separate Plan and Goal engines behind a transport-only broker.
- Move product-specific commands, menus, settings UI, wording, icons, or compatibility aliases into the
  engine.
- Build an arbitrary workflow DSL, CI/CD engine, cron service, distributed scheduler, or unrestricted
  parallel DAG executor.
- Infer completion from idle state, assistant prose, `agent_end`, or `agent_settled`.
- Publish packages, change npm visibility, create tags, or dispatch release workflows without
  separate explicit approval.

## Assumptions and Unknowns

- The selected package name and shared-engine direction are approved; exact public API names and
  module boundaries remain proposed.
- “All logic” means all reusable workflow lifecycle and stage behavior. Product interaction surfaces
  and compatibility names remain in thin extension adapters.
- It is unknown whether pi-plan-mode should expose managed execution as its only implementation path
  or retain the current simpler handoff as a compatibility option during rollout.
- It is unknown whether overlapping `/goal` and `/plan` workflows should be rejected globally,
  serialized, or allowed when they demonstrably own unrelated work. Phase 4 requires an explicit
  decision and verification.
- Candidate second workflows are illustrative, not commitments. Their inclusion depends on concrete
  consumer demand and compatible lifecycle evidence.
- No delivery dates, owners, staffing assumptions, publication schedule, or release commitment were
  provided.

## Decisions and Changes

- **2026-08-03 — Select the package name:** Use `@narumitw/pi-workflow-engine`; `engine` reflects that
  the package owns workflow state machines and stage behavior rather than only hosting an execution
  environment.
- **2026-08-03 — Choose a shared engine, not a provider broker:** Move reusable Plan and Goal workflow
  logic into the engine. `pi-plan-mode` and `pi-goal` both consume it as thin product adapters;
  Plan-to-Execution composition occurs inside one engine-owned workflow and does not require the
  other extension to be installed.
