# pi-starship Explain and Modules plan

## Goal

Implement Phases 1–3 of the pi-starship command-capabilities roadmap on `main`: retain the already
merged trustworthy command baseline, add a read-only **Explain footer** view for currently showing
modules, and add a bounded searchable **Modules** inspector for every registered module. Do not
release packages.

## Context

- Roadmap Phase 1 is verified on `main` by merged PR #517 (`6a39955`) and successful CI/CodeQL.
- The approved top-level information architecture for this scope is Customize footer, Explain footer,
  Modules, Configuration, Help, and Restore built-in….
- `renderStatusline()` already returns per-module rendered chunks, while
  `reachableModuleRequirements()` owns disabled and root-format reachability semantics.
- The module catalog owns names, variables, defaults, options, and ordering but not descriptions.
- The runtime owns immutable snapshots and pure footer rendering. Command views must consume that
  state without starting refreshes, filesystem reads, subprocesses, timers, or network work.
- Applicable guidance read completely: `docs/extension-conventions.md`,
  `docs/extension-settings.md`, Pi `extensions.md`, `tui.md`, and `keybindings.md`, plus the
  `applying-tdd`, `designing-user-experiences`, and `designing-user-interfaces` skills.

## Architecture

- Extend `extensions/pi-starship/src/modules/catalog.ts` with a complete, type-checked description
  table and expose catalog definitions with those descriptions as the single command/documentation
  source.
- Add a pure module-inspection model under `extensions/pi-starship/src/modules/`. Compute one render,
  combine its per-module chunks with effective config and root reachability, and classify each module
  as `Showing`, `Empty`, `Disabled`, or `Not in format`. Reserve `Unavailable` for future explicit
  runtime evidence rather than inferring collector failure.
- Wire a synchronous inspection callback from `pi-starship.ts` to `commands.ts`. It reads only the
  current effective config, immutable runtime snapshot, and most recent footer width; it never
  requests or waits for collection.
- Keep the main navigation on `@narumitw/pi-tui-kit`. The extension's declared compatible dependency
  resolves to pi-tui-kit `0.40.0`, whose public screen union has no adaptive review; changing the
  dependency is out of scope. Keep Explain and the searchable read-only module browser in one
  extension-owned adaptive inspector component rather than relying on newer monorepo-only APIs.
- The inspector uses Pi's public `Input`, injected keybindings, text states, adaptive row allocation,
  bounded scrolling, IME focus forwarding, terminal-control sanitization, and Back/Close behavior.
  It owns no asynchronous work.
- Preserve `/starship settings`, `status`, and `help` exactly. Do not add direct `explain` or `module`
  routes without a separately approved automation need.

## Non-Goals

- Do not implement Roadmap Phase 4 or later: computed/raw configuration views, reload, module
  mutation, support reports, timings, or presets.
- Do not change the TOML format, settings path, built-in root/defaults, formatter/style semantics,
  palette behavior, collectors, persistence, migration, backups, package metadata, dependencies, or
  versions.
- Do not trigger an npm publication, version bump, Git tag, GitHub release, or edit personal settings.
- Do not claim screen-reader support beyond Pi's documented TUI contract; retain complete text,
  logical keyboard order, IME focus, and non-color state cues.

## Risks

- Per-module chunks are computed before root composition. Avoid false visibility by requiring both
  root reachability and non-empty chunks; cover explicit references, `$all`, disabled modules, empty
  values, and duplicate root references.
- Forty-six modules can overflow narrow/short terminals. Allocate the browser from live terminal
  rows, keep one reachable item when possible, scroll both list and detail, and verify dynamic resize.
- A search field can break IME or replay terminal controls. Forward `Focusable.focused`, sanitize the
  Input value after every edit, and test focus and pasted controls through the public TUI harness.
- Opening a nested specialized component from the standard menu can outlive its session. Pass the
  captured owner signal, close on abort/disposal, revalidate ownership after the await, and test
  replacement and shutdown separately.
- Existing tests navigate by item index. Update only expectations changed by the approved six-action
  order and retain all customization, restore, direct-route, RPC, print/JSON, and rollback coverage.

## Plan

- [x] Added focused tests for catalog descriptions and the pure inspection state model, including
      visible-once, explicit-format, `$all`, disabled, not-in-format, empty, and plain preview behavior.
      The first compile failed on the intentionally absent inspection API; after type scaffolding, the
      focused artifact failed all three inspection behaviors with `Module inspection is not
      implemented` while the completed description contract passed.
- [x] Added TUI-harness tests for the six-action main menu, adaptive Explain content/empty state,
      searchable module list, text states, module detail, search/selection restoration, remapped
      keybindings, IME focus, terminal controls, width/height resize, Escape, Ctrl+C, and no settings
      writes. The focused artifact failed all five UI behaviors on the expected missing Explain and
      Modules actions/browser.
- [x] Added type-checked catalog descriptions and the pure inspection model, combining one render with
      effective disabled/root reachability state and terminal-safe plain previews. All four focused
      catalog/inspection tests pass without changing renderer output or collector reachability.
- [x] Wired snapshot-only inspection through `pi-starship.ts` and added Explain through the
      extension-owned adaptive inspector surface. Visible-only, explicit empty/unavailable, responsive,
      and no-write cases pass; a runtime collector-spy regression confirms opening Explain starts no
      additional command work. Accepted dependency constraint: pi-starship remains compatible with
      its declared pi-tui-kit `^0.40.0` range rather than using the newer workspace review screen.
- [x] Implemented the extension-owned adaptive module browser and integrated it as a main action.
      Catalog/state/detail, search restoration, IME focus, terminal safety, resize, remapped-key,
      Back/Close, external disposal, session replacement, and shutdown coverage passes; the 15-test
      focused inspection/lifecycle run settled without writes or stale continuation use.
- [x] Updated `extensions/pi-starship/README.md` for the six-action menu, Explain semantics, module
      states/detail, read-only behavior, and menu-only routing. Updated the roadmap's current state,
      risks, and compatibility decision; Phase 2–3 remain unchecked and explicitly labelled as
      locally implemented pending merge, consistent with the roadmap's `main`-based milestone rule.
- [x] Ran 66 focused command/module/lifecycle tests, pi-starship package formatting/typechecking,
      `git diff --check`, `just pack-starship` (61 expected files), and the final repository gate with
      all 2,103 tests passing. The first full gate was invalidated by unrelated 1Password Git-signing
      failures; the documented command-scoped `commit.gpgsign=false` rerun and final rerun passed
      without weakening tests.
- [x] Audited the final diff against command, TUI, settings, asynchronous lifecycle, touched-area, and
      roadmap coherence checklists. No convention deviation remains; the documented design adaptation
      keeps the inspector extension-owned for pi-tui-kit `^0.40.0` compatibility. A real interactive
      Pi TUI smoke was not run because commands may not open a TUI in this environment; deterministic
      public-harness, runtime collector-spy, lifecycle, full-gate, and pack evidence cover the path.
      Archived this completed plan without overwriting an existing file.

## Completion Checklist

- [x] Phase 1 remains verified on `main`; no release action or version change occurred.
- [x] Every registered module has one non-empty catalog description and appears once in Modules.
- [x] Explain lists every currently showing non-empty module exactly once and no hidden/empty module.
- [x] Modules accurately distinguishes Showing, Empty, Disabled, and Not in format without inferring
      collector failure, and detail exposes preview, variables, style/display fields, root reference,
      reachability, and the known absent-output reason.
- [x] Explain and Modules consume the current snapshot synchronously, start no collection work, write
      no settings, and preserve existing footer/configuration behavior.
- [x] Explain and Modules are width/row bounded, searchable where approved, operable through injected
      keybindings with text cues, IME-focus aware, terminal-safe, and predictable on Back/Close.
- [x] User cancellation, component disposal, session replacement, and shutdown release every owned
      interaction; owner state is revalidated after every await.
- [x] Existing direct routes, non-TUI safety, atomic save/restore/rollback, invalid-file protection,
      missing-file side-effect freedom, and unknown-field behavior remain covered.
- [x] README matches the implementation and the roadmap records its local, merge-pending status;
      focused, package, repository, pack, and diff gates pass with no unaccepted deviation.
