# pi-btw mouse-wheel scrolling plan

## Goal

Make the pi-btw side-thread transcript scroll with the mouse wheel and trackpad like Pi's main thread while preserving keyboard navigation, fixed chrome, follow-at-bottom behavior, text selection, drafts, steering, cancellation, and terminal restoration.

## Context

- `packages/pi-btw/src/fullscreen-ui.ts` already creates a mouse-enabled `TuiAltScreen`.
- `packages/pi-btw/src/transcript-pager.ts` currently clips the transcript with extension-owned `scrollOffset` state, so the outer TUI receives wheel input but has no overflowing transcript region to scroll.
- The installed `@earendil-works/pi-tui` provides `VStack`, `ScrollView`, primary-scroll routing, wheel and trackpad handling, keyboard history navigation, follow-end behavior, and application-owned selection.
- Pull request [#819](https://github.com/narumiruna/pi-extensions/pull/819) supplied the self-clipping root-cause insight; this implementation keeps the header, status, and editor fixed through an explicit native layout.
- This is a bounded side-thread UI change and does not alter settings, persistence, commands, models, or main-thread context behavior.

## Architecture

- Keep `TuiAltScreen` as the dedicated terminal owner.
- Represent the side-thread screen as a native `VStack` containing a fixed header, a growing primary `ScrollView` for the transcript, bounded steering/status rows, a fixed footer, and the editor.
- Configure the transcript `ScrollView` with native follow-end and primary-scroll behavior so wheel input over the transcript or fixed regions reaches the same history viewport.
- Add a narrow internal fullscreen-layout contract so `fullscreen-ui.ts` mounts only side-thread layout-aware components with `setLayoutRoot()` and keeps existing implicit-document mounting for menus, selectors, previews, and loaders.
- Remove extension-owned transcript paging state once native `ScrollView` owns scrolling; retain only product-specific rendering, submission, thinking-level, bring-to-main, steering, and cancellation logic.

## Applicable conventions

- Custom TUI width, invalidation, render requests, `Focusable` forwarding, cancellation, and disposal are MUST rules verified by focused tests and final review.
- Changed observable behavior requires deterministic tests, the root `npm run check` gate, accurate README guidance, and a package dry run.
- Published behavior requires an independent Changeset; no package publication, version tag, visibility change, or release workflow is authorized.
- Terminal text remains sanitized at the display boundary, and the native TUI continues to own mouse protocol parsing, selection, and clipboard behavior.
- No settings are touched, so `docs/extension-settings.md` is not applicable.

## Non-Goals

- Do not add a mouse setting or change wheel speed.
- Do not change Pi's keybindings, terminal mouse protocol, clipboard behavior, or main-thread UI.
- Do not redesign menus, bring-to-main selection, transcript message styling, or thread persistence.
- Do not upgrade Pi dependencies or add a runtime dependency.

## Risks

- A layout root applied to every fullscreen component could clip existing menus or previews, so mounting must remain opt-in.
- Follow-end can incorrectly resume after a user scrolls upward; native scrolling must preserve the intentional position while content or terminal width changes.
- Fixed header, footer, steering rows, and editor can consume all rows in a short terminal; the transcript region must shrink safely without exceeding width or losing the focused editor cursor.
- Mouse selection and wheel routing share terminal mouse events; regression coverage must prove selection remains enabled and disposal restores terminal modes.

## Plan

- [x] Add a focused failing integration test under `packages/pi-btw/test/` that mounts a long side-thread transcript in the real `TuiAltScreen`, sends SGR mouse-wheel input, and proves the native primary viewport moves while fixed side-thread chrome remains present. Evidence: `mouse-wheel.test.ts` failed on the original fixed-height pager because `viewportTop` remained zero, then passed after the native layout change.
- [x] Add focused failing coverage in `packages/pi-btw/test/fullscreen-ui.test.ts` for opt-in layout-root mounting and cleanup, while proving ordinary custom components still use the existing implicit-document path. Evidence: the opt-in test failed before `getFullscreenLayout()` support and now passes with explicit cleanup assertions.
- [x] Refactor `packages/pi-btw/src/transcript-pager.ts` to compose `VStack` and `ScrollView` for both completed and answering states; verify mouse/trackpad routing, `PgUp`/`PgDn`, initial top or bottom position, follow-end, manual-position preservation across growth and reflow, narrow widths, short terminals, steering rows, IME focus forwarding, and footer hints with focused tests. Evidence: focused transcript and real-alt-screen tests pass for completed and answering views.
- [x] Update `packages/pi-btw/src/fullscreen-ui.ts` with the internal opt-in layout contract and lifecycle-safe `setLayoutRoot()` mount/unmount handling; verify completion, cancellation, disposal, late factory settlement, overlay behavior, and terminal restoration remain unchanged. Evidence: focused fullscreen lifecycle tests pass.
- [x] Remove superseded extension-owned transcript scroll state and tests only after equivalent native-layout behavior is green; review the diff for duplicate paging logic and unavailable Pi subpath imports. Evidence: `scrollOffset`, `lastViewportHeight`, and `followBottom` were replaced by public root exports from `@earendil-works/pi-tui`.
- [x] Update `packages/pi-btw/README.md` to document mouse-wheel and trackpad history scrolling alongside `PgUp`/`PgDn`, without implying unsupported terminal behavior.
- [x] Add a minor Changeset for `@narumitw/pi-btw` describing native mouse-wheel and trackpad scrolling as a published feature.
- [x] Run the focused pi-btw tests, `npm run typecheck`, and `npm run check`; keep the repository gate and `pi-tui-kit` build/check sequential because both can touch `packages/pi-tui-kit/dist`. Evidence: 101 focused changed-path tests passed, root typecheck passed after `npm install` restored the lockfile-resolved Kit layout, and `npm run check` passed 354 files and 3,483 tests.
- [x] Run `npm pack --workspace @narumitw/pi-btw --dry-run --json` and inspect the tarball file list. Evidence: the 13-entry dry run contains the manifest, README, license, and intended `src/` files, including both changed runtime modules.
- [x] Not applicable in this harness: an interactive `pi -e ./packages/pi-btw` mouse-wheel smoke would violate the repository prohibition on opening a TUI. The deterministic integration test drives a real `TuiAltScreen` with SGR wheel input instead.
- [x] Audit the final diff against `docs/extension-conventions.md`, specifically rendered width, theme invalidation, render requests, focus forwarding, cancellation/disposal, session restoration, terminal-control sanitization, and changed-behavior documentation. Evidence: native layout children preserve width contracts and invalidation, wrapper focus still reaches each editor, layout mount failure and cleanup are covered, existing cancellation/restoration tests pass, sanitization is unchanged, and the README and Changeset describe the behavior.

## Completion Checklist

- [x] Mouse wheel and trackpad scroll long completed transcripts in both directions.
- [x] Mouse wheel and trackpad scroll history while an answer is running.
- [x] Wheel input over fixed side-thread regions routes to the primary transcript viewport.
- [x] `PgUp`/`PgDn` and native alternate-screen history navigation still work.
- [x] New output follows the bottom only when the user has not intentionally scrolled upward.
- [x] Header, footer/status, steering queue, and editor remain fixed and usable at supported widths and terminal heights.
- [x] Mouse-drag selection/copy, drafts, thinking-level cycling, bring-to-main, cancellation, disposal, and parent-screen restoration retain passing coverage.
- [x] README and Changeset describe the shipped behavior accurately.
- [x] Focused tests, root typecheck, root CI-equivalent check, package dry run, convention audit, and the unavailable interactive smoke disposition are recorded with evidence.
