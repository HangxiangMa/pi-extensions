# Pi TUI Kit Roadmap

## Vision

`@narumitw/pi-tui-kit` should give Pi extensions a small, dependable set of declarative interaction
patterns that feel native to Pi without depending on Pi's private UI implementation. Extensions
should spend their effort on domain state, persistence, safety, and product language instead of
rebuilding navigation, selection, search, mode adaptation, and lifecycle handling.

## Goal

Add only the reusable composite screens that have demonstrated demand from at least two compatible
repository consumers, using public Pi APIs and preserving existing extension behavior across TUI,
RPC, cancellation, session replacement, and shutdown.

## Objectives

- Qualify every proposed abstraction against at least two concrete consumer workflows before adding
  it to the public API.
- Deliver a static choice screen as the first candidate, followed by searchable catalog and contextual
  decision screens only when their qualification gates pass.
- Complete two behavior-preserving consumer migrations for every screen that becomes public.
- Provide deterministic TUI and RPC coverage for every admitted screen, including width, Unicode,
  terminal safety, keybindings, stable identity, cancellation, disposal, and stale-session behavior.
- Keep private Pi imports at zero and document an API-version decision for every new public screen kind.

## Current State

The kit currently provides five declarative screen kinds:

- `actions` for navigation and domain actions;
- `detail` for read-only text;
- `choice` for confirmed static alternatives with current/initial state and selected details;
- `settings` for Pi-style searchable settings with serialized saves and rollback;
- `multiSelect` for bounded optimistic toggles and bulk actions.

The runtime already owns screen-stack navigation, per-screen cursor memory, TUI/RPC adaptation,
Back/Close semantics, cancellable busy actions, terminal-safe rendering, and stale-continuation
checks. Consumers retain domain state, transactional persistence, confirmations, specialized UI, and
session ownership.

Pi publicly exports primitives that should be used directly: `SelectList`, `Input`, `SettingsList`,
`DynamicBorder`, `BorderedLoader`, and `ctx.ui.input()`, `select()`, and `confirm()`. Pi also root-exports
several domain-coupled composites, including its theme, thinking, model, session, tree, and login
selectors; use those directly only when their domain contract fits. Generic patterns such as the
settings selector's internal `SelectSubmenu` are not exported. Never deep-import a `dist/*` path.

Current repository evidence includes:

- `pi-statusline` palette and information-profile pickers with current markers, details, and optional
  preview;
- `pi-starship` framed action selection with width-dependent preview content;
- `pi-image-drop` contextual input and decision dialogs;
- `pi-file-context` experimental searchable file navigation;
- `pi-worktree` worktree selection with display-derived identity mapping;
- specialized UIs in `pi-sync`, `pi-btw`, and `pi-usage` that should remain local unless they share a
  proven contract with another consumer.

The primary challenge is avoiding an over-configurable generic list that erases domain ownership or
adds lifecycle complexity for a single extension.

## Guiding Principles

- **Public Pi APIs only:** import root-exported components directly when their domain contract fits;
  never deep-import `@earendil-works/pi-coding-agent/dist/*` or copy an internal component wholesale.
- **Two-consumer gate:** require two compatible workflows before adding an abstraction.
- **Preserve capability:** migrations must retain preview, persistence, validation, failure recovery,
  safety, and non-TUI behavior.
- **Declarative boundary:** expose stable IDs, display data, and action IDs—not TUI instances or
  renderer callbacks that leak implementation details.
- **Task-oriented screens:** keep choice, catalog, decision, settings, and multi-select contracts
  distinct instead of building one universal component.
- **Mode parity:** define TUI and RPC behavior before implementation; use the existing unsupported-mode
  route for print and JSON unless a deterministic public behavior is designed.
- **Lifecycle ownership:** audit user cancellation, component disposal, session replacement, and
  shutdown independently for every async path.
- **Safe display boundary:** sanitize labels, metadata, values, keybinding hints, pasted queries, and
  errors while preserving raw IDs and action payloads.
- **Bounded delivery:** land one kit capability per focused rollout; keep unrelated consumer and
  domain changes separate.

## Roadmap Themes

### Evidence-driven abstraction

Inventory real workflows, identify their common interaction contract, and stop when a candidate needs
consumer-specific hooks to appear reusable.

### Native-feeling standard screens

Reuse Pi's public primitives and interaction conventions for borders, focus, search, current markers,
descriptions, hints, and viewport behavior without treating private source as an API.

### Cross-mode and lifecycle correctness

Keep TUI, RPC, cancellation, stale generation, and disposal semantics together rather than adding
visual components first and runtime behavior later.

### Safe, incremental adoption

Prove each screen through two migrations, retain specialized UIs when they own unique behavior, and
avoid unrelated domain refactors during adoption.

## Plan

Execute the phases below in order. A phase may be explicitly deferred when its admission criteria are
not met; deferral is preferable to widening the API speculatively.

## Phases and Milestones

### Phase 1: Foundation and Qualification

**Milestones:**

- Create a consumer-compatibility matrix for `pi-statusline`, `pi-starship`, `pi-image-drop`,
  `pi-file-context`, `pi-sync`, `pi-btw`, and `pi-usage`, covering inputs, states, side effects,
  cancellation, RPC behavior, and extension-owned responsibilities.
- Audit installed Pi exports before each candidate and prove the implementation can use root-exported
  APIs without private types or `dist/*` imports.
- Identify two compatible consumers for each admitted pattern; record why rejected or deferred
  candidates do not meet the shared contract.
- Decide whether each additive screen changes `PI_EXTENSION_MENU_API_VERSION`, and verify existing
  four-kind menu definitions remain source compatible.
- Write a focused implementation plan for each admitted screen before coding.

**Outcome:** A verified contract and two migration candidates for each admitted screen, with
specialized or unsupported patterns explicitly deferred.

---

### Phase 2: Static Choice Screen

**Status:** implemented in [PR #463](https://github.com/narumiruna/pi-extensions/pull/463); see the
[choice-screen plan](../plans/archived/2026-07-30_pi-tui-kit-choice-screen-plan.md).

The first candidate models the reusable core of Pi's theme, thinking, and settings-submenu selectors
without cursor-movement side effects.

**Milestones:**

- Define stable item IDs, labels, descriptions, optional selected-item details, disabled state,
  current item ID, and a textual current marker.
- Add restored initial selection, bounded viewport, Enter/Space confirmation, Escape Back, and
  `Ctrl+C` Close.
- Trigger one domain action only after confirmation; keep live preview and preview rollback
  extension-owned.
- Add model validation and deterministic TUI/RPC tests for duplicate labels, current-item fallback,
  raw identity, width, Unicode, sanitization, custom keybindings, disabled rows, cancellation,
  disposal, and stale sessions.
- Document the screen and ownership boundary, build the package, run repository checks, and inspect
  the package dry run.
- Migrate both qualified consumers in the focused rollout without removing existing capability.

**Outcome:** A proven declarative choice screen with two behavior-preserving adopters and no
consumer-specific preview hook.

---

### Phase 3: Searchable Catalog and Contextual Decision

These screens proceed independently; either may be deferred if it lacks two compatible consumers.

**Searchable catalog milestones:**

- Define focus-forwarded search, fuzzy matching over declared search text, stable identity, optional
  badge/metadata, current marker, disabled state, selected details, and bounded viewport.
- Cover empty, no-match, singleton, large, duplicate-label, CJK/emoji, resize, scroll-anchor,
  bracketed-paste, custom-keybinding, RPC, cancellation, disposal, and replacement cases.
- Keep regex grammar, asynchronous refresh, scope tabs, and domain sorting out of the first contract.
- Migrate two qualified catalog consumers while retaining specialized sorting, previews, and actions
  outside the kit.

**Contextual decision milestones:**

- Admit the screen only when public `ctx.ui.confirm()` or `ctx.ui.select()` cannot preserve the
  context required by two workflows.
- Define exact subject/context lines, separately labeled saved and current state, consequences,
  current marker, disabled explanation, safe initial selection, and explicit Apply/Back/Close.
- Keep domain confirmation wording, authorization, validation, and mutation extension-owned.
- Prove no decision is emitted before confirmation and cancellation leaves domain state unchanged in
  both TUI and RPC modes.
- Migrate two qualified consumers with exact summaries, safe defaults, and failure recovery intact.

**Outcome:** Qualified large-list and decision workflows use standard kit screens; candidates without
shared contracts remain extension-owned.

---

### Phase 4: Evolution and Deferred Patterns

**Milestones:**

- Re-evaluate snapshot-first asynchronous catalogs only after two consumers need cached-first
  rendering plus background refresh, bounded timeout, cancellation, stale-result rejection, and
  observable cached/error states.
- Re-evaluate a generic tree browser only after two consumers share hierarchy, expand/collapse,
  active-path, scroll-anchor, and filtering semantics.
- Keep Pi session-tree domain logic out of a future generic tree contract.
- Keep login/OAuth wizards, secret inputs, editors, pagers, diffs, and width-dependent live previews
  extension-owned unless a separate approved architecture establishes a safe contract and multiple
  consumers.
- Review shipped screens against newer public Pi exports and replace kit-owned composites when Pi
  eventually exposes an equivalent stable public component.

**Outcome:** The kit evolves only where repeated evidence justifies new lifecycle and API surface,
and retires local abstractions when a stable public Pi replacement becomes available.

## Technical Health

- Keep TypeScript strict, NodeNext-compatible, and built as published JavaScript plus declarations.
- Keep authored source files below the repository's review threshold or split them along clear screen,
  rendering, and runtime responsibilities when cohesion improves.
- Maintain deterministic model, component, runtime, and README usage tests for every public contract.
- Run `npm run check --workspace @narumitw/pi-tui-kit`, the root `npm run check`, and
  `just pack-tui-kit` for each kit feature.
- Use representative Pi runtime smokes for new TUI behavior and record any path that cannot be
  exercised non-interactively.
- Keep terminal sanitization at the final display boundary and preserve raw domain identities only in
  non-rendered action payloads.
- Avoid retained tasks or state without explicit cancellation, disposal, generation checks, and
  bounded cleanup.

## Risks and Dependencies

- **Private-UI drift:** Pi's private visuals and strings may change. Depend on public primitives and
  preserve interaction contracts rather than source structure.
- **API sprawl:** consumer-specific hooks can turn the kit into a generic UI framework. Enforce the
  qualification gate and task-oriented screen boundaries.
- **Lost capability:** local UIs may own preview rollback, dynamic width, or persistence. Compare
  behavior before migration and retain specialized implementations where necessary.
- **RPC flattening:** rich TUI metadata may not map clearly to dialogs. Define stable identity,
  disabled behavior, Back, and confirmation semantics before shipping.
- **Lifecycle regressions:** search, preview, or refresh work may outlive its owner. Require controlled
  cancellation tests for every async addition.
- **Display trust:** terminal controls may enter through labels, keybindings, errors, or paste. Keep
  sanitization and width checks mandatory.
- **Pi compatibility:** new public exports may make a kit component redundant; review dependency
  updates before extending a local replacement.

## Success Metrics

- Zero imports from Pi private `dist/*` paths in package source.
- At least two completed consumer migrations for every new public screen kind.
- All existing menu definitions continue typechecking unless an approved API-version change includes
  migration evidence.
- Every admitted screen has passing TUI and RPC tests for its documented states and lifecycle paths.
- Every kit feature passes focused tests, the root CI-equivalent gate, package dry run, and a
  representative runtime smoke.
- No migration removes documented preview, persistence, safety, recovery, or non-TUI capability.
- Deferred candidates record the missing shared requirement instead of expanding the API without
  evidence.

## Non-Goals

- Reproducing Pi's model, session, trust, tree, authentication, or provider domain logic.
- Copying public controls that consumers can import directly.
- Exposing Pi TUI objects through the declarative API.
- Replacing extension-owned editors, pagers, diff viewers, secret inputs, OAuth flows, or multi-step
  forms.
- Adding a generic abstraction solely to eliminate one `ctx.ui.custom()` call.
- Making all action menus searchable or enabling live preview side effects by default.
- Committing to delivery dates or speculative release versions before qualification.

## Decisions and Changes

| Date | Decision or change | Rationale |
| --- | --- | --- |
| 2026-07-30 | Store the roadmap under `docs/roadmaps/`. | Roadmaps describe long-term product direction; executable feature plans remain under `docs/plans/`. |
| 2026-07-30 | Reuse root-exported Pi composites only when their domain contract fits; use non-exported composites only as interaction references. | Deep implementation paths are not compatibility contracts, while public exports should not be copied. |
| 2026-07-30 | Require two compatible consumers before adding a screen. | Prevents one-off hooks and unsupported abstraction growth. |
| 2026-07-30 | Deliver the static choice screen with `pi-statusline` information profiles and `pi-worktree` selection in one focused rollout. | Both need confirmed static selection with raw identity and no cursor-movement side effect; an atomic proof rollout keeps preview, decision, and editor-preserving flows specialized. |
| 2026-07-30 | Keep async catalogs, trees, login flows, and live previews deferred. | These patterns require stronger shared evidence or remain domain-specific. |

## Completion Checklist

- [ ] Every shipped composite passed the two-consumer qualification gate and completed two
      behavior-preserving migrations, or its phase is explicitly deferred with evidence.
- [ ] Package source contains no Pi private `dist/*` imports or public contracts exposing TUI objects.
- [ ] Existing action, detail, settings, and multi-select consumers remain source compatible unless an
      approved API-version change documents migration.
- [ ] Every admitted screen has deterministic TUI and RPC coverage for identity, width, Unicode,
      terminal sanitization, keybindings, Back/Close, disabled state, failures, cancellation,
      disposal, replacement, and shutdown where applicable.
- [ ] Each feature and migration passed focused tests, root checks, package dry runs, and a
      representative Pi runtime smoke with unverified paths recorded.
- [ ] README ownership guidance distinguishes public Pi primitives and domain composites to reuse,
      non-exported composites used only as references, kit-owned standard behavior, and
      extension-owned domain UI.
