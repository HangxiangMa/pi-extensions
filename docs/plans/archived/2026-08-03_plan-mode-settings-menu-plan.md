# Plan mode settings menu plan

## Goal

Add inactive `/plan` settings for persistent default tools and thinking level, then lock settings and
workflow tools while Plan mode is active. Keep `/plan tools` as a compatibility shortcut to the same
pre-start draft selector used by **Choose tools, then start…**.

## Context

- Settings remain user-scoped in `pi-plan-mode.json`; `safeSubcommands` stays JSON-only.
- Accepted changes persist immediately but apply only to the next Plan workflow.
- Existing session tool overrides keep precedence over global defaults.
- Active and ready Plan menus expose neither Settings nor Configure tools.
- `/plan tools` stages while inactive, starts only on Done, and rejects while active.

## Architecture

- Extend the package-owned settings module with bounded reads, serialized latest-document patches,
  same-directory atomic publication, unknown-field preservation, and legacy-to-canonical explicit
  save behavior.
- Add a Pi TUI Kit settings flow with a thinking-level row and a default-tools multi-select/reset
  flow. Keep current-workflow activation and settings persistence separate.
- Reuse one pre-start tool draft flow for the launch menu and `/plan tools`; retain persisted session
  selection restoration for compatibility.

## Non-Goals

- No project settings, environment settings, `/plan settings` subcommand, or `safeSubcommands` UI.
- No release, package version, npm visibility, or dependency-range change.

## Plan

- [x] Create this executable plan and record the approved behavior. Evidence: approved plan copied to `docs/plans/2026-08-03_plan-mode-settings-menu-plan.md`.
- [x] Add failing settings tests for side-effect-free load, latest-document patching, unknown-field preservation, legacy explicit save, reset semantics, atomic failure, abort, ordered concurrency, and invalid read-only behavior. Evidence: `./node_modules/.bin/tsc -p tsconfig.test.json` failed on the intentionally missing `updatePlanModeSettings` and `awaitPlanModeSettingsWrites` exports.
- [x] Implement the settings persistence/runtime protocol in `extensions/pi-plan-mode/src/settings.ts`; pass the focused settings tests. Evidence: compiled test tree plus focused `settings.test.js` passed 10/10.
- [x] Add failing TUI/RPC settings-menu tests for thinking, automatic/explicit-empty tools, risk and unavailable rows, reset, rollback, width, cancellation, and disposal. Evidence: test-tree compilation failed because the intentionally specified `settings-menu.js` production module did not yet exist.
- [x] Implement the package-owned Settings flow with Pi TUI Kit and next-workflow-only in-memory publication; pass focused menu tests. Evidence: focused `settings-menu.test.js` passed 5/5 across TUI, RPC, persistence, rollback, width, and disposal paths.
- [x] Add failing launch/command tests for inactive Settings access, active menu locking, shared `/plan tools` staging, cancellation, active rejection, and supported modes. Evidence: focused launch tests failed on the four intended old behaviors (no Settings row, separate active selector, active mutation, and non-interactive acceptance).
- [x] Refactor the launch draft for shared menu/command use, remove the active tool selector path, and preserve session restore/precedence; pass focused command and regression tests. Evidence: all 143 compiled `pi-plan-mode` tests passed, including lifecycle, restore, launch, settings, and command-mode regressions.
- [x] Update `extensions/pi-plan-mode/README.md` for defaults, apply timing, Planning lock, legacy explicit save, and mode behavior. Evidence: Usage and Settings now distinguish persistent defaults, staged workflow overrides, active locking, canonical promotion, failure handling, and supported modes.
- [x] Reduce `extensions/pi-plan-mode/src/plan-mode.ts` from 1,001 lines to at most 1,000 without changing behavior; verify with Biome, TypeScript, and the focused package suite. Evidence: Biome passed, TypeScript compiled, `plan-mode.ts` is 998 lines, and the compiled package suite passed 143/143.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`, including command modes, settings concurrency, async UI lifecycle, and the final source-file size boundary. Evidence: reviewed the `origin/main...HEAD` worktree diff and affected callers for TUI/RPC/print/JSON behavior, generation and abort guards after awaits, disposal/replacement/shutdown draining, latest-valid-document reads, ordered same-path writes, invalid-file protection, unknown-field preservation, same-directory rename publication, terminal-safe errors, and the 998-line maximum. The approved legacy behavior is an explicit canonical promotion that preserves the legacy file—not an automatic migration—and the README documents that plus the intentionally in-process-only concurrency scope.

## Completion Checklist

- [x] Focused pi-plan-mode settings, menu, launch, default-tools, and plan-mode tests pass. Evidence: compiled package suite passed 143/143 after the final line-bound cleanup.
- [x] Every active source file remains at or below 1,000 lines, or has an explicit repository-approved justification. Evidence: `wc -l extensions/pi-plan-mode/src/*.ts` reports a maximum of 998 lines.
- [x] `npm test` passes after the final code change. Evidence: 2,292/2,292 tests passed.
- [x] `npm run check` passes after the final code change. Evidence: the CI-equivalent build, Biome, boundary, typecheck, and 2,292-test gate completed successfully.
- [x] `just pack plan-mode` succeeds after the final code change and the tarball contents are inspected. Evidence: dry run listed 24 intended files, including `src/settings-menu.ts`, and excluded tests and the removed `src/plan-tool-menu.ts`.
- [x] A non-interactive RPC smoke is run after the final code change, or the unavailable path is recorded. Evidence: a real `pi --mode rpc --no-session --no-extensions -e ./extensions/pi-plan-mode` process opened inactive Settings, returned to launch, started Plan mode, and emitted an observable locked-tools warning for active `/plan tools`.
- [x] All checks have evidence and this plan is archived under `docs/plans/archived/`. Evidence: every task and completion check is closed; archived as `docs/plans/archived/2026-08-03_plan-mode-settings-menu-plan.md`.
