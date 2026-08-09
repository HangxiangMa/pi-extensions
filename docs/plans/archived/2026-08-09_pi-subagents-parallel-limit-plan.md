# Configurable pi-subagents parallel limit

## Goal

Let users configure the maximum number of worker tasks accepted by one blocking parallel `subagent` call while preserving the current default of eight.

## Context

The blocking executor currently hard-codes an eight-task limit.

The detached runtime already has a separate `stateful.maxAgents` retained-record capacity, so this change will name and document the new setting specifically as a blocking parallel-task limit.

The setting will be user-owned in `~/.pi/agent/pi-subagents.json`, bounded to a safe documented range, and applied immediately by the manager UI.

## Plan

- [x] Add a validated `blocking.maxParallelTasks` setting with explicit default and absolute bounds; focused settings tests cover normalization, source inspection, legacy seeding, canonical publication races, malformed-file protection, and unknown-field preservation.
- [x] Enforce the effective setting in blocking parallel execution and expose the effective limit in model-facing guidance and status inspection; tests cover default, lowered, and raised limits plus observable rejection.
- [x] Add an Advanced settings input flow that validates, saves, and immediately applies the limit without stale-session use; tests cover success, stale disk/runtime convergence, invalid draft retention, cancellation, persistence rollback, runtime-registration rollback, and width-safe rendering.
- [x] Update `packages/pi-subagents/README.md` and add `.changeset/calm-ravens-delegate.md` for the published feature.
- [x] Audit the diff against `docs/extension-conventions.md` and `docs/extension-settings.md`; the flow owns no background task, uses the existing session-generation/abort owner, serializes input actions through Pi TUI Kit, applies runtime changes synchronously, restores runtime state on save failure, keeps disk unchanged on runtime failure, blocks invalid files, preserves unknown fields, and publishes through the existing lock plus atomic rename.

## Completion Checklist

- [x] Run focused pi-subagents tests and typechecking: 196 tests passed, and the package check passed.
- [x] Run the root CI-equivalent gate: `VITEST_MAX_WORKERS=4 npm run check` passed all 2,614 tests, Biome, boundaries, and workspace typechecks.
- [x] Run `just pack subagents` and inspect the 40-file dry-run tarball, including `src/parallel-limit-ui.ts`, source, README, manifest, and license.
- [x] Archive this completed plan under `docs/plans/archived/`.
