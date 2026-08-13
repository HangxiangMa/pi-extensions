# Slow extension startup reduction plan

## Goal

Reduce idle Pi startup time from `pi-subagents` and `pi-workflow` without delaying equivalent work into `session_start` or changing their tools, commands, settings, persistence, or lifecycle behavior.

## Context

- The reported installed startup attributes 1,397 ms to `pi-subagents` and 668 ms to `pi-workflow`, which together account for about 59% of all extension import time.
- A five-run source baseline on Node 25.9.0 measured a combined import median of 1,932 ms with 126 ms MAD and a first-response median of 3,056.21 ms with 258.91 ms MAD.
- Jiti tracing shows 107 eagerly loaded `pi-subagents` TypeScript modules and 41 eagerly loaded `pi-workflow` TypeScript modules.
- The largest `pi-subagents` eager roots are registration modules that also import execution, transport, inspection, and settings UI implementations.
- `pi-workflow` eagerly imports its Pi TUI Kit manager and fresh-session handoff even when neither route is used.
- Applicable rules are in `docs/extension-conventions.md`, `docs/extension-settings.md`, the Pi extension documentation, and the package-specific `pi-subagents` guidance.

## Architecture

- Keep both canonical `src/index.ts` entrypoints and synchronous factory registration unchanged.
- Register every existing tool and command eagerly with its current schema, description, renderer, and completion behavior.
- Cache only code-module imports, clear a rejected loader promise so later use can retry, and never cache a session context or task in a module loader.
- Load blocking execution, selected detached transport implementations, inspection execution, and manager UI only when their corresponding route is first used.
- Revalidate abort signals, session generations, session managers, and mutable runtime ownership immediately after each lazy import and before side effects.
- Keep persistence restoration, pending completion delivery, settings validation, and session cleanup eager where startup correctness requires them.
- Keep Workflow Plan and Goal runtime registration eager, while deferring only the top-level manager UI and fresh-session implementation handoff.

## Non-Goals

- Reintroduce generated runtime bundles or emit extension implementations outside `src/`.
- Change public tool or command names, parameter schemas, prompt guidance, settings files, defaults, persistence formats, or transport selection.
- Delay required state restoration or completion delivery merely to improve the module-import timing line.
- Optimize smaller extensions until the two dominant packages are measured again.
- Publish packages, create tags, or dispatch release workflows.

## Risks

- A dynamic import can finish after cancellation or session replacement, so every continuation must prove ownership before running implementation code.
- Lazy transport loading can race shutdown, so a loader must not start a turn after closure and must dispose an implementation that resolves after shutdown.
- Splitting registration from implementation can drift tool schemas or renderers, so one lightweight contract must remain the canonical owner.
- A lower module-import number can hide equivalent startup work, so both import time and first RPC response are completion gates.
- First use will pay a bounded one-time import cost, which must fail observably and remain retryable after loader rejection.

## Plan

- [x] Capture a five-run combined source baseline and Jiti import traces for both declared entries; evidence is recorded in Context and `/tmp/pi-slow-extensions-baseline.json`.
- [x] Add focused loader tests for idle registration, successful cache reuse, retry after rejection, and cancellation or replacement while a module is loading; evidence: `startup-imports.test.ts` and `lazy-loading.test.ts` pass.
- [x] Refactor `pi-subagents` registration boundaries so blocking execution, selected detached transports, inspection work, and manager UI remain absent from idle startup while all current tools and commands register synchronously; evidence: injected idle-loader test and Jiti benchmark passed.
- [x] Audit `pi-subagents` startup restoration, pending completion delivery, task cancellation, session replacement, shutdown, transport disposal, settings ordering, and invalid-file protection after each new lazy boundary; evidence: focused lifecycle tests and the 3,720-test root gate pass.
- [x] Refactor `pi-workflow` so `/workflow` manager UI and fresh-session handoff load only for those routes, with retryable loaders and generation checks before UI or session replacement; evidence: four focused lazy-loading regressions pass.
- [x] Update focused READMEs and add patch Changesets for both published packages without changing public behavior claims; evidence: `.changeset/faster-extension-startup.md` is accepted by Changesets status.
- [x] Run focused `pi-subagents` and `pi-workflow` tests, then run the five-run combined benchmark and require at least a 30% import-median reduction with no first-response regression larger than three baseline MADs; evidence: import median improved from 1,932 ms to 1,064 ms (44.9%) and first response from 3,056.21 ms to 2,081.75 ms (31.9%).
- [x] Run `npm run check`, `just pack subagents`, `npm pack --workspace @narumitw/pi-workflow --dry-run --json`, and offline Pi RPC entrypoint smokes; evidence: Node 26.5.0 root check passed 3,720 tests, both package inspections contain complete source trees, and combined RPC command discovery returned success.
- [x] Audit the final diff against the extension and settings guides, recording cancellation, disposal, replacement, shutdown, settings, benchmark, test, pack, smoke, deviation, and unverified-path evidence; evidence: only code modules are cached, loader rejection resets, lifecycle ownership is revalidated after awaits, idle transport shutdown does not load code, and no settings protocol changed.

## Completion Checklist

- [x] Idle startup does not evaluate deferred Subagents execution, selected transport, inspection, or manager implementations, nor Workflow manager or fresh-handoff implementations.
- [x] Every existing tool, command, schema, completion, renderer, direct route, settings behavior, and lifecycle contract remains available and tested.
- [x] Loader rejection is observable and retryable, and stale or aborted loads perform no tool, UI, process, session, persistence, or settings side effect.
- [x] Combined import median improves by at least 30% and first-response timing stays within the recorded regression gate.
- [x] Focused tests, `npm run check`, package inspections, offline Pi smokes, Changesets, and semantic audits pass with no unaccepted deviation.
