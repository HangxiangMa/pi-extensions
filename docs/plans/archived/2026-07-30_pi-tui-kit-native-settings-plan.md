# Pi TUI Kit Native Settings Presentation Plan

## Goal

Make `@narumitw/pi-tui-kit` TUI settings screens follow Pi's built-in `/settings` visual and
keyboard pattern while preserving the kit's declarative API, stable row identity, disabled-row
behavior, serialized immediate saves, rollback, navigation, RPC adaptation, and lifecycle safety.

## Context

- `packages/pi-tui-kit/src/screen-components.ts` currently renders settings with a package-owned
  selector because Pi's public `SettingsList` cannot initialize a restored cursor, enforce disabled
  rows, or expose its search input for focus forwarding.
- The current selector lacks the built-in search row, aligned label/value columns, ten-row viewport,
  native-style hint, and dynamic borders shown by Pi's `/settings` screen.
- Existing consumers use `SettingsScreen.title` and `SettingsScreen.lines` for extension identity,
  effective scope, settings paths, and failure notices; those capabilities must remain visible.
- Applicable guidance: `docs/extension-conventions.md`, `docs/extension-settings.md`, Pi's complete
  `docs/tui.md`, and the `designing-user-interfaces` skill. The relevant MUST audits are width-safe
  rendering, callback-provided theme/keybindings, render requests after state changes, IME focus
  forwarding, cancellation/disposal, stale async continuation safety, deterministic tests, root
  `npm run check`, and package-content verification.

## Architecture

- Keep `SettingsScreen`, `MenuSettingItem`, `runMenu()`, RPC behavior, and
  `PI_EXTENSION_MENU_API_VERSION` unchanged; this is a TUI-only presentation and interaction update,
  not a public schema change.
- Retain a package-owned settings adapter rather than importing Pi's private
  `SettingsSelectorComponent` or delegating state to public `SettingsList`. Use only public
  primitives: `Input`, `fuzzyFilter`, width utilities, `Focusable`, and `DynamicBorder` with an
  explicit callback-provided color function.
- Preserve the existing title and supporting lines as a visible header, then render a Pi-style search
  field, aligned settings rows, bounded viewport and position indicator, selected-row description,
  keyboard hint, and closing border. Disabled state remains textual as well as themed so color is not
  its only signal.
- Keep raw item IDs and values separate from sanitized display/search projections. Filtering and
  cursor movement operate on stable item identities; action callbacks continue receiving unchanged
  raw values.
- Make the settings component implement `Focusable` and forward `focused` to its embedded `Input` so
  IME candidate placement remains correct. Menu keys are handled before search input, preserving
  injected navigation/confirm/cancel bindings and `Ctrl+C` close behavior.
- Keep the existing promise queue, committed/displayed value maps, rejection rollback, transition
  draining, and disposal guards as the sole owner of asynchronous setting changes.

## Non-Goals

- Do not restyle action, detail, multi-select, RPC, print, or JSON screens.
- Do not change extension-owned persistence, validation, precedence, or settings files.
- Do not add free-form setting values, submenus, or new public settings-screen options.
- Do not depend on Pi private modules or copy Pi's complete settings implementation.

## Assumptions

- All kit settings screens should expose search, including short lists, to match the requested Pi
  presentation without adding a new opt-in API.
- The selector body should match Pi, but extension-owned titles and supporting lines remain visible
  because removing them would hide scope, path, and recovery information used by current consumers.
- Escape remains Back within a menu and `Ctrl+C` remains Close. The hint should use Pi-like wording
  without claiming that Escape rolls back changes that were already saved.

## Risks

- Search can desynchronize filtered indexes from stable rows; tests must activate, restore, and roll
  back by item ID rather than display index.
- A hidden or unforwarded `Input` focus would regress CJK IME positioning; test the structural
  `Focusable` contract directly.
- Native-looking alignment can exceed narrow terminal widths or mishandle ANSI/wide characters;
  calculate columns with `visibleWidth()` and bound every line with `truncateToWidth()` or
  `wrapTextWithAnsi()`.
- Pi may change its built-in styling later. Keep parity expressed through public theme tokens and
  focused behavioral tests rather than importing private source.

## Plan

- [x] Add focused red tests in `packages/pi-tui-kit/test/screen-components.test.ts` for the Pi-style
      search row, aligned label/value columns, ten-row viewport and `(n/total)` indicator,
      selected-row description, native-style hint, explicit borders, empty/no-match states, and
      narrow/wide-character width safety; verified the focused run failed on the absent border and
      no-match presentation before implementation.
- [x] Add focused interaction tests in `packages/pi-tui-kit/test/screen-components.test.ts` proving
      fuzzy search uses sanitized labels, filtered activation retains raw IDs/values, initial and
      moved selections remain stable by ID, disabled rows cannot activate, custom keybindings and
      `Ctrl+C` retain Back/Close semantics, and `focused` is forwarded to the search `Input`; verified
      the focused run failed because filtering and the `Focusable` contract were absent.
- [x] Refactor only the settings adapter in
      `packages/pi-tui-kit/src/screen-components.ts` to compose the visible header, explicitly themed
      `DynamicBorder`, focus-forwarded `Input`, fuzzy-filtered stable row model, native column layout,
      ten-row viewport, description, and keybinding-aware hint while preserving existing async queue,
      rollback, transition, disposal, and render-request behavior; the focused component suite passes
      all 20 tests.
- [x] Extend `packages/pi-tui-kit/test/runtime.test.ts` only where component-level coverage cannot
      prove runtime integration, specifically cursor restoration after a filtered/changed row and
      draining of pending saves when search is present; `npm test` passes all 1,807 tests, including
      existing TUI, RPC, stale-session, cancellation, and disposal coverage.
- [x] Update `packages/pi-tui-kit/README.md` to document that settings screens use Pi-style search,
      aligned rows, immediate changes, Back/Close behavior, and IME-safe focus while retaining the
      package-owned adapter rationale and ownership boundary; package typechecking includes and passes
      the README usage fixture.
- [x] Rebuild ignored publication output in `packages/pi-tui-kit/dist/` with
      `npm run build --workspace @narumitw/pi-tui-kit`, inspect generated JavaScript/declarations for
      source parity and absence of unrelated output, and verify `npm run check --workspace
      @narumitw/pi-tui-kit` passes; the package check and generated-output inspection passed.
- [x] Audit the final diff against the TUI and settings touched-area rules—width bounds, theme
      invalidation, render requests, focus forwarding, stable raw payloads, disabled rows, user
      cancellation, component disposal, session replacement, shutdown, and every post-`await`
      continuation; focused and runtime tests cover each applicable path, and the retained custom
      adapter deviation is documented beside the implementation and in the README.
- [x] Run the CI-equivalent `npm run check`, then run `just pack-tui-kit` and inspect the tarball list
      for the expected README, license, built JavaScript, and declarations only; `npm run check` passed
      all 1,807 tests and the dry run contained the expected 15 files with no tarball artifact left.

## Completion Checklist

- [x] A representative kit settings screen visibly matches Pi's settings-list pattern at normal
      terminal widths while retaining its extension title and supporting context; a generated-output
      smoke rendered the border, search field, aligned rows, viewport indicator, description, and hint.
- [x] Search, navigation, activation, Back, Close, disabled rows, rejection rollback, rapid serialized
      updates, and cursor restoration are covered by deterministic passing tests.
- [x] The embedded search input satisfies the `Focusable`/IME contract, and every rendered line stays
      within its supplied width, including widths from one column and CJK content.
- [x] Public menu types, API version, RPC behavior, and consumer-owned persistence semantics remain
      unchanged.
- [x] `packages/pi-tui-kit/README.md` and generated `packages/pi-tui-kit/dist/` match the implementation.
- [x] `npm run check` and `just pack-tui-kit` pass, the semantic convention audit is complete, and no
      known required work remains.
