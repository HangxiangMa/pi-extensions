# Pi Recall tree-style picker plan

## Goal

Make the Pi Recall saved-message TUI adopt the useful display-filter behavior and compact visual hierarchy of Pi's `/tree` selector without turning saved records into a fake session tree.

## Context

`packages/pi-recall/src/picker.ts` currently owns a specialized flat picker with scope switching, fuzzy search, stable selection, direct deletion, terminal sanitization, and IME focus forwarding.

`packages/pi-recall/src/menu.ts` runs that picker through Pi TUI Kit's `runCustomInteraction()` and preserves scope, query, and selection while one `/recall` flow remains open.

Pi TUI Kit provides lifecycle ownership and `formatInteractionHints()`, but it has no ready-made selector that combines in-place scope switching, role filtering, search, deletion, and Recall-specific state restoration.

This change touches the custom-TUI, command-mode compatibility, documentation, dependency-floor, release-intent, lifecycle, and terminal-safety rules in `docs/extension-conventions.md`.

The implementation must keep rendered lines width-safe, use callback-injected theme and keybindings, forward focus to the search input, request renders after state changes, sanitize untrusted display text, and preserve cancellation and session-replacement behavior.

## Architecture

Keep `ScopedRecallPicker` extension-owned and keep `runCustomInteraction()` as its lifecycle boundary.

Add a TUI-only view state with the ordered modes `all`, `user`, and `assistant`.

Apply data reduction in the fixed order scope, view, then fuzzy query.

Use the injected `app.tree.filter.cycleForward` and `app.tree.filter.cycleBackward` bindings for view cycling so configured `/tree` cycle keys also work in Recall.

Do not adopt `/tree` direct filter bindings because `Ctrl+D` is already Recall's direct-delete binding.

Carry the selected view through picker completion results so selection, scope, query, and view survive opening a record, cancelling deletion, successful deletion, and failed deletion during one `/recall` flow.

Start each fresh `/recall` flow with `Current cwd`, `All messages`, and an empty query.

Use Pi TUI Kit's published `formatInteractionHints()` for binding-aware help text, which requires raising Pi Recall's Kit compatibility floor to `^0.52.0`, the first verified published minor that exports that API.

Keep RPC behavior unchanged: RPC continues to ask for scope explicitly and presents the complete scoped list without simulating TUI-only search or view shortcuts.

## Non-Goals

- Do not display, filter, save, or recall tool calls or tool results.
- Do not add labels, folding, branch connectors, active-path markers, or tree navigation.
- Do not change the save-message picker.
- Do not add extension settings or persist view and query preferences across separate `/recall` invocations.
- Do not change Recall storage, quote payloads, command routes, or deletion semantics.
- Do not add a new Pi TUI Kit component or API.
- Do not change Escape, Ctrl+C, or RPC cancellation semantics.

## Assumptions

The desired view cycle is `All messages → User only → Assistant only → All messages`.

Role and message preview remain the primary row content, while session name and timestamp remain available as secondary provenance when width permits.

Changing published TUI behavior warrants a minor Changeset for the experimental `@narumitw/pi-recall` package.

## Risks

- Reusing tree cycle bindings could surprise users who customized those bindings specifically for `/tree`, so documentation and binding-derived hints must make the shared behavior explicit.
- Narrow terminals could hide provenance or produce over-width ANSI rows, so focused width and terminal-control tests must cover every view state.
- Filtering can invalidate the current selection, so stable-ID restoration and deterministic fallback behavior must be specified before rendering changes.
- Raising a zero-major Kit floor can strand older locks, so the required API was verified in registry tarballs and the root lockfile must be refreshed deliberately.

## Plan

- [x] Verify the first published `@narumitw/pi-tui-kit` release that exports `formatInteractionHints()`, then update `packages/pi-recall/package.json` and `package-lock.json` to that compatible zero-major floor; registry tarball inspection found that `0.51.0` lacks the export and `0.52.0` contains it, `npm install` resolved `@narumitw/pi-tui-kit@0.52.0` for Pi Recall, and a direct import reported API version 9 with `formatInteractionHints` as a function.
- [x] Add failing behavior tests in `packages/pi-recall/test/picker.test.ts` for forward and backward injected view-cycle bindings, the `all → user → assistant` order, scope-before-view-before-query filtering, visible counts, mode-specific empty states, stable selection when still visible, and deterministic fallback when hidden; the focused run failed in eight tests because view state, filtering, and result propagation were absent.
- [x] Implement the smallest view-state and filtering changes in `packages/pi-recall/src/picker.ts` that satisfy the new picker contracts, request a render after each accepted cycle, and leave direct deletion plus ordinary search editing unchanged; `npx vitest run packages/pi-recall/test/picker.test.ts` passed 14 tests.
- [x] Add failing integration tests in `packages/pi-recall/test/menu.test.ts` proving that view state survives record opening and picker re-entry, cancelled deletion, successful deletion, and failed deletion, while a newly created Recall menu defaults to `All messages`; four focused tests failed because reopened pickers reset to `All messages`.
- [x] Thread view state through `ScopedRecallPickerResult`, `chooseSavedInTui()`, and the controller-local state in `packages/pi-recall/src/menu.ts`, preserving stale-owner and abort checks after every existing await; the focused picker and menu run passed 27 tests.
- [x] Add failing rendering tests in `packages/pi-recall/test/picker.test.ts` for a `/tree`-inspired `›` cursor, selected background, distinct `user:` and `assistant:` role styling, position and active-view status, binding-derived cycle hints, preserved provenance, terminal-control removal, and width safety at narrow and normal widths; the focused test failed on the old row presentation before rendering edits.
- [x] Restyle `ScopedRecallPicker.render()` in `packages/pi-recall/src/picker.ts` with callback-injected theme colors and `formatInteractionHints()`, keeping role and preview primary and session/timestamp secondary without mutating raw records; all 28 focused picker and menu tests passed.
- [x] Update the Recall TUI keybinding fixture in `packages/pi-recall/test/menu.test.ts` to model the injected tree-cycle bindings and retain `app.session.delete`, then rerun the direct-delete integration tests to prove no `Ctrl+D` conflict was introduced; all focused direct-delete and state-restoration tests passed.
- [x] Audit the complete Pi Recall diff against the custom-TUI and lifecycle rules in `docs/extension-conventions.md`, including Escape, Ctrl+C, component disposal, session replacement, deletion cancellation, stale continuations, render invalidation, IME focus forwarding, terminal sanitization, and all supported modes; no deviations remain, and hardening added regression coverage for bidirectional controls plus Unicode line separators in stored and pasted text.
- [x] Update `packages/pi-recall/README.md` to document the `All messages`, `User only`, and `Assistant only` views, binding-aware forward/backward cycling, filtering order, fresh-flow defaults, state restoration, TUI-only behavior, and unchanged RPC behavior; the experimental warning and standard README sections remain present.
- [x] Add a Changeset that gives `@narumitw/pi-recall` a minor bump for the new tree-inspired TUI view filtering and notes the raised Pi TUI Kit compatibility floor; `npm run changeset:status` listed `@narumitw/pi-recall -> 0.50.0` from `.changeset/bright-messages-cycle.md` and also emitted the repository's existing internal Kit-range warnings for many consumers.
- [x] Run `npx vitest run packages/pi-recall/test/picker.test.ts packages/pi-recall/test/menu.test.ts`, `npm run check --workspace @narumitw/pi-recall`, and the serial root `npm run check`; focused tests passed 28 tests, the package check passed, and the root gate passed Biome, boundaries, all workspace typechecks, and 3,436 tests across 345 files.
- [x] Run `just pack recall` and inspect the tarball file list plus packaged dependency range to confirm the independently installable extension contains the intended source, README, license, and compatible runtime dependency; the dry run contained the nine expected license, README, manifest, and source files, and the manifest declares `@narumitw/pi-tui-kit` as `^0.52.0`.

## Completion Checklist

- [x] The saved-message TUI cycles `All messages`, `User only`, and `Assistant only` through injected `/tree` cycle bindings without stealing Recall's delete binding.
- [x] Scope, view, query, and stable selection compose predictably and survive all existing in-flow navigation and deletion outcomes.
- [x] The picker visually resembles `/tree` where useful while remaining a flat cross-session Recall list with visible provenance.
- [x] RPC, storage, quoting, save selection, cancellation, disposal, and session-replacement behavior remain compatible.
- [x] Focused tests, package checks, root checks, Changeset status, and package inspection all pass with recorded evidence.
- [x] The semantic convention audit reports no unresolved MUST-rule failures or unverified affected paths.
- [ ] After every item above is complete, delete `docs/plans/2026-08-17_pi-recall-tree-style-picker-plan.md` and report the deleted path in the implementation handoff.
