# Pi Recall direct-delete implementation plan

## Goal

Let TUI users delete the selected saved message from Pi Recall's fuzzy picker with the configured `app.session.delete` shortcut (Ctrl+D by default), confirm the exact destructive action, and return to the same scope and query without changing RPC, storage, quote, or existing selected-message workflows.

## Architecture

- Keep search, scope, and selection in `ScopedRecallPicker`; emit a typed delete request containing the selected record and nearest surviving selection.
- Keep mutation ownership in `createRecallMenu`: close the picker, show Pi's standard confirmation, run the existing abort-aware atomic store deletion under a non-cancellable post-confirmation loader, then reopen a fresh picker.
- Revalidate session ownership after every awaited picker, confirmation, and deletion operation. Preserve the previous in-memory list on failure; remove only the confirmed ID after a successful or already-absent result.
- Continue using the existing JSONL lock and atomic replacement protocol without schema or migration changes.

## Non-Goals

No batch deletion, plain-Delete override, new command arguments, RPC fuzzy shortcuts, storage changes, settings, package metadata, publication, or release.

## Plan

- [x] Add focused failing picker tests for the configurable direct-delete shortcut, visible responsive hint, nearest-selection handoff, empty/no-match behavior, and preservation of plain Delete search input. Evidence: the focused picker suite failed on the missing `ctrl+d delete` hint before implementation.
- [x] Implement the typed picker delete request and responsive text hints in `experimental/pi-recall/src/picker.ts`; verify focused picker tests pass. Evidence: focused picker suite passes 11/11.
- [x] Add focused failing menu tests for previewed confirmation, cancellation without mutation, atomic success with scope/query/neighbor restoration, actionable failure recovery, already-removed records, and lifecycle cancellation; verify the intended red state. Evidence: four direct-delete menu tests failed because the picker result went directly to the selected-message screen without confirmation, mutation, progress, or re-entry; lifecycle coverage remains part of the implementation slice.
- [x] Implement the TUI-only confirm/delete/reopen loop in `experimental/pi-recall/src/menu.ts`, including non-cancellable post-confirmation progress, ownership checks after awaits, and immediate textual feedback; verify focused menu and lifecycle tests pass. Evidence: focused menu suite passes 13/13, including success, cancellation, failure, concurrent removal, progress, and session-abort cases.
- [x] Update `experimental/pi-recall/README.md` for the Ctrl+D workflow, confirmation, context preservation, failure behavior, and unchanged RPC/existing delete route. Evidence: package Biome and typecheck pass with the documented behavior.
- [x] Run Pi Recall focused tests, package check, `npm run check:boundaries`, full `npm run check`, and `just pack recall`; inspect dry-run contents. Evidence: Pi Recall passes 42/42 tests; package check and boundaries pass; a normal verification clone with signing disabled passes the full 2,385-test root gate (the linked worktree run reproduced the documented injected-Git/signing failures); dry-run pack contains only the nine manifest-allowed files and leaves no tarball.
- [x] Audit the final diff against `docs/extension-conventions.md` for destructive confirmation, custom TUI width/focus/input behavior, async cancellation/disposal/session replacement, mutation safety, mode compatibility, documentation, and named verification methods. Evidence: confirmation and cancellation remain explicit; rendered lines, focus forwarding, raw Delete compatibility, progress ownership, post-await guards, locked atomic mutation, TUI-only shortcut, unchanged RPC, and documentation are covered. `docs/extension-settings.md` remains inapplicable because no settings changed.

## Completion Checklist

- [x] Ctrl+D (or the user's configured `app.session.delete` binding) requests deletion only when a saved result is selected; plain Delete remains search editing input.
- [x] Confirmation identifies the exact record and consequence; cancelling is side-effect free and restores picker scope, query, selection, and focus.
- [x] Confirmed deletion is atomic, displays progress, remains non-cancellable after application starts, and returns to the same filtered list with a stable neighboring selection and updated counts.
- [x] Failure keeps the previous valid list and presents an actionable error; an already-removed record is reconciled without reporting false success.
- [x] Empty, no-match, overlong-query, narrow-width, terminal-control, disposal, replacement, and shutdown paths are safe and observable where applicable.
- [x] Existing Enter/Preview/Quote/Delete, Escape/Ctrl+C, scope switching, RPC, JSONL schema, unknown fields, command surface, and quote behavior remain compatible.
- [x] Focused tests, package checks, boundaries, root CI-equivalent checks, and package dry run pass with evidence recorded above.
