# Pi TUI Kit Adaptive Review Viewport Plan

## Goal

Add an opt-in terminal-adaptive viewport to `@narumitw/pi-tui-kit` review screens so TUI reviews use
live terminal height without overflowing Pi's custom-UI region, while preserving existing fixed-size
review rendering, deterministic RPC pagination, exact content formatting, navigation, confirmation,
Back/Close, cancellation, disposal, and stale-owner behavior.

The intended public contract is:

```ts
const review: ReviewScreen<Action> = {
  kind: "review",
  title: "Review changes",
  content,
  viewportSize: "adaptive",
  confirm: { id: "apply", label: "Apply", action: "apply" },
};
```

Repository source will raise `PI_EXTENSION_MENU_API_VERSION` from `4` to `5` because older runtimes
reject the new viewport value. Package versioning and publication remain separate work.

## Context

- Repository source is menu API version 4 after PR #484; the roadmap records the latest published
  `@narumitw/pi-tui-kit@0.41.0` as API version 3.
- Review currently uses a 14-row TUI viewport by default, accepts explicit integer sizes from 1 to 50,
  and caps RPC pages at 8 rows. Its formatting already sanitizes controls, preserves indentation,
  hard-wraps by terminal cells, highlights code/diffs, clamps scroll offsets, and keeps confirmation
  identity separate from labels.
- The fixed 14-row viewport was the remaining Kit seam recorded by the `pi-btw` migration gate.
  `BtwBringToMainPreview` already reads the public `tui.terminal.rows` getter and reserves three rows
  for Pi-owned UI, demonstrating the current host-budget convention without a private `dist/*`
  dependency.
- Pi's public TUI contract supplies the live `TUI` instance to `ctx.ui.custom()`, exposes
  `tui.terminal.rows`, rerenders on terminal resize, and requires every component line to remain within
  the supplied width. RPC `custom()` remains unsupported, so review continues using signal-aware
  `ctx.ui.select()` pages there.
- Current planning baseline is clean: `npm run check --workspace @narumitw/pi-tui-kit` passes, and the
  18 focused model/review tests pass on merged `main`. The repository regression baseline is 1,918
  tests.
- Guides read for this plan: `MEMORY.md`, `docs/extension-conventions.md`, Pi's complete
  `docs/extensions.md`, `docs/tui.md`, and `docs/rpc.md`, plus the public TUI typings and relevant
  preset/overlay examples. Applicable MUST areas are callback-provided TUI/theme/keybindings,
  width-bounded rendering, render invalidation, TUI/RPC mode boundaries, cancellation/disposal and
  stale-owner preservation, public package imports, deterministic tests, the root check, and package
  dry-run inspection. `docs/extension-settings.md` is not applicable because this change neither
  reads nor writes extension-owned settings.

## Architecture

### Public contract and compatibility

Change only `ReviewScreen.viewportSize`:

```ts
viewportSize?: number | "adaptive";
```

- Omitted `viewportSize` remains the existing fixed 14-row TUI viewport.
- Numeric values retain the existing integer range `1..50` and identical TUI/RPC behavior.
- `"adaptive"` affects TUI presentation only. RPC uses the existing deterministic 8-row page size.
- Any other string remains invalid at compile time and during runtime screen validation.
- Existing API-version-4 menu definitions remain source-compatible. API version 5 identifies a
  runtime that can interpret the new value; do not add another viewport property or a configurable
  host-row reserve in this change.

### TUI height budget

Extend the internal component render host with read-only terminal rows from the callback-provided
public `TUI`. Adaptive review reads that getter on every `render(width)` call, so Pi's normal resize
render automatically recomputes the layout without listeners, timers, or retained terminal state.

Use an internal available-row budget of:

```ts
Math.max(1, Math.floor(tui.terminal.rows) - 3)
```

The three reserved rows match the existing BTW custom-UI convention and remain an internal host
policy, not a public consumer setting.

Keep the fixed/default path on the existing `renderFrame()` behavior. For the adaptive path, use one
pure row-budget helper owned by `components/review.ts` to compose the same sanitized/themed sections
in the same reading order while never returning more rows than the budget:

1. title and optional supporting `screen.lines`;
2. an optional separator;
3. at least one review-content row when content exists;
4. a position row when content scrolls and at least four total rows are available; and
5. the keyboard hint.

Constrained-height degradation is explicit rather than accidental truncation:

- one available row shows the primary review content;
- two rows add a compact one-line title;
- three rows add a compact critical hint that prioritizes confirmation, Back/Close, then navigation;
- four or more rows include the position row when scrolling is required;
- additional rows restore wrapped title/supporting context, the normal full hint, and the separator
  before expanding the content viewport;
- lower-priority supporting rows may be omitted only in the opt-in adaptive mode, and every visible
  row remains width-safe.

The effective content viewport is therefore at least one row, terminal-bounded rather than capped at
50, and recalculated from fully wrapped frame chrome. Explicit numeric viewports keep the current
50-row validation ceiling.

### Scroll, resize, and rendering state

Store the last rendered effective viewport size for Page Up/Page Down. Up/Down, Home/End, position
feedback, raw confirmation identity, Back, and Ctrl+C retain their current behavior. On every render:

- reformat content for the supplied width;
- recompute the adaptive row budget from live terminal height;
- recalculate maximum scroll;
- clamp the existing display-line offset before slicing; and
- produce position values from the effective viewport.

This plan preserves current display-line offset semantics across width reflow; semantic source-line
anchoring and follow-bottom behavior are not added.

### RPC and lifecycle ownership

Split fixed TUI sizing from RPC page sizing so `reviewDialogPages()` never reads terminal dimensions.
For RPC, `"adaptive"` behaves like the omitted default and yields at most 8 lines per page; explicit
numeric sizes keep `Math.min(viewportSize, 8)`.

No asynchronous ownership changes are required. Existing runtime loops continue to own mode guards,
combined owner signals, post-await stale checks, confirmation actions, error routing, and disposal.
The implementation must audit those paths because the TUI host contract and review result matrix are
touched, but it must not refactor runtime coordination.

### Files and boundaries

Expected implementation ownership:

- `packages/pi-tui-kit/src/types.ts` — public viewport union;
- `packages/pi-tui-kit/src/model.ts` — adaptive/numeric validation;
- `packages/pi-tui-kit/src/components/contracts.ts` — internal live terminal-row host contract;
- `packages/pi-tui-kit/src/components/review.ts` — adaptive layout, effective viewport, scrolling, and
  unchanged RPC page policy;
- `packages/pi-tui-kit/src/index.ts` — API version 5;
- focused Pi TUI Kit tests and compile-time README/context examples;
- `test/support.ts` — only the minimum mutable terminal-row field needed by deterministic custom-UI
  tests; this is not a public testing package; and
- package README, this execution plan, and the canonical roadmap after implementation evidence exists.

Use only package-root Pi imports. Add no runtime dependency, settings, persistence, domain state, or
consumer-owned policy.

## Non-Goals

- Do not create `@narumitw/pi-tui-kit/testing` or migrate consumer tests to a supported test entry
  point; that remains the other open Phase 3 capability.
- Do not migrate or otherwise modify `pi-btw`; its fresh review gate and any migration require a
  separate plan after adaptive review and testability work are available.
- Do not add adaptive sizing to action, choice, settings, input, detail, or multi-select screens.
- Do not add semantic source-line anchoring, follow-bottom scrolling, horizontal scrolling, live
  preview, editor support, standalone confirmation, deferred multi-select, or a general layout engine.
- Do not refactor the TUI/RPC runtime into a shared interaction driver.
- Do not change default/fixed review output, RPC dialog cadence, confirmation semantics, Back/Close
  results, lifecycle ownership, package version, dependency ranges, or current consumers.
- Do not publish the package, create a consumer migration PR, or combine unrelated dependency work.

## Assumptions

- The supported Pi version continues to expose live terminal rows through the callback-provided public
  `TUI`, and Pi requests a render after resize.
- Reserving three terminal rows remains sufficient for Pi-owned chrome in a non-overlay custom UI;
  deterministic built-package smoke evidence must confirm the complete rendered review stays within
  `terminal.rows - 3` for the supported Pi version.
- Very small terminals cannot display every contextual row simultaneously. The explicit adaptive
  priority above preserves the primary content and recovery actions before supporting prose.
- Consumers that do not opt into `"adaptive"` must observe no rendering or pagination change.

## Risks

- **Circular row budgeting:** wrapped title, supporting lines, hints, and the conditional position row
  all affect the content capacity. Mitigation: isolate a pure layout calculation and test the complete
  rendered frame, not only its content slice.
- **Critical hints lost at tiny heights:** naively slicing `renderFrame()` can hide confirmation or
  exit paths. Mitigation: use the explicit constrained hierarchy and a critical one-line hint before
  optional navigation/context rows.
- **Resize drift:** a viewport change can leave `scrollOffset` beyond the new maximum or page by a
  stale fixed size. Mitigation: clamp on every render and page by the last rendered effective size.
- **RPC regression:** widening `viewportSize` can accidentally feed a string into numeric page math.
  Mitigation: separate RPC sizing and compare default, fixed, and adaptive page fixtures.
- **Compatibility ambiguity:** older runtimes reject `"adaptive"`. Mitigation: raise the declarative
  API version to 5, document the requirement, and keep version-4 definitions valid.
- **Testing-host scope creep:** adding generic orchestration to `test/support.ts` would pre-empt the
  planned testing entry point. Mitigation: add only a mutable `terminal.rows` value and resize setter
  needed to drive the existing callback; expose no component internals.
- **Large terminals:** adaptive mode may render more than the fixed 50-row maximum. This is intentional
  for host parity and remains bounded by live terminal height; content formatting is already complete
  before slicing, so no new unbounded document traversal is introduced.

## Rollback / Recovery

There is no persisted data or migration. Before publication, revert the bounded adaptive-review PR to
restore API version 4 and the numeric-only contract. If API version 5 has been published, retain the
`"adaptive"` union and correct the sizing algorithm in a patch rather than removing an accepted public
value; invalid or unavailable terminal dimensions may safely fall back to the existing fixed 14-row
TUI viewport. Numeric/default behavior provides the unaffected fallback path throughout rollout.

## Plan

### 1. Lock the public and visual contracts with red tests

- [x] Re-run `npm run check --workspace @narumitw/pi-tui-kit`, compile the repository test project,
  and execute the focused model/review tests before edits; record the passing test counts and verify
  `git status` remains clean so later failures are attributable to adaptive review.
- [x] Extend `packages/pi-tui-kit/test/context-usage.ts`, `test/readme-usage.ts`, and
  `test/menu-model.test.ts` with compile/runtime cases that accept `viewportSize: "adaptive"`, retain
  numeric and omitted definitions, reject another string, and expect API version 5; verify the new
  cases fail against the numeric-only API version 4 source.
- [x] Add red-first component tests in `packages/pi-tui-kit/test/review-screen.test.ts` for complete
  frame heights at constrained, typical, and large terminal rows; cover narrow wrapped headers,
  supporting lines, critical/full hints, conditional position rows, a minimum content row, and the
  invariant that every output line also stays within width; verify fixed/default renders remain
  byte-for-byte unchanged.
- [x] Add red-first resize and navigation cases that mutate live terminal rows and render widths,
  scroll to the end, shrink and grow the viewport, and exercise Page Up/Page Down; verify the offset,
  position text, visible range, and effective page step clamp to the latest render.
- [x] Add red-first TUI/RPC runtime cases for an adaptive review: TUI must receive live rows through the
  custom host, while RPC must emit the same bounded 8-row pages and dialog cadence as the omitted
  default; verify failures are limited to the missing adaptive contract/terminal host.

### 2. Implement adaptive review without changing fixed behavior

- [x] Update `packages/pi-tui-kit/src/types.ts` and `src/model.ts` to accept exactly a numeric
  `1..50` or `"adaptive"` review viewport and reject all other runtime values; make the focused public
  type and validation tests pass without changing other screen unions.
- [x] Extend the internal `RenderHost` in `src/components/contracts.ts` with public-TUI terminal rows,
  and update the package and repository custom-component harnesses with a default mutable row count;
  verify existing component/runtime tests compile and render unchanged before adaptive logic lands.
- [x] Implement the pure adaptive row-budget/composition helper in
  `packages/pi-tui-kit/src/components/review.ts`, entering it only for `"adaptive"`; prove the complete
  frame respects `max(1, terminal.rows - 3)` and the constrained visibility hierarchy across the new
  width/height matrix.
- [x] Store and use the last rendered effective adaptive viewport for line/page movement, recompute and
  clamp it after every height or width change, and make the focused resize/navigation tests pass while
  retaining current fixed scroll behavior.
- [x] Separate RPC page-size resolution from TUI viewport resolution so adaptive and omitted reviews
  use 8-row RPC pages and numeric reviews keep the existing cap; make the focused TUI/RPC tests pass
  without adding adapter-specific layout state.
- [x] Run every Pi TUI Kit test after the focused green state and search exact fixed/default render and
  pagination assertions for accidental reclassification; retain existing assertions unless they
  explicitly opt into adaptive behavior.

### 3. Finalize API version, documentation, and repository compatibility

- [x] Raise `PI_EXTENSION_MENU_API_VERSION` to `5` in `packages/pi-tui-kit/src/index.ts`, update model
  and compile-time tests to prove API-version-4 definitions still typecheck, and inspect generated
  declarations for the exact `number | "adaptive"` contract.
- [x] Update `packages/pi-tui-kit/README.md` and `test/readme-usage.ts` with opt-in adaptive behavior,
  fixed/default compatibility, the three-row host reserve, constrained-height hierarchy, deterministic
  RPC fallback, and API version 5; verify the mirrored examples compile through package typechecking.
- [x] Inspect all production review consumers and exact review tests for assumptions about numeric
  viewport types, fixed row counts, RPC pages, or API version; verify Image Drop remains unchanged and
  no consumer source, manifest, lockfile, or dependency-range edit is required.
- [x] Audit TUI versus RPC, callback TUI/theme/keybindings, resize/invalidation, Back/Close,
  confirmation, owner abort, `isCurrent()` failure, disposal, pending-action draining, session
  replacement, shutdown, errors, and unsupported modes against `docs/extension-conventions.md`; add a
  focused regression for any path not already covered before marking the audit complete.
- [x] Update `docs/roadmaps/pi-tui-kit-roadmap.md` after implementation evidence exists: record
  repository API version 5, mark only the adaptive-review Phase 3 milestone complete/in progress,
  update the regression metric and decision log, and leave the testing entry point, BTW gate/migration,
  package release, and later phases open.

### 4. Verify built and repository behavior

- [x] Run LSP diagnostics on every touched TypeScript file and
  `npm run check --workspace @narumitw/pi-tui-kit`; verify strict types, formatting, generated
  JavaScript/declarations, public imports, and package-root API version 5 agree.
- [x] Build the package and run a deterministic package-root TUI smoke through generated `dist/` that
  renders adaptive review at constrained/typical/large heights, mutates rows and width, scrolls/pages,
  confirms, returns Back, and closes with Ctrl+C; assert every complete frame fits
  `terminal.rows - 3` without opening an interactive TUI.
- [x] Run a real-Pi RPC smoke or deterministic protocol client through the built package for adaptive
  review pagination, confirmation, cancellation, and owner abort; verify no custom-TUI request is
  emitted and pages remain bounded/deterministic.
- [x] Run `npm test` and then `npm run check` sequentially after the shared package build; verify every
  repository test passes and no concurrent `dist/` rebuild race invalidates consumer results.
- [x] Run `just pack-tui-kit` and inspect the dry-run tarball's JavaScript, declarations, README,
  LICENSE, and package metadata; verify API version 5 and the adaptive union are present while package
  version remains unchanged for the separate release workflow.
- [x] Audit the final diff against this plan's boundaries; verify no testing entry point, BTW or other
  consumer migration, generalized adaptive layout, runtime-driver refactor, package-version bump,
  tracked generated artifact, dependency change, or unrelated roadmap work entered the change.

## Execution Evidence

- Baseline: `npm run check --workspace @narumitw/pi-tui-kit` passed; the repository test project
  compiled and the pre-change model/review focus passed 18/18 tests.
- Red contracts: package typechecking rejected `"adaptive"` at the numeric-only type boundary; after
  the union/host seam landed, four focused adaptive frame/resize/runtime tests failed against the
  fixed renderer for the intended reasons.
- Focused green: model/review coverage passed 23/23 tests, and all Pi TUI Kit tests passed 99/99 after
  package typechecking and build.
- Public artifacts: generated `dist/types.d.ts` contains exactly `number | "adaptive"`, package-root
  JavaScript/declarations report API version 5, and package version remains `0.41.0`.
- Diagnostics and gates: LSP diagnostics reported zero findings across all 12 touched TypeScript
  files; package check passed; `npm test` and the later `npm run check` each passed all 1,923 tests.
- Built smokes: the generated package-root TUI smoke passed seven constrained/typical/large,
  resize/reflow/navigation/confirmation/Back/Close frames; a real Pi 0.83 RPC client passed
  confirmation, three deterministic 8-row pages, cancellation, and owner abort without custom TUI.
- Packaging: `just pack-tui-kit` passed with 27 expected files (built JavaScript/declarations, README,
  LICENSE, and metadata); dry-run version remained `0.41.0`.
- Scope audit: Image Drop remains on omitted fixed review behavior; no consumer, BTW, manifest,
  lockfile, dependency range, package version, testing entry point, generated artifact, or unrelated
  source changed. Runtime mode guards, callback TUI/theme/keybindings, stale/abort/disposal/draining,
  error, unsupported-mode, Back/Close, and confirmation paths remain covered by the 99-test Kit
  matrix and the built smokes.

## Completion Checklist

- [x] `ReviewScreen.viewportSize` accepts only the existing numeric range or `"adaptive"`, existing
  definitions remain valid, and repository menu API version is 5.
- [x] Adaptive TUI review reads live terminal rows, keeps every complete frame within the host budget,
  preserves width safety, and degrades constrained layouts according to the documented hierarchy.
- [x] Resize, reflow, scrolling, paging, position feedback, confirmation, Back, and Close remain
  deterministic, with fixed/default rendering unchanged.
- [x] RPC adaptive review retains 8-row bounded pagination and existing cancellation, confirmation,
  stale-owner, error, and unsupported-mode semantics.
- [x] Current consumers typecheck and retain behavior without source, manifest, lockfile, package
  version, or dependency-range changes; BTW remains specialized pending a separate gate.
- [x] Source, declarations, package-root exports, README examples, packed contents, roadmap, and API
  version agree on the implemented source/published-package boundary.
- [x] Focused tests, all Pi TUI Kit tests, lifecycle regressions, LSP diagnostics, package check,
  generated-dist TUI/RPC smokes, `npm test`, `npm run check`, and `just pack-tui-kit` pass with no
  skipped or unverified required path.
