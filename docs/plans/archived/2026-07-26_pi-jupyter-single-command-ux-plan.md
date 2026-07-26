# pi-jupyter single-command UX plan

## Goal

Replace pi-jupyter's fragmented slash-command surface with one current-state `/jupyter` manager while preserving shortcuts and direct capabilities, making notebook transitions atomic, and keeping preview state visible and recoverable.

## Plan

- [x] Add failing command/parser/menu tests for the sole `/jupyter` registration, progressive completions, strict direct routes, current-state menu variants, back/close navigation, and non-TUI rejection; the old command surface failed the updated focused tests because `/jupyter` was absent.
- [x] Implement the `/jupyter` current-state manager and direct routes in focused command/menu modules, with a two-level notebook picker, path entry, injected keybindings, exact state labels, and side-effect-free cancellation; 12 focused command and preview tests pass.
- [x] Add failing transition tests for successful switch, cancelled load, failed switch/refresh preservation, stale async completion, scroll clamping, tool-hook compatibility, and lifecycle cleanup; failures showed candidate state replacing the active preview before validation and refresh errors clearing the last valid model.
- [x] Make notebook loading and watcher replacement generation-safe and atomic, retain the last valid preview on refresh failure, expose loading/stale/hidden-width status, and keep shortcut behavior compatible; 21 focused command, transition, rendering, mode, and lifecycle tests pass.
- [x] Update the panel's responsive hints and the package README for `/jupyter`, advanced direct routes, state/recovery behavior, shortcut compatibility, and the old-command migration table; focused rendering tests prove 42-column output stays width-safe with long untrusted paths.
- [x] Run focused tests, `npm run check`, `npm ci --dry-run --ignore-scripts`, `just pack-jupyter`, a non-interactive Pi load smoke, and final diff/command-surface audits; 21 focused and all 1,489 repository tests passed, clean-install validation succeeded, the tarball contains the intended 10 files, Pi loaded with 24 model lines, and the source audit finds exactly one `registerCommand("jupyter")`.

## Completion Checklist

- [x] Pi registers exactly one pi-jupyter slash command, `/jupyter`, with tested menu and direct routes.
- [x] Primary, empty, loading, success, stale/error, narrow, cancellation, navigation, and failure states are deterministic and preserve the previous valid preview where required.
- [x] Keyboard/focus behavior, responsive width safety, terminal escaping, shortcuts, tool hooks, and resource cleanup remain covered.
- [x] User-facing documentation and migration guidance match the implemented behavior.
- [x] Clean-install, CI-equivalent, package, runtime-load, and final diff checks pass.
