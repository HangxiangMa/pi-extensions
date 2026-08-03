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

The first combined product is a standalone `pi-workflow` extension built from the engine's planning
and managed-execution stages:

```text
planning → plan ready → approved implementation → managed execution → verification → complete
```

`pi-plan-mode` remains the focused planning product, `pi-goal` remains the focused autonomous-goal
product, and `pi-workflow` owns the end-to-end experience without importing or requiring either
extension. Future debugging, review, migration, release, and other agent workflows should reuse the
same stage engine only when concrete consumer evidence supports their semantics.

## Objectives

- **Centralize workflow behavior** — Success: planning and managed-execution state transitions,
  persistence, lifecycle guards, continuation, and terminal settlement have one implementation in
  `@narumitw/pi-workflow-engine`, not extension-local copies.
- **Keep extensions thin and independent** — Success: `pi-plan-mode`, `pi-goal`, and `pi-workflow`
  depend on the library but never import or inspect one another; each remains installable and
  functional alone.
- **Compose planning and execution atomically** — Success: `pi-workflow` moves one persisted workflow
  from planning to managed execution without an event-channel handoff, duplicate objective, or two
  completion owners.
- **Preserve focused products during migration** — Success: existing `/plan`, `/goal`, tool names,
  settings, session restoration, statuses, and supported non-TUI behavior remain compatible unless a
  separately approved migration explicitly changes them.
- **Generalize from proven stages** — Success: broader workflow primitives enter the public engine
  only after at least two compatible consumers prove shared transition and lifecycle behavior.

## Current State

- No `pi-workflow-engine` package, shared workflow engine, or standalone `pi-workflow` extension
  exists.
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
  assumptions. Focused and combined products may all depend on a publishable non-extension library.
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
└─ focused planning workflow plus its existing implementation-handoff compatibility

pi-goal
├─ /goal public interface and queue manager
├─ Goal menus, settings, wording, and status presentation
├─ compatibility tool names and managed-run RPC adapter
└─ focused workflow using the managed-execution stage

experimental/pi-workflow
├─ /workflow public interface and one unified status surface
├─ workflow-specific menus, settings, wording, and tool namespace
├─ planning and managed-execution stage composition
└─ standalone end-to-end product with no extension dependencies
```

The engine owns workflow policy and invariants. Extensions own product-specific interaction and
compatibility. A policy belongs in an extension only when it is genuinely specific to that product
and cannot be represented as stage configuration or an engine-owned transition.

## Guiding Principles

- **Engine, not broker:** Plan mode does not submit work to an installed Goal provider. Focused and
  combined products instantiate engine-owned stages directly.
- **Focused products, one combined product:** `pi-plan-mode` and `pi-goal` stay narrow;
  `pi-workflow` alone owns the end-to-end Plan-to-Execution experience.
- **One state machine:** an approved `pi-workflow` implementation is one workflow transition, not two
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

### Phase 1: Establish pi-workflow-engine

- [ ] `@narumitw/pi-workflow-engine` exists as a publishable non-extension library with bounded APIs
  for workflow definitions, stage transitions, run/stage identities, persistence snapshots, context
  artifacts, cancellation, observation, and terminal settlement.
- [ ] The engine defines a deterministic base state machine covering idle, active stage, paused,
  blocked, failed, complete, and cleared outcomes with exactly-once terminal publication and stale
  run/stage rejection.
- [ ] Initial planning and managed-execution stages provide the behavior required by the combined
  product, backed by characterization contracts derived from pi-plan-mode and pi-goal without yet
  changing either focused extension's public implementation.
- [ ] Session replacement, fork restoration, shutdown, compaction, synchronous re-entry, delayed
  continuation, restrictive tool ownership, and repeated cleanup have explicit engine contracts and
  deterministic tests.
- [ ] Engine instances do not rely on accidental module-singleton behavior when independently
  installed extensions resolve different compatible library copies.
- [ ] The package emits JavaScript and declarations, exposes only supported root exports, declares no
  Pi extension entrypoint, passes focused checks, and produces an inspected dry-run tarball.

**Outcome:** The engine can host both stages needed for a standalone combined workflow while the
existing focused extensions remain unchanged and available as behavioral references.

### Phase 2: Build experimental/pi-workflow from both stages

- [ ] `experimental/pi-workflow` exists as an independently installable extension with a visible
  experimental warning, unique `/workflow` command and tool namespace, one state-aware manager, and
  no dependency on another extension package.
- [ ] Approving implementation transitions one engine-owned workflow from planning into managed
  execution without pi-goal installation, provider discovery, package-specific events, copied Goal
  objectives, or a second completion owner.
- [ ] The accepted plan remains an engine-owned artifact across implementation turns and compaction;
  successful completion clears context, persistence, widget, and footer atomically, while stopped or
  failed states retain one resumable workflow.
- [ ] TUI, RPC, print, and JSON behavior is explicit, and package contents, status ownership,
  cancellation, replacement, reload, fork, and shutdown remain correct when neither focused extension
  is installed.
- [ ] End-to-end tests and an isolated Pi smoke prove planning, approval, long implementation,
  compaction, verification, explicit completion, and automatic workflow cleanup.

**Outcome:** Users can try one coherent Plan-to-Execution product while the engine is still evaluated
independently of migrations in pi-goal and pi-plan-mode.

### Phase 3: Make pi-goal use the managed-execution stage

- [ ] `pi-goal` constructs managed-execution workflows through the engine while preserving direct
  `/goal`, queue behavior, `goal_complete`, `goal_blocked`, settings, statuses, session migration, and
  supported TUI/RPC/non-interactive behavior.
- [ ] Run identity, continuation intent, completion and blocked audits, stale-tool guards,
  pause/resume/cancel, interruption recovery, compaction, no-progress protection, usage accounting,
  optional budgets, and terminal settlement have one engine implementation.
- [ ] The existing package-specific managed-run RPC remains a compatibility adapter over the engine or
  follows a separately approved migration; it no longer owns Goal lifecycle semantics.
- [ ] Characterization, migration, restore, queue, tool-policy, retry, compaction, budget, no-progress,
  and runtime smoke evidence show no Goal regression, and the replaced extension-local engine logic
  is removed rather than retained in parallel.

**Outcome:** pi-goal becomes a focused product adapter over the same managed-execution stage already
proven by experimental pi-workflow.

### Phase 4: Make pi-plan-mode use the planning stage

- [ ] `pi-plan-mode` constructs planning workflows through the engine while preserving `/plan`,
  `--plan`, `plan_mode_question`, `plan_mode_complete`, saved plans, export, settings, menus, statuses,
  and supported TUI/RPC/non-interactive behavior.
- [ ] Planning/ready transitions, accepted-plan normalization, question and approval lifecycle,
  restrictive tool restoration, exact plan artifact persistence, compaction-safe context, and stale
  workflow protection have one engine implementation.
- [ ] pi-plan-mode remains the focused planning product and retains its existing ordinary
  implementation-handoff compatibility; it does not become another complete Plan-to-Execution
  product.
- [ ] Ready, saved, handoff, clear, replace, resume, reload, fork, compaction, and failed-delivery
  behavior migrate without unapproved changes, and replaced extension-local planning logic is removed.
- [ ] Focused tests and runtime smokes prove byte-exact plan preservation and compatibility across the
  migration.

**Outcome:** Both focused extensions share the engine with pi-workflow while keeping distinct product
roles: planning-only, goal-only, and combined end-to-end workflow.

### Phase 5: Soak pi-workflow and decide whether it is the primary successor

- [ ] Co-installation tests cover every supported combination of pi-workflow, pi-plan-mode, and
  pi-goal; unique commands and tools remain distinguishable, restrictive policy is never widened, and
  overlapping autonomous workflows follow one explicit reject-or-serialize decision.
- [ ] Representative real tasks establish whether pi-workflow improves completion, recovery, and
  cleanup without making focused planning or direct Goal usage harder; unsupported adoption targets
  remain explicit unknowns.
- [ ] Menu structure, defaults, pause/resume behavior, settings ownership, status language,
  compatibility, and migration guidance receive an explicit stable-product decision based on soak
  evidence.
- [ ] Maintainers explicitly decide whether pi-workflow becomes the primary successor, remains a third
  focused option, or stays experimental. pi-plan-mode and pi-goal remain active throughout the soak
  and are deprecated only by a separate approved decision.
- [ ] Engine, extension, and compatibility checks plus package dry runs and representative Pi smokes
  establish release readiness without implying publication, tags, visibility changes, or version
  changes.

**Outcome:** The repository has an evidence-backed decision on whether pi-workflow should become the
primary product, with a deliberate coexistence or migration path for both focused predecessors.

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
| Focused extension dependencies imported by pi-workflow | No combined product | 0 | Boundary checks and package review |
| End-to-end workflows with one completion owner | No combined product | Every pi-workflow run | Integration tests and Pi smokes |
| Broader public primitives without two consumers | No engine | 0 | API review and roadmap evidence |

Adoption and task-completion-rate targets remain TBD because the repository has no telemetry or
validated usage baseline.

## Risks and Dependencies

| Risk or dependency | Impact | Mitigation / decision |
| --- | --- | --- |
| “All logic” turns the engine into a monolith | A shared package could become harder to change than the extensions | Separate core lifecycle, planning stage, managed-execution stage, accounting, persistence, and composition by responsibility; keep product UI outside. |
| pi-goal behavior is large and lifecycle-sensitive | A big-bang extraction could regress retries, budgets, queues, or stale guards | Establish characterization tests, prove the stage in pi-workflow, and migrate pi-goal in bounded reversible slices. |
| Initial engine stages temporarily coexist with extension-local logic | Behavior can drift before focused migrations complete | Freeze characterization contracts, keep Phase 3–4 migrations sequenced, and remove replaced logic rather than maintaining permanent forks. |
| Public tools and commands belong to extensions | Moving logic could accidentally break names, schemas, or rendering | Keep adapter-owned registrations and map them onto engine operations with exact compatibility tests. |
| Pi's global active-tool array has no composable ownership | Two workflows could widen or erase another policy | Keep restrictive-wins semantics, activate only at safe boundaries, and centralize exact snapshot/rollback behavior in the engine. |
| Plan and Goal persisted schemas already exist | Runtime state could strand resumed sessions or forks | Define explicit import/migration adapters and test legacy, current, clear-marker, and malformed branch states. |
| Plan and Goal have different size and context contracts | A naïve common objective could truncate plans or inflate every continuation | Model accepted plans as workflow artifacts distinct from bounded execution objectives. |
| Multiple installed copies cannot safely share module globals | Cross-extension coordination could become version- or resolver-dependent | Make engine ownership explicit through Pi/session surfaces; never require one process-global JavaScript singleton for correctness. |
| Existing managed-run RPC is documented behavior | Extraction could create an unapproved breaking change | Preserve it as a pi-goal adapter until a separately approved compatibility decision says otherwise. |
| Three product adapters can overlap in commands, tools, settings, and user expectations | Co-installation could be confusing even without code coupling | Give pi-workflow a unique namespace, test every supported combination, and make Phase 5 own the coexistence or successor decision. |
| Source modules already contain dense lifecycle logic | Extraction could create files over repository size limits or shallow wrappers | Design deep stage modules with bounded interfaces and audit every source file over 1,000 lines during migration. |

## Non-Goals

- Make pi-plan-mode call an installed pi-goal extension through package-specific events, commands,
  tools, settings, or persisted state.
- Make pi-workflow import, invoke, inspect, or require pi-plan-mode or pi-goal.
- Duplicate Plan and Goal engines inside pi-workflow or keep separate engines behind a transport-only
  broker.
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
- `experimental/pi-workflow` is the approved initial combined product and must show a user-facing
  warning while its command, settings, and persisted workflow contract remain experimental.
- pi-plan-mode remains focused on planning and retains its existing ordinary implementation handoff;
  it does not become a second complete Plan-to-Execution product.
- It is unknown whether overlapping `/workflow`, `/goal`, and `/plan` runs should be rejected globally
  or serialized. Phase 5 requires an explicit decision and verification.
- It is unknown whether pi-workflow should become the primary successor, remain a third option, or
  stay experimental. No predecessor deprecation is implied before Phase 5 evidence and approval.
- Broader workflows are deferred beyond this roadmap until concrete consumer demand proves reusable
  stage semantics.
- No delivery dates, owners, staffing assumptions, publication schedule, or release commitment were
  provided.

## Decisions and Changes

- **2026-08-03 — Select the package name:** Use `@narumitw/pi-workflow-engine`; `engine` reflects that
  the package owns workflow state machines and stage behavior rather than only hosting an execution
  environment.
- **2026-08-03 — Choose a shared engine, not a provider broker:** Move reusable Plan and Goal workflow
  logic into the engine. Focused and combined products consume it as thin adapters rather than
  coordinating extension packages.
- **2026-08-03 — Add a standalone combined product:** Build `experimental/pi-workflow` in Phase 2 from
  planning and managed-execution stages, then migrate pi-goal and pi-plan-mode in Phases 3 and 4.
  pi-plan-mode remains focused rather than becoming another complete Plan-to-Execution product.
- **2026-08-03 — Defer successor selection:** Keep pi-plan-mode and pi-goal active while pi-workflow
  soaks; decide its primary-successor, coexistence, or continued-experiment role only in Phase 5.
