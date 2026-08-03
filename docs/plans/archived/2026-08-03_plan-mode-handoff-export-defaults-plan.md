# Plan mode handoff and export defaults plan

## Goal

Let users choose how long an accepted plan continues guiding implementation and configure the default
Plan export destination. Keep the current retained-plan behavior and `PLAN.md` export destination as
backward-compatible defaults.

## Context

- The approved Settings redesign keeps four goal-oriented rows on one level: **Plan thinking**,
  **Plan tools**, **After Implement**, and **Export destination**.
- **After Implement** offers **Keep plan active**, **Use plan for handoff only**, and **Clear after
  first implementation run**. The Implement menu previews the effective result before the user
  confirms it.
- **Export destination** is used only when an export omits its path. Explicit `/plan export <path>`
  input remains authoritative, and export never overwrites an existing target.
- Settings saves are immediate and atomic. Retention changes apply to the next Implement action;
  export-destination changes apply to the next export.
- `extensions/pi-plan-mode/src/plan-mode.ts` is already near the 1,000-line boundary, so lifecycle
  work must move into a responsibility-focused module rather than growing that file.

## Architecture

- Extend `PlanModeSettings` with `implementationPlanRetention` and optional
  `defaultPlanExportPath`. Missing fields resolve to `keep` and `PLAN.md`; resetting the export
  destination removes its override.
- Capture the effective retention policy in each active implementation state. Legacy retained state
  without the field restores as `keep`, and later global Settings changes cannot alter an existing
  implementation.
- Add an implementation-retention coordinator outside `plan-mode.ts` that binds cleanup to one
  implementation ID and lifecycle phase. **Use plan for handoff only** must preserve the complete
  plan through the first implementation context assembly before clearing retained status/context.
  **Clear after first implementation run** clears only after that implementation's fully settled run,
  not after an older queued run settles.
- Resolve an omitted export path from Settings at action time against the current `ctx.cwd`. Pass the
  same effective default and resolved preview through ready, saved, and active menus instead of
  duplicating `PLAN.md` placeholders.
- Keep the Settings screen flat. The retention row uses three user-facing result labels; the export
  row opens one input screen that shows the configured and currently resolved destination. Empty
  submission resets to `PLAN.md`; Escape returns without saving.

## Non-Goals

- No automatic export on Implement, project-scoped setting, environment-variable override,
  `/plan settings` route, overwrite option, or change to explicit export-path precedence.
- No retroactive retention-policy change for an implementation already in progress.
- No basic/advanced Settings sections or extra confirmation dialog after the outcome is previewed in
  the Implement menu.

## Risks

- Clearing retained state too early can cause the context hook to remove the only implementation
  handoff. The lifecycle contract must prove that the first implementation request still contains the
  complete plan.
- A queued implementation can overlap settlement from an older run. Cleanup must be armed by the
  matching implementation run and guarded by implementation ID, session generation, replacement,
  and supersession.
- Relative export defaults vary by working directory. Every export screen must show the current
  resolved preview, and notifications must report the actual written path.
- Long or control-bearing path text can corrupt or overflow terminal output. Validation,
  sanitization, wrapping, truncation detail, and raw action identity require separate tests.

## Rollback / Recovery

- Omitting both new fields restores the exact current behavior, so reverting runtime/UI support does
  not require a data migration. Unknown fields remain preserved by older-compatible writes.
- Failed settings publication keeps the previous displayed, in-memory, and on-disk values. Failed
  implementation delivery restores the previous ready or saved state and never performs automatic
  cleanup. Failed or cancelled export keeps plan state and the existing target unchanged.
- `/plan exit` remains the explicit recovery route for any retained active implementation.

## Plan

- [x] Verify Pi's implementation-request event ordering and encode the first-context/settled-run contract in focused lifecycle tests; evidence: Pi 0.83.0 documents `context` before each LLM call and `agent_settled` after retries/compaction/queues, and the new lifecycle suite first failed before retention support, then passed exact-handoff and older-settlement guards.
- [x] Add failing settings tests for both new fields, missing-field defaults, strict enum/path validation, reset semantics, latest-document patching, legacy canonical promotion, unknown-field preservation, abort, atomic failure, and ordered concurrent saves; evidence: the first compile failed on the absent exports, fields, and patch surface before implementation.
- [x] Implement the settings schema and persistence patches in `extensions/pi-plan-mode/src/settings.ts`, preserving side-effect-free reads and existing concurrency guarantees; evidence: 12 focused settings tests passed, including three repeated deterministic concurrency runs.
- [x] Add failing Settings-menu tests for the four flat goal-oriented rows, three retention outcomes, export-path input and resolved preview, empty reset, Escape cancellation, cursor/focus restoration, rollback, invalid read-only state, RPC adaptation, terminal controls, long paths, and narrow widths; evidence: focused tests failed against the old two-row screen before implementation.
- [x] Implement the approved flat Settings experience in `extensions/pi-plan-mode/src/settings-menu.ts`, with immediate atomic feedback and no retroactive change to current implementation state; evidence: 9 TUI/RPC Settings tests passed, including active-state capture and immediate next-export integration.
- [x] Add failing implementation-flow tests for effective-policy previews and the `keep`, handoff-only, and first-run policies across ready and saved plans, send failure, busy queued handoff, retries/settlement, resume, fork, compaction, session replacement, supersession, and manual `/plan exit`; evidence: preview and lifecycle tests failed before menu/coordinator integration, then passed alongside existing send-failure, fork, compaction, and replacement suites.
- [x] Extract a responsibility-focused implementation-retention coordinator and integrate captured per-implementation policy into state restore, context transformation, status cleanup, and Implement menus; evidence: `implementation-retention.ts` owns matching/arming and all active source files are at or below 1,000 lines (`plan-mode.ts`: 992).
- [x] Add failing export tests proving configured defaults across ready, saved, and active plans in TUI, RPC, print, and JSON modes, including explicit-path precedence, relative/absolute resolution, `@` compatibility, empty reset, existing file/directory/symlink refusal, cancellation, long/control-bearing display, and consistent placeholders/previews; evidence: three configured-default export tests failed before settings-aware routing, then passed with the existing refusal/cancellation matrix.
- [x] Implement one settings-aware export-default resolver and thread its effective path/preview through direct routes and all export menus without changing overwrite or ready-plan exit semantics; evidence: `plan-export-controller.ts` and shared `plan-export-screen.ts` drive direct and menu paths, with 18 export tests passing.
- [x] Update `extensions/pi-plan-mode/README.md` with user-facing labels, defaults, application timing, JSON values, resolved-path behavior, retention/compaction trade-offs, explicit-route precedence, failure recovery, and supported modes; evidence: README behavior and JSON values match focused tests and the RPC smoke.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`, including command modes, settings concurrency, lifecycle revalidation after every await, context ownership, cancellation/disposal/replacement/shutdown, path safety, and the source-file size boundary; evidence: no product deviation accepted, no package metadata changed, and a separate deterministic gate-fixture fix removed a pre-existing 5 ms timing race in `pi-btw` tests.

## Completion Checklist

- [x] Focused settings, Settings-menu, implementation lifecycle, restore/compaction, export, command-mode, and responsive TUI/RPC tests pass without timing-based waits (160 focused tests).
- [x] Missing new fields preserve `keep` plus `PLAN.md`, legacy sessions restore safely, unknown settings fields survive every save, and current active implementations ignore later global retention changes (focused settings and retention tests).
- [x] Every active source file is at or below 1,000 lines (`plan-mode.ts` is 992; no justification needed).
- [x] `npm test` passes (2,309/2,309 tests).
- [x] `npm run check` passes (Biome, boundaries, workspace typechecks, and 2,309 tests).
- [x] `just pack plan-mode` succeeds; inspected 27 files including README and all new `src` modules.
- [x] A real non-interactive RPC smoke verified the four Settings rows, handoff-only preview, `smoke/PLAN.md` resolution, and active-plan cleanup under isolated temporary agent/session directories.
- [x] Every task and completion check has evidence; archive destination was checked before moving this file to `docs/plans/archived/`.
