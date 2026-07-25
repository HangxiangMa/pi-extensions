# pi-goal Menu Redesign Plan

## Goal

Make bare `/goal` a current-state, menu-first TUI manager while preserving every established direct command, non-TUI behavior, persisted goal/queue data, RPC contract, and failure rollback. Add an interactive settings screen, safe previews for consequential menu actions, focused tests, and updated user documentation.

## Context

- Bare `/goal` currently emits a dense notification containing state and command hints.
- Direct routes such as `/goal <objective>`, `/goal pause`, `/goal status`, queue routes, and compatibility aliases are public interfaces and remain supported.
- Goal state is session-owned; settings are user-owned in `pi-goal.json` and currently reload only at session boundaries.
- The approved UX makes TUI bare `/goal` interactive. Print, JSON, and RPC keep deterministic status behavior.

## Architecture

- Add `extensions/pi-goal/src/menu.ts` to own menu presentation, dynamic action availability, shallow navigation, confirmation previews, help, and delegation to `GoalCommandController`.
- Add `extensions/pi-goal/src/settings-ui.ts` to own the `SettingsList` interaction and immediate, serialized setting application.
- Extend `extensions/pi-goal/src/settings.ts` with atomic, unknown-field-preserving persistence.
- Keep lifecycle/tool contracts in `goal.ts`, goal mutations in `commands.ts`, and runtime safety/state transitions in `runtime.ts`.
- Use Pi-provided `select`, `editor`, `input`, `confirm`, and `SettingsList`; Escape/cancel returns without mutation.

## Non-Goals

- No new slash command or generic `/settings` command.
- No removal or semantic rewrite of existing direct subcommands, aliases, RPC channels, or persisted session formats.
- No project-scoped settings or settings-file migration.
- No custom visual overlay or replacement selector.

## Assumptions

- The approved proposal authorizes the complete scope, including interactive settings.
- Direct destructive routes remain immediate for compatibility; confirmations apply to menu-driven routes.
- Terminal screen-reader support is limited by Pi TUI, so accessibility verification covers text labels, keyboard/IME-compatible built-ins, focus/cancel behavior, non-color cues, and bounded rendering.

## Risks

- Applying tool visibility or queue settings live can conflict with active goal state; application must reuse runtime ownership/safety methods and roll back both the file and effective setting on failure.
- Settings callbacks can overlap; serialize writes and keep the queue usable after a rejected save.
- Long or hostile objective text can corrupt terminal presentation; sanitize control characters and use bounded previews while preserving raw objective data for mutations.
- Bare `/goal` changes in TUI; `/goal status` and all non-TUI invocations must retain status output.

## Plan

- [x] Add focused failing tests for atomic settings saves, nested unknown-field preservation, malformed-file refusal, and write-failure cleanup in `extensions/pi-goal/test/settings.test.ts`; red evidence: `tsc -p tsconfig.test.json` failed because `saveGoalSettings` was absent.
- [x] Implement atomic unknown-field-preserving settings persistence in `extensions/pi-goal/src/settings.ts`; evidence: focused compiled settings test passes (8/8).
- [x] Add focused failing menu tests covering empty/active/stopped/budget/frozen action models, terminal-safe bounded state text, cancellation, destructive previews, and delegation in a new `extensions/pi-goal/test/menu.test.ts`; red evidence: test compilation failed because `src/menu.ts` did not exist.
- [x] Implement `extensions/pi-goal/src/menu.ts` with dynamic current-state menus, start/edit/budget/queue workflows, confirmations, status/help actions, and shallow return/exit behavior; evidence: focused compiled menu test passes (5/5).
- [x] Add focused failing settings-UI tests for immediate persistence ordering, rollback, arbitrary limits, live limit enforcement, and non-TUI behavior in a new `extensions/pi-goal/test/settings-ui.test.ts`; red evidence: test compilation failed because `src/settings-ui.ts` did not exist.
- [x] Implement `extensions/pi-goal/src/settings-ui.ts` with `SettingsList`, serialized saves, confirmation-gated experimental/limit changes, and the minimum runtime setting-application boundary needed to preserve tool, queue, goal, and rollback invariants; evidence: focused compiled settings-UI test passes (4/4).
- [x] Wire bare TUI `/goal` to the manager in `extensions/pi-goal/src/goal.ts`, retain `/goal status` and non-TUI summary behavior, and add integration coverage in `extensions/pi-goal/test/goal.test.ts`; evidence: focused goal/menu/settings suites pass (155/155), including TUI and print dispatch while menu state tests cover pending/frozen guards.
- [x] Update `extensions/pi-goal/README.md` with the menu-first workflow, direct-route compatibility, confirmations/cancellation, settings behavior, supported modes, and keyboard operation; verified against command parsing, manager actions, and mode-dispatch tests.
- [x] Format only changed files and run focused pi-goal tests, `npm run typecheck --workspace @narumitw/pi-goal`, `npm run check:boundaries`, the full `npm run check`, `just pack-goal`, and runtime/load smokes; evidence: focused suites passed, workspace typecheck and boundaries passed, `npm run check` passed 1,349 tests, runtime smoke passed, pack contained all 19 intended files, and `pi -ne -p --no-session -e ./extensions/pi-goal "/goal status"` loaded the extension and produced the expected observable status rejection.

## Completion Checklist

- [x] TUI bare `/goal` exposes state-appropriate Start, Pause, Resume, budget recovery, queue, Status, Settings, Help, Clear, and Close actions without hiding the only route to a capability.
- [x] Empty, active, paused/blocked/usage-limited, budget-limited, complete, pending, queue-enabled, and frozen states have deterministic menu or fallback behavior.
- [x] Menu cancellation and failed start/edit/settings delivery leave goal IDs, queue data, settings, active tools, safety counters, and prior valid state intact.
- [x] Menu-driven Replace, Clear, Skip, Drop last, and Prioritize show the exact affected objective(s) and require confirmation.
- [x] Settings saves are serialized, atomic, preserve unknown fields, refuse malformed input, and roll back display/runtime state on failure.
- [x] Existing direct commands, hidden aliases, non-TUI status behavior, RPC/events, settings defaults, and persisted formats remain compatible.
- [x] Menu/status rendering is terminal-safe, non-color-dependent, keyboard operable, IME-compatible through Pi built-ins, and bounded at narrow/normal/wide tested widths.
- [x] Tests, repository checks, package dry run, documentation review, and applicable runtime smoke all pass with no known required work remaining.
