# pi-tui-kit Consumer Migrations Plan

## Goal

Adopt the agent-level flows added in `@narumitw/pi-tui-kit` through three bounded,
behavior-preserving consumer migrations, then make an evidence-based go/no-go decision for the
`pi-btw` preview. Execute the work as separate PR-ready changes in this order:

1. `pi-usage` uses `runTask()` for abort-aware usage queries.
2. `pi-stamp` uses declarative `input` screens for custom locale and time-zone values.
3. `pi-image-drop` uses declarative `input` and `review` screens for resource-limit editing.
4. `pi-btw` is assessed for a safe `review` migration without changing its interaction contract.

## Context

- `@narumitw/pi-tui-kit@0.41.0` is published with `runTask()`, `input`, and `review`.
- Existing consumers still declare `^0.40.0`. Because zero-major caret ranges are minor-bounded,
  each migrated package must explicitly adopt a range that includes menu API version 3; do not bump
  unrelated consumers.
- `extensions/pi-usage/src/usage.ts` owns `runMenuOperation()`, which repeats TUI/non-TUI mode
  adaptation, `BorderedLoader`, signal composition, cancellation, and error-result mapping.
- `extensions/pi-stamp/src/menu.ts` opens two direct `ctx.ui.input()` loops from an otherwise
  declarative menu. Validation and persistence are already extension-owned.
- `extensions/pi-image-drop/src/menu.ts` owns a custom numeric input while
  `extensions/pi-image-drop/src/runtime.ts` owns the limit draft, validation, save preview, and a
  custom confirmation. The loader and link-rotation confirmation have stricter three-way semantics
  and are not equivalent to the new generic flows.
- `extensions/pi-btw/src/bring-to-main.ts` has an exact, scrollable preview, but callers require
  distinct Bring, Back, and Ctrl+C Close results, terminal-row-adaptive rendering, and preservation
  of Pi's live editor draft. A root `runMenu()` currently reports Back and Close as the same
  `{ kind: "closed" }` result.
- The worktree currently contains unrelated dependency updates produced by `just update`. They must
  be landed separately or isolated in another worktree before any migration commit is prepared.

## Architecture

- `pi-tui-kit` owns mode adaptation, standard component lifecycle, cancellation/disposal draining,
  input draft retention, exact review rendering, and RPC dialog adaptation.
- Each extension continues to own domain validation, mutable draft state, persistence, generation
  checks, success/error copy, and product-specific navigation decisions.
- Consumers import only the package-root API. No extension reaches into `pi-tui-kit/src` or
  `dist/components`.
- Each adopting package updates its own runtime dependency range and lockfile entries. Other package
  ranges remain unchanged so their existing menu API compatibility remains explicit.
- The migrations are independent and ordered as separate PRs. Later work must start from updated
  `main`, not accumulate into one cross-extension diff.
- `pi-image-drop` keeps its cancellable loader and link-rotation confirmation specialized because
  they distinguish Escape cancellation from Ctrl+C Close. Its limit input/review becomes standard,
  while settings publication and future-session semantics remain extension-owned.
- No `pi-tui-kit` public API expansion is allowed during the first three migrations. The `pi-btw`
  gate may recommend a future kit change, but it must not silently add one to this migration wave.

## Non-Goals

- Do not migrate `pi-sync`'s commit-aware loader; it dynamically refuses cancellation after the
  publication boundary, which `runTask()` does not model.
- Do not migrate secret inputs, multi-line editors, live previews, the `pi-btw` transcript composer,
  or its exact text-range selector.
- Do not change settings schemas, paths, defaults, precedence, atomic-write protocols, or unknown
  field preservation.
- Do not enable `pi-image-drop` in RPC, print, or JSON mode; its established command remains TUI-only.
- Do not update all 18 current `pi-tui-kit` consumers merely because a newer library exists.
- Do not publish packages or create/merge PRs as part of plan execution without separate approval.

## Assumptions

- `pi-usage` maps both `runTask()` `cancelled` and `stale` results to its existing `undefined`
  control flow and maps `error` back to a thrown error. It suppresses `runTask()`'s default notifier
  so existing callers remain the sole error reporter.
- `pi-stamp` keeps the current chooser screen id and switches its projection between choices and an
  input screen using per-menu closure state. This preserves the existing stack: a valid custom value
  or Escape returns from the locale/time-zone level to Settings, while Ctrl+C closes the whole menu.
- `pi-image-drop` uses child `limit-input` and `limit-review` screens. Input and review Back return to
  the limits list; Ctrl+C closes the full menu. After a successful save, the review returns to a
  refreshed limits list showing zero unsaved changes. This adds one visible review step compared
  with the old automatic return to Settings, but provides exact post-save state without requiring a
  new multi-pop navigation API.
- The `pi-btw` phase is complete with a documented no-go if its three-way result and editor/viewport
  invariants cannot be preserved through the existing public kit API.

## Risks

- A migrated source package paired with `^0.40.0` can typecheck against the workspace library but
  fail after npm installation. Package metadata, lockfile, and pack output must be verified together.
- Consumer tests resolve `@narumitw/pi-tui-kit` through generated `dist/`; rebuild the kit before
  focused tests when the local package output is stale, even though these migrations should not edit
  kit source.
- `runTask()` reports errors unless given an extension-specific `onError`; careless mapping could
  duplicate `pi-usage` notifications or turn owner replacement into a user cancellation.
- Rejected input must retain the same TUI draft. Reopening `ctx.ui.input()` in a loop would recreate
  the old architecture rather than adopting the screen contract.
- `pi-image-drop` settings publication can finish after session replacement. Every continuation
  after the save await must revalidate the owner before touching draft state or UI; persistence
  itself remains ordered and atomic.
- `extensions/pi-image-drop/src/runtime.ts` is already over 1,000 lines with a lifecycle-cohesion
  justification. The migration should move pure limit projection/parsing into `src/menu.ts` rather
  than grow a second settings owner or expand the runtime further.
- Replacing `BtwBringToMainPreview` without a way to distinguish root Back from Close would regress a
  tested contract. The final gate must prefer deferral over lossy unification.

## Rollback / Recovery

- Keep each extension migration in its own commit/PR so it can be reverted independently.
- No persisted data migration occurs. Reverting restores the previous UI implementation while the
  unchanged settings files remain valid.
- If an adopting package fails its package smoke, revert both its dependency range and corresponding
  lockfile edges; do not leave source importing API version 3 from a version-2-compatible range.
- Delete any temporary `pi-btw` prototype after the go/no-go check. A no-go leaves `pi-btw` source and
  package metadata unchanged and records the missing seam for a future scoped decision.

## pi-btw Gate Result

| Contract | Current owner/evidence | Public `review` fit |
| --- | --- | --- |
| Exact raw draft delivery | `formatBtwBringToMain()` and caller-owned `choice.draft` | Fits; the review action can retain the raw id/content boundary. |
| Terminal-control safety and cell wrapping | `BtwBringToMainPreview`; focused C0/C1, Unicode, and narrow-width tests | Fits through kit sanitization and grapheme/cell hard wrapping. |
| Terminal-row viewport | `BtwBringToMainPreview` derives rows from `tui.terminal.rows` | **Missing:** kit review uses a fixed/default `viewportSize` and never reads terminal rows. |
| Paging and configured keys | Preview tests cover page keys plus configured Bring/Back | Fits for paging and injected confirm/cancel keys. |
| Bring vs Back vs Ctrl+C Close | `BtwBringToMainPreviewAction` has three distinct variants | **Missing:** a root `runMenu()` returns `{ kind: "closed" }` for both Back and Close. |
| Main-editor preservation | `showBtwCustomPreservingEditor()` snapshots/restores around custom UI | Could remain extension-owned, but requires a new wrapper around `runMenu()`. |
| Exact-selector restoration | Caller restores `selectionState` only after preview Back | Blocked by the missing Back/Close result distinction. |

**Decision: no-go for this migration wave.** A disposable package-root harness drove Escape and
Ctrl+C through the same `ReviewScreen`; both returned the identical `{ kind: "closed" }` result.
Source inspection also confirmed `reviewViewportSize()` is fixed and does not observe terminal rows.
Migrating now would weaken tested behavior or require a new kit close-reason/adaptive-viewport API,
which is outside this plan. The disposable harness was deleted after the check, and `pi-btw`
source/package metadata is unchanged.

## Plan

### 0. Isolate prerequisites and establish baselines

- [x] Land the existing `just update` dependency changes in their own PR or move migration work to a
  clean worktree based on current `main`; verify `git status --short` contains no dependency-update
  files before staging a consumer migration. Evidence: migration work started in
  `/home/narumi/.worktrees/pi-extensions-refactor-pi-usage-run-task` at release commit `3e0d145`; its
  initial status contained only this plan, while dependency updates remained in the invoking tree.
- [x] Record the installed and published `pi-tui-kit` version/API evidence with
  `npm view @narumitw/pi-tui-kit version` and a package-root import assertion for
  `PI_EXTENSION_MENU_API_VERSION === 3`; verify consumers will not rely only on a workspace symlink.
  Evidence: npm reported `0.41.0`, and a package-root Node import returned API version `3` after a
  clean `npm ci` in the migration worktree.
- [x] Run `npm run check` on the clean baseline and record the test count; do not begin migration work
  with an unexplained failing gate. Evidence: the pre-migration `just update` gate passed all 1,907
  tests. A linked-worktree rerun reproduced one environment-only Git-runner assertion because Git
  exports its administrative `GIT_DIR` to aliases in linked worktrees; final full gates will run in
  an independent clone rather than accepting that harness artifact.

### 1. PR 1 — migrate `pi-usage` to `runTask()`

- [x] Add focused characterization tests in `extensions/pi-usage/test/usage.test.ts` for successful
  TUI execution, Escape cancellation, owner abort/session shutdown, direct RPC execution, and an
  operation error reported exactly once; verify the tests pass against the current helper before the
  refactor and would fail if cancellation stopped aborting the query. Evidence: 18 focused usage
  tests passed before and after the refactor, including new loader-success and single-error tests;
  existing cancellation/shutdown/RPC tests retain their controlled assertions.
- [x] Update `extensions/pi-usage/package.json` and `package-lock.json` so the package depends on the
  API-version-3-compatible kit range (currently `^0.41.0`); verify the package lock no longer installs
  `pi-tui-kit@0.40.x` beneath `pi-usage` with `npm ls @narumitw/pi-tui-kit --depth=1`. Evidence: the
  usage-local 0.40 lock entry was removed and `npm ls` resolves the workspace 0.41.0 package.
- [x] Replace `runMenuOperation()`'s direct `BorderedLoader`/`ctx.ui.custom()` orchestration with
  package-root `runTask()`, preserving `T | undefined` for completed/cancelled/stale work and
  rethrowing the original error without duplicate notification; verify `BorderedLoader` and
  `LoaderResult` disappear from `extensions/pi-usage/src/usage.ts`. Evidence: the helper now maps all
  four typed task results and supplies a no-op reporter before rethrowing the original error.
- [x] Audit every `runMenuOperation()` caller after the refactor for state captured before awaits,
  generation/model revalidation, parent-signal ownership, and error propagation; verify current,
  another-provider, all-provider, and revalidation paths still use only settled current-session data.
  Evidence: every call retains the menu controller signal; existing stable-current, provider,
  fan-out, shutdown, and model/account revalidation guards run after the awaited helper.
- [ ] Run the pi-usage focused tests, `npm run check --workspace @narumitw/pi-usage`, `npm test`,
  `npm run check`, and `just pack-usage`; inspect the dry-run tarball dependency metadata and record
  any unavailable runtime smoke before marking this PR ready.

### 2. PR 2 — migrate `pi-stamp` custom values to declarative input

- [x] Add red-first menu/component tests in `extensions/pi-stamp/test/menu.test.ts` proving custom
  locale and time-zone rows transition to `input` projections, raw values reach domain validation,
  invalid submissions retain the TUI draft, valid values canonicalize and save once, Escape returns
  to Settings, Ctrl+C closes, owner abort saves nothing, and RPC retries a rejected value. Evidence:
  the initial compile failed because the consumer still exposed only action screens; all seven final
  tests pass, including a real component draft-retry flow and rejected-then-valid RPC flow.
- [x] Update `extensions/pi-stamp/package.json` and `package-lock.json` to the API-version-3-compatible
  kit range; verify `pi-stamp` resolves the intended kit version in `npm ls` and packed metadata.
  Evidence: both report the workspace 0.41.0 kit and no stamp-local 0.40 package remains.
- [x] Refactor `createStampMenu()` so per-menu closure state switches the existing `locale` and
  `time-zone` screen ids between their choice and `input` projections; reset entry mode whenever the
  corresponding chooser is opened so a cancelled input never reopens unexpectedly. Evidence: screen
  resolution and end-to-end navigation tests cover chooser, input, Back, and Close transitions.
- [x] Split the custom-entry actions into navigation and submission actions. Keep
  `canonicalizeLocale()`, `canonicalizeTimeZone()`, warning copy, `savePatch()`, persistence ordering,
  rollback, and unknown-field behavior extension-owned; verify a rejected save retains the draft and
  the previous effective setting. Evidence: the same typed actions distinguish missing navigation
  values from raw submissions, and focused tests prove canonical patch identity and rejection.
- [x] Audit the final stamp diff against `docs/extension-settings.md`: no missing-file read creates a
  file, invalid files remain protected, updates stay serialized/atomic, unknown fields remain
  preserved, and every post-save continuation checks the action signal before notifying or
  transitioning. Evidence: persistence code is unchanged; submissions still use `savePatch()`, which
  checks the action signal before and after `runtime.update()`, and failures return `rejected`.
- [ ] Run stamp focused tests, `npm run check --workspace @narumitw/pi-stamp`, `npm test`,
  `npm run check`, and `just pack-stamp`; inspect dependency and source contents and perform a
  deterministic RPC menu smoke for rejected-then-valid input.

### 3. PR 3 — migrate `pi-image-drop` limits to input and review

- [x] Extend `extensions/pi-image-drop/test/lifecycle.test.ts` and `test/menu.test.ts` with failing
  contract tests for a standard limit input and review: exact current/default/pending copy, raw-value
  and hard-ceiling validation, the per-image-versus-batch cross-field invariant, rejected-draft
  retention, Back versus Ctrl+C, no-change save, cancel-without-save, owner abort, save-failure retry,
  successful patch identity, and a refreshed zero-unsaved-changes limits screen. Evidence: the first
  compile failed on the missing projection/validation exports; 42 final focused lifecycle/menu tests
  pass, including rejected-draft inspection, no-op save, stale-save, and refreshed-state assertions.
- [x] Update `extensions/pi-image-drop/package.json` and `package-lock.json` to the
  API-version-3-compatible kit range; verify standalone installation metadata cannot select
  `pi-tui-kit@0.40.x` for the migrated source. Evidence: the image-local 0.40 lock entry was removed,
  `npm ci` followed by `npm ls` resolves workspace 0.41.0, and the dry-run package has the new range.
- [x] Move pure limit labels, prompt/units, formatting, parsing, hard-ceiling and cross-field
  validation, diff text, patch construction, and screen projection helpers from `src/runtime.ts`
  into extension-owned `src/menu.ts`; verify runtime lifecycle/generation and settings persistence
  remain in `ImageDropRuntime`, and recheck the existing over-1,000-line cohesion justification after
  the move. Evidence: runtime is now 972 lines, menu projection is 367 lines, and no persistence or
  lifecycle owner moved out of `ImageDropRuntime`.
- [x] Add `limit-input` and `limit-review` screen ids and dedicated submit/confirm actions to the
  existing Image Drop menu. Keep the selected limit and draft in the menu invocation, return input
  Back/review Back to the limits list, and preserve Ctrl+C as whole-menu Close through kit-owned
  navigation. Evidence: lifecycle tests drive standard kit components through all transitions.
- [x] On valid input, update only the in-memory draft and return to the limits list; on review confirm,
  publish exactly `limitSettingsPatch()`, revalidate generation/signal after the await, then advance
  `loadedSettings`, `originalLimits`, and `limitDraft` together so the reopened limits screen shows
  no pending changes. Verify failed or stale publication cannot update UI or in-memory committed
  state. Evidence: focused tests assert exact patches, zero unsaved state after success, retry after
  failure, and no stale state/UI publication after replacement during a pending save.
- [x] Remove `showImageDropInputDialog`, `InputDialogResult`, the `showInput` runtime dependency, and
  superseded component tests/imports. Retain `runImageDropMenuLoad()` and
  `showImageDropConfirmDialog()` for their distinct loader and link-rotation three-way contracts;
  verify those existing cancellation/close tests remain unchanged and pass. Evidence: repository
  search finds no removed symbol, while all specialized loader/confirmation tests pass.
- [x] Update `extensions/pi-image-drop/README.md` so command-menu, settings, and package-layout text
  identify limit input/review as standard kit flows while loaders and link-rotation confirmation stay
  specialized; preserve the documented TUI-only command and future-session settings behavior.
  Evidence: the command-menu and package-layout sections now state that ownership split explicitly.
- [x] Audit settings concurrency and lifecycle end to end: invalid-file protection, latest-document
  writes, unknown fields, atomic publication, invocation ordering, failure recovery, session
  replacement, component disposal, and shutdown. Verify every post-await continuation uses the
  original menu generation/signal and no stale `ExtensionContext` is touched. Evidence: settings
  storage code is unchanged; both automatic-start and limit-save continuations now check their action
  signal and captured generation before state/UI, and the replacement-during-save test passes.
- [ ] Run Image Drop focused lifecycle/menu tests, its web-asset check,
  `npm run check --workspace @narumitw/pi-image-drop`, `npm test`, `npm run check`, and
  `just pack-image-drop`; inspect the tarball and run an automated TUI-host smoke because repository
  rules prohibit opening an interactive TUI.

### 4. Gate — assess `pi-btw` preview against `review`

- [x] Write a contract matrix from `extensions/pi-btw/src/bring-to-main.ts`,
  `extensions/pi-btw/src/btw.ts`, and `extensions/pi-btw/test/side-thread.test.ts` covering exact raw
  draft delivery, terminal-control escaping, grapheme/cell wrapping, terminal-row viewport sizing,
  paging, configured confirm/back keys, Ctrl+C Close, editor-text preservation, and restored
  selection state; verify every current behavior has an explicit proposed owner. Evidence: the
  matrix above maps all eight contracts and identifies the two missing public-kit seams.
- [x] Test the existing package-root `runMenu()`/`ReviewScreen` interface against that matrix with a
  disposable local prototype or compile-time harness. Mark the gate **go** only if Bring, Back, and
  Close remain distinct and editor/viewport invariants survive without a new kit API or broad
  `chooseBringToMain()` rewrite; otherwise delete the prototype and record a no-go with the exact
  missing seam. Evidence: `node node_modules/.cache/pi-btw-review-gate.mjs` passed an assertion that
  root Escape and Ctrl+C both return `{ kind: "closed" }`; source inspection proves fixed viewport
  sizing, so the gate is no-go.
- [x] If the gate is go, draft a separate implementation plan/PR boundary that adds the dependency,
  replaces only `BtwBringToMainPreview`, maps its regression tests to the public review contract, and
  runs `just pack-btw`. If it is no-go, leave `pi-btw` source/package metadata unchanged and record
  whether a future close-reason or adaptive-viewport contract would justify kit work. Evidence:
  `pi-btw` has no diff or new dependency; a future plan must first decide whether kit should expose a
  close reason and terminal-adaptive viewport.

### 5. Cross-PR audit and handoff

- [ ] For each migration diff, audit TUI versus RPC/unsupported modes, user cancellation, component
  disposal, session replacement, shutdown, post-await state use, package-root imports, metadata, and
  source-file size against `docs/extension-conventions.md`; record deviations or unavailable smokes
  in that PR's handoff.
- [ ] Verify each adopting extension has a compatible kit range while every non-adopting consumer's
  range is untouched; use manifest diffs, lockfile inspection, `npm ls`, and each package dry run as
  evidence.
- [ ] Confirm the three implementation PRs remain independently revertible and the `pi-btw` decision
  is finite. Do not combine unrelated dependency updates, generated artifacts, or deferred kit API
  work into a migration commit.

## Completion Checklist

- [ ] `pi-usage` delegates generic task lifecycle policy to `runTask()` with unchanged query,
  cancellation, stale-session, and error-reporting behavior.
- [ ] `pi-stamp` custom locale/time-zone entry uses declarative input while preserving canonical
  validation, rejected drafts, settings safety, navigation, TUI focus, and RPC behavior.
- [ ] `pi-image-drop` limit editing uses standard input/review screens while preserving draft-only
  edits, exact save patches, future-session semantics, failure recovery, and three-way specialized
  flows outside the limits workflow.
- [ ] The `pi-btw` review migration has an evidence-backed go/no-go result; no interaction invariant
  is silently weakened.
- [ ] Only adopting packages require menu API version 3, and their manifests, lockfile edges, tests,
  and dry-run tarballs agree on the dependency contract.
- [ ] Focused tests, package checks, root `npm test`, root `npm run check`, applicable deterministic
  smokes, and `just pack-*` checks pass for every completed migration, with any accepted unverified
  path documented.
- [ ] Guides read and audited in each handoff: `docs/extension-conventions.md` and, for Stamp and
  Image Drop, `docs/extension-settings.md`; touched UI, lifecycle, settings, package, documentation,
  and verification areas have no unexplained MUST-rule deviation.
