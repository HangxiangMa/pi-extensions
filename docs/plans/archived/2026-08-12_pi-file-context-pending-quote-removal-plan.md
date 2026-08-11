# Pi File Context pending quote removal plan

## Goal

Let a user remove one specific pending File Context quote before submitting the next prompt.

## Architecture

- Keep pending quote state inside `pi-file-context`, where attachment and lifecycle cleanup already live.
- Add `/file-context remove` as a documented TUI-only route that opens a short selector containing each pending path and line range.
- Treat selecting a row as the explicit remove action, while `Escape` or `Ctrl+C` closes the selector without changing pending quotes.
- Revalidate the owning session, generation, and selected quote after the selector resolves so stale or concurrent flows cannot remove the wrong quote.
- Refresh the existing package-owned widget after every removal and advertise the removal route beside the pending state.

## Non-Goals

- Do not add quote reordering, editing, persistence, or bulk clearing.
- Do not change quote injection order or snapshot contents.
- Do not add a settings option or a new shortcut.

## Plan

- [x] Add focused command tests for completion, removing one selected quote, selector cancellation, empty state, unsupported modes, and stale-session protection; the focused run failed in all four new behavior areas before implementation.
- [x] Implement `/file-context remove`, safe pending-state removal, widget refresh, and strict argument handling; all 50 focused File Context tests and the package typecheck pass.
- [x] Update the package README and add a patch Changeset for the published behavior.
- [x] Audit command modes, user cancellation, selector failure recovery, session replacement, concurrent stale selection, widget lifecycle, terminal sanitization, and unchanged quote injection semantics against `docs/extension-conventions.md`; focused tests cover each changed path and no guide deviation remains.
- [x] Run `npm run check`, inspect `just pack file-context`, and archive this completed plan; the isolated-agent-dir repository gate passed 2,996 tests and the dry-run tarball contains the expected 12 published files.

## Completion Checklist

- [x] A user can identify and remove one pending quote without affecting the others.
- [x] Cancelling the removal selector has no side effects.
- [x] Stale or concurrent selector results cannot remove a replacement-session quote or the wrong pending quote.
- [x] `/file-context` browsing remains compatible and unknown or trailing arguments are rejected observably.
- [x] Documentation, Changeset, focused tests, repository checks, and package smoke all pass.
