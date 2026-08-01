# Pi TUI Kit Semantic Interaction Driver Plan

## Goal

Qualify and, only if the deletion test passes, introduce one internal semantic interaction driver for
`@narumitw/pi-tui-kit`. The driver must concentrate action lookup, disabled/mismatched interaction
rejection, action invocation, composed cancellation, accepted/rejected results, stale checks, error
routing, and returned transitions that are currently coordinated separately by TUI and RPC runtime
branches.

This is a behavior-preserving internal refactor. Public screen definitions, exports, menu API version
5, TUI rendering and pending-component cadence, RPC dialog cadence, navigator behavior, package
metadata, and every consumer remain unchanged.

## Context

- `packages/pi-tui-kit/src/runtime.ts` is 773 authored lines and has changed for every recent screen or
  lifecycle addition. It owns both adapters, state loading, screen-specific action lookup, signal
  composition, action execution, stale/error handling, and navigator application.
- TUI currently resolves settings, multi-select, and input actions in component callbacks, then
  separately resolves choice, review, action, and pinned multi-select activation after the component
  closes. RPC independently resolves each of those screen kinds after each dialog response.
- `invokeAction()` and `activateActionItem()` already concentrate part of the policy. A useful driver
  must deepen that seam by deleting mode-specific action-resolution knowledge; moving the same switch
  into another file or wrapping existing calls without deletion is a no-go.
- The current package has seven screen kinds and 28 focused runtime tests. The roadmap requires a
  complete TUI/RPC behavior matrix before admitting the driver.
- Guides read before planning: `MEMORY.md`, `docs/extension-conventions.md`, the complete Pi
  `extensions.md`, `tui.md`, `rpc.md`, and `packages.md`, the canonical roadmap and linked archived
  Kit plans, package runtime/types/components, runtime tests, and repository test support. Applicable
  MUST areas are TUI-only custom UI, public callback inputs, mode-safe RPC dialogs, cancellation and
  disposal, post-await stale checks, deterministic tests, package boundaries, the root check, and a
  pack dry run. Settings guidance is not applicable because no settings behavior is touched.

## Architecture

Add one package-internal `src/interaction.ts` module if qualification passes.

The module accepts a resolved screen plus one semantic intent:

- activate an action/choice/review confirmation or pinned multi-select action by raw item id;
- change one settings value;
- toggle one multi-select item; or
- submit one input value.

It owns:

- validating that the intent fits the screen kind;
- resolving raw ids to enabled items and action handlers;
- mapping `value` and `selected` into the existing action context;
- composing an optional screen-owned signal with the menu-owner signal;
- ordinary and busy action execution;
- accepted/rejected/stale classification, action error reporting, and returned transition semantics;
  and
- revalidating owner state after every await it owns.

The TUI adapter retains component creation/disposal, pending-work draining, raw screen events,
selection memory, and conversion of accepted component callbacks into component closure. The RPC
adapter retains dialog titles/options, pagination, response cadence, and cancellation flattening.
`runtime.ts` retains state loading, the navigator, and application of the driver's returned
transition because those operations define the outer menu loop rather than one interaction.

No production or test module outside this package may import the internal driver. No new public type,
export, dependency, screen field, or API-version change is allowed.

### Admission and deletion gate

Admit implementation only if the final structure:

1. gives both TUI and RPC the same action-resolution entry point for every actionable screen kind;
2. removes their duplicated handler lookup, disabled checks, input mapping, signal composition, and
   action-result interpretation;
3. leaves presentation and component/dialog lifecycle mode-owned;
4. reduces `runtime.ts` materially without increasing total action-coordination complexity or adding a
   pass-through facade; and
5. keeps the full behavior matrix byte/result/cadence compatible.

If those conditions cannot be met, record a finite no-go in this plan and the roadmap without adding
`interaction.ts`.

## Qualification Evidence

### Seven-screen TUI/RPC behavior matrix

| Screen | TUI semantic interaction and cadence | RPC semantic interaction and cadence | Rejection / transition / evidence |
| --- | --- | --- | --- |
| `actions` | A component activation carries the raw item id after the custom component closes; `to` and `close` items do not invoke a handler. | One flat `select()` response maps its unique display label back to the indexed raw item. Busy labels do not open TUI. | Missing/disabled items stay; action results supply the transition. Covered by `runMenu navigates…`, `TUI action Close…`, and `RPC uses dialog adaptation…`. |
| `detail` | No action exists. Escape applies the screen hint; Ctrl+C closes. | A selected exit row applies the hint, while an undefined generic `select()` cancellation remains Back. | Always non-actionable. Covered by `TUI root Back…` and `RPC preserves generic Back…`. |
| `choice` | Activation carries the selected raw id after current/initial/remembered cursor handling. | A unique label maps back to the raw item id; duplicate and disabled labels remain deterministic. | Disabled/missing rows stay; accepted/rejected action transitions are preserved. Covered by the five choice runtime tests. |
| `settings` | A value change invokes the item's action inside the open component with a screen-owned signal; the component serializes, rolls back rejection, and closes only after an accepted transition settles. | Selecting a row cycles directly to its next configured value and invokes the same raw item/action; no value subdialog opens. | Disabled/missing rows stay. TUI coverage is in the three settings runtime tests and component queue tests; cross-mode raw payload coverage is added before extraction. |
| `input` | Submit sends raw `{ itemId: "input", value }` through a screen-owned signal; rejection keeps the same draft/component. | `input()` sends the raw value through the menu signal and reopens after rejection. Undefined applies the screen hint. | Stale closes the component and returns stale; accepted transition closes it. Covered by all seven `input-screen.test.ts` cases. |
| `review` | Only the declared confirmation raw id activates; scrolling and Back/Close remain component-owned. | Bounded pages loop through `select()`; Previous/Next stay in the adapter and only Confirm invokes the action. Undefined/exit applies the hint. | Missing confirmation stays non-actionable; rejection keeps the current page. Covered by review TUI/RPC confirmation, pagination, cancellation, and owner-abort tests. |
| `multiSelect` | Toggle sends raw id plus the next selected boolean through a screen-owned signal while optimistic state/pending queues remain component-owned. Pinned action activation resolves after component closure. | The full unfiltered dialog maps item rows to toggles and pinned rows to action items. | Disabled rows stay; rejected toggles roll back by raw id; action/toggle transitions are unchanged. Covered by searchable/raw-id, disabled RPC, pinned-action, rollback, and pending-drain tests. |

Shared lifecycle rows are already characterized independently: owner abort during state load, idle TUI,
RPC dialog, ordinary action, choice action, settings action, and busy action; stale continuation;
component disposal and drain; rejecting error reporters; Back/Close; unsupported modes; and shutdown-
equivalent owner replacement. The pre-refactor cross-mode characterization will close the remaining
single-test gap for settings and one-table raw payload comparison without replacing these tests.

### Admission result: go

The concrete extraction passes the pre-edit deletion gate. One internal coordinator can replace the
TUI action-resolution blocks currently at runtime lines 97–148 and 167–208 plus the RPC resolution
blocks at lines 516–585 and the input/review invocation fragments, while reusing and moving the
existing action/busy/stale/error helpers. TUI component lifecycle, optimistic state, and selection
memory remain outside; RPC dialogs and review paging remain outside. The expected result is one
screen/intent resolution switch instead of two mode-specific switches, a material runtime reduction,
and no new caller or public interface. Rollback is one internal module plus its runtime wiring.

## Non-Goals

- Do not add standalone confirmation, deferred multi-select, catalog, editor, wizard, or another
  screen kind.
- Do not change TUI frames, keybindings, focus, review sizing, RPC labels/pages, dialog count, Back or
  Close results, state reload frequency, selection restoration, action payloads, or error wording.
- Do not merge TUI and RPC presentation adapters or claim presentation parity Pi cannot expose.
- Do not modify extension source, settings, manifests, lockfile, generated `dist/`, package versions,
  release workflows, or npm state.
- Do not split files merely to reduce line counts, introduce a class hierarchy, or add a public
  runtime-driver abstraction.

## Assumptions

- The existing public `MenuActionHandler` and `MenuTransition` contracts are sufficient; qualification
  should not discover a need for a public API change.
- Selection memory remains TUI-only because RPC clients own their own cursor/dialog presentation.
- Component callbacks must still receive an accepted transition before the TUI screen closes, while
  RPC can apply the same transition directly after a dialog settles.

## Risks

- A generic intent union could hide important screen differences. Mitigation: keep four explicit
  semantic intent variants and reject intent/screen mismatches deterministically.
- Moving signal composition could change whether screen disposal is rejection or whole-menu stale.
  Mitigation: characterize menu-owner and screen-owner abort independently before moving code.
- Busy actions intentionally treat user cancellation as rejected/stay rather than stale. Mitigation:
  keep that policy in the driver and preserve existing task regressions.
- A broad test rewrite could merely follow the refactor. Mitigation: add behavior-matrix
  characterization before production edits and retain all existing runtime assertions unchanged.
- The module could become a shallow indirection. Mitigation: compare before/after line ownership,
  call-site knowledge, and net action-routing code; reject the extraction if the deletion test fails.

## Rollback / Recovery

There is no persisted data or public API migration. Keep characterization tests independently useful.
Before merge, reverting the internal module and runtime wiring restores the old implementation. If a
regression appears after merge, revert the focused refactor without changing package or consumer
versions. Do not retain parallel old/new action-resolution paths.

## Plan

### 1. Baseline and qualification

- [x] Install the clean linked worktree with the repository-pinned npm, run the Kit workspace check,
  compile tests, and run all focused Kit tests; record runtime/test counts and verify the branch has
  only this plan before characterization work. Evidence: npm 12.0.2 performed a clean install; the Kit
  check/build passed; test compilation and 113/113 Kit tests passed. Baseline is 3,516 Kit source
  lines, 773 runtime lines, 28 runtime tests, and nine Kit test files; only this plan is untracked.
- [x] Write a complete behavior matrix in this plan for all seven screen kinds across TUI and RPC,
  covering semantic intent, raw payload, action/transition owner, rejection, mode-specific cadence,
  Back/Close, and non-action screens; verify each cell against source and an existing or newly named
  test. Evidence: the Qualification Evidence matrix maps every screen to exact runtime/component test
  owners and identifies only cross-mode settings/raw-payload consolidation for characterization.
- [x] Apply the admission/deletion gate to a concrete before/after ownership sketch. Record go/no-go,
  the exact duplicated branches expected to disappear, mode-specific policy that must remain, and a
  bounded rollback shape before editing production source. Evidence: the gate is go; the recorded
  line ranges contain duplicated action resolution, while TUI component lifecycle and RPC dialog
  cadence remain mode-owned and rollback is limited to one internal module plus runtime wiring.

### 2. Characterize the shared contract

- [x] Add focused pre-refactor runtime characterization proving TUI and RPC deliver identical raw
  action payloads and transitions for actions, settings, choice, multi-select toggles/actions, input,
  and review confirmation while detail remains non-actionable; verify it passes against the current
  runtime and fails if action lookup or payload mapping is deliberately perturbed. Evidence: the new
  seven-screen matrix test passes both modes for eight actionable/non-actionable cases and exact
  `itemId`/`value`/`selected` payloads; changing the initial settings key or input payload produced the
  expected focused failures before correction.
- [x] Add or identify focused pre-refactor coverage for rejected/disabled/mismatched interactions,
  thrown and reported errors, user cancellation, component disposal, screen-owner abort, menu-owner
  abort, `isCurrent()` failure, session replacement, and busy-action cancellation/draining; close any
  behavior-matrix gap before extraction. Evidence: a new two-mode ordinary-action error test proves
  report-once and retry/exit behavior; existing choice/input/settings/multi-select rejection and
  disabled tests plus runtime owner-abort, stale, disposal, drain, and busy-action tests cover every
  externally reachable path. Intent/screen mismatch is not externally constructible and will be
  checked directly at the new internal seam.

### 3. Implement the admitted internal driver

- [x] Add `packages/pi-tui-kit/src/interaction.ts` with the four bounded semantic intent variants and
  one internal invocation entry point; move existing action invocation, busy action, stale checking,
  error routing, and result classification into that owner without adding a production export.
  Evidence: the 285-line internal module owns activate/setting/multi-select/input resolution, composed
  signals, ordinary/busy actions, stale/error classification, and transitions; package-root exports
  and API version 5 are unchanged.
- [x] Rewire the TUI runtime to translate component callbacks/events into semantic intents while
  retaining component disposal, pending drains, selection memory, and screen closure cadence; verify
  focused TUI tests after the change. Evidence: TUI now has one `interact()` adapter; all component
  lifecycle remains in `showTuiScreen()`, and the 116-test Kit suite passes its matrix, close-reason,
  selection, rejection, disposal, drain, owner-abort, stale, and busy-action cases.
- [x] Rewire the RPC runtime to translate dialog responses into the same semantic intents while
  retaining titles, unique labels, pagination, cancellation flattening, and dialog cadence; verify
  focused RPC tests after the change. Evidence: dialog rows now carry semantic intents, while input
  and review retain their dedicated dialog loops; all strict identity, unfiltered multi-select,
  pagination, cancellation, and abort tests pass.
- [x] Remove the superseded runtime action-resolution helpers and branches, then apply the deletion
  test using source diff, runtime/driver line counts, import graph, and repository search; reject or
  simplify any layer that merely forwards the same knowledge. Evidence: `runtime.ts` falls from 773
  to 526 lines (32%); the driver is 285 lines and total Kit source grows only 38 lines while adding one
  owner. Repository search finds `definition.actions`, action disabled checks, and interaction signal
  composition only in `interaction.ts`; runtime retains disabled text solely for RPC presentation.
  The direct internal test proves mismatched, missing, and disabled intents never invoke actions.

### 4. Verification and roadmap evidence

- [x] Run LSP diagnostics on every touched TypeScript file and
  `npm run check --workspace @narumitw/pi-tui-kit`; verify strict NodeNext types, Biome, generated
  package output, and all focused Kit tests. Evidence: Biome LSP reports zero findings on all four
  touched TypeScript files; the 34-file Kit check/typecheck/build passes; all 116 Kit tests pass.
- [x] Run timeout-bounded generated-package TUI and strict RPC smokes covering one accepted action,
  one rejected retry, Back, Close, owner abort, and zero cross-mode custom-UI calls; compare observed
  results/dialog cadence with the pre-refactor contract. Evidence: the 30-second package-root smoke
  passed rejected-then-accepted input, distinct TUI Back/Close, TUI/RPC owner abort, strict RPC Back
  and hint-driven Close, and the RPC harness custom trap.
- [x] Run `npm test` and then `npm run check` sequentially after the shared Kit build; verify every
  repository test passes without a build race. Evidence: the linked worktree reproduced its documented
  Git-admin `GIT_DIR` alias limitation, so an independent clone of the identical rebased tree ran the
  commands sequentially; both passed 1,930/1,930 tests with zero failures, cancellations, skips, or
  todos, and every CI-equivalent gate passed.
- [x] Run `just pack-tui-kit`, inspect the tarball and generated declarations/exports, and verify no
  internal driver type or new package content crosses the public boundary. Evidence: the 37-file pack
  contains the built internal driver but no source/tests/dependencies; a clean tarball fixture exposes
  exactly the unchanged production root and two testing factories, reports API 5, and rejects the
  unexported `/interaction` subpath with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- [x] Update `docs/roadmaps/pi-tui-kit-roadmap.md` with the Phase 4 driver go/no-go, actual runtime line
  count, behavior-matrix evidence, checks, and retained standalone-confirmation/deferred-multi-select
  status; do not claim unrelated Phase 4 milestones. Evidence: Phase 4 is accurately in progress with
  only the driver checked; the roadmap records 526 runtime/285 driver lines, the internal ownership
  boundary, the 1,930-test gate, and both still-open qualification milestones.
- [x] Audit the final diff against this plan, `docs/extension-conventions.md`, and the roadmap; verify
  public API/version, TUI/RPC cadence, lifecycle ownership, consumers, package metadata, settings,
  generated artifacts, and release state are unchanged, then open a focused PR and require green CI
  and CodeQL before merge. Evidence: PR #500 changed exactly this plan, the roadmap, runtime/driver,
  and their tests; no export, API, manifest, lockfile, consumer, settings, or release file changed.
  CI and all three CodeQL checks passed before merge commit `ed3c980`.
- [x] After merge, synchronize a clean worktree to `origin/main`, record the merge commit and checks,
  mark every task with evidence, archive this completed plan under `docs/plans/archived/`, and merge a
  final documentation PR. Evidence: the dedicated worktree synchronized cleanly to `origin/main` at
  `ed3c980`; every task is evidenced, and this plan is moved to its unused canonical archive path in
  the final documentation branch for green-check merge.

## Completion Checklist

- [x] The admission decision is backed by a complete seven-screen TUI/RPC behavior matrix and an
  explicit deletion test.
- [x] Both adapters use one internal semantic interaction entry point and no parallel
  action-resolution path remains.
- [x] Public exports, API version 5, screen definitions, TUI output/cadence, RPC dialogs/pagination,
  raw action payloads, transitions, lifecycle outcomes, and consumers remain compatible.
- [x] Focused matrix/lifecycle tests, Kit checks, LSP diagnostics, generated-package smokes, root tests,
  root CI-equivalent checks, pack inspection, CI, and CodeQL pass with no unrecorded skip.
- [x] The roadmap records only the proven Phase 4 result; the dedicated handoff worktree synchronized
  cleanly to merged `main`, and the fully evidenced plan is archived without replacing another file.
