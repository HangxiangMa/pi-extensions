# File quote MVP plan

## Goal

Add an experimental Pi extension that lets a user browse project text files, select a line range, keep a compact pending-quote indicator, and attach the exact selected snapshot to the next submitted prompt.

## Context

- The primary interaction should be user-owned selection rather than asking the agent to infer a range.
- The preferred trigger is typing `@` in the normal TUI editor; `/file-quote` will remain a discoverable fallback.
- This MVP will use keyboard line selection. Mouse drag selection is deferred until terminal mouse-event behavior is prototyped across Ghostty and Windows Terminal.

## Plan

- [x] Added focused tests under `extensions/experimental/pi-file-quote/test/`; the initial `npm test` failed because `../src/file-quote.js` did not exist, proving the intended red state.
- [x] Added the experimental package metadata, thin entrypoint, and bounded filesystem/quote model; all eight focused tests pass.
- [x] Implemented the TUI explorer and preview with fuzzy filtering, keyboard range selection, cancellation, width-safe rendering, quote bounds, and terminal-control escaping; component coverage passes.
- [x] Registered the `@` custom-editor trigger, `/file-quote` fallback, pending widget, input transformation, experimental warning, and lifecycle cleanup; event/command tests and isolated Pi entrypoint loading pass.
- [x] Documented installation, workflow, controls, security, limitations, package layout, keywords, and license; recorded the durable direct-selection preference in `MEMORY.md`.
- [x] Formatted intended files, updated workspace lock metadata, passed isolated `npm run check` with 1,390 tests, and inspected the six-file npm dry-run package.

## Non-Goals

- Mouse drag selection.
- Binary/image preview.
- Multiple pending quotes.
- Persistent quotes across reloads or session replacement.
- Publishing or adding the experiment to automated publish/version workflows.

## Risks

- Opening `ctx.ui.custom()` from a custom editor input callback may behave differently in a real Pi TUI; retain `/file-quote` as a fallback and cover the callback boundary with a runtime smoke.
- Recursive discovery must avoid symlink escape, ignored dependency/build directories, unbounded memory, and terminal control injection.

## Completion Checklist

- [x] Typing `@` at a word boundary opens the explorer without inserting `@`; tests preserve the draft and explorer cancellation has no quote side effect.
- [x] A selected line range appears as a compact widget and is injected once into the next ordinary interactive prompt with path and line metadata.
- [x] Escape/cancel and session shutdown leave no pending quote, widget, or extension-owned custom editor.
- [x] RPC warns and print/JSON-style no-UI command execution throws an observable TUI requirement without entering custom UI.
- [x] Root checks, package dry run, and isolated local Pi entrypoint loading pass.
