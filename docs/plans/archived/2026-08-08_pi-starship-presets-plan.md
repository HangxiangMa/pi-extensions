# pi-starship presets plan

## Goal

Add four bundled, Pi-native footer presets to `@narumitw/pi-starship` and let TUI users browse,
preview, optionally customize, confirm, and atomically apply one from the existing `/starship` menu
without weakening custom TOML, recovery, lifecycle, or non-TUI behavior.

## Context

- `packages/pi-starship/src/commands.ts` currently exposes a six-item, current-state main menu and one
  transactional edit/preview/confirm pipeline. Presets should reuse that pipeline rather than add a
  second persistence protocol.
- `packages/pi-starship/src/config.ts` owns side-effect-free missing-file loading, TOML normalization,
  draft validation, atomic publication, concurrent-file protection, and runtime-apply rollback.
- The existing **Restore built-in…** action is documented recovery behavior and remains visible. The
  preset list therefore contains only non-default alternatives.
- Starship currently publishes presets such as Bracketed Segments, Nerd Font Symbols, Pastel
  Powerline, and Tokyo Night. pi-starship supports only its own modules and format semantics, so the
  bundled documents will be Pi-specific adaptations rather than compatibility copies.
- Applicable guidance already reviewed: `docs/extension-conventions.md`,
  `docs/extension-settings.md`, Pi TUI/menu lifecycle requirements, and the repository TDD boundary.
  Touched MUST areas are command/menu behavior, custom TUI width and cancellation, settings
  publication and rollback, session replacement/shutdown, deterministic tests, documentation,
  release intent, package inspection, and the root check.

## Architecture

- Add a lazy command-side preset catalog under `packages/pi-starship/src/presets/`. Each entry owns a
  stable ID, English label, concise description, Nerd Font requirement, and complete raw TOML
  document. Keep each substantial declarative document in its own module so no source file crosses the
  repository's 1,000-line limit.
- Keep `BUILT_IN_CONFIG` and `BUILT_IN_EXAMPLE` authoritative for missing-file defaults and recovery;
  presets must not alter startup defaults or config normalization.
- Import the preset catalog only through the already lazy `commands.ts` path. Opening ordinary Pi
  sessions must not eagerly load preset documents or Pi TUI Kit UI beyond current behavior.
- Add a seventh **Presets** row to the main menu and one shallow preset action screen. Stable IDs drive
  selection; labels are presentation only. Exact raw-document equality identifies a currently applied
  preset, which is shown textually and disabled from redundant application. Any manual byte change is
  treated as custom configuration.
- Generalize the current restore/edit review helper around explicit replacement metadata rather than
  a restore boolean. A preset selection produces a validated draft and adaptive live preview with
  **Apply preset…**, **Customize before applying**, and **Choose another preset** outcomes. Customizing
  opens the existing editor with the preset document and then returns to the standard preview flow.
- Applying a preset is a complete-document replacement, not a TOML overlay. The confirmation must name
  the selected preset and state that custom settings, unknown fields, and comments will be removed and
  that no post-success backup is kept. Save, apply, concurrent-file protection, and rollback continue
  through the existing config APIs.
- Initial catalog:
  - `minimal`: font-safe `$model`, `$directory`, `$git_branch`, and `$activity` layout.
  - `bracketed`: font-safe bracketed presentation of the balanced Pi/Git default information.
  - `nerd-font-symbols`: balanced default information with Nerd Font module symbols.
  - `tokyo-night`: a one-line, palette-backed Powerline treatment of Pi model/thinking, directory,
    Git, activity, context, and time, explicitly requiring a Nerd Font.
- None of the initial presets enables GitHub PR queries, cloud/deployment readers, or optional
  command-backed workspace collectors. Preset previews remain synchronous consumers of the current
  immutable runtime snapshot.

## Non-Goals

- Read or execute Starship's own preset command, binary, schema, or `starship.toml`.
- Claim complete compatibility with upstream preset TOML or copy unsupported Starship modules.
- Add a `/starship preset` textual route, project scope, environment override, automatic migration,
  remote/community preset download, preset composition, or TOML merge engine.
- Remove **Customize footer**, **Restore built-in…**, or any established `settings`, `status`, and
  `help` route.
- Detect whether the terminal actually has a Nerd Font; requirements remain explicit text and preview
  evidence.
- Introduce a Basic/Advanced submenu or more than the one preset-list navigation level.

## Assumptions

- Unless revised before execution, the approved v1 catalog is Minimal, Bracketed, Nerd Font Symbols,
  and Tokyo Night as specified above.
- Presets are complete starting points. Expert preservation is provided by **Customize before
  applying**, not by silently merging a preset into an existing document.

## Risks

- **Destructive replacement:** a preset could erase hand-written TOML or forward-compatible fields.
  Mitigation: preview first, use explicit replacement copy, require confirmation, and retain existing
  atomic rollback behavior.
- **Misleading active state:** normalized configs may be equivalent while source documents differ.
  Mitigation: claim `Currently applied` only for exact raw-document equality; otherwise show custom.
- **Font failure:** private-use glyphs render as boxes without a Nerd Font. Mitigation: mark affected
  rows and preview screens with `Requires Nerd Font`; keep two font-safe choices and non-color labels.
- **Narrow-terminal overflow:** Powerline glyphs and long confirmation text can become unusable.
  Mitigation: reuse adaptive preview and Kit wrapping, and test constrained widths/heights and resize.
- **Lifecycle race:** session replacement or shutdown can occur while a preset preview, editor, or
  confirmation is open. Mitigation: retain the command owner signal, dispose every custom component,
  and revalidate ownership after each await before save/apply/UI continuation.
- **Startup regression:** large bundled documents could enter the eager extension graph. Mitigation:
  keep the catalog under the lazy command implementation and retain source-entry/import tests.
- **Upstream resemblance and attribution:** themed documents may derive colors or ideas from Starship
  presets. Mitigation: adapt to Pi semantics, describe them as inspired, and retain/update `NOTICES.md`
  where source material is reused.

## Rollback / Recovery

- The on-disk schema and path remain unchanged. Reverting the feature leaves any applied preset as
  ordinary valid `pi-starship.toml`, still editable through `/starship settings`.
- **Restore built-in…** remains the deterministic recovery path for every preset.
- Cancel, Back, Escape, Ctrl+C, disposal, replacement, validation failure, confirmation rejection, and
  save failure leave the previous file and runtime unchanged.
- Runtime-apply failure restores the previous file/effective config through the current identity-aware
  rollback path; a concurrent newer file is preserved and reported instead of overwritten.

## Plan

- [x] Add focused red tests in `packages/pi-starship/test/config.test.ts` for the public preset catalog:
      every stable ID is unique, every complete document validates without diagnostics, font
      requirements are explicit, exact raw matching recognizes only unchanged preset documents, and
      no preset reaches network or optional command-backed modules; verify the focused tests execute
      and fail for missing preset behavior before implementation.
- [x] Add `packages/pi-starship/src/presets/` catalog and four bounded document modules implementing the
      approved module/layout contracts; verify the focused catalog/config tests pass and source files
      remain below 1,000 lines.
- [x] Add focused red menu tests in `packages/pi-starship/test/command-ux.test.ts` and
      `packages/pi-starship/test/commands.test.ts` for the seventh **Presets** row, one-level four-item
      list, descriptions and Nerd Font warnings, exact `Currently applied` disabled state, active
      preset configuration presentation, Back/focus restoration, and no startup/file/runtime side
      effects; verify they fail on the existing six-row menu for the intended reason.
- [x] Extend the declarative `defineMenu` flow in `packages/pi-starship/src/commands.ts` with stable
      catalog-driven preset actions and current-state presentation while preserving all existing menu
      items and direct routes; verify the focused main/preset menu tests pass at 20, 40, and 80 columns.
- [x] Add focused red interaction tests for selection preview, **Choose another preset**, preview
      Escape, **Customize before applying**, editor cancellation, final confirmation copy, successful
      first save, replacement of a custom/malformed document, and immediate runtime application;
      assert every pre-confirmation exit performs zero saves and zero applies.
- [x] Generalize the existing preview/apply workflow and connect preset selection to validation,
      preview, optional editing, confirmation, atomic save, and immediate apply; verify the interaction
      tests pass without duplicating persistence or rollback code.
- [x] Add failure and lifecycle regressions covering preset validation/render failure, warning display,
      write/rename failure, runtime-apply rollback, concurrent replacement, retry, external disposal,
      session replacement, and shutdown after each await boundary; verify the previous valid file and
      effective footer survive every unsuccessful path and no stale continuation publishes UI/state.
- [x] Re-audit non-TUI and compatibility behavior so no new textual subcommand is accepted, RPC no-arg
      help remains observable without opening custom TUI, print/JSON stay protocol-safe, existing
      completions remain `settings|status|help`, and lazy source-entry behavior is unchanged; verify
      existing route, lifecycle, and source-entry tests plus focused regressions pass.
- [x] Update `packages/pi-starship/README.md` with the preset catalog, font prerequisites, exact
      replacement/customize/recovery semantics, menu navigation, package layout, and Starship-inspired
      wording; update `NOTICES.md` only if implementation reuses upstream preset material, and add a
      minor Changeset for `@narumitw/pi-starship`; verify Biome and `npm run changeset:status` accept the
      documentation and release intent.
- [x] Run `npm run typecheck --workspace @narumitw/pi-starship`, the compiled pi-starship test set,
      `npm run check`, `just pack starship`, and a local Pi TUI/RPC smoke that previews, cancels, applies,
      and restores a preset from a temporary agent directory; record exact evidence and any unverified
      platform/font path before completion.
- [x] Audit the final diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`, including command modes, width, cancellation, disposal, session
      ownership, settings ordering/failure recovery, invalid-file protection, atomic publication,
      documentation, and release gates; verify every applicable MUST has test/review/smoke evidence and
      record any accepted deviation.

## Completion Checklist

- [x] `/starship` presents seven shallow, goal-oriented actions and a four-item preset screen with
      visible current state, font requirements, Back, Escape, and Ctrl+C behavior.
- [x] Minimal and Bracketed are font-safe; Nerd Font Symbols and Tokyo Night are clearly marked; all
      four documents validate cleanly and render within supported widths without enabling undocumented
      collectors or network work.
- [x] Selecting a preset never mutates disk or runtime before preview and confirmation; users can apply,
      customize first, choose another, or cancel without ambiguous side effects.
- [x] Complete-document replacement is disclosed, confirmed, serialized, atomic, generation-safe, and
      rollback-capable; malformed/current/concurrent documents follow the documented recovery rules.
- [x] Built-in defaults, Restore, custom TOML, menu/direct command routes, non-TUI protocol behavior,
      lazy command loading, lifecycle cleanup, and unknown-field behavior remain compatible and tested.
- [x] README, attribution review, minor Changeset, focused tests, package typecheck, local TUI/RPC smoke,
      `npm run check`, and `just pack starship` pass with recorded evidence.

## Execution Evidence

- Completed 2026-08-08 on `feat/pi-starship-presets` after rebasing onto `origin/main` at
  `1156ee7`. The four preset documents validate without diagnostics and remain under the lazy command
  import boundary.
- TDD evidence: the catalog test first failed with an empty preset list, and the menu test first failed
  on the existing six-row menu and `Custom configuration` state. Focused config, menu, interaction,
  rendering, failure-recovery, and lifecycle tests then passed.
- `npm run check --workspace @narumitw/pi-starship` passed. The compiled package test set passed before
  the final root gate; `npm run check` passed with 2,542 tests after the final rebase and help-text
  update.
- `just pack starship` passed with 69 files, including all five `src/presets/` modules. Changeset status
  reports the intended independent minor bump to `@narumitw/pi-starship` 0.50.0.
- A real Pi 0.84.1 RPC smoke loaded only `packages/pi-starship/src/index.ts`, discovered `/starship`,
  returned the updated `/starship help` notification, exited successfully, and left the temporary
  agent directory without `pi-starship.toml`. TUI behavior was exercised through the local async Kit
  harness at 20, 40, and 80 columns; an interactive real-terminal/Nerd Font visual smoke was not run
  because repository execution policy forbids opening a TUI.
- Semantic audit covered `docs/extension-conventions.md`, `docs/extension-settings.md`, and Pi's full
  `extensions.md`, `tui.md`, `packages.md`, and `rpc.md`: direct routes/modes are preserved; preset
  selection is TUI-only; cancellation, disposal, replacement, and shutdown are generation-safe;
  complete-document replacement is previewed and confirmed; existing invalid-file, atomic publication,
  concurrent-file preservation, runtime rollback, lazy loading, and missing-file semantics remain in
  force. No accepted convention deviation remains; only real Nerd Font appearance is unverified.
