# Pi TUI Kit Testing Adoption and Release Plan

## Goal

Complete the next Pi TUI Kit delivery sequence without publishing an unproven testing contract:

1. migrate Stamp and Image Drop test orchestration to the supported
   `@narumitw/pi-tui-kit/testing` subpath in separate PRs;
2. remove only repository test-support logic that is proven unused, while retaining domain and
   specialized-component fixtures;
3. publish the repository's accumulated Pi TUI Kit API 5 work in a shared minor release; and
4. rerun the BTW migration gate against the published API, migrating and publishing BTW only if
   editor preservation, Back/Close, adaptive review, and selection-restoration invariants all pass.

The intended order is therefore **consumer test adoption → Kit release → BTW production gate**.
Stamp and Image Drop test migrations do not need a prior npm release because repository tests resolve
and build the local workspace package.

## Context

- Clean `main` is synchronized at merge commit `9f2c9dc`, which includes PR #487 and the supported
  testing subpath. PR #487 passed CI and CodeQL before merge.
- Repository `@narumitw/pi-tui-kit` remains version `0.41.0` but exposes menu API version 5, adaptive
  review, distinct root Back/Close results, and `@narumitw/pi-tui-kit/testing`. npm currently exposes
  `@narumitw/pi-tui-kit@0.41.0` with menu API version 3.
- Stamp and Image Drop already depend on `@narumitw/pi-tui-kit` through `^0.41.0`. Their tests ship
  neither test files nor the testing import, so adopting `/testing` does not change either extension's
  production dependency boundary.
- Stamp's `test/menu.test.ts` directly owns one ad hoc TUI factory driver and one callback-scripted RPC
  flow. Image Drop's `test/menu.test.ts` directly owns loader and confirmation drivers, while
  `test/lifecycle.test.ts` uses broad callback automation for representative declarative input/review
  settings flows.
- `test/support.ts#createCustomSelectorHarness()` is not deletable after only these two migrations:
  current Kit, production-extension, experimental, and deprecated tests still use it. The supported
  entrypoint replaces repeated Kit-host policy, not every specialized component fixture or the broad
  consumer-owned `createMockContext()`.
- Since tag `v0.41.0`, the changed publish roots include Pi TUI Kit, Stamp, Image Drop, and eight
  other packages, while `extensions/pi-btw` is unchanged. Preflight proved that a zero-major minor
  bump intentionally preserving `^0.41.0` Kit ranges adds nested `0.41.0` lock entries, so the
  selector takes its safe fallback and publishes all 23 workspaces, matching the prior `v0.41.0`
  release behavior. BTW will therefore publish unchanged at `0.42.0`; a successful later migration
  uses an independently bumped `0.42.1`.
- BTW currently owns `BtwMenuSelector`, `BtwBringToMainPreview`, and `BtwTextRangeSelector` plus
  `showBtwCustomPreservingEditor()`. Only the standard menu and preview are migration candidates;
  exact text-range selection remains specialized.
- Guides read for this plan: `MEMORY.md`, `docs/extension-conventions.md`,
  `docs/extension-settings.md`, the supported-testing archived plan, the canonical Kit roadmap,
  package manifests, release workflows/scripts, root test support, and relevant Stamp, Image Drop,
  and BTW source/tests. Applicable MUST areas are deterministic tests, public package roots,
  callback-provided TUI/keybindings, cancellation/disposal, settings UI behavior preservation,
  extension dependency metadata, pack inspection, and the root CI-equivalent gate. No settings
  loading, validation, persistence, precedence, or file format will change.

## Architecture

### Test-adoption boundary

Consumer tests compose only the supported UI adapters into their existing fixtures:

```ts
const tui = createTuiHarness({ width: 80, rows: 24 });
const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });

const running = showMenu(context.ctx, runtime, options);
await tui.waitForOpen();
tui.press("tui.select.confirm");
await tui.waitForPending();
await running;
```

RPC tests use exact scripts and finish with `assertConsumed()`. Consumer fixtures continue to own Pi
context fields, notifications, session generations, persistence, domain state, and specialized UI.
Do not add those concerns to Pi TUI Kit testing.

Each migration is a separate behavior-preserving PR:

1. Stamp testing adoption;
2. Image Drop testing adoption;
3. bounded root-support/roadmap cleanup if the post-migration usage audit permits a real deletion.

If a consumer proves a missing harness capability, stop that migration. Add the smallest generally
valid capability in a separate Pi TUI Kit PR with package-owned tests and rerun package conformance
before continuing. Do not widen `/testing` inside a consumer PR.

### Release boundary

Use the canonical GitHub shared-version workflow, not a hand-edited version commit. A minor bump is
selected because the unpublished delta includes new public production behavior, menu API versions 4
and 5, adaptive review, and a supported testing subpath. Starting from the current highest workspace
version, the expected release is `0.42.0`; derive and verify the actual version at execution time.

Before dispatch, derive the exact changed-package set from the previous release tag, inspect every
selected tarball, and obtain explicit approval for the version and package list. The workflow must
produce one canonical `chore(release): v<version>` commit and matching tag; the tag-triggered publish
workflow must publish Pi TUI Kit before selected dependents.

### BTW gate after Kit publication

Gate BTW after the Kit release so a successful migration can declare a real bounded dependency on the
published API 5 minor. Admission requires all of the following:

- standard menu choices preserve initial/restored selection and raw identity;
- root Back and Ctrl+C Close remain distinct through nested flows;
- review uses the adaptive viewport without hiding exact content;
- the main editor draft is preserved across every menu/review result and revalidated after awaits;
- returning from preview restores question or text-range selection state; and
- exact character/line selection remains in `BtwTextRangeSelector` with no capability loss.

A no-go is a valid finite result. Record the failed invariant and retain the existing specialized
components rather than approximating behavior.

## Non-Goals

- Do not publish before Stamp and Image Drop prove the supported testing seam.
- Do not migrate every repository use of `createCustomSelectorHarness()` or delete
  `createMockContext()` merely to reduce helper counts.
- Do not change Stamp or Image Drop production source, settings behavior, package ranges, commands,
  lifecycle semantics, or shipped files in their test-adoption PRs.
- Do not expose components, add fuzzy dialog matching, or add context/session/settings/filesystem
  mocks to `@narumitw/pi-tui-kit/testing`.
- Do not combine Stamp, Image Drop, release, and BTW changes into one PR.
- Do not force BTW onto Kit if editor preservation, restored selection, exact text selection, or
  Back/Close semantics regress.
- Do not publish a version manually when the canonical tag workflow is healthy. Manual publication is
  recovery-only, except for a successfully migrated BTW version intentionally omitted from the prior
  canonical release selection.
- Do not start Phase 4 interaction-driver, standalone-confirmation, or deferred-multi-select work.

## Assumptions

- Repository tests continue to build Pi TUI Kit before consumers, so source adoption can import
  `@narumitw/pi-tui-kit/testing` before npm publication.
- The shared minor workflow remains the version authority and preserves consumer-owned dependency
  ranges unless a migration explicitly requires a newer Kit API.
- GitHub Actions retains trusted npm provenance credentials for tag-triggered publication.
- BTW remains unchanged between `v0.41.0` and the release parent and is intentionally included by the
  safe all-package fallback. If the post-release gate succeeds, `just bump @narumitw/pi-btw patch`
  creates `0.42.1` after adding the published Kit range; no npm version is reused.
- Pi 0.83 remains the runtime conformance target for this release.

## Risks

- **Publishing an awkward test API:** migration may reveal missing or misleading semantics after the
  subpath is public. Mitigation: dogfood two named consumers before release and fix the package in a
  separate pre-release PR.
- **False cleanup:** root helpers still support many Kit and specialized tests. Mitigation: require an
  exact usage/ownership audit and delete only zero-consumer logic.
- **Release package drift:** concurrent merges can change the tag's selected package set. Mitigation:
  recompute the list from the latest `origin/main`, inspect each selected manifest/tarball, and require
  approval immediately before dispatch.
- **Partial npm publication:** some packages may publish before a workflow failure. Mitigation: query
  every selected `name@version`, rerun the idempotent workflow or publish only missing artifacts, and
  never overwrite an existing version.
- **BTW dependency mismatch:** a migrated BTW cannot depend on unpublished API 5 under `^0.41.0`,
  and unchanged BTW `0.42.0` is selected by the shared-release fallback. Mitigation: gate after Kit
  `0.42.x` is visible, add bounded `^0.42.0`, bump BTW alone to unused patch `0.42.1`, then publish.
- **BTW capability loss:** a generic review/menu can erase editor or selection behavior. Mitigation:
  characterize invariants first and accept a documented no-go.

## Rollback / Recovery

- Before npm publication, revert or amend the bounded consumer/package PR that fails; existing tests
  can continue using repository-local support.
- After publication, keep both package roots and fix defects additively in a patch. Do not remove
  `@narumitw/pi-tui-kit/testing` from a published minor.
- If the shared bump commit/tag is wrong but nothing published, stop the publish workflow, delete the
  remote tag only with explicit approval, revert the release commit, and rerun from clean `main`.
- If publication is partial, preserve every published artifact, inventory missing packages with
  `npm view`, and resume only the missing versions. If npm shows a dist-tag but `npm view` returns 404,
  use `just npm-public <package>` after confirming the package exists.
- Shared release `0.42.0` intentionally publishes BTW unchanged. A successful migration must use the
  next unused BTW patch (expected `0.42.1`); if that patch already exists, derive another unused
  version and never overwrite registry bytes.
- A BTW no-go requires no runtime rollback: retain the specialized components, record evidence, and
  close the roadmap gate explicitly.

## Plan

### 1. Establish the execution baseline and exact ownership matrix

- [x] Synchronize a clean `main` with `origin/main`, verify PR #487 is present, and record HEAD, npm
  Kit version/API, repository Kit version/API, latest release tag, and current test count; verify with
  `git status`, `npm view @narumitw/pi-tui-kit version`, package-root imports, and `npm test`.
  Evidence: clean tracked `main` is synchronized at PR #487 merge `9f2c9dc`; tag/npm remain
  `v0.41.0`/`0.41.0`, the built source root reports API 5, and all 1,937 tests pass.
- [x] Run `npm run check --workspace @narumitw/pi-tui-kit` followed by `npm run check`; record a green
  pre-migration baseline and do not run package/root builds concurrently because both replace
  `packages/pi-tui-kit/dist`. Evidence: both sequential gates pass; the root gate again passes all
  1,937 tests with zero failures, skips, cancellations, or todos.
- [x] Inventory every `createCustomSelectorHarness`, `driveCustomSelector`, implicit
  `createMockContext({ select/input })` Kit adapter, and direct custom-factory driver; classify each as
  Kit-standard, specialized UI, consumer-domain context, deprecated, or already supported, and add
  the exact retained/deletion candidates to this plan's evidence. Evidence: 80 direct references in
  21 files span four Kit test files, 13 active extension files, one experimental file, one deprecated
  file, and root support; nine files also name `driveCustomSelector`. Stamp/Image direct drivers are
  Kit menu/input/loader or specialized confirmation hosts, while broad context/domain fixtures and
  non-Kit components remain retained owners. Full helper deletion is therefore not a candidate.
- [x] Freeze the Stamp and Image Drop behavioral matrix before editing—TUI render/input/focus,
  rejected retry, pending drain, Escape Back, Ctrl+C Close, RPC order, cancellation, owner abort,
  persistence, and notifications—and verify each claimed invariant already has a named assertion or
  add a characterization assertion without changing production behavior. Evidence: nine named tests
  cover Stamp TUI retry/Close, RPC retry/adaptation/abort, Image Drop loader Back/Close and abort
  ordering, specialized confirmation, rejected limit retry, replacement during save, and Ctrl+C
  closure; the green 1,937-test baseline freezes their existing assertions.

### 2. Migrate Stamp tests in an independent PR

- [x] Create a Stamp-only branch from the latest merged `main` and update
  `extensions/pi-stamp/test/menu.test.ts` to import the public testing subpath while retaining
  `createMockContext()` only for context/domain ownership; verify no Stamp source or manifest diff.
  Evidence: branch `test/pi-stamp-testing-harness` changes only the active plan and Stamp menu test;
  source, manifest, lockfile, and root support have no diff.
- [x] Replace the inline TUI custom callback in the rejected-locale flow with one
  `createTuiHarness()` that externally drives all sequential screens, focuses/types the input, drains
  the rejected action, proves the draft remains visible, accepts the corrected locale, and closes via
  Ctrl+C; verify the original patch/result assertions remain unchanged. Evidence: the supported host
  drives five screen openings, explicit focus/raw Ctrl+U input, pending drains, rejected draft render,
  canonical `en-US` patch, and Ctrl+C closure while preserving all prior assertions.
- [x] Replace the callback-scripted Stamp RPC retry with `createRpcHarness()` steps that assert exact
  input/select kind and order, exact raw responses/cancellation, zero custom TUI, and complete script
  consumption; retain only product-significant title/options assertions. Evidence: seven strict steps
  lock exact main/settings/locale/input cadence, both raw values, updated state, cancellation, Close,
  the custom trap, and `assertConsumed()`.
- [x] Compile the repository test project and run the focused Stamp menu test from its generated real
  path, then run `npm run check --workspace @narumitw/pi-stamp`, LSP diagnostics on touched TypeScript,
  and root `npm run check`; verify all prior Stamp behavior and the repository gate remain green.
  Evidence: all 7 focused tests pass, Stamp's 14-file check/typecheck passes, LSP reports zero
  diagnostics, and root check passes all 1,937 tests.
- [x] Audit the Stamp diff against the test-adoption boundary, update this plan with evidence, open a
  focused PR, and merge only after CI passes; verify the merged PR changes tests/plan evidence only
  and leaves production source, package metadata, settings semantics, and root support unchanged.
  Evidence: PR #488 merged as `67a8048` after CI and all CodeQL checks passed; its two-file diff is
  limited to the active plan and Stamp menu test, with no production, metadata, lockfile, settings, or
  root-support change.

### 3. Migrate Image Drop tests in an independent PR

- [x] Create an Image Drop-only branch from the latest merged `main` and update
  `extensions/pi-image-drop/test/menu.test.ts` to compose `createTuiHarness()` with its existing
  context fixture; verify initialization still uses Pi's public theme setup required by
  `BorderedLoader`. Evidence: branch `test/pi-image-drop-testing-harness` imports only the supported
  testing subpath and retains `initTheme("dark", false)`; no production, manifest, or lockfile diff.
- [x] Replace the loader and specialized-confirmation factory drivers with semantic harness operations
  covering Escape Back/cancel, Ctrl+C Close, abort-before-UI-close ordering, disposal, and ignored late
  input; verify loader work is drained or explicitly released so no animation/task keeps Node alive.
  Evidence: three menu tests drive named keys through the supported host, assert closed ownership and
  abort ordering, and all five menu tests terminate without retained loader timers.
- [x] Migrate the representative rejected resource-limit input flow in
  `extensions/pi-image-drop/test/lifecycle.test.ts` from implicit select/input automation to an
  externally driven `createTuiHarness()` sequence; verify the invalid draft remains rendered, the
  corrected value persists once, review confirmation uses raw identity, and session/domain assertions
  remain extension-owned. Evidence: one seven-screen host drives main/settings/limits/input/review,
  retains the invalid draft, saves `{ maxImages: 12 }` once through the raw review action, closes with
  Ctrl+C, and preserves notification/domain assertions.
- [x] Not applicable: add or migrate one representative Image Drop RPC resource-limit flow to
  `createRpcHarness()`. Authoritative `ImageDropRuntime.register()` rejects every non-TUI command at
  line 117 before `runMenu()`, and the existing unsupported-mode test locks that contract. An attempted
  harness integration recorded zero dialogs, proving an RPC script would require the forbidden
  production-mode expansion; the attempt was removed and Stamp remains the consumer RPC proof.
- [x] Compile and run focused Image Drop menu/lifecycle tests, then run
  `npm run check --workspace @narumitw/pi-image-drop`, `npm run check:web`, LSP diagnostics on touched
  TypeScript, and root `npm run check`; verify generated web assets and production source are
  byte-for-byte unchanged. Evidence: all 42 focused tests pass; the 30-file package check/typecheck and
  both web checks pass; LSP reports zero diagnostics; root check passes all 1,937 tests; source,
  generated web assets, package metadata, and lockfile have no diff.
- [x] Audit the Image Drop diff, update this plan with evidence, open a focused PR, and merge only after
  CI passes; verify the merged PR changes tests/plan evidence only and preserves settings,
  persistence, server, browser, and runtime behavior. Evidence: PR #489 merged as `4d014d2` after CI
  and all CodeQL checks passed; its three-file diff is limited to two tests and plan evidence, with no
  production, settings, server/browser, manifest, generated asset, or lockfile change.

### 4. Apply the deletion test and update the roadmap

- [x] Re-run the repository-wide helper inventory after both consumer PRs; verify Stamp and Image Drop
  no longer import `createCustomSelectorHarness()` for the migrated Kit flows and list every remaining
  owner by category. Evidence: neither named consumer has a direct import; 75 references remain in 19
  files across Kit tests, active specialized/standard extension tests, one experiment, one deprecated
  package, and root support, while nine files still use `driveCustomSelector`.
- [x] Not applicable: remove root helper functions, branches, imports, or marker-based Kit automation.
  `selectedKitRow`, the marker probe, `createCustomSelectorHarness`, and `driveCustomSelector` all
  retain direct owners after the named migrations; deleting or reshaping them would broaden this
  milestone into unrelated consumers. The green 1,937-test gates on both migration PRs prove retention
  without manufacturing a cleanup diff.
- [x] Update `docs/roadmaps/pi-tui-kit-roadmap.md` to mark Stamp/Image Drop supported-host adoption
  complete, state the bounded root-support result, keep unrelated consumer migrations and the BTW
  gate explicit, and record the new regression count; verify roadmap claims against merged files and
  test output. Evidence: Phase 3 and its success metric now mark named adoption complete, explicitly
  retain inventoried root owners, keep BTW/release open, record the two-consumer decision, and retain
  the verified 1,937-test regression count.
- [x] Open and merge a cleanup/roadmap PR only when it contains a real independently reviewable
  deletion or canonical roadmap update; verify CI passes and `main` is clean before release preflight.
  Evidence: docs-only PR #490 merged as `db74305` after CI and all CodeQL checks passed; synchronized
  `main` was clean before branch `chore/pi-tui-kit-release-preflight` began.

### 5. Preflight and publish the shared minor release

- [x] Fetch the latest `origin/main`, recompute the previous stable tag and all changed publish roots,
  and verify Pi TUI Kit, Stamp, and Image Drop are selected while BTW is not; if BTW is selected or the
  list differs materially from reviewed evidence, stop and revise the release/BTW sequence before any
  tag is created. Evidence/revision: 11 roots changed, but both pinned-npm simulation and historical
  `v0.41.0` verification show the safe selector fallback publishes all 23 workspaces, including
  unchanged BTW. The sequence is revised above: publish BTW `0.42.0` unchanged and use `0.42.1` only
  after a successful post-release gate.
- [x] Derive the shared minor version with the repository version script in a disposable copy or by
  inspecting the current highest workspace version; verify the expected result is `0.42.0`, package
  versions are not edited in the working tree, and no target `name@version` already exists on npm.
  Evidence: isolated shared clones using repository-pinned npm derive `0.42.0`; all 23 registry queries
  confirm the target is unused, and the working tree retains source version `0.41.0`.
- [x] Harden `.github/workflows/bump-version.yml` and `publish.yml` to install and verify the exact
  `packageManager` npm before lockfile or registry work; verify a red-first repository-script test now
  passes and the preflight simulation runs npm `12.0.2` rather than runner-default npm 11.
- [x] Run `just doctor-all`, verify npm identity, registry, visibility, and current versions for every
  selected workspace, and resolve any scoped-package visibility anomaly before release approval.
  Evidence: all 23 packages are public at `0.41.0` on `https://registry.npmjs.org/` with no visibility
  anomaly. Local npm is intentionally unauthenticated (E401); trusted GitHub OIDC/provenance remains
  the publishing identity and will be verified by the workflow, as in the prior release.
- [x] Run `npm run check` sequentially, dry-pack every selected workspace, inspect each `files` boundary
  and dependency range, and run `just pack-tui-kit`, `just pack-stamp`, and `just pack-image-drop` as
  named evidence; verify no source tests, private files, or bundled Pi peers leak into tarballs.
  Evidence: the workflow-hardening root gate passes 1,938 tests; all 23 selected workspaces dry-pack;
  Kit/Stamp/Image Drop contain 35/9/23 expected files, and all manifests exclude tests, node_modules,
  and private control paths. Named recipes use the same workspace pack commands.
- [x] Install the actual Kit tarball into a disposable non-workspace fixture and verify Node plus strict
  NodeNext TypeScript resolve production and `/testing` imports, menu API version 5, adaptive review,
  exact runtime exports, external Pi peers, and unchanged production compatibility. Evidence: a real
  35-file tarball installation passes strict NodeNext compilation, exact two-root runtime exports,
  API 5, external Pi 0.83 peers, a seven-row adaptive TUI budget, and close-result behavior.
- [ ] Present the exact version, selected package list/order, checks, tarball evidence, and rollback
  status to the user and obtain explicit approval immediately before triggering the irreversible
  release workflow.
- [ ] Dispatch `.github/workflows/bump-version.yml` on `main` with `version_bump=minor`, then verify its
  commit is exactly `chore(release): v<version>`, changes only all shared manifest versions plus the
  lockfile, points the matching tag at that commit, and passes the canonical release-selection tests.
- [ ] Watch the tag-triggered publish workflow through completion and verify its reported package
  order publishes Kit before selected dependents; on failure, inventory already-published versions
  before any retry and recover only missing artifacts.
- [ ] Query npm for every selected `name@version`, install the registry Kit in a fresh fixture, and
  verify both package roots, API version 5, declarations, peer resolution, provenance/visibility, and
  Stamp/Image Drop installability; record registry URLs and immutable versions in this plan.
- [ ] Update the roadmap's published baseline and decision log from API 3/source-only testing to the
  verified registry release, open a documentation-only PR, and merge after link/check validation.

### 6. Rerun the BTW gate against the published Kit

- [ ] Confirm the shared release published unchanged `@narumitw/pi-btw@0.42.0` and that repository BTW
  remains behaviorally identical to `v0.41.0`; reserve unused patch `0.42.1` for a successful
  migration, deriving another unused patch rather than reusing registry bytes if necessary.
- [ ] Add focused characterization tests for editor text captured before custom UI, editor changes
  observed at completion, post-await restoration, root Back versus Ctrl+C Close, initial question
  selection, preview Back restoration, exact text-range state, narrow/large terminal bounds, resize,
  and owner/session replacement; verify all pass on the existing implementation before migration.
- [ ] Build a disposable Kit-backed prototype or test-only adapter for standard BTW choice and adaptive
  review flows, leaving `BtwTextRangeSelector` untouched; verify every admission invariant in the
  Architecture section and record a binary go/no-go decision in the roadmap.
- [ ] If the gate is no-go, mark the migration/publication items below not applicable with the failed
  invariant, retain specialized code unchanged, run root `npm run check`, and complete Phase 3 with a
  durable no-go decision.
- [ ] If the gate is go, create a BTW-only branch, add a bounded runtime dependency on the published
  Kit minor (expected `^0.42.0`), bump BTW alone to unused patch `0.42.1` with
  `just bump @narumitw/pi-btw patch`, run `npm install` to update the lockfile, and verify boundary
  checks accept the library dependency without any extension-to-extension edge.
- [ ] If the gate is go, replace only `BtwMenuSelector` and `BtwBringToMainPreview` ownership with
  declarative choice/adaptive-review flows, preserve the editor wrapper and generation checks across
  every await, and keep exact character/line selection specialized; verify obsolete classes/tests are
  deleted only when no caller remains.
- [ ] If the gate is go, run focused BTW tests, package typecheck/check, LSP diagnostics, root
  `npm run check`, `just pack-btw`, and a timeout-bounded real Pi TUI smoke for editor preservation,
  restored selection, Back, Close, adaptive resize, and bring-to-main completion.
- [ ] If the gate is go, audit and merge the BTW PR after CI, obtain explicit publication approval,
  run `just publish-btw` only if the target version is still absent, and verify the registry package
  depends on the published Kit minor and installs/loads in a disposable Pi environment.
- [ ] Update the roadmap with the final BTW gate result, package publication state when applicable,
  final regression count, and any separately scoped testing-adoption follow-ups for other extensions;
  verify no Phase 4 work is claimed complete.

### 7. Final audit and handoff

- [ ] Audit the complete sequence against this plan, both convention guides, the roadmap, merged PRs,
  tags, GitHub Actions, and npm registry state; verify no unrecorded API expansion, production consumer
  change, helper deletion, package selection, skipped check, or accepted deviation remains.
- [ ] Synchronize local `main` to `origin/main`, verify a clean worktree and all expected merge/release
  commits, archive this fully checked plan under `docs/plans/archived/`, and report PRs, versions,
  registry links, checks, smokes, deletion outcome, and BTW decision.

## Completion Checklist

- [x] Stamp's representative TUI and RPC menu tests use `@narumitw/pi-tui-kit/testing` without changing
  Stamp production source, package metadata, settings behavior, or results.
- [x] Image Drop's representative loader, confirmation, and rejected-input/review tests use the
  supported testing seam without changing production or generated web assets; RPC is explicitly not
  applicable because the command rejects non-TUI modes before opening any dialog.
- [x] Root test-support cleanup is evidence-based: only zero-consumer Kit automation is removed, and
  retained specialized/general fixtures have named owners and follow-up scope. No candidate reached
  zero consumers, so retention is the verified bounded outcome.
- [ ] The shared minor release is canonical, all selected GitHub checks pass, and every selected npm
  package/version is visible and installable with no partial-publication ambiguity.
- [ ] Registry `@narumitw/pi-tui-kit` exposes menu API version 5 plus production and `/testing` roots;
  Node, strict NodeNext TypeScript, tarball contents, and peer resolution pass from a clean fixture.
- [ ] The BTW gate has a durable go/no-go result covering editor preservation, selection restoration,
  exact text selection, adaptive review, Back/Close, cancellation, replacement, and width/height
  bounds; a successful migration is merged and published on a compatible Kit range.
- [ ] The roadmap accurately distinguishes completed test adoption, published Kit state, retained root
  support, BTW outcome, other-extension follow-ups, and still-open Phase 4 work.
- [ ] All focused tests, package checks, LSP diagnostics, root `npm run check`, relevant pack dry runs,
  generated-package/registry smokes, CI checks, release workflows, and npm verification pass or have an
  explicitly accepted, recorded alternative.
- [ ] Every plan task is checked with evidence, the final worktree is clean on synchronized `main`, and
  the plan is archived without overwriting an existing file.
