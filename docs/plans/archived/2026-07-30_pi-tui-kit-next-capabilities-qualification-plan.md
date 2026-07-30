# Pi TUI Kit Next-Capabilities Qualification Plan

## Goal

Qualify the next bounded `@narumitw/pi-tui-kit` capabilities against current repository consumers,
record an explicit admit/defer/reject decision for searchable multi-select, searchable catalog, and
contextual decision patterns, and update the roadmap without adding speculative public API.

## Context

- The kit currently exposes five screen kinds: `actions`, `detail`, `choice`, `settings`, and
  `multiSelect`; the static `choice` rollout and its two proof migrations were completed in PR #463.
- The roadmap requires two compatible consumers before admitting a reusable interaction contract and
  keeps searchable catalog and contextual decision independent.
- Search pressure is now visible in dynamic tool and resource lists:
  - `extensions/pi-plan-mode/src/plan-mode.ts` projects every currently selectable Pi tool into a
    bounded `multiSelect` screen;
  - `extensions/pi-subagents/src/config-ui.ts` projects every configured/current tool into a
    draft-based `multiSelect` screen with pinned Save and Discard actions;
  - `experimental/pi-jupyter/src/jupyter-preview.ts` lists discovered notebooks before opening a
    specialized preview;
  - `extensions/pi-sync/src/sync-setups-ui.ts` and `storage-connections-ui.ts` list user-owned
    resources before a detail screen.
- `experimental/pi-file-context/src/file-context-explorer.ts` combines search with two activation
  gestures, asynchronous preview, history, revision, diff, and range selection. Its whole workflow is
  not evidence for a simple catalog contract.
- `extensions/pi-image-drop/src/menu.ts` has an explicit confirmed/cancelled/close result, while
  `extensions/pi-starship/src/commands.ts` owns width-dependent preview and `pi-sync` already expresses
  contextual reviews with public `ctx.ui.select()` and `ctx.ui.confirm()`.
- Pi 0.83.0 publicly exposes `Input`, `SelectList`, `SettingsList`, `fuzzyFilter`, `DynamicBorder`,
  `BorderedLoader`, and RPC dialog methods. `ctx.ui.custom()` remains TUI-only; RPC adaptation must use
  dialog methods.

## Architecture

Qualification will use one compatibility matrix with these fields for every candidate flow:

- package and source/test evidence;
- item source and maximum/expected cardinality;
- snapshot versus asynchronous refresh behavior;
- stable raw identity, display labels, descriptions, disabled/current state, and search corpus;
- activation gestures and whether selection itself has side effects;
- extension-owned persistence, validation, confirmation, preview, and rollback;
- TUI, RPC, print, and JSON behavior;
- cancellation, disposal, session replacement, and shutdown ownership;
- exact capability that a shared contract would remove without consumer-specific hooks.

Evaluate three distinct contracts rather than one generic list:

1. **Searchable multi-select enhancement:** optional TUI filtering over labels plus declarative search
   text, with stable raw IDs, pinned action rows, unchanged serialized toggle/rollback behavior, and a
   flat unfiltered RPC dialog.
2. **Searchable catalog screen:** a static snapshot of selectable items with stable IDs, declared
   search text, metadata/current/disabled state, one confirmation action, bounded viewport, and no
   asynchronous refresh, tabs, custom sort, secondary activation gesture, or preview callback.
3. **Contextual decision screen:** only admissible if two workflows cannot preserve required context,
   Back/Close semantics, and safe defaults with public `ctx.ui.select()` or `ctx.ui.confirm()`.

An admitted capability receives its own focused implementation plan and rollout. A deferred or
rejected capability records the missing shared requirement instead of widening this qualification
plan into implementation.

## Non-Goals

- Implement or publish a kit capability.
- Migrate a consumer or change extension settings, commands, persistence, or runtime behavior.
- Turn `actions`, `choice`, `multiSelect`, and catalog into one configurable universal list.
- Admit async catalogs, file trees, live preview, editors, secret input, or multi-step wizards.
- Treat two screens in one package as sufficient proof when the roadmap requires two repository
  consumers.

## Unknowns

- Whether searchable multi-select has two behaviorally compatible consumers once pinned action rows,
  draft save semantics, and session-persisted immediate toggles are compared precisely.
- Whether any two catalog candidates need search strongly enough and share one-gesture static
  selection without requiring auxiliary renderer or refresh hooks.
- Whether image-drop has a second compatible decision consumer after excluding flows already served
  by Pi's public dialogs.
- Whether an optional enhancement to an existing screen changes
  `PI_EXTENSION_MENU_API_VERSION`, even though existing version-2 runtimes can safely ignore unknown
  optional fields.

## Risks

- Counting merely similar-looking lists can admit an abstraction without shared lifecycle or product
  semantics.
- Using `pi-file-context` as proof could pull dual activation, preview, and async request generations
  into a generic catalog.
- Search added to multi-select can conflict with pinned action rows or documented single-key actions;
  qualification must compare exact current behavior before approving the contract.
- A rich TUI contract can flatten poorly in RPC; every decision must define whether RPC remains a
  full unfiltered list or needs a separate public behavior.
- Roadmap status can drift if qualification evidence remains only in an implementation plan; the
  final decision must be linked from the roadmap.

## Qualification Evidence

### Public Pi and compatibility baseline

- Installed Pi 0.83.0 root exports were imported directly and verified for `Input`, `SelectList`,
  `SettingsList`, `fuzzyFilter`, `DynamicBorder`, and `BorderedLoader`.
- Repository searches found no private Pi `dist/*` import in the kit or either proof consumer.
- The focused pre-change baseline passed 106 tests across kit model/component/runtime, Plan-mode tool
  selection and role policy, and Subagents configuration.
- Search is an optional enhancement to an existing screen kind. `PI_EXTENSION_MENU_API_VERSION`
  remains `2`: an older version-2 runtime ignores the optional fields and keeps a valid full
  multi-select instead of rejecting the definition.

### Searchable multi-select matrix

| Consumer | Shared contract | Owned behavior retained | Decision |
| --- | --- | --- | --- |
| `pi-plan-mode` `/plan tools` | Snapshot of installed tools, stable raw IDs, labels plus policy/source/description search text, disabled policy rows | Immediate active-tool application, required tools, session persistence/restore, replacement and shutdown signal | Proof migration |
| `pi-subagents` agent-tool draft | Snapshot of available and preserved-unavailable tools, stable names, pinned Save/Discard, availability search text | One-save draft, malformed-file refusal, unknown fields, mutation lock, atomic publication, reload wording | Proof migration |
| `pi-sync` included-content draft | Snapshot of built-in/custom paths and stable IDs with a later review step | Sensitive-session confirmation, review loop, setup concurrency, atomic settings update | Compatible future adopter; excluded from the first focused rollout |

**Decision:** admit optional `enableSearch` and item `searchText` on `multiSelect`. TUI filters toggle
rows and pins action rows; empty/no-match, stable cursor restoration, hidden pending rollback, focus,
paste sanitization, width, and custom keybindings stay kit-owned. RPC remains a complete unfiltered
flat dialog. No matcher, renderer, persistence, or lifecycle hook is public.

### Searchable catalog matrix

| Candidate | Reusable portion | Incompatible or missing requirement |
| --- | --- | --- |
| `pi-jupyter` notebook picker | Stable discovered paths, current marker, useful filename/path search | Manual path entry, asynchronous load/cancel, outside-workspace confirmation, and TUI-only preview ownership |
| `pi-subagents` agent picker | Static stable agent names, source/tool summaries, one confirmed transition | Compatible bounded shape, but no second proven large-list workflow currently shares it |
| `pi-sync` setup and storage lists | Stable user-owned names and current state | Add/edit/remove actions and state refresh belong to a live manager rather than one static confirmation |
| `pi-accounts` account lists | Stable provider/account IDs and current/disabled state | Credential login, switching, removal confirmation, and refreshed storage state are mutation workflows |
| `pi-file-context` explorer | Fuzzy path search and stable file identity | Dual activation, async preview, history, revision input, diff, range selection, and request generations |

**Decision:** defer searchable catalog. Subagents is a plausible first consumer, but no second
consumer has both demonstrated large-list search pressure and the proposed static one-confirmation
contract. The missing gate is shared product behavior, not a rendering primitive.

### Contextual decision matrix

| Candidate | Required context | Qualification result |
| --- | --- | --- |
| `pi-image-drop` | Message plus distinct Confirm, Escape cancellation, and `Ctrl+C` Close | One clear consumer |
| `pi-starship` | Width-dependent live preview, Continue/Edit/Cancel, then a separate exact confirmation | Incompatible with a static decision contract |
| `pi-sync` and `pi-accounts` confirmations | Exact consequence text and safe cancellation | Public `ctx.ui.confirm()`/`select()` already preserves the required behavior |

**Decision:** defer contextual decision. Image Drop lacks a second compatible consumer, and adding
preview callbacks for Starship would violate the declarative boundary.

## Plan

- [x] Capture the installed Pi 0.83.0 public exports and relevant `Input`, `fuzzyFilter`, `SelectList`,
      and RPC dialog contracts in this plan's evidence notes; verify with root-package import/type
      inspection and repository searches showing zero proposed `dist/*` dependency.
- [x] Build a compatibility matrix for searchable multi-select candidates in `pi-plan-mode`,
      `pi-subagents`, and `pi-sync`; verify each row against its source, README, and focused regression
      tests for stable IDs, toggle timing, pinned actions, persistence, cancellation, and mode behavior.
- [x] Run the existing kit, Plan-mode tool-selection, and Subagents configuration regressions before
      deciding searchable multi-select compatibility; verify with a fresh build/test compilation and
      absolute-path `node --test` runs under `node_modules/.cache/pi-extensions-test/` for
      `packages/pi-tui-kit/test/{menu-model,screen-components,runtime}.test.js`,
      `extensions/pi-plan-mode/test/{default-tools,subagent-allowlist}.test.js`, and
      `extensions/pi-subagents/test/subagents.test.js`.
- [x] Apply the two-consumer gate to searchable multi-select and record an admit or defer decision,
      including the exact query, cursor, pinned-action, pending-toggle, RPC, API-version, and consumer
      migration contract as acceptance evidence.
- [x] Build a compatibility matrix for catalog candidates in `pi-jupyter`, `pi-subagents`, `pi-sync`,
      and `pi-accounts`, explicitly compare `pi-file-context` as a rejection case, and verify every row
      against source plus existing menu/lifecycle tests.
- [x] Apply the two-consumer gate to searchable catalog and record either two named proof migrations
      with one bounded contract or the missing shared requirement that keeps the screen deferred.
- [x] Build a compatibility matrix for decision candidates in `pi-image-drop`, `pi-starship`,
      `pi-sync`, and other direct `ctx.ui.confirm()` owners; verify whether public Pi dialogs already
      preserve each workflow's context, safe default, cancellation, and non-mutation behavior.
- [x] Apply the two-consumer gate to contextual decision and record either two named proof migrations
      that cannot use public dialogs or an explicit deferral with the incompatible requirements.
- [x] Decide `PI_EXTENSION_MENU_API_VERSION` treatment separately for each admitted additive field or
      screen kind; verify the decision against version-2 source compatibility, runtime behavior, and
      README wording without manually changing package versions.
- [x] Update `docs/roadmaps/pi-tui-kit-roadmap.md` with Phase 1–2 completion evidence, the three
      qualification decisions, named consumers, missing gates, and links to any focused implementation
      plans; verify the roadmap does not claim implementation that has not shipped.
- [x] Create or reconcile one focused `docs/plans/YYYY-MM-DD_<capability>-plan.md` for each admitted
      capability, and mark any conditional pre-draft deferred when its gate fails; verify each
      executable plan names one bounded rollout, two proof consumers, TUI/RPC behavior, lifecycle
      checks, package dry runs, and rollback.
- [x] Run `npm run check` after the documentation changes and inspect `git diff --check`; record any
      unavailable baseline or runtime path instead of marking its qualification evidence complete.
- [x] Audit the final qualification diff against `docs/extension-conventions.md`,
      `docs/extension-settings.md`, Pi's `tui.md`, `extensions.md`, `rpc.md`, and the roadmap's
      two-consumer/public-API rules; report touched areas, admitted/deferred capabilities, checks, and
      accepted deviations in the handoff.

## Verification Evidence

- Public Pi root imports and private-import searches passed.
- The pre-change focused baseline passed 106 tests; the final focused kit and consumer selection passed
  115 tests.
- Kit, Plan-mode, and Subagents workspace checks passed, as did all three package dry runs and the
  Plan-mode RPC smoke.
- Root `npm run check` was executed repeatedly. Its build, Biome, boundaries, typechecks, and all
  touched tests passed, but unrelated timing/path tests varied under the local parallel runner. A full
  sequential run passed 1,847 of 1,848 tests and the remaining `pi-github-pr` periodic-refresh test
  passed when focused. PR #467's hosted CI subsequently passed the complete root gate.

## Completion Checklist

- [x] Every candidate has source, test, mode, lifecycle, side-effect, and ownership evidence in one
      compatibility matrix.
- [x] Every admitted capability names two compatible consumers and one bounded contract; every
      deferred/rejected capability names the missing or incompatible requirement.
- [x] Public Pi primitives and RPC behavior are verified without private imports or TUI-object API.
- [x] API-version decisions are explicit and existing five-screen definitions remain source
      compatible.
- [x] The roadmap and any focused implementation plans agree on status and scope.
- [x] Baseline regressions, `npm run check`, and `git diff --check` pass, or unavailable evidence
      remains unchecked and is reported.
