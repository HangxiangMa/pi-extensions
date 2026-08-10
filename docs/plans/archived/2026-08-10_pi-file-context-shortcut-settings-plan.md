# Pi File Context shortcut settings plan

## Goal

Replace the immediate `@` screen takeover with a configurable File Context shortcut that defaults to `Ctrl+Alt+F`, while preserving `/file-context` and Pi's native editor behavior.

## Architecture

- `pi-file-context` owns user settings in `<getAgentDir()>/pi-file-context.json`.
- The extension loads and validates `openShortcut` during factory initialization so Pi can register the resolved shortcut before interactive shortcut setup.
- `openShortcut` accepts a Pi key identifier string or `null` to disable the shortcut.
- Missing settings use `ctrl+alt+f`, while malformed files or invalid values keep the default and produce a TUI warning after `session_start`.
- Shortcut and slash-command activation share the existing abort-aware explorer lifecycle.

## Non-Goals

- Do not add project-level shortcut overrides.
- Do not add a settings menu for this single manually editable setting.
- Do not change File Context's internal `Ctrl+F` file/content search toggle.

## Plan

- [x] Add focused tests for default, custom, disabled, malformed, and invalid shortcut settings, plus shortcut registration and removal of the immediate `@` editor takeover; the settings test first failed on custom and malformed inputs, registration tests failed before the new installer existed, and the repeated-launch test observed two concurrent explorers.
- [x] Add the settings loader and register the resolved shortcut without replacing Pi's editor; all 47 focused File Context tests pass.
- [x] Update package documentation and add a Changeset for the published behavior change; `README.md`, `packages/pi-file-context/README.md`, and `.changeset/fuzzy-files-shortcut.md` describe the implemented default, settings path, reload boundary, and fallback.
- [x] Audit lifecycle cancellation, session replacement, settings failure behavior, native editor preservation, and shortcut conflicts against the extension guides; session generation and abort guards remain active, repeated launches coalesce, RPC and TUI warnings are observable, modified function-key combinations unsupported by Pi are rejected, and no editor component is installed.
- [x] Run the package checks, full repository check, and package dry run, then archive this completed plan; the package check, 2,792-test repository gate, and `just pack file-context` pass.

## Completion Checklist

- [x] `@` no longer directly opens File Context or replaces the normal editor.
- [x] `Ctrl+Alt+F` opens File Context by default and `openShortcut` can replace or disable it after `/reload`.
- [x] `/file-context` remains compatible in TUI and rejects unsupported modes as before.
- [x] Invalid settings never overwrite the source file and produce an observable warning in TUI and RPC modes.
- [x] Focused tests, `npm run check`, and `just pack file-context` pass.
