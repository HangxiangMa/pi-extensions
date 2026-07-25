# Resolve pi-sync target-switch review comments

## Goal

Resolve every inline review comment on PR #374 without weakening pull safety or legacy-config compatibility.

## Plan

- [x] Add focused regressions for target pinning, current-target idempotence, concrete pull confirmation, SettingsList behavior, and legacy settings visibility; verified all five focused tests failed for the intended reviewed behavior.
- [x] Pin post-switch work to the selected target, skip no-op switches, and retain the normal concrete pull confirmation; all 37 focused multi-profile tests pass, including direct and manager concurrency cases.
- [x] Replace nested settings selectors with a SettingsList that serializes saves, restores failed values, and omits target-switch choices for legacy settings; focused persistence, rollback, and legacy tests pass.
- [x] Update user documentation and durable repository memory for the corrected safety behavior; README policy and package layout now match the implementation and tests.
- [x] Run `npm run check`, inspect the PR diff, and package pi-sync; all 1,300 repository tests pass, `git diff --check` passes, and `just pack-sync` includes `src/settings-ui.ts`.

## Completion Checklist

- [x] All five inline review comments are addressed by code, tests, and documentation.
- [x] The repository CI-equivalent gate passes.
- [x] The completed plan is archived under `docs/plans/archived/`.
