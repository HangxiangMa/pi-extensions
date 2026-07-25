# pi-sync pull after target switch

## Goal

Make target switching ask to pull by default, with a persisted setting for always pulling or retaining switch-only behavior, while preserving pi-sync conflict checks, backups, and non-interactive safety.

## Plan

- [x] Add failing pi-sync regression tests for ask, always-pull, switch-only, non-interactive, failure, and settings persistence behavior; focused run failed in the four intended missing-behavior assertions (prompt, pull, switch-only feedback, persistence).
- [x] Add validated `targetSwitchAction` settings resolution and atomic persistence while preserving unknown fields; focused validation and settings-menu persistence tests pass.
- [x] Update target-switch and Settings flows to apply the selected policy through the existing locked pull path without forcing conflicts; focused prompt, cancellation, success, non-TUI, and failure tests pass.
- [x] Update `extensions/pi-sync/README.md` with defaults, accepted values, interaction, and recovery behavior; documented values and safeguards match the implementation.
- [x] Run focused pi-sync tests, `npm run check`, and review the final diff for bounded scope and preserved compatibility; 33 focused tests and all 1,296 repository tests pass, and `just pack-sync` includes the new module.

## Completion Checklist

- [x] Omitted settings default to asking in TUI and never cause an implicit pull without an interactive confirmation.
- [x] `pull` skips pull confirmation but retains locking, backup, conflict detection, cancellation, and failure reporting through the existing pull path.
- [x] `switch-only` preserves the prior switch behavior.
- [x] Non-TUI ask mode switches without pulling and provides actionable feedback where the mode supports it.
- [x] Existing settings and unknown fields remain valid and preserved.
- [x] The completed plan is archived under `docs/plans/archived/`.
