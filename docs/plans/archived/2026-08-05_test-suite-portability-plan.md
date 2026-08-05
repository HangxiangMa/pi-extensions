# Test suite portability fixes

## Goal

Make the complete `npm test` suite pass when the host exposes a non-canonical temporary-directory alias and when TUI content wraps at the configured test width.

## Plan

- [x] Canonicalize the temporary-directory environment for the compiled test process in `scripts/run-tests.mjs`; focused pi-subagents path and workspace tests passed with the canonical temp environment.
- [x] Make the pi-btw and pi-plan-mode assertions inspect a sufficiently wide render rather than depending on incidental wrapping from a long host temp path; both focused menu test files passed.
- [x] Render the pi-worktree colliding labels wide enough to inspect their distinguishing suffixes and drain the asynchronous choice action before the custom harness returns; the focused colliding-label switch test passed.
- [x] Isolate the pi-github-pr branch-change lifecycle test from unrelated filesystem watcher notifications surfaced by the full run; its focused lifecycle test passed five consecutive runs.
- [x] Run the complete repository test suite and `npm run check`; `npm test` passed 2,427 tests and `npm run check` passed. The semantic audit found only test harness/assertion changes: no extension runtime, settings persistence, command surface, or package behavior changed.

## Completion Checklist

- [x] All 12 originally failing tests pass in the focused eight-file run after the final pi-worktree assertion fix.
- [x] `npm test` passes: 2,427 tests, 0 failures.
- [x] `npm run check` passes: formatting/lint, boundaries, typechecks, and all 2,427 tests.
- [x] The completed plan is archived under `docs/plans/archived/`.
