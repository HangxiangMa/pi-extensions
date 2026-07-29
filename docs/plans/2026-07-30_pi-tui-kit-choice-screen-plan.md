# Pi TUI Kit Phase 1–2 Choice Screen Plan

## Goal

Execute Phase 1 and, only if its admission gate passes, Phase 2 of
`docs/roadmaps/pi-tui-kit-roadmap.md`: qualify a reusable static choice contract against two real
consumer workflows, add it to `@narumitw/pi-tui-kit` without private Pi dependencies, and prove it
through two behavior-preserving consumer migrations.

## Context

- The kit currently supports `actions`, `detail`, `settings`, and `multiSelect` screens through
  `packages/pi-tui-kit/src/types.ts`, `model.ts`, `screen-components.ts`, and `runtime.ts`.
- `PI_EXTENSION_MENU_API_VERSION` is `1`; adding a fifth `MenuScreen` variant would be the first new
  declarative capability since that version was introduced.
- Pi 0.82.1 root-exports `ThemeSelectorComponent`, `ThinkingSelectorComponent`,
  `ModelSelectorComponent`, `SessionSelectorComponent`, `TreeSelectorComponent`,
  `LoginDialogComponent`, `DynamicBorder`, and `BorderedLoader`. Those exports are public but mostly
  domain-coupled; they must not be described as private or cloned as generic controls.
- Pi does not root-export the settings selector's internal `SelectSubmenu`; the generic implementation
  must still be composed from public `SelectList`, theme, keybinding, and width APIs rather than a
  `dist/*` import.
- `pi-statusline`'s information-profile picker is the strongest known static-choice candidate: it has
  stable values, a current value, initial selection, per-item details, explicit apply, and no
  cursor-movement side effect.
- `pi-worktree`'s `selectWorktree()` is the second qualified consumer: it selects one static record,
  maps a display-derived label back to a record by array position, and performs all mutation only
  after selection. A choice screen can preserve its prompt while carrying the raw worktree path as
  stable identity.
- Known non-candidates for the static MVP are `pi-statusline`'s palette picker (live preview and
  preview rollback), `pi-btw`'s editor-preserving standalone menus, `pi-starship`'s width-dependent
  preview menus, `pi-image-drop`'s safety decision dialog, and `pi-file-context`'s searchable
  multi-mode explorer.

### Qualification matrix

| Flow | Input and state | Details / side effects | Back, modes, lifecycle | Decision and evidence |
| --- | --- | --- | --- | --- |
| `pi-statusline` information profile | Stable profile names; `current` may be `custom`; initial cursor falls back to `balanced` | Selected segment names; save/apply/rollback only after confirmation | Escape closes its containing menu; no-argument command is TUI-only and owner signal/generation already wrap `runMenu()` | **Admit.** `extensions/pi-statusline/src/commands.ts`; 31 baseline command tests in `extensions/pi-statusline/test/commands.test.ts`. |
| `pi-worktree` worktree selection | Static records; current worktree is excluded; first eligible row is initial | Existing formatted record label; switch/remove and identity revalidation happen after selection | Undefined means cancel in TUI/RPC; command context supplies an abort signal | **Admit.** `extensions/pi-worktree/src/command.ts`; 28 baseline command tests in `extensions/pi-worktree/test/command.test.ts`. |
| `pi-statusline` palette | Stable presets and current value | Cursor movement performs live preview; cancel restores preview | TUI-only with save/apply rollback | **Reject for static choice.** Preview behavior is covered by `commands.test.ts`. |
| `pi-btw` menus | Static strings and optional initial value | Some rows are decisions; helper captures concurrent editor state immediately before `done()` | Must distinguish Back/Close and preserve editor changes while custom UI is open | **Reject for static choice.** `extensions/pi-btw/src/btw.ts`; 65 baseline tests in `extensions/pi-btw/test/side-thread.test.ts`. |
| `pi-starship` preview actions | Static actions | Body is computed from terminal width and can lead to edit/apply confirmation | TUI-only specialized review loop | **Reject.** `extensions/pi-starship/src/commands.ts`; 16 baseline tests in `extensions/pi-starship/test/commands.test.ts`. |
| `pi-image-drop` confirmation | Confirm/Cancel decision | Safety copy and three-way confirmed/cancelled/close result | Explicit Escape versus Ctrl+C contract | **Defer to decision screen.** `extensions/pi-image-drop/src/menu.ts`; 5 baseline tests in `extensions/pi-image-drop/test/menu.test.ts`. |
| `pi-file-context` explorer | Searchable files plus preview/history/revision/diff modes | Async loading, selection ranges, Git context | Focus forwarding, disposal, request generations | **Reject.** `experimental/pi-file-context/src/file-context-explorer.ts`; belongs to catalog/specialized UI. |

### Touched-area rules

- Library API, rendering, runtime, declarations, README, and package output must satisfy repository
  package boundaries, root-exported Pi dependencies, width-safe rendering, injected keybindings,
  terminal sanitization, deterministic tests, and `just pack-tui-kit` verification.
- A consumer migration must keep `ctx.ui.custom()` TUI-only through `runMenu()`, preserve Back versus
  Close, keep action cancellation and generation ownership, and test every claimed RPC/non-TUI path.
- `pi-statusline` settings loading, validation, atomic persistence, unknown-field preservation,
  serialized application, and rollback are out of scope for redesign but must remain covered because
  its interactive settings command path is touched.
- `pi-worktree` already depends on `@narumitw/pi-tui-kit`; its migration requires focused command
  tests, `just pack-worktree`, and preservation of revalidation, switch/remove safety, cancellation,
  and non-TUI rejection.

## Architecture

### Proposed static choice contract

The Phase 1 gate should approve or revise this bounded shape before implementation:

```ts
interface MenuChoiceItem {
  id: string;
  label: string;
  description?: string;
  details?: readonly string[];
  disabled?: boolean;
  disabledReason?: string;
}

interface ChoiceScreen<ActionId extends string> {
  kind: "choice";
  title: string;
  lines?: readonly string[];
  items: readonly MenuChoiceItem[];
  action: ActionId;
  currentItemId?: string;
  initialItemId?: string;
  viewportSize?: number;
  hint?: "back" | "close";
}
```

- `currentItemId` controls only the textual current marker; it may be absent from the item list to
  represent a custom or legacy value.
- A valid remembered cursor wins, then `initialItemId`, then a matching `currentItemId`, then the
  first row. Disabled rows remain focusable for explanation but cannot activate.
- Moving the cursor only updates selected details and remembered selection. Confirmation invokes the
  screen's one action with the raw `itemId`; rejected or thrown actions remain on the screen.
- The screen owns no persistence, preview callback, rollback callback, TUI object, or arbitrary
  renderer. Domain action handlers retain mutation and recovery.
- TUI uses public `SelectList` plus a kit-owned frame/details adapter. RPC flattens rows into unique
  labels while mapping the selected label back to raw identity and adding an explicit Back/Done row.
- Existing menu definitions remain source compatible. If admitted, increment
  `PI_EXTENSION_MENU_API_VERSION` to `2` because a v1 runtime cannot interpret the new screen kind;
  do not change package versions manually.

### Delivery boundaries

- Land the kit contract and its two proof migrations in one focused rollout PR so the new public API
  and its qualification evidence are reviewed atomically; keep each responsibility in a separate
  commit when that improves reviewability.
- Retain all statusline persistence and worktree switch/remove safety outside the kit.
- Do not combine palette preview, searchable catalog, contextual decision, settings schema, or command
  surface changes with the rollout.
- This single-PR rollout supersedes the roadmap's default separate-migration preference for the first
  admitted screen; future unrelated migrations remain separate.

## Non-Goals

- Add live preview or run actions when selection merely moves.
- Replace Pi's exported theme, thinking, model, session, tree, or login selectors.
- Add search, regex syntax, scope tabs, async refresh, free-form input, multi-step forms, or tree
  navigation.
- Change extension settings files, defaults, precedence, migration, or persistence protocols.
- Remove specialized selectors that do not fit the approved static contract.
- Publish packages, bump package versions, or merge PRs as part of implementation.

## Assumptions

- The two-consumer admission gate passes with `pi-statusline` information profiles and `pi-worktree`
  worktree selection; neither requires a cursor-movement side effect or consumer-specific kit hook.
- `currentItemId` and `initialItemId` remain separate because `pi-statusline` can report a `custom`
  current profile while initially focusing `balanced`.
- `pi-btw` remains specialized because preserving editor text at the exact pre-`done()` boundary is a
  stronger contract than `runMenu()` exposes.

## Risks

- A choice screen may duplicate the existing `actions` screen without enough product difference.
  Admission requires current-state marking, initial selection, selected details, and two migrations
  that materially remove repeated standard behavior.
- Adding a preview hook to qualify the palette picker would violate the static Phase 2 boundary and
  create async rollback/lifecycle work; reject that expansion and defer the palette picker.
- RPC labels can collide with duplicate display text or the exit row; preserve raw identity through
  the existing unique-label adaptation and test collisions.
- A missing or disabled current/initial item can produce unstable cursor behavior; define fallback
  order once and cover reload, rejection, and item removal.
- `screen-components.ts` is currently below 1,000 lines but will grow. Review line count and cohesion
  before completion; split the choice adapter only if it creates a clearer responsibility boundary.

## Rollback / Recovery

- The library change is additive and has no persisted-data migration. If it regresses before consumer
  adoption, revert the kit PR and restore API version `1` with its README declaration.
- If a consumer migration regresses, revert that migration first; its prior specialized selector and
  settings format remain available in Git and no stored data requires rollback.
- A failed choice action must return or throw through the existing action protocol, report the error,
  retain the last stable selection, and leave domain state recovery to the consumer.
- Do not delete either specialized consumer implementation until its focused regression tests pass in
  the migration PR.

## Plan

### Phase 1 — Foundation and qualification

- [x] Audit Pi 0.82.1's root exports and relevant selector constructor types, then update the
      `Current State` and `Decisions and Changes` sections of `docs/roadmaps/pi-tui-kit-roadmap.md` to
      distinguish public domain-coupled composites from the non-exported `SelectSubmenu`. Evidence:
      runtime export inspection and installed declarations show the domain selectors at the package
      root, while `SelectSubmenu` is absent; package source has no planned `dist/*` import.
- [x] Add a qualification matrix to this plan's `Context` for the candidate custom flows and worktree
      selector, recording input, state, details, side effects, Back/Close, modes, lifecycle, migration
      fit, and implementation/test evidence. Evidence: the matrix cites all seven inspected flows and
      their owning source and regression suites.
- [x] Run the existing statusline, BTW, Starship, image-drop, and worktree command/menu regression
      suites to establish baseline behavior. Evidence: a fresh package build and test compilation pass;
      absolute-path `node --test` runs pass 31, 65, 16, 5, and 28 tests respectively (145 total).
- [x] Prove or reject `pi-btw` as the second consumer by tracing
      `showBtwCustomPreservingEditor()`, `showBtwMenu()`, and their concurrent-editor tests. Evidence:
      BTW is rejected because `runMenu()` cannot capture editor text at the required pre-`done()`
      boundary without a consumer-specific hook; its 65 baseline tests remain unchanged.
- [x] Apply the two-consumer admission gate and record the decision in this plan and the roadmap.
      Evidence: `pi-statusline` information profiles and `pi-worktree` selection share confirmed static
      selection with post-confirmation actions and stable raw IDs; preview, decision, and
      editor-preserving flows remain excluded.
- [x] Finalize the `ChoiceScreen` contract, fallback order, disabled behavior, TUI/RPC semantics,
      consumers, and API version `2` decision in this plan. Evidence: neither admitted workflow needs
      cursor-movement side effects, private Pi imports, arbitrary rendering hooks, or settings
      persistence changes.

### Phase 2 — Static choice library contract

- [x] Add focused failing cases to `packages/pi-tui-kit/test/menu-model.test.ts` and compile-time usage
      fixtures for valid choice definitions, blank/duplicate IDs, missing actions, invalid viewport,
      missing current/initial IDs, disabled reasons, and unchanged four-kind definitions. Evidence:
      test compilation failed on the absent `ChoiceScreen` export and `choice` union variant before
      implementation.
- [x] Add `MenuChoiceItem`, `ChoiceScreen`, and the `MenuScreen` union/export changes in
      `packages/pi-tui-kit/src/types.ts` and `src/index.ts`, implement validation in `src/model.ts`, and
      set `PI_EXTENSION_MENU_API_VERSION` to `2`. Evidence: the focused model suite passes 8 tests and
      consumer-facing README usage compiles without casts.
- [x] Add focused failing cases to `packages/pi-tui-kit/test/screen-components.test.ts` for current
      marker, separate initial focus, selected details, viewport and page navigation, disabled focus
      and rejection, duplicate labels, custom keybindings, Back/Close, narrow widths, terminal
      controls, invalidation, disposal, and selection restoration. Evidence: four choice component
      cases failed on the explicit unimplemented adapter before implementation.
- [x] Implement the choice adapter in `packages/pi-tui-kit/src/screen-components.ts` from public
      `SelectList`, `DynamicBorder`, and existing sanitization helpers, with no selection-change side
      effect. Evidence: 27 component tests pass and choice output is bounded at widths 1, 20, 40, 80,
      and 120.
- [x] Add focused failing cases to `packages/pi-tui-kit/test/runtime.test.ts` for TUI confirmation,
      raw item identity, remembered/initial/current fallback, rejection, item removal, RPC
      duplicate/exit labels, disabled rows, owner abort, disposal, session replacement, and shutdown.
      Evidence: three choice routing tests failed before runtime support; shared action tests continue
      covering thrown-action recovery.
- [x] Extend `packages/pi-tui-kit/src/runtime.ts` to route choice activation through the existing action
      protocol and adapt choice rows in RPC mode, revalidating signal and `isCurrent()` after every
      await. Evidence: 23 runtime tests pass, including current fallback, choice owner-abort draining,
      and stale exit.
- [x] Update `packages/pi-tui-kit/README.md` and `test/readme-usage.ts` with the choice contract,
      API version `2`, current-versus-initial behavior, RPC flattening, and extension-owned preview and
      persistence boundaries. Evidence: README examples compile and repository search finds no stale
      four-screen or API version `1` statement in the package.
- [x] Review `screen-components.ts` and `runtime.ts` line counts and responsibilities after the change.
      Evidence: they remain cohesive at 851 and 678 lines respectively, below the 1,000-line review
      threshold.
- [x] Run the library and repository gates with
      `npm run check --workspace @narumitw/pi-tui-kit`, the 58 focused compiled kit tests,
      `npm run check`, and `just pack-tui-kit`; inspect the tarball. Evidence: all pass, the root gate
      passes 1,824 tests, and the 15-file tarball contains built ESM/declarations, README, license, API
      version `2`, and no private Pi import.

### Phase 2 — Consumer proof

- [x] Add failing regressions to `extensions/pi-statusline/test/commands.test.ts` and
      `test/information-command.test.ts` for standard-screen ownership, custom-current/balanced-initial
      presentation, selected details, confirm/apply, Escape, save/apply failure, rollback, and narrow
      rendering. Evidence: the ownership test failed because the old information picker was not a kit
      screen before migration.
- [x] Replace only `showInformationProfilePicker()` and its information-profile call path in
      `extensions/pi-statusline/src/commands.ts` with the admitted choice screen, retaining palette
      preview, settings persistence, unknown fields, atomic save, runtime apply, rollback, and
      non-TUI command behavior. Evidence: 35 focused command/information tests, the workspace check,
      root gate, and `just pack-statusline` pass.
- [x] Add a failing regression to `extensions/pi-worktree/test/command.test.ts` for standard-screen
      ownership, raw path identity, duplicate sanitized labels, confirmation, and unchanged switch
      revalidation. Evidence: the test failed with one custom screen instead of two while the old
      display-label/index selector remained.
- [x] Replace `selectWorktree()` in `extensions/pi-worktree/src/command.ts` with the admitted choice
      screen without changing switch/remove domain behavior, and propagate the owning menu signal to
      nested selection. Evidence: 28 focused command tests, the workspace check, root gate,
      `just pack-worktree`, and boundary validation pass.
- [x] Run a representative noninteractive Pi runtime smoke for a migrated consumer. Evidence:
      `pi --mode rpc --no-session --no-extensions -e ./extensions/pi-worktree` loaded `/worktree`,
      opened the main menu and nested choice dialog over the extension UI protocol, and returned
      cleanly after cancellation. Interactive TUI rendering is covered by deterministic component and
      command harnesses because agent commands may not open an interactive TUI.

### Final audit and handoff

- [x] Audit the final rollout diff against `docs/extension-conventions.md`,
      `docs/extension-settings.md`, and the roadmap's Phase 1–2 success metrics. Evidence: package
      boundaries, public Pi imports, width/theme/keybinding rules, TUI/RPC mode handling, owner-signal
      cancellation, post-`await` stale handling, statusline atomic save/apply/rollback tests, worktree
      revalidation/safety tests, root checks, and all pack contents pass review. Accepted deviations:
      the first capability and proof migrations share one atomic rollout PR, and deterministic TUI
      harnesses plus a real RPC smoke replace an interactive TUI command forbidden in this agent run.
- [ ] Open one focused rollout PR containing qualification, the choice contract, both proof
      migrations, tests, and documentation; verify CI and CodeQL pass and the PR remains mergeable.
- [ ] Confirm every plan item and completion check has evidence, archive this completed plan under
      `docs/plans/archived/2026-07-30_pi-tui-kit-choice-screen-plan.md`, and verify the active plan path
      no longer exists and the archive did not overwrite another file.

## Completion Checklist

- [x] Phase 1 records accurate Pi export status, a complete compatibility matrix, 145 baseline tests,
      and an explicit two-consumer admission decision.
- [x] Not applicable: admission passed, so the failed-admission package-source condition does not
      apply.
- [x] The public contract remains declarative, uses no private Pi import, sets API version `2`, and
      keeps existing four screen kinds source compatible.
- [x] Choice model, TUI, and RPC tests cover validation, identity, current/initial selection, details,
      disabled state, width, Unicode, sanitization, keybindings, navigation, failures, cancellation,
      disposal, replacement, and shutdown.
- [ ] The focused rollout PR passes package checks, root `npm run check`, all three pack dry runs,
      CI/CodeQL, and the noninteractive RPC runtime smoke.
- [x] Both migrations preserve domain state, settings persistence, rollback, editor state, preview
      ownership, established commands, revalidation safety, and relevant non-TUI behavior.
- [ ] The roadmap, package README, API version declaration, and archived plan agree on the delivered
      Phase 1–2 outcome.
