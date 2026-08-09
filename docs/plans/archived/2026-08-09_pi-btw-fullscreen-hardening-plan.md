## Goal

Harden the dedicated `/btw` fullscreen lifecycle so asynchronous custom-component factories cannot strand terminal ownership and returning to the main TUI does not unnecessarily clear scrollback.

## Context

The review target is pull request #652 against `main`.
The main risk boundary is `packages/pi-btw/src/fullscreen-ui.ts`, which temporarily transfers one terminal between the parent TUI and a side-thread `TuiAltScreen`.

## Risks

- A custom factory can invoke its completion callback before its asynchronous component factory settles.
- Waiting for that factory can leave the side promise pending and prevent parent-TUI restoration.
- A forced parent redraw resets `TuiMainScreen` state and emits the clear-scrollback sequence even when the terminal size did not change.

## Plan

- [x] Add focused regression tests for completion before asynchronous factory fulfillment or rejection; verify they fail without timing sleeps.
  Evidence: the focused suite first left the result pending, then the contract-aligned tests failed because rejection overrode `done` and parent restoration waited for factory fulfillment.
- [x] Add focused coverage that parent restoration performs a non-forced redraw; verify the current forced-redraw event fails the assertion.
  Evidence: three restoration tests received `parent.render:true` instead of `parent.renderNow:false` before the fix.
- [x] Harden custom UI settlement so `done` settles immediately, later rejection cannot override it, and a component created after completion is disposed exactly once.
  Evidence: the focused suite covers fulfillment, rejection, cancellation, duplicate disposal, and late component creation.
- [x] Restore the parent with a non-forced synchronous render so stopped-state pending renders cannot suppress catch-up and regular-screen scrollback is preserved.
  Evidence: all completion and error paths assert `renderNow(false)` after parent restart.
- [x] Re-review the branch diff for terminal ownership, cancellation, stale state after awaits, cleanup failures, editor preservation, input handling, and same-pattern lifecycle bugs.
  Evidence: no additional confirmed finding remained after tracing `runBtwFullscreen`, `runBtwThread`, Pi custom-UI semantics, and `TuiAltScreen`/`TuiMainScreen` lifecycle behavior.
- [x] Run focused pi-btw tests, package checks, the root CI-equivalent gate, and package preview; record evidence.
  Evidence: 127 pi-btw tests passed; package check passed; the final root gate passed 2,616 tests after one unrelated `pi-worktree` temporary-directory cleanup flake passed on focused retry; the 12-file package preview includes `src/fullscreen-ui.ts` and excludes tests and plans.

## Completion Checklist

- [x] Every tested custom factory outcome settles without leaving the parent TUI stopped.
- [x] Components created after completion or cancellation are disposed exactly once.
- [x] Parent restoration catches up without requesting a forced render.
- [x] Existing mouse selection, notification, editor preservation, error, and disposal behavior remains covered and passing.
- [x] The branch diff passes formatting, boundaries, typechecking, tests, packaging, and a fresh semantic review.
