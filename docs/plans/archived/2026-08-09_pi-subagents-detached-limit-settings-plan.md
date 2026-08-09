# Expand pi-subagents detached limit settings

## Goal

Let users edit the existing detached-subagent capacity and concurrency limits from `/subagents` instead of requiring manual JSON changes.

Expose `stateful.maxAgents`, `stateful.maxActiveTurns`, `stateful.maxChildrenPerAgent`, `stateful.maxDepth`, and `stateful.maxStoredAgents` while preserving their current defaults and accepted values.

## Context

The runtime already reads all five fields from `~/.pi/agent/pi-subagents.json`.

Only `blocking.maxParallelTasks` currently has an interactive numeric editor.

The detached registry and persistence layer capture these five limits during extension startup, so changing them safely requires a later `/reload` or session restart.

Lowering `maxAgents`, `maxDepth`, or `maxStoredAgents` below current retained state can prevent some records from being restored after reload and therefore needs a clear preview and confirmation.

## Architecture

- Keep `settings.ts` as the owner of validation, inspection, source reporting, and atomic user-setting updates.
- Centralize the five defaults and effective-value resolution so `AgentRegistry`, `AgentPersistence`, status output, inspection output, and the editor cannot drift.
- Add **Detached agent limits** under `/subagents` → **Advanced settings** and keep the existing **Maximum parallel workers** route unchanged.
- Put the five related settings on one action screen, with one numeric input screen per field and current-session versus configured values shown before editing.
- Save each accepted value immediately, but do not mutate the live registry or automatically reload; report that the value applies after `/reload` so users can make several edits before one restart.
- Keep the numeric editor and destructive-lowering preview in a dedicated module so `config-ui.ts` remains below the repository's 1,000-line review threshold.
- Expose current and configured detached limits through `/subagents status`, `/subagents help`, manager summaries, and `subagent_inspect status` for TUI and non-TUI observability.

## Non-Goals

- Do not make the fixed blocking execution concurrency of four configurable in this change.
- Do not change blocking single, chain, parallel, aggregator, or detached scheduling semantics.
- Do not add arbitrary presets or narrow the currently accepted safe-integer domains.
- Do not expose mailbox, byte, timeout, retention-day, or idle-TTL settings as agent-count controls.
- Do not add project-scoped settings or new environment variables.
- Do not automatically close, evict, interrupt, or reload retained agents after a save.

## Assumptions

- “More quantity options” means exposing the five existing detached-agent limits, not introducing additional resource limits.
- Numeric inputs are preferable to fixed value cycles because the existing settings accept user-selected safe integers and no evidence supports a smaller preset list.
- `maxDepth` continues to accept zero, while the other four fields continue to require positive safe integers.
- Cross-field combinations remain valid as they are today; for example, `maxActiveTurns` may exceed `maxAgents`, although the smaller live capacity remains the effective practical bound.

## Risks

- Duplicate defaults could make the UI report a value different from the registry or persistence layer, so all consumers must use one resolver.
- Lower values can reduce restored capacity, so the editor must identify affected retained agents before saving and cancellation must leave the file unchanged.
- A manual file change can make configured values differ from the current startup snapshot, so every screen must label current and configured values separately.
- A malformed or concurrently changed settings file could otherwise be overwritten, so every write must reuse the existing mutation lock, latest-document read, unknown-field preservation, and atomic rename protocol.
- Reloading while detached agents are retained can interrupt work, so the editor must never reload automatically and must direct users to Current agents before a deliberate reload.

## Plan

- [x] Add a shared detached-limit definition and resolver for the five fields, their defaults, labels, descriptions, and validation domains; `stateful-limits.ts`, registry, persistence, runtime tests, and session-refresh tests use the same resolved values.
- [x] Add structured inspection and a field-specific updater in `packages/pi-subagents/src/settings.ts`; settings tests verify side-effect-free defaults, unknown-field preservation, invalid-file protection, legacy seeding, expected-tuple rejection, and canonical publication races.
- [x] Extend `StatefulSubagentRuntimeStatus` and `subagent_inspect status` with current and configured limits plus per-field sources; inspect and renderer tests verify structured and TUI-visible output.
- [x] Add `packages/pi-subagents/src/stateful-limit-ui.ts` with five validated numeric input flows; manager tests verify every label and 64-cell rendering.
- [x] Wire the new screen into `/subagents` → **Advanced settings** without moving the existing parallel-limit route; tests cover Escape, Ctrl+C, invalid input, session replacement, shutdown, and stale confirmation snapshots.
- [x] Implement startup-only save behavior with reload messaging; tests save multiple values while the current runtime remains unchanged and verify later session starts refresh the limits.
- [x] Add ancestry-aware lowering previews for `maxAgents`, `maxDepth`, and `maxStoredAgents`; tests cover exact projected counts, cancellation, changed snapshots, session replacement, and settings-write failure.
- [x] Update manager summary, status, help, spawn guidance, structured inspection, and inspect rendering with effective and configured capacity information.
- [x] Update `packages/pi-subagents/README.md` and add `.changeset/bright-otters-scale.md` with a minor release intent.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`; independent review passed after lifecycle-order, configured-divergence, renderer, and field-specific preview fixes.

## Completion Checklist

- [x] `npm run check --workspace @narumitw/pi-subagents` passed, and all 14 pi-subagents test files passed with 205 tests.
- [x] `VITEST_MAX_WORKERS=4 npm run check` passed Biome, boundaries, all workspace typechecks, 230 test files, and 2,623 tests.
- [x] `just pack subagents` passed and the 44-file dry-run tarball contains the new modules, README, manifest, source, and license.
- [x] A real `pi -e ./packages/pi-subagents` pseudo-TTY smoke loaded the extension; enhanced-keyboard automation could not traverse the menu, so the accepted deterministic harness fallback covers successful multi-save, cancellation, reload messaging, stale sessions, and narrow widths.
- [x] Independent review returned PASS after all correctness, lifecycle, settings, compatibility, UX, and evidence findings were resolved.
- [x] Archive this plan under `docs/plans/archived/` after every task and completion check has evidence.
