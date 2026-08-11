# Pi File Context menu redesign plan

## Goal

Make `/file-context` open a clear File Context menu where users can add, inspect, and repeatedly remove pending quotes without remembering a subcommand.

## Architecture

- Keep quote snapshots, limits, injection order, and lifecycle ownership in `packages/pi-file-context/src/file-context.ts`.
- Add a package-owned menu module that lazy-loads `@narumitw/pi-tui-kit`, projects current pending state into standard actions, choice, and detail screens, and delegates mutations to identity-safe callbacks.
- Give each pending quote a session-local stable ID so duplicate paths, ranges, or snapshots never rely on display labels for removal.
- Keep the configured shortcut as the direct explorer path, add `/file-context browse` as the explicit direct route, and retain `/file-context remove` as a compatibility route into the removal screen.
- Use the session controller and generation checks across menu state loads, project scanning, explorer results, quote removal, session replacement, and shutdown.

## Non-Goals

- Do not add bulk clear, reorder, quote editing, persistence, or a settings menu.
- Do not change file discovery, content search, Git provenance, quote limits, prompt injection syntax, or settings storage.
- Do not support interactive File Context flows in RPC, JSON, or print mode.

## Risks

- Menu and custom explorer handoffs could lose Back versus Close semantics or leave stale components active.
- Duplicate quote labels could remove the wrong snapshot unless stable identity is kept separate from display text.
- Adding the Kit dependency could resolve an incompatible minor unless the package floor and lockfile are verified.
- Narrow terminals and untrusted paths or quote text could overflow or inject controls into menu output.

## Plan

- [x] Add focused failing tests for the main menu, disabled empty removal, Help, compatibility routes, direct shortcut behavior, repeated identity-safe removal, cancellation, loading failure, lifecycle replacement, terminal sanitization, and constrained layouts; the first runs failed because the menu module did not exist and command completion lacked `browse`.
- [x] Add the lazy-loaded File Context menu module and stable pending IDs; all 60 focused File Context tests pass with the Kit TUI harness.
- [x] Refactor explorer launch ownership so menu Add uses cancellable discovery, root Escape returns to the menu, Ctrl+C closes the browser, and direct shortcut or `browse` behavior remains compatible; the Kit scan loader maps either cancel key to a side-effect-free return to the menu.
- [x] Update package dependency metadata and lock resolution for the approved `@narumitw/pi-tui-kit` compatibility floor; root `npm install` resolves the package-local dependency to published version 0.51.0.
- [x] Update the README, package layout, commands, quick start, experimental limitations, and existing Changeset for the redesigned published behavior.
- [x] Audit the complete diff against `docs/extension-conventions.md`, including TUI-only mode handling, cancellation, disposal, stale awaits, sanitization, disabled reasons, widget state, unknown settings preservation, and independent installability; no settings storage changed and the proportionate no-confirmation removal trade-off remains as approved.
- [x] Run focused File Context tests and typecheck, the isolated full repository check, Changeset status, and `just pack file-context`; `npm run check` passed 3,006 tests and the 13-file dry-run tarball contains the new menu source.

## Completion Checklist

- [x] `/file-context` opens a responsive Add, Remove, and Help menu with visible pending and shortcut state.
- [x] Empty or limit-reached actions remain visible with textual reasons and cannot mutate state.
- [x] A user can preview and remove several exact pending quotes in one menu visit.
- [x] Back, Close, cancellation, errors, concurrent changes, session replacement, and shutdown preserve valid state and settle owned work.
- [x] `F8`, `/file-context browse`, and `/file-context remove` remain tested compatibility paths.
- [x] Documentation, dependency metadata, lockfile, Changeset, checks, and package contents match the implemented experience.
