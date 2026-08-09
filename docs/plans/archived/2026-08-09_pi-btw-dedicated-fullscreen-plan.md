## Goal

Keep `/btw` mouse text selection stable while the main agent continues running by rendering the side thread in a dedicated alternate-screen TUI and catching the main TUI up after exit.

## Architecture

- Keep the main agent and session running.
- Suspend only the parent TUI renderer while the side thread is open.
- Run every side-thread custom component in one extension-owned `TuiAltScreen` with application-owned mouse selection enabled.
- Proxy the command context so side-thread menus, loaders, transcript views, and notifications use the dedicated TUI while main-editor reads and writes retain their existing owner.
- Stop and dispose the dedicated TUI before restarting and force-rendering the parent TUI.

## Non-Goals

- Do not pause, abort, or queue the main agent.
- Do not change side-thread model, transcript, bring-to-main, or settings semantics.
- Do not add direct clipboard or terminal mouse-protocol handling to pi-btw.

## Risks

- Two TUI instances must never own the terminal concurrently.
- Cancellation, disposal, synchronous completion, factory errors, and session replacement must restore the parent renderer exactly once.
- Notifications emitted while the main renderer is suspended must remain visible after returning.

## Plan

- [x] Add focused failing tests for command routing and dedicated-TUI ownership, including cleanup after completion, errors, and disposal.
  Red evidence: the new suite initially failed because `fullscreen-ui.js` did not exist, command routing reported `0 !== 2`, and the editor-preservation regression reported `main draft` instead of `brought side context`.
- [x] Add a dedicated fullscreen UI bridge under `packages/pi-btw/src/` and route `runBtwThread` through it.
  Evidence: all 125 pi-btw tests pass, including real `TuiAltScreen` mouse-mode enable/disable sequences.
- [x] Update `packages/pi-btw/README.md` and add a patch changeset describing stable mouse selection while main output continues.
- [x] Audit cancellation, component disposal, session replacement, main-editor preservation, and terminal ownership against `docs/extension-conventions.md`.
  Evidence: focused tests cover completion, flow errors, stop failures, synchronous and delayed disposal, ordered parent restoration, and bring-to-main editor retention.
- [x] Run focused pi-btw tests, package typechecking, `npm run check`, and `npm run pack:btw`; inspect the packed file list.
  Evidence: the root gate passed 2,614 tests, and the 12-file tarball includes `src/fullscreen-ui.ts` with no tests or plan artifacts.

## Completion Checklist

- [x] The main TUI stops before the dedicated TUI starts and restarts only after the dedicated TUI stops.
- [x] The main agent is never awaited or aborted by `/btw`; command coverage asserts zero `waitForIdle()` calls.
- [x] All side-thread custom screens share the dedicated TUI and retain keyboard input and application-owned mouse selection.
- [x] Normal completion, errors, and disposal restore terminal ownership and dispose active components exactly once.
- [x] Existing side-thread and bring-to-main behavior passes unchanged, including editor text written during the fullscreen flow.
- [x] Documentation, changeset, CI-equivalent checks, and package preview are complete.
