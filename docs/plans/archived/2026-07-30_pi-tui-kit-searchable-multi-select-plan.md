# Pi TUI Kit Searchable Multi-Select Plan

## Goal

After the two-consumer qualification gate passes, add an optional searchable mode to
`@narumitw/pi-tui-kit`'s existing `multiSelect` screen and prove it through behavior-preserving
migrations of Plan-mode tool selection and Subagents agent-tool configuration.

## Context

- `MultiSelectScreen` currently provides bounded optimistic toggles, pinned action rows, serialized
  action execution, rollback, cursor restoration, disabled explanations, paging, Back/Close, and
  TUI/RPC adaptation.
- `extensions/pi-plan-mode/src/plan-mode.ts` can project every installed Pi tool into `/plan tools`.
  Toggling applies immediately to session-owned Plan-mode state and persists the selected names in the
  active Pi session.
- `extensions/pi-subagents/src/config-ui.ts` can project every available or previously configured tool
  into an agent-specific draft. It must not write `pi-subagents.json` until **Save changes**, and
  Escape/Discard must leave the settings document unchanged.
- The two consumers intentionally have different persistence timing. The shared contract is limited
  to filtering and stable row identity; immediate application, draft ownership, validation,
  persistence, and rollback remain consumer- or runtime-owned.
- Pi 0.83.0 publicly exports `Input` and `fuzzyFilter`. A component containing `Input` must implement
  `Focusable`, forward focus for IME positioning, sanitize pasted controls before filtering/rendering,
  and stay within the supplied width.
- RPC `select` requests expose a flat option array and no server-side incremental query event. The
  searchable option therefore affects TUI presentation only; RPC continues to expose every row with
  stable identity and disabled semantics.
- `packages/pi-tui-kit/src/screen-components.ts` is 851 authored lines. Search state and rendering
  would create a clear multi-select responsibility boundary and likely push the file through the
  repository's 1,000-line review threshold.

## Architecture

### Public contract

Subject to the qualification/API-version decision, use this bounded additive shape:

```ts
interface MenuMultiSelectItem {
  id: string;
  label: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  disabledReason?: string;
  searchText?: string;
}

interface MultiSelectScreen<ScreenId extends string, ActionId extends string> {
  kind: "multiSelect";
  // Existing fields remain unchanged.
  enableSearch?: boolean;
}
```

- `enableSearch` defaults to `false`, preserving existing rendering, key handling, and source
  compatibility.
- Search matches the sanitized display label plus optional declarative `searchText`. It does not use
  raw IDs or renderer callbacks and never renders `searchText`.
- The query is screen-instance state and resets when the screen is recreated. The selected raw ID is
  retained when still visible; filtering away the selected row moves to the first visible toggle or
  pinned action, and clearing the query restores a valid remembered row deterministically.
- Toggle rows are filtered; `screen.actions` remain visible and keep their declared order so Save,
  Discard, bulk actions, and Done routes do not disappear behind a query.
- Empty source and no-match states are distinct. A no-match screen can still activate pinned actions.
- Filtering never changes `selected`, `committedSelected`, revisions, or pending action order. A
  queued toggle settles against its raw item ID even if the query later hides that row; Back/Close
  still waits for owned pending work.
- Navigation and paging operate over the currently visible toggle rows plus pinned action rows.
  Enter/Space continues toggling or activating the selected row; other input is forwarded to the
  search `Input` only when search is enabled.
- TUI search forwards `Focusable.focused`, rebuilds themed content on invalidation, sanitizes pasted
  C0/C1 controls, and bounds every rendered line. RPC ignores the visual filter and presents the full
  unique row list.

### Internal boundaries

Before adding search behavior, extract the multi-select adapter from the growing component module:

- keep `createMenuScreenComponent()` and existing import compatibility in
  `src/screen-components.ts`;
- move shared internal component contracts, frame/hint rendering, and terminal-safe helpers to a
  cohesive internal module while re-exporting the symbols currently imported by `runtime.ts` and
  tests;
- move multi-select state, rendering, pending-queue, and search behavior to a dedicated internal
  module;
- keep public exports unchanged except for the admitted optional fields.

The extraction is behavior-preserving and must stay green before the first search behavior is added.

### Consumer ownership

- Plan mode continues owning tool policy, active-tool application, session state, lifecycle restore,
  and required tool membership.
- Subagents continues owning agent discovery, one-save drafts, unknown-field preservation,
  malformed-file protection, mutation locking, atomic publication, and notifications.
- Neither consumer passes callbacks, TUI instances, custom matchers, persistence functions, or
  lifecycle state through the declarative screen model.

## Non-Goals

- Add a new `catalog` screen or make `actions`/`choice` searchable.
- Add regex syntax, asynchronous refresh, remote search, scope tabs, sorting callbacks, or custom
  renderers.
- Filter RPC options server-side or add a new RPC protocol.
- Change Plan-mode settings schema, default tool policy, command routes, or implementation handoff.
- Change Subagents settings schema, workflow tools, agent discovery, save timing, lock protocol, or
  reload behavior.
- Add search to every existing multi-select consumer in the same rollout.
- Publish packages, bump versions manually, merge a pull request, or release as part of execution.

## Assumptions

- `docs/plans/2026-07-30_pi-tui-kit-next-capabilities-qualification-plan.md` admits searchable
  multi-select with `pi-plan-mode` and `pi-subagents` as compatible consumers before implementation
  starts.
- Search over installed tool names and declared descriptions/source text is useful at realistic tool
  counts and does not require asynchronous discovery inside the screen.
- Pinned action rows remain available during filtering, which preserves the Subagents draft workflow
  without adding a keyboard shortcut API.

## Risks

- Printable search input competes with Space-as-toggle and any consumer documentation that implies a
  single-letter action shortcut. Establish the exact baseline first and update only inaccurate touched
  UI guidance rather than adding an undocumented shortcut contract.
- Rebuilding a filtered row array can lose cursor identity or route an activation to the wrong raw
  item. Derive actions from stable IDs and test duplicate labels plus changing filters.
- A pending optimistic toggle can settle after its row is filtered out. Keep revision and committed
  state keyed by raw ID independently of visible rows.
- Pinned Save/Discard rows can become unreachable or unexpectedly selected after no-match filtering.
  Define and test visible-row navigation and no-match fallback before implementation.
- Reusing the settings search implementation mechanically could inherit its different immediate-save
  and row-layout assumptions. Share only safe primitives, not settings state semantics.
- A source split can obscure behavior changes. Land or verify the behavior-preserving extraction while
  all focused tests are green, then start red/green search increments.

## Rollback / Recovery

- The public change is optional and has no persisted-data migration. Reverting `enableSearch` and
  `searchText` restores the previous UI while all raw tool selections remain readable.
- Revert either consumer's opt-in independently if its interaction regresses; the library remains
  backward compatible with non-searchable multi-select definitions.
- A failed toggle or save follows the existing rollback path. Search state must never become a source
  of truth for committed selection.
- If the qualification gate fails, mark implementation and migration items not applicable, record the
  deferral in the roadmap, and archive the completed qualification-only plan without changing package
  source.

## Implementation Record

- Qualification admitted Plan mode and Subagents. Catalog and contextual decision remained deferred
  because neither passed an independent two-consumer gate.
- `PI_EXTENSION_MENU_API_VERSION` remains `2`; `enableSearch` and `searchText` are optional and older
  version-2 runtimes degrade to the existing full unfiltered screen.
- The behavior-preserving extraction reduced `screen-components.ts` from 851 to 572 lines and placed
  multi-select behavior in a 259-line internal module, with separate shared contracts and rendering
  helpers.
- TDD red evidence:
  - the README/type fixture first failed with TS2353 for missing `searchText`;
  - four focused component tests failed because filtering, no-match, focus, and hidden rollback did
    not exist;
  - the Plan-mode proof initially retained `custom` because metadata search was absent;
  - the Subagents proof stopped on the unfiltered tool screen before Save/Discard assertions.
- The final contract uses public Pi `Input` and `fuzzyFilter`, filters toggle rows only, pins action
  rows, preserves stable raw IDs and pending maps, forwards focus, sanitizes pasted controls, and
  leaves RPC unfiltered.
- Plan mode retains immediate session-owned activation and restore behavior. Subagents retains its
  one-save draft, malformed-file protection, unavailable names, unknown fields, mutation lock, and
  atomic publication; Save, Discard, and Escape are covered independently.

## Plan

### Qualification and baseline

- [x] Complete `docs/plans/2026-07-30_pi-tui-kit-next-capabilities-qualification-plan.md` and record
      that Plan-mode and Subagents satisfy the two-consumer gate for the bounded contract above;
      verify the roadmap names both consumers and no consumer-specific hook.
- [x] Audit the current `/plan tools` and Subagents agent-tool flows against their README and tests,
      including query-key conflicts, pinned Save/Discard rows, immediate versus draft persistence,
      Escape/Ctrl+C, TUI/RPC fallback, session replacement, and shutdown; record any pre-existing
      documentation mismatch before changing behavior.
- [x] Establish a green baseline by building test output and running the absolute compiled tests under
      `node_modules/.cache/pi-extensions-test/` for
      `packages/pi-tui-kit/test/{menu-model,screen-components,runtime}.test.js` plus the compiled
      `packages/pi-tui-kit/test/readme-usage.js` fixture,
      `extensions/pi-plan-mode/test/{default-tools,subagent-allowlist}.test.js`, and
      `extensions/pi-subagents/test/subagents.test.js`; record test counts and commands as evidence.
- [x] Inspect Pi 0.83.0 root exports and declarations for `Input`, `Focusable`, and `fuzzyFilter`, then
      decide whether optional search fields change `PI_EXTENSION_MENU_API_VERSION`; verify the plan and
      roadmap record the decision and package source needs no private `dist/*` import.

### Internal extraction

- [x] Extract shared internal component contracts/rendering helpers and the multi-select adapter from
      `packages/pi-tui-kit/src/screen-components.ts` without changing public exports or behavior;
      verify the pre-existing kit component/runtime tests pass before adding search cases and every
      authored source file remains below the review threshold.
- [x] Run `npm run check --workspace @narumitw/pi-tui-kit` after the extraction and inspect the built
      `dist/` diff; verify it contains only equivalent generated structure and no search API yet.

### Search contract and kit behavior

- [x] Add focused failing type/model and README-usage fixtures for `enableSearch`, item `searchText`,
      default-off compatibility, duplicate display labels with unique raw IDs, and unchanged existing
      definitions; verify the red state fails because the optional contract is absent.
- [x] Add the admitted optional fields to `packages/pi-tui-kit/src/types.ts`, exports/declarations as
      applicable, and model validation only where runtime-invalid values exist; verify the focused
      model and compile-time usage fixtures pass without casts.
- [x] Add focused failing component tests for label/searchText fuzzy matching, CJK/emoji, bracketed
      paste and C0/C1 sanitization, IME focus forwarding, empty/no-match states, width/resize,
      duplicate labels, disabled rows, selected-ID restoration, clearing a query, paging, custom
      keybindings, and default-off output; verify each red case fails for missing search behavior.
- [x] Add focused failing component tests for pinned action visibility and ordering, no-match action
      activation, optimistic toggles hidden during pending work, rejection rollback, serialized rapid
      toggles, Back/Close waiting, disposal, and stale transition suppression; verify the red state
      isolates filtering from existing queue semantics.
- [x] Implement searchable multi-select in the extracted adapter using public `Input` and
      `fuzzyFilter`, stable-ID state maps, pinned action rows, focus forwarding, final-boundary display
      sanitization, and visible-row navigation; verify all focused component tests pass at narrow and
      representative widths.
- [x] Add runtime tests proving TUI passes raw IDs after filtering and remains stale-safe across owner
      abort/disposal/session replacement, while RPC exposes the full unique unfiltered list with
      disabled rows and unchanged toggle semantics; verify the focused runtime suite passes.
- [x] Update `packages/pi-tui-kit/README.md` and `test/readme-usage.ts` with the optional search
      contract, search corpus, pinned-action behavior, TUI/RPC difference, API-version decision, and
      ownership boundary; verify examples compile and no text claims search for screens that do not
      support it.

### Proof migration: Plan mode

- [x] Add failing Plan-mode regressions in `extensions/pi-plan-mode/test/default-tools.test.ts` for
      searching by tool name and declared metadata, toggling the intended raw tool, clearing the
      query, blocked rows, cursor stability, Escape, and session-state persistence; verify the red
      state shows `/plan tools` is not yet searchable.
- [x] Enable the admitted search contract only on the Plan-mode tool screen in
      `extensions/pi-plan-mode/src/plan-mode.ts`, retaining tool policy, required tools, active-tool
      restoration, session persistence, and non-TUI routes; verify the focused Plan-mode tests and
      workspace check pass.
- [x] Update `extensions/pi-plan-mode/README.md` to describe search without changing documented tool
      risk or settings precedence; verify the README still distinguishes session selections from
      `defaultPlanTools` and matches tested behavior.

### Proof migration: Subagents

- [x] Add failing Subagents regressions in `extensions/pi-subagents/test/subagents.test.ts` for
      searching available and preserved-unavailable tools, toggling by raw name, pinned Save/Discard,
      no-match behavior, Escape/Discard read-only behavior, and Save-after-filter unknown-field
      preservation; verify the red state shows the agent-tool draft is not yet searchable.
- [x] Enable the admitted search contract only on the Subagents `tool-draft` screen in
      `extensions/pi-subagents/src/config-ui.ts`, retaining one-save draft state, unavailable tool
      preservation, malformed-file refusal, mutation locking, atomic save, and reload semantics;
      verify focused Subagents tests and the workspace check pass.
- [x] Update `extensions/pi-subagents/README.md` so agent-tool instructions accurately describe search,
      Save/Discard navigation, and Escape behavior; verify no documentation implies a shortcut the
      tested component does not implement.

### Verification and handoff

- [x] Run the compiled focused kit and consumer suites after a fresh build, then run
      `npm run check --workspace @narumitw/pi-tui-kit`,
      `npm run check --workspace @narumitw/pi-plan-mode`, and
      `npm run check --workspace @narumitw/pi-subagents`; record commands, test counts, and results.
- [x] Run root `npm run check` and `git diff --check`; leave any unavailable check open rather than
      inferring success from focused tests.
- [x] Run `just pack-tui-kit`, `just pack-plan-mode`, and `just pack-subagents`, inspect each tarball's
      files and generated declarations, and verify no private Pi import, source-only dependency, or
      unintended package content.
- [x] Run a representative local Pi smoke for Plan mode or Subagents plus an RPC smoke that exercises
      the full unfiltered multi-select dialog; record why deterministic component tests substitute for
      any interactive TUI path that cannot be automated.
- [x] Update `docs/roadmaps/pi-tui-kit-roadmap.md` with the shipped searchable multi-select capability,
      two proof migrations, API-version decision, checks, and retained catalog/decision status;
      verify the roadmap and package/consumer READMEs agree.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, Pi's
      `tui.md`, `extensions.md`, `rpc.md`, and the roadmap touched-area checklist, separately checking
      user cancellation, component disposal, session replacement, shutdown, post-`await` state,
      settings ordering/failure recovery, and unknown-field protection; report deviations and
      unverified paths in the handoff.
- [x] Confirm every plan item and completion check has evidence, then move this completed plan to
      `docs/plans/archived/2026-07-30_pi-tui-kit-searchable-multi-select-plan.md`; verify the active
      path is gone and the archive does not overwrite an existing file.

## Verification Evidence

- Focused final suite: 115 passing tests across kit model/components/runtime, Plan-mode tool selection
  and role policy, and the complete Subagents integration test file.
- Workspace checks passed for `@narumitw/pi-tui-kit`, `@narumitw/pi-plan-mode`, and
  `@narumitw/pi-subagents`.
- `just pack-tui-kit`, `just pack-plan-mode`, and `just pack-subagents` passed; the kit tarball contains
  built JavaScript/declarations for the extracted modules, and `dist/types.d.ts` contains both optional
  fields.
- A real Pi 0.83.0 RPC smoke loaded local Plan mode, invoked `/plan tools`, verified the complete flat
  option list, cancelled it, and exited without extension errors. Deterministic custom-component tests
  substitute for a non-automatable interactive TUI smoke and cover focus, keys, width, paste, filtering,
  pending work, and disposal semantics.
- Root `npm run check` was attempted repeatedly. All touched tests and non-test gates pass, but the
  parallel root test runner exposed unrelated pre-existing timing/path flakes. A full sequential run
  passed 1,847 of 1,848 tests; the sole remaining `pi-github-pr` periodic-refresh failure passes when
  focused and is outside this diff. The root-pass completion item remains explicitly unchecked.

## Completion Checklist

- [x] The two-consumer gate passes with Plan mode and Subagents, and the public contract has no
      consumer-specific callback, renderer, persistence, or lifecycle hook.
- [x] Existing multi-select definitions retain their prior behavior when search is omitted.
- [x] Search tests cover identity, filtering, pinned actions, pending/rejected toggles, width, Unicode,
      terminal safety, IME focus, keybindings, Back/Close, disposal, replacement, shutdown, and RPC.
- [x] Plan mode preserves tool policy, required tools, session persistence, lifecycle restore, and
      non-TUI behavior.
- [x] Subagents preserves draft-only mutation, Save/Discard/Escape, unavailable names, malformed-file
      protection, unknown fields, locking, atomic publication, and reload behavior.
- [ ] Focused suites and workspace checks pass, as do all three pack dry runs and the recorded Pi
      runtime smoke; root `npm run check` remains open because unrelated parallel-run flakes are
      recorded above.
- [x] Roadmap, README, generated declarations, API-version declaration, and archived plan agree on the
      delivered behavior.
