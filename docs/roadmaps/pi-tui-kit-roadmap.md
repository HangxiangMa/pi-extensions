# Pi TUI Kit Native Composite Patterns Roadmap

## Goal

Evolve `@narumitw/pi-tui-kit` with a small set of reusable interaction patterns inspired by Pi's
non-public composite components, while using only public Pi APIs, preserving existing menu contracts,
and admitting a new abstraction only when at least two repository consumers can adopt it without
losing behavior.

## Context

Pi already publicly exports primitives that consumers should use directly: `SelectList`, `Input`,
`SettingsList`, `DynamicBorder`, `BorderedLoader`, and `ctx.ui.input()`, `select()`, and `confirm()`.
The kit should not copy those controls.

The useful references that cannot safely be imported are private composites under Pi's interactive
implementation, including `ModelSelectorComponent`, `SessionSelectorComponent`, the settings
`SelectSubmenu`, `TrustSelectorComponent`, `TreeSelectorComponent`, and `LoginDialogComponent`.
Their package paths and implementation details are not public compatibility contracts.

Current repository evidence includes:

- `pi-statusline` owns palette and information-profile pickers with current markers, descriptions,
  selected details, and optional live preview;
- `pi-starship` owns a framed action selector with a width-dependent preview;
- `pi-image-drop` owns contextual input and confirmation dialogs;
- `pi-file-context` owns an experimental searchable file catalog and multi-mode explorer;
- `pi-sync`, `pi-btw`, and `pi-usage` retain specialized UIs whose domain behavior should not be
  generalized accidentally.

The kit currently supports `actions`, `detail`, `settings`, and `multiSelect` screens.

## Architecture

- Import Pi runtime APIs only from supported package exports; never import
  `@earendil-works/pi-coding-agent/dist/*` or copy a private component wholesale.
- Model reusable behavior declaratively with stable IDs and action IDs. The kit owns rendering,
  navigation, keybindings, mode adaptation, cancellation, and stale-continuation safety; extensions
  retain domain state, persistence, confirmations, preview side effects, and recovery policy.
- Every admitted screen must define TUI and RPC behavior. Print and JSON continue through the
  existing unsupported-mode contract unless a public deterministic route is explicitly designed.
- Require two compatible consumers before adding a public abstraction. Migrate consumers in separate
  focused changes after the library contract lands; do not combine unrelated domain refactors with
  the kit feature.
- Treat each new screen kind as a public API change. Decide and document whether
  `PI_EXTENSION_MENU_API_VERSION` changes before implementation rather than inferring it after release.
- Apply the same TUI boundary as settings: width-safe output, terminal-control sanitization,
  callback-provided theme/keybindings, `Focusable` forwarding, stable selection, explicit Back/Close,
  and disposal/session/shutdown cancellation.

## Non-Goals

- Do not reproduce Pi's model, session, trust, tree, authentication, or provider domain logic.
- Do not expose Pi TUI objects through the declarative API to support one specialized preview.
- Do not replace extension-owned editors, pagers, diff viewers, secret inputs, OAuth flows, or
  multi-step forms.
- Do not add a generic abstraction merely to remove a single local `ctx.ui.custom()` call.
- Do not make all action menus searchable or add live preview side effects by default.

## Plan

### Milestone 0 — Qualify each abstraction

- [ ] Create a consumer-compatibility matrix for the candidate flows in `pi-statusline`,
      `pi-starship`, `pi-image-drop`, `pi-file-context`, `pi-sync`, `pi-btw`, and `pi-usage`; record
      required states, inputs, side effects, cancellation, RPC behavior, and features that must remain
      extension-owned, and admit a candidate only when two consumers share one bounded contract.
- [ ] Audit Pi's installed public exports and private composite references before each admitted
      feature; verify the proposed implementation can be composed from root-exported APIs without a
      `dist/*` import or private type dependency.
- [ ] Define the additive API/versioning decision for each admitted screen in its implementation
      plan; verify existing four-kind definitions continue compiling unchanged and document any
      intentional API-version increment.

### Milestone 1 — Static choice screen

Model the reusable core of Pi's private theme/thinking/select-submenu pattern without live side
effects.

MVP contract:

- stable item ID, label, description, optional selected-item detail lines, disabled state;
- current item ID and textual current marker;
- restored initial cursor and bounded viewport;
- Enter/Space confirmation, Escape Back, `Ctrl+C` Close;
- one action only after confirmation; no action merely from moving the cursor.

- [ ] Write `docs/plans/<date>_pi-tui-kit-choice-screen-plan.md` from the qualification matrix, naming
      two migration candidates and explicitly excluding any live preview behavior they cannot preserve;
      obtain acceptance evidence from the current consumer tests and UI contracts before coding.
- [ ] Add red model/type tests in `packages/pi-tui-kit/test/menu-model.test.ts` for valid choice items,
      duplicate/blank IDs, missing actions, current-item fallback, disabled rows, and unchanged existing
      definitions; verify failures identify the absent choice contract.
- [ ] Add the declarative choice types and validation in `packages/pi-tui-kit/src/types.ts` and
      `packages/pi-tui-kit/src/model.ts`; verify package typechecking and model tests pass without
      widening action, settings, or multi-select semantics.
- [ ] Implement the choice TUI in `packages/pi-tui-kit/src/screen-components.ts` with Pi-style borders,
      current marker, selected details, stable cursor, width bounds, terminal sanitization, injected
      keybindings, and Back/Close behavior; verify focused rendering, Unicode, narrow-width, disabled,
      focus, cancellation, and disposal tests.
- [ ] Implement choice navigation and RPC adaptation in `packages/pi-tui-kit/src/runtime.ts`; verify
      stable raw identity, duplicate display labels, current-item restoration, rejected actions,
      owner abort, stale generation, and RPC cancellation through deterministic runtime tests.
- [ ] Document the choice screen and ownership boundary in `packages/pi-tui-kit/README.md`, rebuild the
      package, and verify `npm run check --workspace @narumitw/pi-tui-kit`, `npm run check`, and
      `just pack-tui-kit`.
- [ ] Migrate each qualified choice consumer in its own PR without removing preview, persistence,
      failure recovery, or non-TUI behavior; verify the extension's focused tests, root gate, package
      dry run when applicable, and a representative Pi runtime smoke before declaring the abstraction
      proven.

### Milestone 2 — Searchable catalog screen

Model the reusable list/search shell seen in Pi's private model, session, and extension selectors.
Keep it separate from short action menus.

MVP contract:

- focus-forwarded search input and fuzzy matching over declared search text;
- stable ID, label, description, optional badge/metadata, current marker, disabled state;
- ten-row default viewport with optional bounded override and position indicator;
- selected-item details, no-match/empty states, cursor restoration, Back/Close;
- no regex grammar, asynchronous refresh, scope tabs, or domain-specific sorting in the MVP.

- [ ] Admit the catalog only after the compatibility matrix identifies two active consumers whose
      search, selection, and RPC needs fit the MVP; otherwise mark the milestone deferred with the
      missing shared requirement rather than broadening the API speculatively.
- [ ] Write `docs/plans/<date>_pi-tui-kit-catalog-screen-plan.md` with raw/display/search identity,
      filtering order, cursor behavior, mode adaptation, and lifecycle acceptance cases; verify the
      proposal against both consumer flows before implementation.
- [ ] Add red model, component, and runtime tests for catalog validation, bracketed-paste sanitization,
      CJK/emoji widths, custom keybindings, filtering to zero/one/many rows, duplicate labels, current
      markers, disabled activation, resize/scroll anchoring, RPC identity, cancellation, disposal, and
      session replacement.
- [ ] Implement the declarative catalog contract across `types.ts`, `model.ts`,
      `screen-components.ts`, and `runtime.ts` using public `Input`/fuzzy/width primitives; verify the
      focused suites and existing screen behavior remain green.
- [ ] Document, build, pack, and migrate both qualifying consumers in separate PRs; verify each
      migration preserves domain sorting, actions, failure states, and any specialized preview outside
      the kit before running the root gate and Pi runtime smoke.

### Milestone 3 — Contextual decision screen

Model the reusable presentation contract of Pi's private trust selector only when plain
`ctx.ui.confirm()` or `ctx.ui.select()` cannot preserve required context.

MVP contract:

- title plus exact subject/context lines;
- separately labeled saved and current state;
- choices with consequences, current marker, disabled explanation, and safe initial selection;
- explicit Apply/Save, Back, and Close semantics;
- domain confirmation wording and mutation remain consumer-owned.

- [ ] Admit the decision screen only if two active consumers require the same contextual state and
      choice presentation beyond public Pi dialogs; otherwise continue using extension-owned dialogs.
- [ ] Write `docs/plans/<date>_pi-tui-kit-decision-screen-plan.md` with the two exact workflows,
      safety/default rules, cancellation semantics, and RPC representation; verify destructive or
      externally visible effects remain outside the renderer.
- [ ] Add red validation, rendering, action, cancellation, stale-session, disabled-state, and RPC tests,
      then implement the smallest declarative decision contract across the kit modules; verify no
      decision is emitted before explicit confirmation and cancellation leaves domain state unchanged.
- [ ] Document, build, pack, and migrate the qualifying consumers separately; verify exact summaries,
      safe defaults, failure recovery, root checks, and representative Pi runtime smokes.

### Milestone 4 — Deferred patterns

- [ ] Re-evaluate a snapshot-first asynchronous catalog only after two consumers need cached-first
      rendering plus background refresh; require bounded timeout, abort on cancel/dispose/session
      replacement/shutdown, post-`await` generation checks, stale-result rejection, and observable
      cached/error states before admitting it.
- [ ] Re-evaluate a generic tree browser only after two consumers share hierarchy, expand/collapse,
      active-path, scroll-anchor, and filter semantics; keep Pi session-tree logic and extension-specific
      node actions out of the kit.
- [ ] Keep login/OAuth wizards, secret inputs, editors, pagers, diffs, and width-dependent live previews
      permanently extension-owned unless a separate approved architecture establishes a safe public
      contract and multiple concrete consumers.

## Risks

- **Private-UI drift:** visual copying can age quickly. Preserve interaction contracts and public theme
  tokens rather than private class structure or exact internal strings.
- **API sprawl:** catalog, choice, and decision can collapse into an over-configurable generic list.
  Keep separate task-oriented kinds and reject one-consumer hooks.
- **Lost capability during migration:** local UIs may own preview rollback, dynamic width, or
  persistence. Compare behavior before deleting them and leave specialized flows local when needed.
- **RPC mismatch:** rich TUI metadata may flatten poorly. Define stable identity and observable Back,
  disabled, and confirmation behavior before shipping each screen.
- **Lifecycle regression:** search, preview, or refresh work can outlive the component. Audit user
  cancellation, disposal, replacement, and shutdown independently for every async addition.
- **Display trust:** labels, metadata, values, keybinding hints, pasted queries, and errors can contain
  terminal controls. Sanitize at the final display boundary while preserving raw IDs and payloads.

## Completion Checklist

- [ ] Every shipped composite passed the two-consumer qualification gate and has two completed,
      behavior-preserving migrations or an explicitly deferred milestone with evidence.
- [ ] No package source imports Pi private `dist/*` modules or exposes TUI implementation objects in
      the public declarative contract.
- [ ] Existing action, detail, settings, and multi-select consumers remain source compatible unless an
      explicitly approved API-version change documents migration.
- [ ] Each admitted screen has deterministic TUI and RPC coverage for identity, width, Unicode,
      terminal sanitization, keybindings, Back/Close, disabled state, failures, cancellation,
      disposal, session replacement, and shutdown where applicable.
- [ ] Each feature and consumer migration passed focused tests, `npm run check`, applicable package
      dry runs, and a representative Pi runtime smoke with unverified paths recorded.
- [ ] README ownership guidance clearly distinguishes public Pi primitives to reuse, private Pi
      composites used only as references, kit-owned standard behavior, and extension-owned domain UI.
