# Pi TUI Kit Consumer Convergence Plan

## Goal

Adopt Pi TUI Kit's published standard interactions in `pi-statusline`, `pi-starship`, and `pi-tool`, add only the narrow Live Choice contract needed to preserve Starship behavior, and remove duplicated generic TUI ownership without moving domain state, persistence, preview rollback, or specialized workflows into the Kit.

Deliver the work through dependency-ordered pull requests so no extension raises its Pi TUI Kit compatibility floor before the required API is published and registry-verified.

## Context

Pi TUI Kit already serves 23 repository packages, while 14 packages still depend directly on Pi TUI for a mixture of generic and specialized interfaces.

The archived Live Choice plan explicitly deferred `pi-statusline` and `pi-starship` migrations until `runLiveChoice()` was published.

The registry currently exposes a Kit release containing `runLiveChoice()`, so `pi-statusline` can migrate now.

`pi-starship` cannot migrate its preset picker without one narrow distinction: the active preset must reject the primary Apply action while still allowing its Customize shortcut.

Pull request #685 adds exact browse detail documents, but that API is not published yet.

`pi-tool` must therefore retain its independently installable browser workaround until a registry release contains that exact browse contract.

The Starship footer explanation is a read-only adaptive scrolling document and can use the existing declarative `review` screen without a new Kit API.

## Architecture

### Ownership

Pi TUI Kit owns standard selection, preview-callback draining, injected-key navigation, terminal-safe rendering, Back/Close classification, TUI/RPC adaptation, and component disposal.

Each extension continues to own domain data, current-session identity, preview snapshots, preview reset, validation, persistence, rollback, notifications, and action consequences.

Specialized interfaces remain local, including Statusline segment ordering, Starship width-dependent apply previews, Sync secret input and conflict resolution, Recall scope/delete search, BTW and Chat composers, OAuth, and File Context exploration.

### Live Choice confirmation gating

Extend only `LiveChoiceItem` with an optional confirmation-disabled state and reason.

The existing `disabled` state continues to block both primary confirmation and shortcuts.

The new state blocks only primary confirmation, keeps configured shortcuts available in TUI mode, presents a textual reason, and remains inert in RPC mode where shortcuts do not exist.

If both states are supplied, full `disabled` behavior takes precedence.

Keep this contract scoped to `runLiveChoice()` unless implementation evidence proves the declarative `choice` screen needs the same public capability.

### Pull-request boundaries

1. Migrate `pi-statusline` to the already-published Live Choice API and introduce this plan.
2. Migrate the Starship footer explanation to the already-published `review` screen.
3. Add the narrow Live Choice confirmation-gating API to Pi TUI Kit after pull request #685 is merged, avoiding API-marker and release-intent conflicts.
4. After an explicitly approved Kit release is registry-verified, migrate the Starship preset picker.
5. After the same release is proven to contain exact browse details, migrate `pi-tool` and remove its browser workaround.

Each implementation pull request starts from then-current `origin/main`, changes only its owning package or the Kit, carries its own Changeset when published behavior or compatibility changes, and updates this plan with evidence.

## Non-Goals

- Do not combine an unpublished Kit API with its first consumer.
- Do not publish packages, merge a Changesets release pull request, create version tags, or dispatch release workflows without explicit user approval.
- Do not redesign Statusline palettes, Starship presets, Starship apply/rollback flows, or the `/tool` catalog.
- Do not move extension settings persistence, validation, unknown-field preservation, atomic writes, or rollback into Pi TUI Kit.
- Do not add arbitrary render callbacks, consumer components, secret inputs, editors, reorderable settings, conflict resolution, or transcript composers to the Kit.
- Do not remove direct Pi TUI dependencies while any production import remains.
- Do not migrate unrelated packages merely because they use `ctx.ui.custom()`.

## Plan

### Phase 0: Plan and baselines

- [x] Record the clean starting branch, base commit, open Kit pull requests, registry Kit release, and relevant package dependency floors; verify with `git status`, `gh pr view`, package manifests, `npm view`, and the lockfile.
- [x] Map the touched TUI, settings, lifecycle, package, Changeset, and release MUST rules from `docs/extension-conventions.md` and `docs/extension-settings.md` to focused tests and repository gates.
- [ ] Record focused baselines for `pi-statusline`, `pi-starship`, `pi-tui-kit`, and `pi-tool` before each owning phase; run package checks and the relevant package tests without running Kit builds concurrently with root checks.

### Phase 1: pi-statusline Live Choice migration

- [x] Create a focused branch from then-current `origin/main`, add characterization coverage for initial/current selection, cursor preview, cancel restoration, confirmation, stale owner replacement, disposal, terminal controls, narrow widths, and persistence failure behavior.
- [x] Verify the published Kit release and clean-install declaration expose `runLiveChoice()`, then raise only `pi-statusline`'s Kit compatibility floor to that registry-verified release and refresh the root lockfile.
- [x] Replace `showPalettePresetPicker()`'s local `SelectList`, border, hint, and completion loop with `runLiveChoice()` while keeping preview, save/apply, rollback, and final preview reset extension-owned.
- [x] Preserve the existing palette labels, current marker, initial cursor, TUI-only command support, Back/Close behavior, notification wording, unknown-field preservation, atomic settings publication, and failed-apply rollback.
- [x] Remove only imports and helpers made unused by the picker migration; retain direct Pi TUI dependencies required by the custom segment-ordering editor, renderer, and statusline components.
- [x] Update `pi-statusline` documentation only where interaction wording or compatibility requirements changed, and add an appropriate package Changeset.
- [x] Run focused Statusline tests, its package check, root dependency resolution verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack statusline`; inspect the tarball and record any unavailable live TUI smoke.
- [x] Audit settings ordering, preview cleanup, stale ownership after every await, cancellation, disposal, rollback, final diff scope, and independent installation before opening the Statusline pull request.

### Phase 2: pi-starship footer explanation migration

- [ ] Create a separate branch from then-current `origin/main` and add characterization coverage for available, unavailable, and empty inspections; adaptive height, narrow widths, scrolling, resize clamping, terminal controls, Back, Close, owner abort, and restored parent selection.
- [ ] Replace the custom component in `packages/pi-starship/src/command-inspector.ts` with a pure terminal-safe content formatter consumed by a declarative adaptive `review` screen in the Starship menu.
- [ ] Keep inspection acquisition, module ordering, preview formatting, TUI-only command behavior, and session ownership in Starship; do not expose a Kit render callback or change RPC support.
- [ ] Delete superseded local layout, scroll, keybinding, abort-listener, and disposal ownership, then remove only imports that no longer have another production caller.
- [ ] Update Starship package documentation if the interaction contract changed and add an appropriate Starship Changeset.
- [ ] Run focused Starship command and lifecycle tests, its package check, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack starship`; inspect the tarball and record any unavailable live TUI smoke.
- [ ] Audit terminal safety, resize behavior, parent cursor restoration, cancellation, disposal, stale session ownership, final diff scope, and independent installation before opening the Starship inspector pull request.

### Phase 3: Pi TUI Kit confirmation-gating API

- [ ] Wait until pull request #685 is merged, then create a Kit-only branch from the resulting `origin/main` so API compatibility metadata and Changeset intent advance from one authoritative base.
- [ ] Add failing public type and declaration tests for a Live Choice item whose primary confirmation is disabled while shortcuts remain enabled, including full-disabled precedence and the incremented compatibility literal.
- [ ] Add failing TUI tests for textual presentation, injected confirm rejection, shortcut dispatch, current and initial selection, preview callbacks, terminal controls, narrow widths, Back/Close, owner abort, disposal, stale preview completion, and preview failure.
- [ ] Add failing RPC tests proving the confirmation-disabled row is explanatory and inert, no shortcut or preview executes, duplicate labels preserve raw identity, cancellation follows the requested hint, and full-disabled precedence remains unchanged.
- [ ] Implement the smallest Live Choice-only public contract and internal adaptation needed to separate primary confirmation from shortcut availability without changing existing `disabled`, declarative `choice`, or default behavior.
- [ ] Update Kit README examples, public exports or declarations as required, API compatibility metadata, type fixtures, and a Kit-only minor Changeset.
- [ ] Run the complete Kit check and tests, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack tui-kit`; inspect root declarations and prove no consumer adopts the unpublished API.
- [ ] Audit display-cell bounds, sanitization, disabled-state precedence, shortcut conflicts, preview queue cancellation and draining, stale ownership after awaits, error reporting, TUI/RPC compatibility, and final diff scope before opening the Kit pull request.

### Release gate

- [ ] Obtain explicit user approval before merging or otherwise executing the Changesets release pull request.
- [ ] Verify the released Kit version and dist-tag with `npm view`, inspect its tarball, and use a clean temporary install to prove root declarations and runtime exports contain both exact browse details and Live Choice confirmation gating.
- [ ] Record the exact verified release in this plan before raising either Starship or Tool compatibility floors.

### Phase 4: pi-starship preset picker migration

- [ ] Create a separate consumer branch from then-current `origin/main`, raise only Starship's Kit floor to the verified release, run root `npm install`, and prove the lockfile resolves the compatible release in the consumer scope.
- [ ] Add or retain regressions for initial/current preset identity, live preview, paging, Home/End, narrow widths, terminal controls, active-preset Apply rejection, active-preset Customize availability, ordinary Apply, Customize, Back, Close, preview reset, stale owner replacement, and preview failure.
- [ ] Replace `showPresetPicker()`'s local component with `runLiveChoice()`, using confirmation gating for the active preset and the existing Customize shortcut while keeping validation, editor flow, apply, rollback, and preview reset in Starship.
- [ ] Delete superseded picker rendering, navigation, hint, and sanitization code; remove direct Pi TUI imports or dependencies only if no other Starship production path requires them.
- [ ] Update Starship README and package layout as needed and add an appropriate Starship Changeset for the compatibility floor and packaged implementation.
- [ ] Run focused Starship tests, package check, resolved-version verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, `just pack starship`, and a practical local Pi load smoke.
- [ ] Audit preview cleanup in every exit path, stale contexts after awaits, full versus confirmation-only disabled semantics, RPC/non-TUI behavior, independent installation, and final diff scope before opening the preset-picker pull request.

### Phase 5: pi-tool exact browse migration

- [ ] Confirm the release gate evidence satisfies the open release and consumer tasks in `docs/plans/2026-08-10_pi-tui-kit-browse-detail-document-plan.md`, then create a separate Tool branch from then-current `origin/main`.
- [ ] Raise only Tool's Kit floor to the verified exact-browse release, run root `npm install`, and prove the lockfile resolves that release in the consumer scope.
- [ ] Replace the custom browser and separate detail loop with the standard `browse` screen using `detailDocument`, preserving tool ordering, active status, metadata search, fresh command-time state, TUI/RPC navigation, exact schemas, query restoration, and stable raw identity.
- [ ] Delete `packages/pi-tool/src/tool-browser.ts`, remove direct Pi TUI peer and development dependencies when no production import remains, and update package layout documentation and lockfile metadata.
- [ ] Retain or add regressions for indentation, tabs, 20-column wrapping, Unicode cells, terminal controls, duplicate labels, query restoration, Back/Close, session replacement, shutdown, arguments, unsupported modes, and no document-content search leakage.
- [ ] Add an appropriate Tool Changeset, run focused tests, package check, resolved-version verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, `just pack tool`, and a practical local Pi load smoke.
- [ ] Audit lifecycle ownership, document privacy, independent installation, removal of duplicated UI ownership, final diff scope, and the original browse-detail plan evidence before opening the Tool pull request.

### Phase 6: Completion

- [ ] Refresh each pull request after its push and record commit IDs, CI checks, review outcomes, package evidence, deviations, and remaining risks in this plan.
- [ ] Confirm every implementation pull request is merged, both required Kit APIs are registry-visible, no consumer depends on an unpublished API, and no unnecessary direct Pi TUI dependency remains.
- [ ] Archive this plan and the completed browse-detail plan only after every checkbox has evidence and no release or consumer migration remains open.

## Execution evidence

### Phase 0 and Statusline baseline

- Starting branch: `docs/pi-tui-kit-consumer-convergence-plan` at `e46ba18ef3d1da259aec6e317c92e6666258fd42`, matching then-current `origin/main`, with only this plan untracked.
- Statusline implementation branch: `feat/pi-statusline-live-choice`, created from that exact `origin/main` commit while preserving the plan, then rebased onto `08f1c39ad11a4868cc16e3e36ef12ebbf6ec2579` after pull request #685 merged.
- Kit pull request #685 remained open and blocked on CI at baseline; no other open pull request matched the Kit title search. It later merged successfully as `08f1c39ad11a4868cc16e3e36ef12ebbf6ec2579`.
- Registry `latest` was `@narumitw/pi-tui-kit@0.52.0`; registry tarball inspection showed `runLiveChoice` absent from `0.49.3` and `0.51.0` and present in both root JavaScript and declarations for `0.52.0`.
- Baseline floors were Statusline `^0.49.1`, Starship `^0.49.1`, Tool `^0.51.0`, and Kit package version `0.52.0`; the initial lockfile resolved Statusline and Starship to Kit `0.49.3` and Tool to `0.51.0`.
- Statusline baseline passed `npm run check --workspace @narumitw/pi-statusline` and 125 focused tests before implementation.
- Final Statusline evidence after rebasing: package check passed; 129 focused tests passed; `npm ls` resolved Kit `0.52.0`; boundaries passed; CI-equivalent `npm run check` passed with 268 files and 2,906 tests; `git diff --check` passed.
- Statusline implementation commit: `247083fe` (`feat(statusline): standardize palette picker`).
- `just pack statusline` exposed only the 29 expected manifest-listed files (36.4 kB packed, 129.8 kB unpacked), including the source entrypoint, README, and license; no generated or test files leaked.
- A clean temporary registry install proved Kit `0.52.0` exports `runLiveChoice` at runtime and in root declarations. A live TUI smoke was unavailable in the non-interactive agent terminal, so deterministic Kit-harness lifecycle tests and the package source-entry smoke remain the runtime evidence.
- Semantic audit found settings writes unchanged and still covered for malformed files, unknown-field preservation, atomic publication, failed apply, and rollback. The picker now reuses the menu's exact owner, revalidates it after the awaited interaction, drains Kit preview work, resets previews on Back, Close, and external disposal, skips stale contexts, and reports reset failures without reopening the menu.

### Applicable MUST mapping for Phase 1

| Area | Requirement and evidence |
| --- | --- |
| TUI and terminal safety | Keep custom UI TUI-only, bounded, disposed, and terminal-safe; covered by command mode tests, Kit-harness narrow-width/control assertions, cancellation, external disposal, and the package/root gates. |
| Lifecycle | Stop stale session work and release session-owned UI; covered by owner-abort, replacement, shutdown, and disposal tests plus review after each await. |
| Settings | Preserve unknown fields, malformed-file protection, atomic publication, ordering, runtime apply, and rollback; covered by existing settings/command regressions and focused package tests. |
| Package boundary | Keep the extension independently installable, declare runtime dependencies, retain required Pi peers, and use the published API only; verified through manifests, lock resolution, boundaries, pack inspection, and the registry clean-install smoke. |
| Release intent | Record published behavior through a package Changeset without publishing; verified by `.changeset/green-statusline-choice.md` and Changesets status. |
| Repository gate | Run deterministic focused tests, package check, CI-equivalent `npm run check`, `git diff --check`, and package smoke before completion. |

## Risks

- Combining Kit and first-consumer adoption would make local hoisting hide independent-install failures, so release gates are mandatory.
- Two open Kit API branches can collide on compatibility literals, declarations, and Changeset intent, so confirmation gating starts only after pull request #685 merges.
- Live preview callbacks can outlive cursor movement or session ownership, so every migration must retain abort, drain, generation, and final reset evidence.
- Treating the active Starship preset as fully disabled would accidentally remove Customize, while treating it as enabled would allow a meaningless Apply; the new contract must preserve this distinction explicitly.
- Replacing Statusline's picker must not weaken its atomic settings write, unknown-field preservation, runtime apply, or rollback protocol.
- Replacing Starship's inspector must not turn width-dependent apply previews into a generic Kit callback; only the read-only footer explanation is in scope.
- Exact Tool documents may be large or sensitive, so their content must remain outside fuzzy-search metadata and RPC selector labels.
- Removing a direct Pi TUI dependency based on one deleted file can break other specialized production imports, so manifests change only after a package-wide import audit.

## Completion Checklist

- [x] `pi-statusline` uses published `runLiveChoice()` for palette previews and preserves settings, preview, cancellation, and rollback behavior.
- [ ] Starship footer explanation uses the standard adaptive `review` screen with no extension-owned generic scroll component.
- [ ] Pi TUI Kit exposes and documents confirmation-only Live Choice gating with unchanged legacy disabled behavior and complete TUI/RPC lifecycle tests.
- [ ] The enhanced Kit release is explicitly approved, published, registry-verified, and independently installable before consumer adoption.
- [ ] `pi-starship` uses the published Live Choice contract for presets while active Apply remains inert and Customize remains available.
- [ ] `pi-tool` uses published exact browse details and no longer owns a duplicate browser or unnecessary direct Pi TUI dependency.
- [ ] Every package has focused tests, an appropriate Changeset, inspected package contents, passing CI-equivalent checks, and an evidence-backed semantic audit.
- [ ] Specialized domain interfaces remain extension-owned and no speculative general-purpose Kit API was added.
- [ ] Both plans are archived only after all pull requests, release gates, registry checks, and consumer migrations are complete.
