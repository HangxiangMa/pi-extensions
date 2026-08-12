# pi-workflow implementation plan

## Goal

Create an independently installable experimental `@narumitw/pi-workflow` extension that preserves the established `/plan` and `/goal` behavior while adding a seamless, failure-safe Plan-to-Goal handoff and a `/workflow` manager.

## Context

The repository already contains mature `pi-plan-mode` and `pi-goal` extensions.

The combined package is a replacement for loading those two extensions together, not an extension-to-extension adapter.

The package will keep the existing `/plan`, `/goal`, Plan tools, Goal tools, session state formats, safety policies, queue behavior, waits, budgets, compaction behavior, and direct command routes unless integration requires an explicitly documented guard.

The default handoff will preserve user agency by presenting the completed plan before starting Goal work.

An explicit workflow setting will allow automatic handoff after Plan completion.

## Architecture

`packages/pi-workflow/src/plan/` and `packages/pi-workflow/src/goal/` will contain package-owned snapshots of the current stable implementations so the experimental extension remains independently installable and does not import another extension package.

`packages/pi-workflow/src/workflow.ts` will compose both runtimes in an explicit lifecycle order and register only `/workflow` itself.

The embedded Plan and Goal runtimes will continue to own `/plan`, `/goal`, their tools, and their domain state.

`packages/pi-workflow/src/settings.ts` will own the canonical optional user file at `<getAgentDir()>/pi-workflow.json`.

The settings document will contain separate `workflow`, `plan`, and `goal` objects so saves cannot confuse overlapping fields.

All settings reads and writes will use one package-owned mutation protocol with side-effect-free missing reads, runtime validation, unknown-field preservation, private temporary files, atomic rename publication, invalid-file protection, ordered in-process writes, and failure rollback.

The Plan handoff controller will transition the accepted plan and Goal activation together, send one combined implementation request, and restore the ready plan if Goal activation or delivery fails.

The combined request will contain the exact approved plan, Goal stale-turn guard, and Goal execution contract in the same first implementation turn.

The active Plan state will retain the exact plan across compaction and Goal continuation until the linked Goal completes, is cleared, or is superseded.

Current-session and fresh-session handoffs will both activate linked Plan and Goal state before implementation begins.

A linked Goal pause, wait, blocker, usage limit, or budget limit will retain the approved plan for recovery.

The package will reject starting Plan while an unfinished Goal exists and reject starting or replacing Goal while Plan is active or awaiting approval, avoiding two owners competing for tools and turns.

The `/workflow` manager will show current Plan and Goal state and expose the primary workflow action, Plan settings, Goal settings, handoff behavior, status, help, and close actions.

The package will display an experimental warning and will document that it must not be loaded together with `pi-plan-mode` or `pi-goal` because command, tool, event-channel, and state compatibility names are intentionally retained.

## Non-Goals

- Do not modify the stable `pi-plan-mode` or `pi-goal` packages.
- Do not make one extension depend on or import another extension package.
- Do not publish the package, change npm visibility, create a tag, or dispatch a release workflow.
- Do not silently copy or rewrite the existing `pi-plan-mode.json` or `pi-goal.json` files.
- Do not add a second Plan or Goal command namespace.

## Risks

- Embedded snapshots can diverge from their stable predecessors, so source provenance and synchronization expectations must be documented.
- Plan and Goal both control active tools, so lifecycle order and every rollback path need direct integration tests.
- Automatic handoff can start costly work without another confirmation, so it must be explicit, visible, and default off.
- Fresh-session handoff crosses a session replacement boundary, so only plain serialized data may cross and all destination work must use the replacement context or destination runtime.
- Goal completion and Plan retention are separate persisted transitions, so reload and partial failure tests must prove recovery does not lose the approved plan or create duplicate Goal work.

## Architecture Deviation

This experimental prototype intentionally uses package-owned source snapshots instead of the shared `@narumitw/pi-workflow-engine` direction recorded in `docs/roadmaps/2026-08-03_pi-workflow-engine-roadmap.md`.

The choice keeps the new extension independent and preserves every predecessor feature now, but duplicates lifecycle and persistence code.

Promotion to stable requires either migration to the shared engine or an explicitly approved superseding architecture decision.

The PR must call out this deviation rather than presenting it as completion of the engine roadmap.

## Plan

- [x] Record the OpenAI Codex research findings and resolve the review-versus-automatic default with evidence. Evidence: Codex HEAD `965b9f2` uses an authoritative Plan artifact followed by an explicit same-thread, fresh-thread, or stay-in-Plan decision, and core rejects automatic idle turns in Plan mode; reviewed handoff remains the default while explicit pre-authorized automatic handoff is configurable.
- [x] Add `packages/pi-workflow/` metadata, thin entrypoint, license, experimental lifecycle, unified settings path, and package documentation; verify boundary expectations and package contents.
- [x] Add failing settings tests for missing, valid, malformed, invalid, unknown-field, ordered-save, and atomic-publication behavior.
- [x] Implement the unified settings store and adapters consumed by the embedded Plan and Goal settings screens.
- [x] Add package-owned Plan and Goal runtime snapshots without extension-package imports, preserving their direct commands, tools, state formats, and non-TUI behavior.
- [x] Add failing integration tests for command registration, conflicting-mode guards, reviewed handoff, automatic handoff, one-request delivery, activation failure rollback, and linked completion cleanup.
- [x] Implement the current-session handoff controller and runtime handles until the focused integration tests pass.
- [x] Add failing fresh-session tests for destination setup, cancellation, stale source contexts, kickoff failure, and reload recovery.
- [x] Implement fresh linked Plan-to-Goal handoff until the focused tests pass.
- [x] Add the `/workflow` declarative TUI/RPC manager with current state, workflow action, Plan settings, Goal settings, handoff setting, status, help, unsupported-mode behavior, cancellation, disposal, and stale-session guards.
- [x] Add an independent experimental warning, README replacement guidance, settings schema, command/mode table, handoff lifecycle, failure recovery, package layout, and limitations.
- [x] Add a Changeset for the new publishable behavior and update the root lockfile with `npm install`.
- [x] Audit every touched command, setting, custom UI, session replacement, async continuation, tool-policy, persistence, status, shutdown, and package rule against `docs/extension-conventions.md` and `docs/extension-settings.md`.
- [x] Run focused tests, package typecheck, `npm run check:boundaries`, the full `npm run check`, `just pack workflow`, and a local `pi -e ./packages/pi-workflow` load smoke.
- [x] Inspect the tarball for only declared files and archive this completed plan with verification evidence.

## Completion Checklist

- [x] `/workflow`, `/plan`, and `/goal` are the only slash commands registered by the package.
- [x] Existing Plan and Goal command routes and tools remain available with documented mode behavior.
- [x] A reviewed or explicitly automatic Plan completion starts one linked Goal turn with the exact approved plan.
- [x] Failed or cancelled handoff never loses the ready plan and never leaves a phantom active Goal.
- [x] Goal completion or clear removes linked Plan retention, while recoverable stopped Goal states retain it.
- [x] Fresh-session handoff survives replacement without using stale contexts or duplicating work.
- [x] The canonical settings file is optional, validated, atomically written, unknown-field preserving, and protected from invalid overwrite.
- [x] Every asynchronous menu and session flow cancels owned work and revalidates lifecycle identity after awaits.
- [x] The extension is marked experimental, warns users, is absent from root `pi.extensions`, and is independently packable.
- [x] All required tests, checks, audits, package inspection, and runtime smoke pass with no unreported skipped path.

## Verification Evidence

- `npx vitest run packages/pi-workflow/test/*.test.ts`: 39 files and 555 tests passed, including complete copied Plan and Goal TypeScript regression suites.
- `npm run test:runtime --workspace @narumitw/pi-workflow`: all 18 real `createAgentSession` Goal lifecycle, queue, RPC, budget, retry, pause, and compaction scenarios passed through the combined extension entrypoint.
- `npm run check --workspace @narumitw/pi-workflow`: Biome and TypeScript passed.
- `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false npm run check`: 361 files and 3,654 tests passed with full workspace Biome, boundaries, and typechecks; the command-scoped Git override avoids unavailable 1Password signing in test-created repositories.
- `just pack workflow`: 54 declared files, 104.7 kB packed, 460.3 kB unpacked, with tests and local dependencies excluded.
- RPC `pi --mode rpc --no-session -e ./packages/pi-workflow`: loaded successfully, registered exactly `/workflow`, `/plan`, and `/goal`, and emitted the standard Workflow select request.
- Independent Herdr reviews reproduced and then verified fixes for ID rotation, queue supersession, session replacement, tool ownership, partial persistence, phantom Goal recovery, and runtime smoke coverage; the final correctness review reported no remaining Major or Minor finding.
- The shared workflow-engine roadmap deviation remains a disclosed high-risk architecture exception requiring maintainer approval; this plan does not mark that roadmap complete.
