# Pi TUI Kit disabled action presentation

## Goal

Make disabled action rows consistently understandable and width-safe in Pi TUI Kit without forcing
consumers to append status text such as `(unavailable)` to action labels. Preserve raw item identity,
existing navigation, and the guarantee that disabled actions never execute.

## Context

- `ActionMenuItem` currently accepts `disabled` but not `disabledReason`.
- TUI action screens pass labels and descriptions directly to Pi's public `SelectList`. Its default
  primary column is capped near 32 cells and silently truncates longer labels, which can produce
  fragments such as `(una` even when the terminal has room for both columns.
- Action-screen rendering blocks disabled activation but does not render a textual disabled state.
  RPC action rows have the same presentation gap. `ActionMenuItem` is also used for action rows inside
  multi-select screens, so the public contract must behave consistently in both owners.
- Choice and multi-select toggle rows already establish the Kit convention of `[-]`, `unavailable`,
  and an optional reason.

## Architecture

- Extend the public `ActionMenuItem` contract with optional `disabledReason`, scoped to action rows
  rather than all `MenuItemBase` consumers.
- Keep consumer-provided labels semantic and stable. The Kit will derive presentation-only disabled
  markers and descriptions after sanitization:
  - TUI: prefix a disabled row with `[-]`; when `disabledReason` is supplied, combine
    `Unavailable: reason` with any existing description. Keep an existing description unchanged when
    no separate reason is supplied.
  - RPC: when `disabledReason` is supplied, include the disabled state and reason in the unique dialog
    label because RPC selectors have no native disabled-row presentation. Preserve the existing label
    for legacy disabled definitions without a reason so exact RPC scripts remain compatible.
- Configure the public Pi `SelectList` layout for action screens so the primary column adapts to the
  rendered labels. Preserve description space when both columns fit; when they do not, prioritize a
  recognizable action label and use a cell-aware ellipsis instead of silent partial text.
- Apply the disabled-action contract to both top-level `actions` screens and `multiSelect.actions`.
  Existing interaction guards remain the authority that prevents activation.
- Treat this as declarative menu API version 8 and a backward-compatible minor release of
  `@narumitw/pi-tui-kit`. Version-7 definitions remain valid; version 7 was assigned to the
  independently merged standalone-confirmation API before this branch rebased.

## Non-Goals

- Do not change choice, settings, browse, review, input, or multi-select toggle semantics.
- Do not add wrapping action rows or a new custom list primitive when Pi's public `SelectList` layout
  hooks are sufficient.
- Do not modify `pi-usage` or raise any consumer's Kit dependency floor in this change. Consumers may
  adopt the published API only after the Kit release is available.
- Do not change action IDs, action dispatch, screen transitions, cursor restoration, or Back/Close
  behavior.

## Plan

- [x] Add focused failing contracts in `packages/pi-tui-kit/test/screen-components.test.ts` for a
      long disabled action label with an existing description and sanitized `disabledReason`; initial
      `tsc -p tsconfig.test.json` failed because `disabledReason` was absent, and the passing contracts
      cover widths 1, 24, 40, 41, 80, and 120 plus inert activation.
- [x] Add focused failing runtime contracts in `packages/pi-tui-kit/test/runtime.test.ts` for RPC
      disabled action rows; the passing contract verifies the unavailable reason, inert selection,
      recovery through Close, and raw target identity.
- [x] Add focused failing multi-select coverage in
      `packages/pi-tui-kit/test/screen-components.test.ts` and `packages/pi-tui-kit/test/runtime.test.ts`
      for disabled `multiSelect.actions`; the passing contracts preserve toggle semantics and verify
      sanitized marker/reason presentation plus inert TUI/RPC activation.
- [x] Update `packages/pi-tui-kit/src/types.ts`, the action and multi-select component adapters under
      `packages/pi-tui-kit/src/components/`, and `packages/pi-tui-kit/src/runtime.ts` to implement the
      public `disabledReason` contract, sanitized cross-mode formatting, adaptive public `SelectList`
      layout, and ellipsis-based truncation; focused component and runtime tests pass.
- [x] Run the complete `@narumitw/pi-tui-kit` test and typecheck surface after the focused tests;
      package check passed and all 139 Kit tests passed, including action, choice, multi-select,
      navigation, sanitization, width, and built-export contracts.
- [x] Update `packages/pi-tui-kit/README.md` with disabled action behavior and an example, then bump
      `PI_EXTENSION_MENU_API_VERSION` in `packages/pi-tui-kit/src/index.ts` to 8 and document version
      compatibility; source and built-export type fixtures pass with literal version 8 after rebasing
      over the independently merged version-7 confirmation API.
- [x] Add `.changeset/gentle-actions-explain.md` as a minor Changeset for
      `@narumitw/pi-tui-kit`; `npm run changeset:status` reports the planned `0.50.0` release.
- [x] Run `npm run check:boundaries`, `npm run check`, and `just pack tui-kit`; boundaries passed,
      the CI-equivalent gate passed all 2,458 tests on the latest `origin/main`, and the 47-file dry-run
      tarball contains built JavaScript/declarations, README, license, and package metadata without
      tests or authored source.
- [x] Audit the final diff against `docs/extension-conventions.md` for the touched reusable-library,
      TUI, documentation, testing, and publishing rules; public Pi TUI primitives, width/sanitization
      contracts, minor release intent, package contents, and consumer independence conform with no
      accepted deviations or skipped applicable smokes. Settings and lifecycle rules are not touched.

## Risks

- Growing the primary column too aggressively could hide useful descriptions. Width tests cover
  narrow, boundary, and wide layouts and assert both label recognition and description visibility
  where both fit. Full-suite regressions established that a generic `Unavailable` description must
  not displace existing copy and that reason-less RPC labels must remain exact for pre-version-8
  consumers.
- RPC cannot truly disable a selector row. It must clearly label the row and safely reject selection
  without invoking domain code or trapping the user.
- `ActionMenuItem` also powers multi-select action rows; implementing only top-level action rendering
  would create an inconsistent public API.

## Completion Checklist

- [x] Disabled top-level and multi-select action rows expose a sanitized textual state in TUI and,
      when a reason is supplied, the state and reason in RPC; focused component/runtime contracts
      cover both owners while legacy reason-less RPC labels remain compatible.
- [x] Disabled action rows remain focusable/explainable but cannot invoke navigation, close, or domain
      actions; existing interaction guards and cross-mode inert-selection tests verify the boundary.
- [x] Long action labels no longer end in ambiguous fragments when space is available, and unavoidable
      truncation uses an ellipsis while every rendered line remains within widths 1 through 120 in
      focused boundary cases.
- [x] Existing action descriptions, selection memory, transitions, cancellation, and Back/Close
      behavior remain compatible; the full suite includes the recovered Starship description case.
- [x] API version 8, README, declaration output, minor Changeset, package contents, and repository
      checks agree with the shipped public behavior after rebasing over the version-7 confirmation
      API.
- [x] No consumer adopts the API before the corresponding Kit release is published; the final source
      diff is confined to Pi TUI Kit, its tests/docs, release intent, and this plan.
