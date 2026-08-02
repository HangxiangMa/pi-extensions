# pi-tui-kit P0 implementation plan

## Goal

Deliver the three approved P0 improvements as additive pi-tui-kit API version 6 capabilities: a
searchable read-only browse/detail screen, end-to-end callback-injected keybindings for static lists,
and a lifecycle-safe helper for extension-owned custom interactions.

## Architecture

- Add a declarative `browse` screen whose catalog data is pure and extension-owned. The kit owns
  TUI search, textual status display, adaptive list/detail layout, selection/query restoration,
  terminal sanitization, IME focus, Back/Close semantics, and a deterministic unfiltered RPC
  list/detail adapter. Browse invokes no domain action.
- Keep `actions` and `choice` on Pi's public `SelectList` renderer, but own their input dispatch in the
  kit so navigation, confirmation, cancellation, and hints all use the callback-provided
  `KeybindingsManager` rather than a global keybinding singleton.
- Add `runCustomInteraction()` beside `runTask()`. It wraps only Pi's public `ctx.ui.custom()`
  contract, combines owner cancellation with an interaction signal, drains optional pending work,
  classifies external disposal and owner replacement as stale, and reports unsupported modes and
  errors through typed results. Product-specific Back/Close values remain consumer-owned.
- Increment `PI_EXTENSION_MENU_API_VERSION` to 6 while keeping version-5 definitions valid.

## Non-Goals

- Refactor pi-starship to consume unreleased pi-tui-kit APIs.
- Add Starship module states, persistence, collection, settings, or other domain policy to the kit.
- Add a generic custom menu screen that exposes internal navigator/component contracts.
- Change package versions, consumer dependency ranges, publish metadata, or perform a release.
- Implement the previously discussed P1 harness and cross-screen adaptive-height work.

## Plan

- [x] Added focused model/component tests for `browse` validation, search, textual status,
      list/detail navigation, adaptive resize, IME focus, terminal safety, selection restoration, and
      injected keys. Red evidence: focused run failed in the missing browse dispatcher and viewport
      validation exactly as expected.
- [x] Added failing action/choice regression tests where callback keybindings differ from Pi's global
      manager. Red evidence: callback Down/Confirm produced no action while the global manager used
      different keys. Static-list navigation and confirmation now use only the injected manager;
      focused action/choice rendering, paging, selection, disabled, Back, and Close tests pass.
- [x] Implemented the public `browse` types, model validation, adaptive TUI component, component
      dispatch, and exports without domain actions. Focused model/component tests pass for search,
      status text, detail navigation, resize bounds, focus, sanitization, and exits.
- [x] Added TUI/RPC runtime tests for browse Back/Close, detail pagination, duplicate labels,
      sanitization, no action dispatch, and eight-screen adaptation; existing shared TUI/RPC owner
      cancellation tests cover the same screen host path. Red evidence: RPC exited after one selector
      before browse adaptation; focused runtime tests now pass after list/detail integration.
- [x] Added focused tests for `runCustomInteraction()` completion, completed `undefined`, pre-abort,
      owner abort, async-factory races, explicit and implicit external disposal, pending-work draining,
      unsupported modes, stale suppression, and error reporting. Red evidence: the public export and
      typed context were absent; all eight helper tests now pass.
- [x] Updated API/type tests, README examples and ownership documentation for browse, injected static
      list keys, custom interactions, API version 6, and the manual consumer-upgrade policy. README
      and lifecycle-context usage examples compile; the rebuilt production/testing exports pass.
- [x] Ran 131 focused pi-tui-kit tests, package check/build, pi-starship package and 10 focused
      command/lifecycle tests, 10 focused pi-jupyter transition tests, `git diff --check`, the final
      `npm run check` with all 2,118 tests passing, and `just pack-tui-kit` with 41 expected files.
      Inspected the built public/testing exports and tarball. The first full gate exposed three hanging
      pi-jupyter tests whose synthetic callback key manager accepted semantic ids while sending raw
      keys; the fixture was corrected and the whole repository passed without weakening behavior.
- [x] Audited the final diff against Pi TUI, keybinding, lifecycle, RPC, accessibility,
      package-boundary, and scope constraints. No convention deviation remains. A live interactive
      Pi TUI/RPC smoke was not opened because commands may not open a TUI in this environment;
      public component/runtime/testing harnesses, consumer tests, full repository checks, and the
      package dry run cover the paths. Archived this completed plan without overwriting a file.

## Completion Checklist

- [x] Browse is read-only, searchable in TUI, deterministic in RPC, width/row bounded, terminal-safe,
      textually stateful, IME-aware, and predictable across detail/list/parent Back and Ctrl+C Close.
- [x] Actions and choice screens use callback-injected navigation and confirmation even when global
      keybindings differ.
- [x] Custom interactions terminate exactly once, abort and drain owned work, classify owner loss or
      external disposal as stale, and never reopen obsolete UI.
- [x] API version 6 remains source-compatible with version-5 menu definitions.
- [x] Documentation and supported testing surfaces describe only implemented contracts.
- [x] Focused, package, repository, pack, and diff gates pass with no unaccepted deviation.
