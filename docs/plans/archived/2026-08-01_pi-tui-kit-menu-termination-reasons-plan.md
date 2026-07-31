# Pi TUI Kit Menu Termination Reasons Plan

## Goal

Make `runMenu()` preserve why an ordinary menu session ended by returning a mandatory close reason:

```ts
type MenuCloseReason = "back" | "close";

type RunMenuResult =
  | { kind: "closed"; reason: MenuCloseReason }
  | { kind: "stale" }
  | { kind: "unsupported"; mode: ExtensionMode }
  | { kind: "error"; error: unknown };
```

The change must distinguish root Back from explicit whole-flow Close in TUI and RPC without changing
nested navigation, action behavior, cancellation draining, stale-owner priority, error routing, or
unsupported-mode behavior. It must remain domain-neutral and provide the smallest public seam needed
by future three-way confirmation and `pi-btw` review work.

## Context

- `packages/pi-tui-kit/src/navigator.ts` already decides whether a Back transition pops a child screen
  or closes the root, but it records only `closed: boolean`.
- Both TUI and RPC loops in `packages/pi-tui-kit/src/runtime.ts` discard the final transition and
  return the same `{ kind: "closed" }` object.
- `pi-btw` requires Bring, Back, and Ctrl+C Close to remain distinct so preview Back can restore the
  exact selector state while Close terminates the whole flow. Its migration was an evidence-backed
  no-go because the current result collapses Back and Close and review still lacks terminal-adaptive
  sizing.
- `showImageDropConfirmDialog()` also retains a specialized confirmed/cancelled/Close contract. A
  future standalone confirmation flow cannot replace it safely until the underlying lifecycle can
  preserve Back versus Close.
- Existing production callers either ignore the `runMenu()` result, return it, or check only
  `result.kind`; Chrome DevTools and Firecrawl are the only extension sources that assign and inspect
  the result directly, and both check only `kind !== "closed"`.
- Package tests contain exact `{ kind: "closed" }` assertions across action, choice, settings,
  multi-select, input, review, busy-action, TUI, and RPC paths. These are the primary compatibility
  surface that must be reclassified rather than mechanically loosened to kind-only assertions.
- Guides read for this plan: `docs/extension-conventions.md`, Pi extension, TUI, RPC, and keybinding
  documentation, the archived agent-flow and consumer-migration plans, and the canonical Pi TUI Kit
  roadmap. Applicable MUST areas are TUI-only custom UI, non-interactive safety, width and input
  behavior preservation, cancellation/disposal draining, stale-context protection, reusable-library
  boundaries, deterministic tests, root checks, and package dry-run inspection.
- `docs/extension-settings.md` is not applicable because this change does not read, validate, or
  persist extension settings.

## Architecture

### Public contract

Add `MenuCloseReason` to `packages/pi-tui-kit/src/types.ts`, export it from the package root, expose the
final reason from `MenuNavigator`, and require it on the `closed` variant of `RunMenuResult`.

Use only interaction-level reasons:

- `back` means a `{ kind: "back" }` transition closed the root screen;
- `close` means a `{ kind: "close" }` transition closed the menu.

Do not add arbitrary strings, action ids, successful domain values, screen ids, or physical-key names
to the result. An extension still owns whether a domain action completed and what value it produced.

Raise `PI_EXTENSION_MENU_API_VERSION` from `3` to `4`. Although no screen discriminant changes, a
consumer that branches on `reason` must be able to require a runtime that returns it. Version-3 menu
definitions remain valid on the version-4 runtime. Do not hand-edit the npm package version; repository
release versioning and publication remain separate work.

### Navigator ownership

`createMenuNavigator()` remains the sole owner of stack semantics and gains
`readonly closeReason: MenuCloseReason | undefined`:

- nested Back pops one screen and leaves the reason undefined;
- root Back closes with `back`;
- explicit Close closes with `close` at any depth;
- applying more transitions after closure cannot replace the first terminal reason; and
- `closed === true` implies one close reason is present.

The runtime reads that reason only after the navigation loop terminates. It must not infer the reason
from the current screen, label, selected item, keypress, or adapter mode.

### Existing transition mapping to preserve

| Existing path | Required terminal outcome |
| --- | --- |
| TUI Escape/configured cancel on a `hint: "back"` root | `closed/back` |
| TUI Escape/configured cancel on `hint: "close"` | `closed/close` |
| TUI Ctrl+C from any standard screen | `closed/close` |
| Action returns `{ kind: "close" }` | `closed/close` |
| Action or multi-select row declares `close: true` | `closed/close` |
| Nested Back | Menu remains active; no reason yet |
| TUI custom UI returns no event while owner is current | Preserve current implicit Close as `closed/close` |
| RPC generic selector returns `undefined` | Preserve current Back transition and return `closed/back` at root |
| RPC input/review returns no value | Preserve `screen.hint ?? "back"`; report its root reason |
| RPC user selects an explicit exit row | Preserve the row's existing Back/Close transition and report it at root |
| Owner signal aborts or `isCurrent()` fails | `stale`, never `closed` |
| State/action failure while current | Existing `error` or rejection behavior; no close reason |
| Print/JSON or TUI without UI | Existing `unsupported` result; no close reason |

Stale and error checks continue to take precedence after every await. A close event that races with
owner replacement must still return `stale`.

### Compatibility and rollout boundary

The new field is source-compatible for consumers that inspect only `result.kind`, but it changes the
observable object and exact equality/serialization. Treat this as an explicit public API change:

- update package tests and documentation to require the field;
- keep all existing consumer manifests unchanged because no consumer will adopt `reason` in this PR;
- verify all current consumers still typecheck against the workspace package;
- defer `pi-btw`, adaptive review viewport, standalone confirmation, and any consumer range update to
  separate plans/PRs; and
- release and npm publication require separate approval and workflow execution.

## Non-Goals

- Do not migrate `pi-btw` or remove any specialized confirmation component.
- Do not add terminal-adaptive review sizing in this change.
- Do not add a standalone `runConfirm()` flow, a new screen kind, or domain completion payloads.
- Do not normalize or redesign existing RPC cancellation cadence; preserve each branch's current
  transition and only expose its final reason.
- Do not refactor the TUI/RPC loops into a shared interaction driver as part of this bounded change.
- Do not change action transitions, screen hints, selection restoration, busy-action behavior,
  rendering, settings behavior, or task lifecycle policy.
- Do not update consumer dependency ranges, bump package versions, publish npm packages, or create
  consumer migration PRs.

## Assumptions

- The mandatory property is named `reason`, and the public values are exactly `"back"` and `"close"`.
- `MenuCloseReason` belongs in `src/types.ts` because both the public navigator and runtime result use
  it without introducing a dependency from navigation into runtime.
- A current-owner TUI custom UI that returns `undefined` without a semantic event retains its existing
  implicit Close behavior rather than being reclassified as Back.
- RPC selector cancellation remains whatever transition the current adapter already applies; this
  change does not claim Pi can identify the physical Ctrl+C key in RPC.
- Existing consumers that check only `result.kind` require no source or manifest edit.
- The latest repository baseline is 1,914 passing tests; execution must establish the actual baseline
  before editing and stop on any unexplained failure.

## Risks

- Adding a required property can break external deep-equality or serialized-result consumers even
  when TypeScript source still compiles. API version 4, README migration notes, declarations, and pack
  inspection must make the observable change explicit.
- Updating every exact package assertion mechanically could encode the wrong reason. Each test must be
  classified from its terminal transition, with focused matrix tests proving the central semantics.
- A fallback such as `navigator.closeReason ?? "close"` could hide an impossible navigator state.
  Tests should enforce the invariant instead of silently inventing a reason.
- Owner abort can finish the active component with a Close event before the runtime notices the
  signal. Existing post-await stale checks must remain ahead of terminal-result publication.
- RPC input/review cancellation follows `screen.hint`, while a generic undefined selector currently
  applies Back. Unifying these paths would be an unrelated behavior change.
- Raising the menu API constant without a package-version release means source can advertise version
  4 before npm does. Documentation must distinguish repository source from the latest published
  `0.41.0` package until the separate release workflow runs.

## Rollback / Recovery

- The change has no storage, settings, or data migration. Reverting the package commit restores the
  version-3 result shape without recovery work.
- A rollback must revert `MenuCloseReason`, navigator state, runtime results, API version, tests,
  README/type examples, and roadmap status together; do not leave declarations or documentation
  claiming a reason the runtime does not return.
- Keep proof-consumer work out of this PR so rollback cannot strand an extension requiring API version
  4 or a dependency range unavailable on npm.
- If package or built-output smoke fails, restore the previous API constant and result contract rather
  than publishing a partial compatibility state.

## Plan

### 1. Lock the public result and navigation semantics with failing tests

- [x] Run the focused Pi TUI Kit tests and root `npm test` before edits; record the package test count
  and repository count, and stop if the expected 1,914-test baseline has an unexplained failure.
  Evidence: all 90 focused Pi TUI Kit tests and all 1,914 repository tests passed. An initial parallel
  package/root build raced over generated `dist/`; the required sequential rerun passed cleanly.
- [x] Extend `packages/pi-tui-kit/test/menu-model.test.ts` with navigator tests for nested Back, root
  Back, explicit Close, immutable first terminal reason, and the invariant that a closed navigator
  exposes a reason; verify the new assertions fail against the boolean-only navigator. Evidence:
  package typechecking failed only because `MenuNavigator` had no `closeReason` property.
- [x] Add focused TUI and RPC result-matrix tests in `packages/pi-tui-kit/test/runtime.test.ts` for
  root Back, Ctrl+C/explicit Close, nested Back followed by Close, action Close, close rows, implicit
  current-owner TUI closure, generic RPC cancellation, hint-driven input/review cancellation, owner
  abort, and stale-versus-close races; verify failures are limited to the missing result reason.
  Evidence: all three new matrix tests failed only because actual closed results lacked `reason`;
  existing nested-navigation and owner-abort race tests provide the stale-priority cases.
- [x] Extend `packages/pi-tui-kit/test/context-usage.ts` with compile-time examples that exhaustively
  narrow `RunMenuResult`, require `reason` only on `closed`, and reject an unsupported close reason;
  verify package typechecking fails before the public type is added. Evidence: typechecking failed on
  the missing package-root `MenuCloseReason`, missing `closed.reason`, and both intentionally unused
  negative `@ts-expect-error` directives.

### 2. Make the navigator the single owner of termination reason

- [x] Add `MenuCloseReason` to `packages/pi-tui-kit/src/types.ts` and a read-only reason to
  `MenuNavigator` in `src/navigator.ts`; set it only when root Back or explicit Close first terminates
  the navigator, then make the focused navigator tests pass without changing stack or selection
  restoration behavior. Evidence: 11 focused model/navigation tests and package typechecking pass;
  nested Back leaves the reason unset and post-close transitions preserve the first reason.
- [x] Update both terminal returns in `packages/pi-tui-kit/src/runtime.ts` to publish the navigator's
  required reason while preserving every existing transition application and all stale/error checks;
  make the focused TUI/RPC matrix pass without adding adapter-specific reason inference. Evidence:
  both loops use one invariant-checking `closedMenuResult()` over `navigator.closeReason`; the three
  new TUI/RPC matrix tests pass.
- [x] Reclassify every exact `{ kind: "closed" }` assertion in Pi TUI Kit runtime, input, and review
  tests to its actual `back` or `close` reason; retain kind-only assertions only where a consumer test
  intentionally does not depend on the new contract, and run all Pi TUI Kit tests to detect a missed
  terminal path. Evidence: source search finds only the intentional invalid compile-time example
  without a reason; all 94 focused Pi TUI Kit tests pass.

### 3. Version and document the public contract

- [x] Export `MenuCloseReason` from `packages/pi-tui-kit/src/index.ts`, raise
  `PI_EXTENSION_MENU_API_VERSION` to `4`, and update model/type tests to prove version-3 definitions
  remain valid while the version-4 runtime result requires a reason. Evidence: package typechecking
  and 11 focused model/navigation tests pass; the negative type examples reject missing/unknown
  reasons while existing definitions still resolve.
- [x] Update `packages/pi-tui-kit/README.md` and `test/readme-usage.ts` with the exact closed-result
  shape, root Back versus Close semantics, RPC caveat, API version 4 rationale, and a typed handling
  example; verify README examples compile through the existing typecheck path. Evidence: package and
  repository test-project typechecking compile the mirrored `MenuCloseReason` handling example.
- [x] Update `docs/roadmaps/pi-tui-kit-roadmap.md` after implementation evidence is available: mark
  Phase 2 complete in source, distinguish latest published `0.41.0`/API 3 from repository API 4 until
  release, append the implementation decision, and leave adaptive viewport and BTW migration open.
  Evidence: roadmap metadata, current state, Phase 2 status, success metric, and decision log now make
  that source/published split explicit; Phase 3 and the BTW re-gate remain open.

### 4. Audit consumers and lifecycle compatibility

- [x] Inspect all production `runMenu()` callers and tests for exact result objects, exhaustive
  switches, serialization, or dependency on Back/Close collapse; verify Chrome DevTools and Firecrawl
  retain their kind-only post-close behavior, Stamp's returned type remains compatible, and no
  consumer source or manifest change is required. Evidence: repository search found only those two
  kind-only result checks and Stamp's pass-through; all workspace typechecks pass after rebuilding
  the kit, and no consumer source, manifest, or lockfile changed.
- [x] Audit TUI versus RPC, user cancellation, component disposal, pending-action draining, owner
  abort, `isCurrent()` failure, session replacement, shutdown, and post-await stale priority against
  `docs/extension-conventions.md`; add a regression for any uncovered path before marking the audit
  complete. Evidence: the new matrix covers both modes and ordinary terminal paths; 16 focused
  cancellation/disposal/owner/stale tests pass, including an owner-triggered Close event that still
  returns Stale. No transition or asynchronous ordering changed.
- [x] Run LSP diagnostics on touched TypeScript files and the Pi TUI Kit package check; verify strict
  types, source formatting, generated declarations, and package-root exports all agree on
  `MenuCloseReason`, mandatory `closed.reason`, and API version 4. Evidence: Biome LSP reports zero
  diagnostics across all ten touched TypeScript files; the package check passes, generated
  declarations expose the reason/navigator field, and a package-root import reports API version 4.

### 5. Verify built and repository behavior

- [x] Build the package and run deterministic package-root TUI and RPC smokes that assert root Back,
  explicit Close, action Close, and owner abort through generated `dist/`; use an automated TUI host
  because repository rules prohibit opening an interactive TUI. Evidence:
  `node node_modules/.cache/pi-tui-kit-termination-smoke.mjs` passed package-root TUI Back/Ctrl+C/action
  Close, RPC Back/action Close, owner abort to Stale, and API version 4 assertions.
- [x] Run `npm test` and `npm run check`; verify all repository tests pass and no current extension
  requires a source or dependency-range migration for the additive result field. Evidence: both
  sequential gates pass all 1,918 tests (the 1,914 baseline plus four focused tests); workspace
  typechecks pass with no consumer or manifest changes.
- [x] Run `just pack-tui-kit` and inspect the dry-run tarball's JavaScript, declarations, README,
  LICENSE, and package metadata; verify the built public API exposes the reason and API version 4
  while the source package version remains unchanged for the separate release workflow. Evidence:
  the 27-file dry run contains only LICENSE, README, package metadata, and generated JS/declarations;
  declarations require `closed.reason`, package-root JS reports API 4, and package version stays
  `0.41.0`.
- [x] Audit the final diff against the roadmap boundary and this plan's non-goals; verify no adaptive
  viewport, standalone confirmation, internal-driver refactor, consumer migration, package-version
  bump, generated tracked artifact, or unrelated dependency change entered the implementation PR.
  Evidence: changed code is limited to termination types/navigation/runtime/exports and their tests;
  package manifests, lockfile, consumers, components, task flow, and tracked `dist/` are unchanged.
  Documentation covers the contract/roadmap/plan, and MEMORY records the directly observed build race.

## Completion Checklist

- [x] Root Back and explicit Close produce distinct mandatory reasons in both supported menu modes,
  while nested Back remains active. Evidence: focused navigator/runtime tests and the built-package
  TUI/RPC smoke assert all three states.
- [x] Action Close, close rows, screen hints, implicit current-owner closure, and RPC cancellation
  preserve their existing transition behavior and report the corresponding reason. Evidence: the
  focused result matrix plus reclassified choice/multi-select/input/review tests pass.
- [x] Owner abort, stale generation, disposal with pending work, errors, and unsupported modes retain
  precedence and never masquerade as an ordinary close reason. Evidence: 16 lifecycle tests, all 94
  focused package tests, and owner-abort smoke assertions pass.
- [x] `MenuCloseReason`, `MenuNavigator`, `RunMenuResult`, package-root exports, declarations, README,
  examples, and `PI_EXTENSION_MENU_API_VERSION === 4` agree. Evidence: package check, declaration
  inspection, compile-time negative examples, README usage typecheck, and package-root import pass.
- [x] Existing consumers typecheck and retain behavior without source, manifest, or dependency-range
  changes; future consumers of `reason` are explicitly deferred to separate migrations. Evidence:
  all workspace typechecks and root gates pass with zero consumer/manifest/lockfile diff.
- [x] Focused tests, package checks, LSP diagnostics, automated built-package TUI/RPC smokes,
  `npm test`, `npm run check`, and `just pack-tui-kit` pass with pack contents inspected. Evidence:
  94 focused and 1,918 repository tests pass; LSP has zero diagnostics; the smoke and 27-file pack pass.
- [x] The roadmap records the implemented source state and preserves adaptive viewport, BTW, release,
  and publication work as separate future decisions. Evidence: Phase 2 is complete in repository
  source, published `0.41.0` remains API 3, and Phase 3/BTW/release remain explicitly open.
