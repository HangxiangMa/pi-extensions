# Pi TUI Kit Browse Detail Document Plan

## Goal

Add an explicit exact-document detail contract to Pi TUI Kit's declarative `browse` screen so JSON, code, diffs, and other whitespace-sensitive content render safely and consistently in TUI and RPC modes without changing legacy prose details.

After the Kit API is published, migrate `pi-tool` back to the standard browse screen and remove its extension-owned browser workaround in a separate consumer pull request.

## Context

`MenuBrowseItem.details` currently accepts prose lines that `browse.ts` passes through `safeBrowseText()`, whose whitespace normalization removes indentation before both TUI wrapping and RPC pagination.

The existing `review` screen already owns the required document boundary in `review.ts`: terminal-control removal, newline normalization, tab expansion, grapheme-aware hard wrapping, syntax or diff formatting, adaptive TUI scrolling, and bounded RPC pages.

`pi-tool` currently preserves schema indentation by owning a searchable TUI component in `packages/pi-tool/src/tool-browser.ts` and routing detail content through a separate review screen.

That workaround is correct and independently publishable, but it duplicates browse search, layout, focus, width, lifecycle, and navigation behavior that belongs in Pi TUI Kit.

The delivery requires at least two implementation pull requests because repository policy requires a new Kit API to be published before a consumer raises its compatibility floor to use it.

## Architecture

Add a public `BrowseDetailDocument` value with `content: string` and optional `format: ReviewFormat`, then add optional `detailDocument` to `MenuBrowseItem` without changing the existing `details` field.

When `detailDocument` is present, it is the complete detail body and takes precedence over `details`; the item label remains the detail title, while the consumer includes any desired status, description, or provenance in the exact document.

When `detailDocument` is absent, the existing generated body of sanitized status, description, and `details` lines remains byte-for-byte compatible at the dialog and rendered-text boundaries.

Keep `detailDocument.content` out of implicit fuzzy-search input because exact documents may be large or sensitive, and require consumers to opt searchable metadata into the existing `searchText` field.

Extract the document sanitization, tab expansion, grapheme segmentation, hard wrapping, plain RPC line generation, and themed text/code/diff formatting from `review.ts` into one package-internal document-formatting module used by both review and browse.

Keep browse list rendering, query and stable-ID restoration, detail scrolling, Back/Close behavior, focus forwarding, adaptive row allocation, and RPC navigation in their existing owners.

Do not expose internal formatter helpers from the package root because consumers need a declarative document contract rather than rendering implementation details.

Advance the declarative menu API compatibility marker, export the new public type, document legacy and exact detail semantics, and record an additive Kit release through Changesets.

## Non-Goals

- Do not change legacy `details` whitespace normalization, ordering, generated status or description lines, search behavior, selection restoration, or exact RPC labels.
- Do not add browse actions, confirmation, mutation hooks, arbitrary component callbacks, horizontal scrolling, or consumer-owned render functions.
- Do not make document content implicitly searchable or persist any browse state outside the current menu instance.
- Do not modify `pi-tool`, raise a consumer dependency floor, publish a package, merge a release pull request, or dispatch a release workflow in the Kit API pull request.
- Do not migrate another consumer unless it has a confirmed whitespace-sensitive browse detail and can adopt the already-published API independently.

## Execution Evidence

- Branch: `feat/pi-tui-kit-browse-detail-document`, created from `origin/main` at `e4e3abcb`.
- Preserved pre-existing work: this plan was the only untracked path before implementation.
- Baseline: `npm run check --workspace @narumitw/pi-tui-kit` passed before production edits.
- Applicable repository rules: deterministic behavior tests, width-bounded and terminal-safe TUI rendering, IME focus forwarding, Back/Close and disposal preservation, reusable-library packaging, independent Changeset versioning, and publication before consumer adoption.
- Verification map: package tests cover public types, TUI, RPC, navigation, controls, widths, focus, and disposal; `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack tui-kit` cover repository and package gates.
- Red evidence: the initial Kit typecheck failed only on the absent `BrowseDetailDocument` export, `detailDocument` property, and version-10 contract.
- Focused evidence: the complete Kit check passed and all 168 Kit tests passed after implementation.
- Repository evidence: `npm run check:boundaries` passed, and `npm run check` passed with 268 test files and 2,900 tests.
- Packaging evidence: `just pack tui-kit` built the package and listed 59 manifest-approved files containing the manifest, README, license, built JavaScript, and declarations.
- Semantic audit: the formatter is stateless and shared; browse still reads live width and rows on every render, clamps scroll after reflow, forwards list focus to the existing `Input`, and retains its existing synchronous Back, Close, cancellation, and disposal ownership.
- Scope audit: no consumer source, dependency range, lockfile, setting, command, action, or lifecycle implementation changed.
- Release status: publication and the dependent `pi-tool` migration remain deliberately open because this execution explicitly forbids publishing and repository policy forbids consumer adoption before registry verification.
- Execution deviation: formatter extraction and browse wiring landed in one working-tree batch rather than two intermediate commits; the unchanged review contract was still verified independently by the focused review suite.

## Plan

### Phase 1: Pi TUI Kit API

- [x] Record the current focused Kit baseline and map the touched public-type, browse TUI, RPC adapter, exact-document, terminal-safety, package, and release rules; verify with the existing package tests and `npm run check --workspace @narumitw/pi-tui-kit` before production edits.
- [x] Add failing public-contract tests for `BrowseDetailDocument` and `MenuBrowseItem.detailDocument`, including the package root declaration export and the incremented API compatibility literal; verify that typechecking initially fails only because the API is absent.
- [x] Add failing TUI browse regressions in `packages/pi-tui-kit/test/browse-screen.test.ts` for two- and four-space indentation, tabs, narrow cell widths, CJK or emoji boundaries, terminal controls, scrolling, and query plus raw-ID restoration after returning from an exact detail.
- [x] Add failing RPC regressions in `packages/pi-tui-kit/test/runtime.test.ts` for exact indentation, deterministic hard wrapping, bounded pagination, sanitized controls, duplicate display labels, Back behavior, and the guarantee that document content never appears in list choices or implicit search metadata.
- [x] Add legacy characterization tests proving that items using only `details` retain their current normalized TUI text, RPC titles and pages, status and description ordering, empty fallback, navigation, and existing exact scripts.
- [x] Extract one internal document-formatting module from `review.ts` and make review use it without behavior changes; verify all existing review text, code, diff, width, control, adaptive-height, and RPC pagination tests before wiring browse to it.
- [x] Update `types.ts`, browse TUI rendering, and RPC browse pagination so `detailDocument` uses the shared exact-document pipeline while legacy `details` stays on the existing prose pipeline; define and test `detailDocument` precedence when both fields are supplied.
- [x] Audit theme invalidation, syntax highlighting after wrapping, display-cell bounds, empty and very narrow terminals, scroll clamping after resize, IME focus restoration, cancellation, disposal, and stale menu ownership across both detail representations.
- [x] Update `packages/pi-tui-kit/README.md`, public examples, package-root exports, API compatibility metadata, and type fixtures to describe full-body ownership, explicit `searchText`, mode behavior, precedence, and compatibility with existing browse definitions.
- [x] Add a Kit-only minor Changeset, run the complete Kit check and tests, `npm run check:boundaries`, the CI-equivalent `npm run check`, `git diff --check`, and `just pack tui-kit`, then inspect the tarball for built JavaScript, declarations, README, license, and manifest only.
- [x] Audit the final Phase 1 diff against repository conventions and prove that no consumer source or dependency floor adopts the unpublished API.

### Release gate

- [ ] Obtain explicit user approval before merging the Changesets release pull request or otherwise publishing the new Kit release.
- [ ] Verify the released Kit version, root export, declaration shape, tarball integrity, and registry visibility with `npm view` and a clean temporary install before any consumer migration begins.

### Phase 2: pi-tool consumer migration

- [ ] Create a separate consumer branch from then-current `origin/main`, raise only `pi-tool`'s Kit compatibility floor to the verified published release, run root `npm install`, and prove the lockfile resolves that compatible version within the consumer install scope.
- [ ] Replace `pi-tool`'s custom TUI browser and separate detail menu loop with the standard Kit `browse` screen using `detailDocument`, while preserving tool ordering, active status, metadata search, fresh command-time state, TUI and RPC navigation, and exact schema content.
- [ ] Delete `packages/pi-tool/src/tool-browser.ts`, remove direct Pi TUI peer and development dependencies if no production import remains, and update package layout documentation and lockfile metadata.
- [ ] Keep consumer regressions for TUI and RPC indentation, 20-column wrapping, terminal controls, query restoration, session replacement, shutdown, arguments, and unsupported modes, and add a comparison proving no supported `/tool` behavior regresses.
- [ ] Add the appropriate `pi-tool` Changeset for its raised compatibility floor and packaged implementation change, then run focused tests, package check, the CI-equivalent root check, `git diff --check`, `just pack tool`, and the local Pi load smoke.
- [ ] Inspect the final consumer diff for removal of duplicated UI ownership, verify independent installation against the published Kit package, and archive this completed plan only when every phase and release gate has evidence.

## Risks

- A silent global change to `details` would alter existing consumers, so the new exact path must be opt-in and legacy behavior must remain characterized.
- Allowing both `details` and `detailDocument` creates ambiguity, so the public contract must define `detailDocument` precedence and test it in TUI and RPC.
- Duplicating review's formatter inside browse would allow sanitization or wrapping behavior to drift, so both screens must share one internal document pipeline.
- Syntax or diff formatting can become incorrect if it classifies wrapped fragments instead of original source lines, so the shared formatter must preserve the existing source-versus-rendered-segment contract.
- Exact documents can be large or sensitive, so they must not enter fuzzy-search strings, selector labels, logs, or autocomplete metadata unless the consumer explicitly copies safe metadata into `searchText`.
- A zero-major Kit range does not cross minor releases, so migrating `pi-tool` before registry publication would pass through local hoisting while failing for independent installs.
- Simplifying `pi-tool` can accidentally change query restoration or lifecycle cleanup, so the migration must retain behavior-level tests rather than only replacing source structure.

## Completion Checklist

- [x] Browse supports a documented exact full-body detail with text, code, and diff formats in both TUI and RPC modes.
- [x] Exact details preserve indentation, tabs, Unicode display-cell bounds, terminal safety, scrolling, pagination, Back/Close behavior, query restoration, and stable raw identity.
- [x] Legacy `details` behavior and existing browse consumers remain compatible without source or dependency changes in the Kit API pull request.
- [x] Review and browse share one internal document-formatting implementation with no new public rendering helper.
- [x] Public exports, API compatibility metadata, README, declarations, Changeset intent, package contents, and repository checks agree.
- [ ] The Kit API is published and registry-verified before `pi-tool` raises its compatibility floor.
- [ ] `pi-tool` uses the standard browse screen, retains all supported behavior, and no longer owns duplicated browser UI or unnecessary direct Pi TUI dependencies.
- [ ] The completed plan is archived with all checks, release evidence, consumer migration evidence, deviations, and unverified paths recorded.
