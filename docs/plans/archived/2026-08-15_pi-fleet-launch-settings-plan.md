# Pi Fleet launch settings plan

## Goal

Add persistent `/fleet` settings for the default terminal backend and per-launch confirmation, with the same effective launch policy applied to menu and `session_spawn` launches.

## Context

- The approved settings are **Default terminal** (`tmux` or `Ghostty`) and **Confirm new sessions** (`Ask` or `Skip`).
- The configured terminal replaces the per-launch backend selector when **New Pi session…** is chosen.
- An explicit `session_spawn.terminal` argument overrides the configured default.
- Disabling launch confirmation skips only the final launch preview for both menu and tool launches.
- Experimental consent remains required once per Pi Fleet runtime.
- The existing tmux default remains compatible when no settings file exists.

## Architecture

- Own user settings in `<getAgentDir()>/pi-fleet.json`; do not add project overrides or environment-variable overrides.
- Keep defaults, validation, ordered in-process persistence, unknown-field preservation, and atomic temporary-file-plus-rename publication in a new package-owned settings module.
- Reload settings during `session_start`, flush pending writes during `session_shutdown`, and retain the previous effective state when loading or publication fails.
- Let `FleetController` resolve omitted tool terminals and confirmation policy from the shared settings runtime.
- Project the same settings runtime into a Pi TUI Kit `settings` screen so TUI and RPC use one menu and one persistence path.
- Document that ordering is process-local; separately running Pi sessions reload the shared file on their next session start or `/reload`.

## Applicable MUST Rules

- Preserve the extension factory, command routes, TUI/RPC mode behavior, tool failure signaling, cancellation, stale-session checks, and session-owned cleanup; verify with focused lifecycle, menu, tool, and spawn tests plus review.
- Use the existing Pi TUI Kit manager for the standard Settings screen and keep unsupported print/JSON behavior unchanged; verify with TUI/RPC menu tests and typechecking.
- Use `getAgentDir()`, keep missing-file reads side-effect free, validate runtime JSON, preserve unknown fields, block malformed-file writes, serialize reads and writes, publish atomically, and reload/flush at lifecycle boundaries; verify with deterministic settings and lifecycle tests.
- Keep changed published behavior documented and represented by the existing Pi Fleet Changeset; verify with README review, Changesets status, and package dry run.
- Run the CI-equivalent `npm run check`; do not treat it as a substitute for the settings concurrency, cancellation, replacement, and failure-recovery audit.

## Non-Goals

- Do not make experimental consent configurable.
- Do not add project-scoped settings, environment overrides, terminal auto-detection, or backend fallback.
- Do not change split direction, first-task, readiness, kickoff, group, or messaging semantics.
- Do not synchronize effective in-memory settings across already-running Pi processes.

## Plan

- [x] Add focused settings tests for defaults, validation, side-effect-free missing loads, first save, unknown-field preservation, malformed-file protection, atomic failure recovery, and ordered read/write behavior; the absent new module prevented a valid executable red state, then the smallest implementation passed all six tests.
- [x] Implement `packages/pi-fleet/src/settings.ts` and make session start, shutdown, spawn terminal resolution, and launch confirmation consume one shared settings runtime; three focused spawn/lifecycle tests failed against the old behavior, then the settings, spawn, and extension suites passed all 20 tests.
- [x] Add focused failing menu tests for Settings navigation, immediate terminal/confirmation updates, rollback on save failure, configured-backend spawning without a backend prompt, and TUI/RPC adaptation; four focused tests failed against the old menu, then all nine menu tests passed with the Pi TUI Kit settings screen.
- [x] Update tool metadata, README settings/default/confirmation/lifecycle guidance, package layout, and the existing Changeset while preserving explicit terminal override behavior; all 88 Pi Fleet tests and package typechecking passed.
- [x] Run formatting, Pi Fleet tests, package typechecking, root `npm run check`, `just pack fleet`, Changesets status, and a local Pi entrypoint smoke; root checks passed 3,779 tests across 376 files, the dry-run package contains 22 declared files including `src/settings.ts`, the Changeset remains a minor bump, and the isolated entrypoint loaded successfully.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`, including cancellation, disposal, session replacement, shutdown, stale state after every await, settings ordering, invalid-file protection, unknown-field preservation, atomic publication, and all changed TUI/RPC/tool paths; no convention deviation remains, while process-local write ordering and unavailable live terminal smokes are documented limitations.

## Completion Checklist

- [x] Missing settings preserve tmux plus per-launch confirmation as the compatible defaults.
- [x] `/fleet → Settings` changes the default backend and launch confirmation immediately and durably.
- [x] Menu launches use the configured backend without asking for a backend each time.
- [x] Omitted `session_spawn.terminal` uses the configured backend, while an explicit argument wins.
- [x] Confirmation policy applies to menu and tool launches without suppressing experimental consent.
- [x] Invalid settings never get overwritten, failed saves restore the prior effective value, and lifecycle reads/writes remain ordered.
- [x] Documentation, Changeset, tests, checks, package contents, and unverified smokes are accurately reported.
