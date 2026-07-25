# Pi Sync post-merge review follow-up

## Goal

Resolve all three unresolved review findings from PR #374 without weakening target-switch or pull safety.

## Context

`extensions/pi-sync/src/sync.ts` was already 1,002 lines on the branch baseline and is 1,003 lines after this change. It remains the cohesive command, lifecycle, and sync-operation orchestration module described in the package layout; extracting only the one-line pull outcome addition would split its existing operation contract without reducing coupling, so a mechanical decomposition is outside this bounded follow-up.

## Plan

- [x] Add focused regressions in `extensions/pi-sync/test/multi-profile.test.ts` for rejecting no-UI automatic pulls before state mutation, reporting retained targets after declined pull review, and avoiding unfocusable search inputs; all four targeted tests initially failed for the reviewed reasons.
- [x] Update `extensions/pi-sync/src/target-switch.ts`, `sync.ts`, and manager route plumbing so automatic pulls require observable UI before switching and concrete pull cancellation propagates back as a non-applied result with a switch-aware notice; the focused and complete multi-profile suites pass.
- [x] Remove search from the short settings screen and the adjacent file-selection `SettingsList` until its embedded input can receive focus through a public API; rendering regressions pass without the search field.
- [x] Update `extensions/pi-sync/README.md` with the supported headless target-switch behavior; documentation now matches tested print, JSON, TUI, and RPC expectations.
- [x] Run focused pi-sync tests, `npm run check`, and `just pack-sync`, then inspect the intended diff; 39 multi-profile tests and all 1,305 repository tests pass, and the dry run contains the expected 22 package files.

## Completion Checklist

- [x] All three PR #374 review findings are covered by deterministic regressions and fixed on this branch.
- [x] The adjacent same-pattern `SettingsList` focus risk is removed.
- [x] Repository checks and the pi-sync package dry run pass.
- [x] Archive this completed plan under `docs/plans/archived/`.
