# pi-sync remote-only custom path plan

## Goal

Allow the Included Content editor to add a safe agent-relative file or directory that does not yet
exist locally, so a new environment can pull custom content already present in remote snapshots.

## Plan

- [x] Add a focused `packages/pi-sync/test/sync.test.ts` regression proving a remote-only custom path can be added, reviewed, and saved without creating the local file; the focused test initially failed with `1 !== 3` because no add-path action existed.
- [x] Update `packages/pi-sync/src/file-selection.ts` with a generic Add custom path action that validates the entered path, keeps edits draft-only, and revalidates cancellation/session ownership after input; focused result: 18/18 tests passed.
- [x] Document remote-only custom paths in `packages/pi-sync/README.md` and add `.changeset/fresh-paths-sync.md` as a patch Changeset for `@narumitw/pi-sync`.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`; `npm run check` passed all 2,366 tests, Changesets reports the pi-sync patch, and `just pack sync` contains the updated source and README.

## Completion Checklist

- [x] A missing local custom path can be entered from TUI, appears selected in the draft, and is persisted only after reviewed Save; covered by the focused absent-path test.
- [x] Invalid, duplicate, overlapping, cancelled, disposed, replaced-session, and failed-save paths preserve the existing settings behavior; covered by new unsafe/replacement tests, existing policy validation, draft-disposal, concurrent-save, and full-suite coverage.
- [x] No extension-specific filename or cross-extension dependency is introduced; the action accepts generic validated agent-relative paths.
- [x] All plan tasks have evidence and the completed plan is archived as `docs/plans/archived/2026-08-07_pi-sync-remote-only-custom-path-plan.md`.
