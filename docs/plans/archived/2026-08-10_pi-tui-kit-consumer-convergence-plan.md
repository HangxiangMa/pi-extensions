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
- [x] Record focused baselines for `pi-statusline`, `pi-starship`, `pi-tui-kit`, and `pi-tool` before each owning phase; Tool's final baseline passed its package check and 8 focused tests from a detached `origin/main` worktree before the consumer diff was audited.

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

- [x] Create a separate branch from then-current `origin/main` and add characterization coverage for available, unavailable, and empty inspections; adaptive height, narrow widths, scrolling, resize clamping, terminal controls, Back, Close, owner abort, and restored parent selection.
- [x] Replace the custom component in `packages/pi-starship/src/command-inspector.ts` with a pure terminal-safe content formatter consumed by a declarative adaptive `review` screen in the Starship menu.
- [x] Keep inspection acquisition, module ordering, preview formatting, TUI-only command behavior, and session ownership in Starship; do not expose a Kit render callback or change RPC support.
- [x] Delete superseded local layout, scroll, keybinding, abort-listener, and disposal ownership, then remove only imports that no longer have another production caller.
- [x] No package documentation change was needed because the read-only interaction contract is unchanged; add an appropriate Starship Changeset.
- [x] Run focused Starship command and lifecycle tests, its package check, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack starship`; inspect the tarball and record any unavailable live TUI smoke.
- [x] Audit terminal safety, resize behavior, parent cursor restoration, cancellation, disposal, stale session ownership, final diff scope, and independent installation before opening the Starship inspector pull request.

### Phase 3: Pi TUI Kit confirmation-gating API

- [x] Wait until pull request #685 is merged, then create a Kit-only branch from the resulting `origin/main` so API compatibility metadata and Changeset intent advance from one authoritative base.
- [x] Add failing public type and declaration tests for a Live Choice item whose primary confirmation is disabled while shortcuts remain enabled, including full-disabled precedence and the incremented compatibility literal.
- [x] Add failing TUI tests for textual presentation, injected confirm rejection, shortcut dispatch, current and initial selection, preview callbacks, terminal controls, narrow widths, Back/Close, owner abort, disposal, stale preview completion, and preview failure.
- [x] Add failing RPC tests proving the confirmation-disabled row is explanatory and inert, no shortcut or preview executes, duplicate labels preserve raw identity, cancellation follows the requested hint, and full-disabled precedence remains unchanged.
- [x] Implement the smallest Live Choice-only public contract and internal adaptation needed to separate primary confirmation from shortcut availability without changing existing `disabled`, declarative `choice`, or default behavior.
- [x] Update Kit README examples, public exports or declarations as required, API compatibility metadata, type fixtures, and a Kit-only minor Changeset.
- [x] Run the complete Kit check and tests, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack tui-kit`; inspect root declarations and prove no consumer adopts the unpublished API.
- [x] Audit display-cell bounds, sanitization, disabled-state precedence, shortcut conflicts, preview queue cancellation and draining, stale ownership after awaits, error reporting, TUI/RPC compatibility, and final diff scope before opening the Kit pull request.

### Release gate

- [x] Not applicable to this execution: release pull request #684 had already merged and published before the consumer work resumed; no release, tag, or workflow action was performed here.
- [x] Verify Kit `0.53.0` and the `latest` dist-tag with `npm view`, inspect its 59-file tarball, and use a clean temporary install to prove the root runtime and declaration exports contain exact browse details and Live Choice confirmation gating.
- [x] Record Kit `0.53.0` as the registry-verified release before raising either Starship or Tool compatibility floors.

### Phase 4: pi-starship preset picker migration

- [x] Create branch `feat/pi-starship-live-choice` from `origin/main` at `012115dc`, raise only Starship's Kit floor to `^0.53.0`, run root `npm install`, and prove the consumer scope resolves Kit `0.53.0`.
- [x] Add or retain regressions for initial/current preset identity, live preview, paging, Home/End, narrow widths, terminal controls, active-preset Apply rejection, active-preset Customize availability, ordinary Apply, Customize, Back, Close, preview reset, stale owner replacement, and preview failure.
- [x] Replace `showPresetPicker()`'s local component with `runLiveChoice()`, using confirmation gating for the active preset and the existing Customize shortcut while keeping validation, editor flow, apply, rollback, and preview reset in Starship.
- [x] Delete superseded picker rendering, navigation, hint, and sanitization code; retain direct Pi TUI dependencies because Starship's preview renderer, footer renderer, and command contracts still import them.
- [x] Keep the already-accurate Starship README unchanged and add `.changeset/calm-starship-choice.md` for the compatibility floor and packaged implementation.
- [x] Run 195 focused Starship tests, package check, resolved-version verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack starship`; use the source-entry test and deterministic Kit harness because a live TUI smoke is unavailable in the non-interactive terminal.
- [x] Audit preview cleanup in every exit path, stale contexts after awaits, full versus confirmation-only disabled semantics, RPC/non-TUI behavior, independent installation, and final diff scope before opening the preset-picker pull request.

### Phase 5: pi-tool exact browse migration

- [x] Confirm the release gate evidence satisfies the open release and consumer tasks in `docs/plans/2026-08-10_pi-tui-kit-browse-detail-document-plan.md`, then create branch `feat/pi-tool-browse-detail-convergence` from `origin/main` at `99b96dc4`.
- [x] Raise only Tool's Kit floor to `^0.53.0`, run root `npm install`, and prove the consumer scope resolves Kit `0.53.0`.
- [x] Replace the custom browser and separate detail loop with the standard `browse` screen using `detailDocument`, preserving tool ordering, active status, explicit metadata search, fresh command-time state, TUI/RPC navigation, exact schemas, query restoration, and stable raw identity.
- [x] Delete `packages/pi-tool/src/tool-browser.ts`, remove the unused direct Pi TUI peer and development dependencies, and update package layout documentation and lockfile metadata.
- [x] Retain or add regressions for indentation, tabs, 20-column wrapping, Unicode cells, terminal controls, duplicate labels, query restoration, Back/Close, session replacement, shutdown, arguments, unsupported modes, and no implicit document-content search leakage.
- [x] Add `.changeset/calm-tools-browse.md`, run 12 focused tests, package check, resolved-version verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack tool`; use the extension-factory test load because a live TUI smoke is unavailable in the non-interactive terminal.
- [x] Audit lifecycle ownership, document privacy, independent installation, removal of duplicated UI ownership, final diff scope, and the original browse-detail plan evidence before opening the Tool pull request.

### Phase 6: Completion

- [x] Refresh each pull request after its push and record commit IDs, CI checks, review outcomes, package evidence, deviations, and remaining risks in this plan.
- [x] Confirm every implementation pull request is merged, both required Kit APIs are registry-visible, no consumer depends on an unpublished API, and no unnecessary direct Pi TUI dependency remains.
- [x] Archive this plan and the completed browse-detail plan after every checkbox has evidence and no release or consumer migration remains open.

## Execution evidence

### Phase 0 and Statusline baseline

- Starting branch: `docs/pi-tui-kit-consumer-convergence-plan` at `e46ba18ef3d1da259aec6e317c92e6666258fd42`, matching then-current `origin/main`, with only this plan untracked.
- Statusline implementation branch: `feat/pi-statusline-live-choice`, created from that exact `origin/main` commit while preserving the plan, then rebased onto `08f1c39ad11a4868cc16e3e36ef12ebbf6ec2579` after pull request #685 merged.
- Kit pull request #685 remained open and blocked on CI at baseline; no other open pull request matched the Kit title search. It later merged successfully as `08f1c39ad11a4868cc16e3e36ef12ebbf6ec2579`.
- Registry `latest` was `@narumitw/pi-tui-kit@0.52.0`; registry tarball inspection showed `runLiveChoice` absent from `0.49.3` and `0.51.0` and present in both root JavaScript and declarations for `0.52.0`.
- Baseline floors were Statusline `^0.49.1`, Starship `^0.49.1`, Tool `^0.51.0`, and Kit package version `0.52.0`; the initial lockfile resolved Statusline and Starship to Kit `0.49.3` and Tool to `0.51.0`.
- Statusline baseline passed `npm run check --workspace @narumitw/pi-statusline` and 125 focused tests before implementation.
- Final Statusline evidence after rebasing: package check passed; 129 focused tests passed; `npm ls` resolved Kit `0.52.0`; boundaries passed; CI-equivalent `npm run check` passed with 268 files and 2,906 tests; `git diff --check` passed.
- Statusline pull request [#687](https://github.com/narumiruna/pi-extensions/pull/687) merged as `8da1ca13f6e5e4f7e63e579726fb243e8748855b`, carrying implementation commit `247083fe`, plan commit `763f33dc`, and evidence commit `16ce4aad`.
- CI run `31408552397` initially failed only in the unrelated `pi-subagents` timeout-evidence test after all Statusline tests passed; one failed-job rerun succeeded. Final CI run `31409152669` passed in 2m51s before merge. No review was submitted.
- `just pack statusline` exposed only the 29 expected manifest-listed files (36.4 kB packed, 129.8 kB unpacked), including the source entrypoint, README, and license; no generated or test files leaked.
- A clean temporary registry install proved Kit `0.52.0` exports `runLiveChoice` at runtime and in root declarations. A live TUI smoke was unavailable in the non-interactive agent terminal, so deterministic Kit-harness lifecycle tests and the package source-entry smoke remain the runtime evidence.
- Semantic audit found settings writes unchanged and still covered for malformed files, unknown-field preservation, atomic publication, failed apply, and rollback. The picker now reuses the menu's exact owner, revalidates it after the awaited interaction, drains Kit preview work, resets previews on Back, Close, and external disposal, skips stale contexts, and reports reset failures without reopening the menu.

### Phase 2 Starship inspector

- Branch `feat/pi-starship-review-inspector` started from `origin/main` merge `8da1ca13f6e5e4f7e63e579726fb243e8748855b`, then rebased onto `0d254565a30e7ecd911228ea32b35077ac176e1d`; the Starship package check and 190 focused tests passed at baseline.
- The formatter test failed before implementation because `formatFooterExplanation` did not exist, then passed after the custom component was reduced to terminal-safe content formatting and the menu adopted an adaptive `review` screen.
- Final evidence after rebasing: Starship package check passed; 193 focused tests passed; boundaries passed; CI-equivalent `npm run check` passed with 274 files and 2,941 tests; `git diff --check` passed.
- Starship inspector pull request [#690](https://github.com/narumiruna/pi-extensions/pull/690) merged as `81c279717e9a04799d918a2f4f1e707a1a4d00d8`, carrying implementation commit `306a4e58`, plan commit `6e919e79`, evidence commit `ad35979a`, and PR record commit `fd6d36cd`. Final CI run `31410197960` passed in 1m; no review was submitted.
- `just pack starship` exposed the expected 79 manifest-listed source, notice, README, and license files (81.7 kB packed, 303.2 kB unpacked); tests and generated artifacts were absent.
- A live TUI smoke remained unavailable in the non-interactive terminal. Kit-harness tests covered unavailable, empty, populated, long, and unsafe documents; adaptive heights and widths; Home/End and paging; resize clamping; Back, Close, owner abort, external disposal, and parent cursor restoration.
- Audit confirmed inspection acquisition, module ordering, preview text, TUI-only routing, and session ownership remain in Starship. The removed code owned only generic layout, scroll, keybinding, abort-listener, and disposal behavior now supplied by the Kit.

### Phase 3 Live Choice confirmation gating

- Branch `feat/pi-tui-kit-live-choice-confirmation-gating` started from `origin/main` merge `81c279717e9a04799d918a2f4f1e707a1a4d00d8`, after browse pull request #685 and the two preceding consumer phases merged.
- Kit baseline passed its package check and 170 focused tests. New TUI and RPC tests failed before implementation because gated confirmation still selected the item and no explanation was rendered.
- The public contract adds only `confirmationDisabled` and `confirmationDisabledReason` to `LiveChoiceItem`; API compatibility advances from 10 to 11 and declarative `choice` remains unchanged.
- Final evidence: Kit package check and build passed; 176 focused tests passed; root declarations and runtime export compatibility fixtures passed; boundaries passed; CI-equivalent `npm run check` passed with 274 files and 2,947 tests; `git diff --check` passed.
- Kit pull request [#691](https://github.com/narumiruna/pi-extensions/pull/691) merged as `eb8e05554b2966fda7576ca60401272436fc13c0`, carrying implementation commit `93b507b5`, plan commit `cc659b7e`, and PR record commit `470d010b`. Final CI run `31411554011` passed in 3m9s; no review was submitted.
- `just pack tui-kit` exposed 59 expected built files (51.2 kB packed, 230.9 kB unpacked). Root declarations contain both gating fields and compatibility literal 11. Repository search proved no Statusline, Starship, Tool, or other consumer uses the unpublished fields.
- Audit confirmed full `disabled` presentation and shortcut blocking take precedence; gating blocks only Enter/Space activation, leaves non-conflicting shortcuts and previews active in TUI, stays inert without previews or shortcuts in RPC, sanitizes labels and reasons, preserves raw IDs, and reuses existing preview draining, stale checks, disposal, and error reporting.

### Release gate and Phase 4 Starship preset picker

- Changesets pull request [#684](https://github.com/narumiruna/pi-extensions/pull/684) merged as `012115dca62871a18b2cbe0e13b6692d90cae53a` before this execution resumed, and its CI run `31416913691` passed.
- Registry `latest` is Kit `0.53.0`; `npm view` and registry tarball inspection confirmed the release, and a clean temporary install proved `runLiveChoice` is a root runtime export while root declarations re-export `BrowseDetailDocument` and expose both confirmation-gating fields.
- Starship baseline passed its package check and 193 focused tests before production edits. The confirmation-explanation regression then failed against the local picker before implementation because no `Cannot apply` reason was rendered.
- Branch `feat/pi-starship-live-choice` started from `origin/main` at `012115dc`. The Starship floor is now `^0.53.0`, and `npm ls --workspace @narumitw/pi-starship` resolves the workspace Kit `0.53.0` without the former nested `0.49.3` install.
- Final focused evidence: package check passed; 195 Starship tests passed; boundaries and Changesets status passed; `git diff --check` passed; and the post-rebase CI-equivalent `npm run check` passed with 279 files and 2,975 tests. The first root run failed only in an unrelated `pi-sync` timing test, which passed in isolation before the full successful reruns.
- `just pack starship` exposed the 79 expected manifest-listed source, notice, README, and license files (81.1 kB packed, 298.6 kB unpacked); tests and generated files were absent.
- Starship preset pull request [#698](https://github.com/narumiruna/pi-extensions/pull/698) merged as `99b96dc4f5a819c7b8981a2477d81c305253ec15`, carrying signed implementation commit `d403f3c1` and evidence commit `f6c07b2a`; final CI run `31422551454` passed in 3m16s, and no review was submitted.
- The semantic audit confirmed Kit owns selection, cell-bounded terminal-safe rendering, injected navigation, preview draining, cancellation, and disposal. Starship still owns preset identity, TOML validation, editor flow, persistence, apply/rollback, stale workflow ownership, notifications, and final preview reset. The command remains TUI-only, and direct Pi TUI dependencies remain necessary for specialized preview and footer paths.

### Phase 5 Tool exact browse migration

- Branch `feat/pi-tool-browse-detail-convergence` started from the Starship merge `99b96dc4`. A focused implementation commit prepared in a separate worktree was cherry-picked onto this authoritative base; that worktree's staged plan archive was left untouched.
- Tool baseline from a detached clean `origin/main` worktree passed its package check and all 8 focused tests. Final evidence passed the package check, 12 focused tests, boundaries, Changesets status, `git diff --check`, and the CI-equivalent `npm run check` with 279 files and 2,979 tests.
- `npm ls --workspace @narumitw/pi-tool` resolves Kit `0.53.0`. A clean temporary install of the Tool tarball independently resolved registry Kit `0.53.0`, confirmed the `^0.53.0` floor, and confirmed the obsolete Pi TUI peer is absent.
- `just pack tool` exposed only 6 manifest-listed files (4.4 kB packed, 10.3 kB unpacked): source entrypoint, catalog and lifecycle modules, README, license, and manifest. The deleted browser, tests, and generated files were absent.
- Tool pull request [#701](https://github.com/narumiruna/pi-extensions/pull/701) merged as `42c545e0e62217e9843a4379442185b5acb47d62`, carrying signed implementation commit `17426ab5` and evidence commits `e098d19d` and `e681bdde`; final CI run `31424047112` passed in 3m18s, and no review was submitted.
- The semantic audit confirmed document content stays out of implicit browse search while explicitly projected public metadata remains searchable. Exact schemas preserve indentation, tabs, 20-column wrapping, Unicode cells, and controls; duplicate sanitized labels retain raw identity; Back restores query and selection; Close, replacement, and shutdown dispose the one Kit interaction.
- Pi Tool still owns command-time data acquisition, ordering, active-state projection, detail contents, lifecycle generation, and mode policy. Kit now owns search UI, detail rendering, navigation, terminal safety, and disposal, and no Tool production import requires Pi TUI.

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
- [x] Starship footer explanation uses the standard adaptive `review` screen with no extension-owned generic scroll component.
- [x] Pi TUI Kit exposes and documents confirmation-only Live Choice gating with unchanged legacy disabled behavior and complete TUI/RPC lifecycle tests.
- [x] Kit `0.53.0` is published, registry-verified, and independently installable; its release completed before this execution resumed and no release action was taken here.
- [x] `pi-starship` uses the published Live Choice contract for presets while active Apply remains inert and Customize remains available.
- [x] `pi-tool` uses published exact browse details and no longer owns a duplicate browser or unnecessary direct Pi TUI dependency.
- [x] Every package has focused tests, an appropriate Changeset, inspected package contents, passing CI-equivalent checks, and an evidence-backed semantic audit.
- [x] Specialized domain interfaces remain extension-owned and no speculative general-purpose Kit API was added.
- [x] Both plans are archived after all pull requests, release gates, registry checks, and consumer migrations are complete.
