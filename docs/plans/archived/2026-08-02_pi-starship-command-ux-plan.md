# pi-starship `/starship` UX plan

## Goal

Make `/starship` present normal built-in defaults accurately, keep configuration and recovery actions
shallow and safe, and keep every preview action reachable across supported terminal sizes and
keybindings without changing pi-starship's configuration format or persistence guarantees.

## Context

- The existing editor → validation → preview → confirmation → atomic save → runtime apply flow is
  sound and already covers cancellation, save failure, apply failure, rollback, session replacement,
  RPC, and non-TUI behavior.
- The reviewed gaps are the unbounded preview height, an actionable restore in the normal missing-file
  state, incomplete restore consequences, an unnecessary Advanced submenu, misleading fallback copy,
  ignored injected keybindings, and silently accepted trailing command arguments.
- Applicable guidance: `docs/extension-conventions.md`, `docs/extension-settings.md`,
  `designing-user-experiences`, `designing-user-interfaces`, and `applying-tdd`.
- Touched areas are command routing, standard menu information architecture, specialized preview TUI,
  settings recovery copy, tests, and user-facing command documentation.

## Architecture

- Keep the main, configuration, and help screens on `@narumitw/pi-tui-kit`; do not add a shared kit
  API for this extension-specific editor/preview transaction.
- Derive one presentation model from `LoadedStarshipConfig` for state, source, health, and restore
  availability. Distinguish a healthy absent file from an error-driven built-in fallback.
- Flatten the menu to `Customize footer`, `Configuration`, `Help`, and `Restore built-in…`.
  Configuration owns state, source, path, health, and diagnostics. Restore remains visible last but is
  disabled when there is no document to replace or the exact built-in document is already saved.
- Move the specialized preview component out of command routing if needed for cohesion. It will use
  `tui.terminal.rows`, the callback-provided keybindings, a bounded scrollable preview viewport, and a
  typed result that distinguishes apply, edit, discard, and whole-workflow close.
- Preserve the existing validator, raw-document handling, atomic publication, unknown-field behavior
  during ordinary edits, rollback protocol, owner checks after awaits, and missing-file read behavior.

## Non-Goals

- Do not change Starship format/style semantics, built-in module defaults, palette behavior, or the
  nine-module root.
- Do not add presets, a structured settings form, project settings, migration, backup files, or
  automatic settings-file creation.
- Do not modify `@narumitw/pi-tui-kit`, package dependencies, metadata, versions, or personal
  `~/.pi/agent/pi-starship.toml`.
- Do not remove the documented `settings`, `status`, or `help` direct routes or add ad hoc print/JSON
  output.

## Assumptions

- `Customize footer` and configuration diagnosis are the primary jobs; restore is infrequent recovery.
- In the healthy missing-file state, a visible disabled restore row communicates that defaults are
  already active better than hiding the capability.
- A successful restore intentionally replaces the complete document without retaining a backup, so
  the review and confirmation must state that consequence explicitly.

## Risks

- An adaptive specialized component can regress keyboard, resize, or lifecycle behavior; use the
  public TUI harness with width, row, remapped-key, Escape, Ctrl+C, and disposal coverage.
- Flattening restore makes a destructive action more visible; keep it last, state-gated, suffixed with
  an ellipsis, previewed, and exactly confirmed.
- Changing screen transitions can weaken proven save/apply recovery; retain the persistence helpers
  unchanged and rerun all command and lifecycle regressions.

## Plan

- [x] Add red-first cases to `extensions/pi-starship/test/commands.test.ts` for healthy missing-file,
      saved built-in, custom, and invalid-file presentations; assert `Built-in defaults · Healthy`, no
      Advanced screen, one combined Configuration screen, and a disabled no-op restore that does not
      create `pi-starship.toml`; focused execution failed on the expected current `Built-in fallback`,
      Advanced navigation, and actionable restore behavior.
- [x] Update `extensions/pi-starship/src/commands.ts` with the derived configuration presentation and
      flattened four-action menu; Configuration now shows state/source/path/health/diagnostics and
      Restore is state-gated; all 19 focused command tests passed after updating the existing navigation
      expectations.
- [x] Add red-first TUI-harness cases for a long multiline preview at `20×8`, `28×12`, and `80×24`,
      dynamic resize, remapped navigation/confirmation/cancel keys, cancellation, Ctrl+C whole-workflow
      close, and returning to edit/main; focused execution failed on the expected unbounded frame,
      hard-coded hint/key handling, and preview Ctrl+C reopening the main menu.
- [x] Implement `extensions/pi-starship/src/command-preview.ts` as the extension-owned adaptive
      preview surface and wire it through `commands.ts`; frames are row/width bounded, preview content
      scrolls independently of reachable actions, injected hints are used, and Escape/Ctrl+C differ;
      all 23 focused command tests passed.
- [x] Update the customize flow copy in `extensions/pi-starship/src/commands.ts` to use `Apply
      changes…`, `Continue editing`, and `Discard draft`; unavailable previews remain explicit and
      recoverable. Valid, warning, invalid, preview-failure, confirmation-cancellation, and successful-
      apply coverage passed in the 25-test focused command run.
- [x] Update restore review and confirmation in `extensions/pi-starship/src/commands.ts` to show
      current state/path and disclose complete-document replacement—including custom settings, unknown
      fields, and comments—with no post-success backup; custom and malformed recovery plus byte-exact
      cancellation passed in the 26-test focused command run.
- [x] Add red-first command-routing cases for unknown and trailing arguments, then update the
      `/starship` parser to accept only exact documented routes and issue a TUI/RPC usage warning;
      focused execution first failed on `settings extra`, then all 27 command tests passed with
      completions plus existing TUI, RPC, print, and JSON safety preserved.
- [x] Re-run command and lifecycle coverage after auditing user cancellation, external component
      disposal, session replacement, shutdown, and owner checks after every await; added abort-aware
      preview disposal plus replacement/shutdown regressions, and all 50 focused command/lifecycle
      tests passed.
- [x] Update `extensions/pi-starship/README.md` so the shallow menu, built-in-default state, disabled
      restore behavior, destructive restore warning, adaptive controls, exact direct routes, and
      non-TUI behavior match the implementation; `npm --workspace @narumitw/pi-starship run check`
      accepted the documentation, source, tests, and types.
- [x] Compile the test tree and run the focused command artifacts directly after the initial relative
      `node_modules` path was filtered; all 28 command tests passed, an absolute-realpath `node --test`
      follow-up also passed, and `npm --workspace @narumitw/pi-starship run check` passed package Biome
      and typechecking.
- [x] Run the final gates and semantic audit: `git diff --check` passed, `just pack-starship` included
      the new preview module in 59 expected files, and the second `npm run check` passed all 2,089
      tests after the first run hit an unrelated `pi-btw` scheduling flake whose focused rerun passed.
      Command, TUI, settings, lifecycle, and touched-area guide audits found no accepted deviation or
      unverified implementation path.

## Completion Checklist

- [x] A healthy new user sees `Built-in defaults · Healthy`, and opening/cancelling `/starship` or its
      editor does not create a settings file.
- [x] The main menu has four shallow actions, Configuration owns all status details, and restore is
      disabled for healthy missing/exact-built-in documents but available for custom/invalid recovery.
- [x] Restore review and confirmation disclose complete-document replacement and cancellation leaves
      stored and effective settings byte-for-byte unchanged.
- [x] Preview content and actions remain operable within tested width/height combinations, use injected
      keybindings, distinguish Escape from Ctrl+C, and restore the main selection predictably.
- [x] Exact direct routes remain compatible; unknown and trailing arguments are rejected observably in
      UI-capable modes without corrupting print/JSON protocols.
- [x] Existing atomic save, rollback, warning, non-TUI, lifecycle, and session-replacement guarantees
      still pass deterministic tests.
- [x] README behavior matches the final interaction, focused/package/full checks pass, and the final
      guide audit reports no unaccepted deviation.
