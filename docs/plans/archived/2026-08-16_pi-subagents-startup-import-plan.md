# pi-subagents startup import plan

## Goal

Reduce `@narumitw/pi-subagents` idle startup load time without changing user-facing behavior.

The measured baseline is `PI_TIMING=1 pi -ne -ns -np -e packages/pi-subagents/`, where `src/index.ts module import` took about 512ms and factory execution took about 1ms.

Success means the same command shows a materially lower module import time on the same machine, target under 300ms, or the remaining blocker is isolated with evidence.

## Context

Pi loads TypeScript extensions through jiti, so top-level TypeScript import graph size directly affects startup.

The current thin entrypoint forwards to `src/subagents.ts`, but that module statically imports registration, rendering, settings, schema, and stateful runtime modules.

An esbuild split-metafile inspection showed large startup-reachable chunks from `stateful.ts`, `registry.ts`, `work-item-ledger.ts`, `render.ts`, `settings.ts`, `params.ts`, and related modules.

Repository extension gates apply because this changes extension loading, tool registration, settings access, command surfaces, lifecycle cancellation, and verification behavior.

`docs/extension-conventions.md` and `docs/extension-settings.md` were read during planning and again before implementation.

## Non-Goals

Do not change the public tool names, command names, settings file path, settings semantics, or default enabled surfaces.

Do not change the package manifest away from the repository-required `"pi": { "extensions": ["./src/index.ts"] }` shape in this iteration.

Do not introduce a build-only runtime entrypoint unless a separate approved package convention change is made.

## Architecture

Keep `src/index.ts` as a thin default-export forwarder.

Make the startup path responsible only for registering commands, tools, hooks, lightweight schemas, and lightweight render callbacks.

Move runtime-heavy implementation behind cached dynamic imports that run only when a tool, command UI, or transport is actually used.

Split settings reads needed at startup from settings writes, migrations, locks, and UI helpers used only by configuration actions.

Preserve lifecycle ownership by keeping cancellation controllers and session-generation guards in the registration layer.

## Plan

- [x] Record a reproducible baseline by running `PI_TIMING=1 pi -ne -ns -np -e packages/pi-subagents/` at least three times; capture the import, factory, and total timings in the final handoff.
  Evidence: after `npm install`, baseline module import/factory/total extension timings were `1091/2/1093ms`, `520/2/522ms`, and `529/2/531ms`, so the warm median module import was 529ms.

- [x] Generate an import-size snapshot with an esbuild metafile or equivalent dependency graph; identify which startup-reachable modules remain above 10KB of bundled output.
  Evidence: `/tmp/pi-subagents-startup-baseline.json` showed startup-reachable chunks over 10KB dominated by `stateful.ts` and registry/persistence modules, `render.ts`, `automation-contract.ts`, `params.ts` plus `panel-planning.ts`, `work-item-ledger.ts`, `settings.ts`, `agents/discovery.ts`, `result-contract.ts`, and `delegation-contract.ts`.

- [x] Split `packages/pi-subagents/src/settings.ts` into lightweight read/inspection exports and write/migration/lock exports; verify startup imports no longer load `proper-lockfile` by static import inspection and `npm test`.
  Evidence: the mutation lock now lazy-loads `proper-lockfile` inside `withSettingsMutationLock()`, `rg "proper-lockfile|lockSync" packages/pi-subagents/src/settings.ts packages/pi-subagents/src -n` shows no static import, and focused settings tests plus `npm run check` passed.
  Deviation: public synchronous settings utility exports remain in `settings.ts` to preserve the existing import contract.

- [x] Update settings consumers so startup registration imports only read/inspection helpers, while config UI and save paths dynamically import write helpers; verify malformed-file, migration, unknown-field preservation, and save tests still pass.
  Evidence: config UI remains dynamically imported from `config-registration.ts`, status/help are now dynamically imported, settings writes no longer load `proper-lockfile` before mutation, and `settings.test.ts` plus `subagents-settings-persistence.test.ts` passed.
  Deviation: write helpers remain synchronous and are not converted to async dynamic imports because tests and public utilities import them synchronously from `src/settings.ts` and `src/subagents.ts`.

- [x] Split stateful registration from heavy stateful runtime by moving registry, persistence, work ledger, transport, and context-snapshot work behind cached on-demand imports; verify idle `startup-imports.test.ts` still proves no transport or execution implementation is loaded.
  Evidence: `stateful.ts` now uses cached dynamic loaders for completion delivery, context, transport creation, cwd policy, persistence, registry, lifecycle, workspace, discovery, grants, runtime policy, retained semantic state, semantic comparison, and spawn hashing; `startup-imports.test.ts` passed.

- [x] Preserve stateful lifecycle cleanup by keeping session replacement and shutdown handlers active before lazy runtime initialization; verify with stateful lifecycle and registry tests.
  Evidence: session replacement and shutdown handlers still clear generation, broker, timers, registry, persistence, isolated workspaces, seen messages, and pending idempotent spawns; lazy loader promises reset after rejection; stateful lifecycle and registry focused tests passed.

- [x] Not applicable: Split blocking tool rendering so startup does not import full `render.ts`, panel renderers, runner types, or deep result helpers unless rendering or execution needs them; verify tool call/result rendering tests still pass.
  Evidence: Pi `ToolDefinition.renderCall` and `renderResult` are synchronous and must return a `Component`, so the existing rich blocking renderer cannot be loaded asynchronously without changing user-facing rendering; `formatUsageStats` and `formatTokens` were split to `usage-format.ts` to keep utility exports lighter, and `tool-rendering.test.ts` passed.

- [x] Evaluate whether `params.ts` can be made lighter without weakening tool schemas; if not, document it as an accepted startup dependency with size evidence.
  Evidence: `PANEL_PRESETS` moved to lightweight `panel-presets.ts`, which removed the `panel-planning.ts` -> `work-item-ledger.ts` startup path while preserving the same TypeBox schema enum.

- [x] Re-run the import-size snapshot and compare startup-reachable modules against the baseline; keep any remaining heavy top-level imports only with a documented reason.
  Evidence: `/tmp/pi-subagents-startup-final.json` removed the startup-reachable `work-item-ledger.ts` chunk and reduced the stateful startup chunk from about 164KB to about 64KB.
  Remaining over-10KB blockers are the synchronous blocking renderer, stateful tool schemas/renderers, automation schema, settings validation, agent discovery/catalog formatting, result contract schema, and delegation contract schema.

- [x] Re-run `PI_TIMING=1 pi -ne -ns -np -e packages/pi-subagents/` at least three times on the same machine; compare median module-import timing with the baseline.
  Evidence: final module import/factory/total extension timings were `473/1/475ms`, `359/1/360ms`, and `352/1/354ms`, so the warm median module import was 359ms versus the 529ms baseline.

- [x] Run focused package tests that cover startup imports, settings, stateful lifecycle, config commands, blocking execution, consult, inspect, and rendering; record the exact command and result.
  Evidence: `npx vitest run packages/pi-subagents/test/startup-imports.test.ts packages/pi-subagents/test/settings.test.ts packages/pi-subagents/test/subagents-settings-persistence.test.ts packages/pi-subagents/test/stateful-session-lifecycle.test.ts packages/pi-subagents/test/stateful-tool-registration.test.ts packages/pi-subagents/test/config-ui.test.ts packages/pi-subagents/test/blocking-subagents-execution.test.ts packages/pi-subagents/test/consult.test.ts packages/pi-subagents/test/inspect.test.ts packages/pi-subagents/test/tool-rendering.test.ts` passed 82 tests across 9 files; `npx vitest run packages/pi-subagents/test/subagents-manager-ui.test.ts packages/pi-subagents/test/subagents-settings-ui.test.ts packages/pi-subagents/test/registry-lifecycle-and-budgets.test.ts packages/pi-subagents/test/registry-persistence.test.ts packages/pi-subagents/test/registry-completion-delivery.test.ts` passed 34 tests across 5 files.

- [x] Run `npm run check`; record the result, or leave this task unchecked with the failure and next action.
  Evidence: first `npm run check` found Biome import ordering issues and one flaky `pi-worktree` temp-directory cleanup failure; `npx vitest run packages/pi-worktree/test/settings.test.ts` then passed, the Biome issues were fixed, and the second `npm run check` passed.

- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`; record touched MUST areas, checks, smokes, deviations, and unverified paths in the handoff.
  Evidence: audit completed for extension factory loading, lifecycle cleanup, tool cancellation, command non-TUI behavior, settings read/write ordering, invalid-file protection, unknown-field preservation, atomic publication, package metadata, Changesets, and verification behavior.

## Risks

Lazy imports can move failures from startup to first use, so first-use error paths must remain observable and cancellable.

Splitting settings can accidentally weaken invalid-file protection or write ordering, so settings tests must cover read and save paths together.

Splitting stateful runtime can break shutdown of partially initialized resources, so session replacement and shutdown tests are mandatory.

Micro-benchmark timing may vary because jiti and OS caches affect repeated runs, so compare multiple runs on the same machine.

## Completion Checklist

- [x] Startup timing evidence shows a materially lower median module-import time, or remaining cost is isolated with evidence.
  Evidence: warm median module import improved from 529ms to 359ms, and the final esbuild snapshot isolates the remaining synchronous startup imports.

- [x] No public command, tool, settings, or lifecycle behavior changed except startup performance.
  Evidence: public tool names, command names, manifest entrypoint, settings file path, and synchronous utility exports are preserved; focused behavior tests and `npm run check` passed.

- [x] Focused tests and `npm run check` passed, or any skipped/unavailable check is explicitly documented.
  Evidence: focused tests passed, root `npm run check` passed after rerunning and fixing the initial Biome issues, and no checks remain skipped.

- [x] Final handoff names the extension-convention and settings audits, runtime smoke evidence, deviations, and unverified paths.
  Evidence: this plan records the deviations and the final PR handoff must include the audit and smoke evidence.
