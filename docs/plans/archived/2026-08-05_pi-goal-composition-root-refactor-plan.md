# pi-goal Composition Root Refactor Plan

## Goal

Turn `packages/pi-goal/src/goal.ts` into a small, order-explicit composition root by moving slash
command, terminal tool, and Pi lifecycle adapter ownership into cohesive internal modules, without
changing registration order, factory isolation, exports, or runtime behavior.

## Context

- This is plan 3 of the KISS refactor sequence and starts only after the transition-ownership and
  tool-policy plans are complete and archived.
- `goal.ts` currently combines factory construction, about 35 bound runtime aliases, two complete
  tool implementations, slash-command dispatch, 14 lifecycle handlers, local transition helpers,
  and public re-exports in roughly 1,150 lines.
- `command.ts`, `commands.ts`, `run-protocol.ts`, and `GoalRuntime` already provide domain modules, but
  their Pi-facing adapters remain assembled inline in `goal.ts`.
- Registration and lifecycle order are behaviorally significant. The refactor must make that order
  more visible rather than hiding it behind an all-purpose bootstrap function.

## Architecture

Keep `src/index.ts` as the one-line forwarding entrypoint and keep `goal.ts` as the extension factory
and public compatibility export surface. Extract three adapter modules with real ownership:

1. A slash-command adapter owns `/goal` registration, parsing-to-controller dispatch, menu/settings
   routing, mode behavior, and argument completions.
2. A terminal-tool adapter owns `goal_complete` and `goal_blocked` schemas, validation, result
   payloads, termination semantics, and calls into authoritative runtime/command transitions.
3. A lifecycle adapter owns Pi lifecycle hook registration, event ordering, run attribution,
   continuation/queue settlement, compaction/retry handling, and session cleanup.

Each adapter exposes one registration function with only the dependencies it actually needs. Avoid a
shared dependency bag or generic registrar. `goal.ts` constructs one runtime, command controller, and
managed-run controller, registers adapters in the established order, and retains public re-exports.

Do not move code merely to reduce line count. Each extracted module must own policy and tests that
would otherwise return to the composition root if the module were deleted. Shared helpers belong to
the adapter whose invariant they support; cross-adapter helpers stay in an existing domain module or
receive a new module only when they represent one independently testable concept.

## Non-Goals

- Change public exports, command/tool schemas, prompts, settings, queue behavior, managed-run channels,
  lifecycle event ordering, or package metadata.
- Introduce dependency injection containers, plugin registries, generic event dispatchers, or an
  adapter class hierarchy.
- Further split `GoalRuntime`, transition ownership, or tool policy after their preceding plans.
- Reorganize the large integration test matrix beyond moving adapter-specific cases needed to prove
  the new boundaries; the next plan owns broad test topology.
- Add roadmap or supervision features.

## Risks

- Registering event-bus or Pi lifecycle listeners in a different order can change synchronous
  re-entry, restore policy, continuation ownership, or managed-run publication.
- A wide registration dependency object would hide coupling instead of reducing it.
- Moving nested helper closures can accidentally share state across factories or capture a stale
  session context.
- Existing tests import compatibility exports from `goal.ts`; careless re-exports could break users
  even when the extension loads.

## Rollback / Recovery

This is a source-only refactor with no persistent-data or public API migration. Extract and verify one
adapter at a time. Keep `goal.ts` functional after each step, remove old inline code immediately after
its replacement passes, and revert the current extraction if listener order or factory isolation
cannot be proven.

## Plan

- [x] Record the current factory registration sequence, every `pi.events.on`, `pi.registerTool`,
      `pi.registerCommand`, and `pi.on` hook, local closure ownership, and public re-export in this
      plan; verify each entry maps to a deterministic loader, command, tool, lifecycle, or
      multi-factory test before moving code.
- [x] Establish the post-plan-2 baseline with the mapped tests,
      `npm run check --workspace @narumitw/pi-goal`, and
      `npm run test:runtime --workspace @narumitw/pi-goal`; record exact passing evidence before
      production edits.
- [x] Extract the `/goal` Pi adapter into one descriptive module with command registration, argument
      completion, parser errors, menu/settings routing, queue-frozen gates, and controller dispatch;
      verify existing TUI, RPC, print/JSON rejection, direct route, completion, and unknown/trailing
      argument tests pass unchanged.
- [x] Extract `goal_complete` and `goal_blocked` definitions into one terminal-tool adapter that uses
      the authoritative transition owner from plan 1; verify schema, stale-ID, ownership, blocker,
      budget wrap-up, queue completion, managed-run publication, and terminate-result tests pass.
- [x] Extract Pi lifecycle hook registration and its lifecycle-local helpers into one adapter while
      preserving exact hook registration order and per-factory closures; verify session start/shutdown,
      input/message/context, tool, run, settled, retry, compaction, queue, timer, and multi-factory
      isolation tests after the move.
- [x] Reduce `goal.ts` to explicit construction and ordered registration of runtime, controllers, and
      adapters plus the compatibility export surface; remove the bound-method alias layer and any
      adapter code left inline, then verify a reviewer can see registration order and factory-owned
      objects without opening implementation modules.
- [x] Audit adapter interfaces and dependency direction, rejecting shared dependency bags,
      pass-through wrappers, duplicated helpers, module-global mutable session state, and cycles;
      verify each adapter's deletion would return a coherent policy and its tests to `goal.ts` rather
      than merely inline renames.
- [x] Add or update loader and two-factory characterization only where the extraction changed a seam,
      asserting the canonical `src/index.ts` default export, compatibility re-exports, listener/tool/
      command registration counts and order, independent mutable state, and idempotent shutdown.
- [x] Review the final diff against `docs/extension-conventions.md`, separately auditing factory
      evaluation, cancellation, session replacement, shutdown, timer cleanup, event-bus re-entry,
      post-`await` ownership, command modes, tool termination, and custom TUI guards; record every
      accepted deviation or unverified path.
- [x] Run mapped focused tests, `npm run test:runtime --workspace @narumitw/pi-goal`, root
      `npm test`, root `npm run check`, `just pack goal`, and `git diff --check`; verify all checks
      pass and inspect the tarball to confirm `src/index.ts` remains the sole declared entrypoint and
      all extracted source ships.

## Execution Evidence

- `goal.ts` is now 52 lines and visibly constructs one `GoalRuntime`, `GoalCommandController`, and
  `GoalRunController`, then registers managed-run, tool, command, and lifecycle adapters in the
  established order.
- Added cohesive Pi adapters: `command-registration.ts` owns `/goal`, `tools.ts` owns both terminal
  tools, and `lifecycle.ts` owns the 14 Pi lifecycle hooks and lifecycle-local helpers.
- Removed the 35-method binding layer from the composition root and lifecycle adapter. Adapters call
  the narrow owning runtime/controller/policy operation directly and no dependency bag or global
  mutable session state was introduced.
- Registration inventory is authoritative in the source: two event-bus listeners remain in
  `run-protocol.ts`, two tools in `tools.ts`, one command in `command-registration.ts`, and 14 ordered
  lifecycle hooks in `lifecycle.ts`; `src/index.ts` remains the sole declared package entrypoint.
- Compatibility re-exports remain in `goal.ts`; loader registration, multi-factory isolation,
  command modes, tools, retries, compaction, queue settlement, timers, session replacement, and
  shutdown all passed existing integration coverage and runtime smoke.
- Final evidence: pi-goal check, 293 focused tests, runtime smoke, root 2,406-test `npm test` and
  `npm run check`, 23-file package dry run containing all adapters, and `git diff --check` passed.
- Semantic audit found no changed registration order, stale context use, unowned task, adapter cycle,
  command/tool contract, or accepted deviation.

## Completion Checklist

- [x] `goal.ts` is a small order-explicit composition root and compatibility export surface rather
      than the implementation owner for commands, tools, and lifecycle hooks.
- [x] Slash command, terminal tool, and lifecycle adapters each own one coherent Pi-facing policy
      behind one narrow registration interface.
- [x] Registration order, factory isolation, public exports, commands, tools, prompts, lifecycle,
      queue, settings, managed runs, persistence, notifications, and statuses remain compatible.
- [x] No generic registry, dependency bag, pass-through module, cycle, or module-global session state
      was introduced.
- [x] Focused tests, runtime smoke, root test/check gates, package dry run, semantic audits, and
      `git diff --check` pass with all exceptions documented.
