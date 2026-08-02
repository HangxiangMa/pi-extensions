# Pi TUI Kit Roadmap

- **Status:** Proposed strategic direction; not an implementation or release commitment
- **Audience:** Pi TUI Kit maintainers and extension authors
- **Planning horizon:** The next evidence-qualified capability sequence; no delivery dates are
  committed
- **Repository source:** Menu API version 6 with read-only browse, lifecycle-safe custom
  interactions, adaptive review, distinct root Back/Close results, and a supported `/testing` subpath
- **Published status:** Derive the current release from the npm badge, registry, and package manifest;
  this roadmap does not pin a transient package version
- **Migration evidence:** Maintained package/consumer tests and the stable PR references in the
  decision log below

## Vision

`@narumitw/pi-tui-kit` gives Pi extensions a small, dependable set of declarative interaction
patterns that feel native to Pi without depending on Pi's private UI implementation. Extensions
spend their effort on domain state, persistence, safety, and product language instead of rebuilding
cross-mode presentation, navigation, rendering safety, cancellation, disposal, and stale-session
handling.

## Objectives

- Preserve the reason a menu session terminates so callers can distinguish root Back from whole-flow
  Close without extension-local sentinels.
- Make bounded review screens adapt safely to terminal height while retaining deterministic RPC
  pagination and fixed-size compatibility.
- Publish a supported consumer test host that exercises real TUI and RPC adapters, then remove the
  equivalent generic orchestration added to repository-level test support by the first adopters.
- Admit new public flows only when compatible consumer evidence proves reusable interaction and
  lifecycle policy; keep domain state, validation, persistence, and transactional recovery local.
- Improve runtime change locality only where a behavior matrix proves one shared interaction driver
  can replace duplicated mode-specific action and lifecycle coordination.
- Keep read-only catalog presentation separate from extension-owned data freshness, status meaning,
  and domain actions.
- Centralize custom-component cancellation, disposal, stale-owner classification, and pending-work
  draining without absorbing the specialized component or its domain result.
- Keep package source imports from Pi private `dist/*` paths at zero through every roadmap phase.

## Current State

The maintained package exposes eight declarative screen kinds:

- `actions`;
- `detail`;
- `browse`;
- `choice`;
- `settings`;
- `input`;
- `review`; and
- `multiSelect`.

The package also exposes `runTask()` for abort-aware work with a TUI loader and
`runCustomInteraction()` for lifecycle ownership around one extension-owned specialized component.
Published menu API version 6 identifies runtimes that add read-only searchable browse and custom
interaction lifecycle handling while retaining version-5 adaptive review and distinct root
Back/Close behavior. The package's separate supported `/testing` subpath provides semantic TUI
driving and strict RPC scripts without exporting raw components; Stamp and Image Drop completed
representative adoption before publication.

Production and experimental consumers use the Kit alongside direct Pi dialogs. Raw consumer and
dialog counts are intentionally not pinned here because they change independently of roadmap
outcomes. A direct dialog justifies Kit ownership only when multiple consumers repeat compatible
interaction and lifecycle policy.

The latest proof migrations established the following baseline:

- `pi-usage` replaced local loader orchestration with `runTask()` while preserving query, user
  cancellation, stale-session, and error behavior;
- `pi-stamp` adopted declarative locale and time-zone input while retaining canonical validation,
  settings safety, rejected TUI drafts, RPC behavior, and publication ownership;
- `pi-image-drop` composed declarative input and review into a draft/review/publish flow while keeping
  selected-field state, cross-field validation, exact patches, and post-publication state advancement
  extension-owned; and
- all three migrations passed focused checks, package dry runs, and the repository CI-equivalent
  gate.

API version 6 then added a read-only browse screen, callback-injected keys for static lists, and
`runCustomInteraction()`. Pi Starship adopted browse while retaining module-data ownership; Pi Sync
adopted custom interaction lifecycle ownership while retaining secret masking, commit-aware
cancellation, settings, and notification policy. Both consumers raised only their own compatibility
floors.

The earlier migrations exposed two concrete review gaps: root Back and Ctrl+C Close originally collapsed to
one result, and `ReviewScreen` used fixed rather than terminal-derived viewport sizing. Published API
versions 4 and 5 resolved those Kit seams in sequence. The `pi-btw` post-release gate then passed:
standard choices and adaptive review migrated without weakening editor-preservation,
restored-selection, Back/Close, resize, or exact-text contracts.

Consumer tests had to extend `test/support.ts` to drive real input focus, rejected retries, Ctrl+C,
disposal, pending action draining, and RPC dialog cadence. The published
`@narumitw/pi-tui-kit/testing` subpath now owns the reusable lifecycle knowledge used by Stamp and
Image Drop representative flows. Repository support remains for its explicitly inventoried Kit,
specialized-component, experimental, and deprecated owners rather than being deleted prematurely.

The Phase 4 interaction-driver gate passed after the original seven-screen TUI/RPC behavior matrix.
Runtime retains adapter cadence, state loading, navigation, and component/dialog lifecycle; internal
`interaction.ts` owns screen-intent validation, raw action resolution, composed action signals,
accepted/rejected/stale outcomes, error routing, and returned transitions once for both modes. Browse
subsequently extended the maintained cross-mode matrix to eight screens without turning the internal
driver into public API.

## Guiding Principles

- **Public Pi APIs only:** use root-exported Pi primitives whose domain contract fits; never deep-import
  private implementation paths or copy a private component wholesale.
- **Reusable policy, local domain ownership:** the kit owns cross-mode interaction, rendering safety,
  navigation, cancellation, disposal, and stale checks. Extensions own domain drafts, validation,
  authorization, persistence, rollback, wording, and session ownership.
- **Evidence before abstraction:** require two compatible consumers by default. Record explicit
  contrary evidence or a finite no-go rather than widening an API speculatively.
- **Preserve capability:** migrations retain preview, persistence, validation, failure recovery,
  editor state, safety, and non-TUI behavior even when that requires keeping a specialized flow.
- **Explicit terminal outcomes:** Back, Close, Stale, Unsupported, and Error are lifecycle semantics,
  not presentation details to infer from labels or mutable flags.
- **Mode-specific presentation, shared lifecycle:** TUI and RPC may use different cadence, but action
  acceptance, transitions, signal composition, stale checks, and error routing follow one contract.
- **Safe display boundary:** sanitize rendered labels, metadata, values, key hints, pasted text, and
  errors while preserving raw identities only in non-rendered action payloads.
- **Bounded rollout:** one lifecycle or capability contract per PR; package work, proof migration, and
  unrelated dependency changes remain independently revertible.

## Roadmap Themes

### Explicit Interaction Semantics

Preserve lifecycle outcomes the navigator and adapters already know so extensions can compose nested
flows without losing Back-versus-Close intent.

### Host-Adaptive, Cross-Mode Experience

Use live TUI dimensions for bounded rendering while preserving deterministic RPC behavior and
unsupported-mode boundaries.

### Verifiable Consumer Adoption

Make real component and adapter behavior straightforward to test from consuming packages rather than
requiring each extension to rebuild a TUI/RPC host.

### Evidence-Controlled Expansion

Qualify standalone confirmation, deferred selection, and future screen patterns against compatible
consumers. Keep wizards, editors, action-bearing catalogs, and previews specialized until their
lifecycle contracts actually converge.

### Runtime Locality Without Speculative Layers

Concentrate action and lifecycle policy only when doing so deletes duplicated coordination. Avoid a
pass-through driver that merely renames the same TUI and RPC branches.

## Phases and Milestones

### Phase 1: Proven Declarative Foundation

**Status:** Complete.

**Milestones:**

- Static choice and searchable multi-select shipped through focused proof migrations after an
  evidence-based capability qualification.
- Input, bounded review, and `runTask()` shipped in menu API version 3 through representative
  consumer flows.
- Usage, Stamp, and Image Drop completed behavior-preserving consumer migrations.
- The BTW review gate recorded exact missing seams instead of weakening its specialized behavior.
- Package checks, deterministic TUI/RPC smokes, dry-run packages, and repository gates passed for the
  shipped capabilities and migrations.

**Outcome:** The kit has a verified cross-mode foundation and concrete adoption evidence from which
the next lifecycle contracts can be prioritized.

### Phase 2: Distinct Menu Session Outcomes

**Status:** Complete.

**Milestones:**

- `RunMenuResult` exposes a runtime-owned reason that distinguishes root Back from explicit Close
  without carrying domain-specific completion payloads.
- Root Back, nested Back, Ctrl+C, close items, action Close, custom-UI disposal, RPC cancellation,
  owner abort, unsupported mode, and failure have characterized terminal outcomes.
- Nested Back remains an in-menu transition and never reports a terminal result.
- An explicit menu API-version and compatibility decision covers exact result-object changes and
  consumer migration requirements.

**Outcome:** Menu and standalone flows can share a precise cancellation vocabulary, unlocking safe
three-way confirmation and preview composition.

### Phase 3: Adaptive Review and Supported Testability

**Status:** Complete. Adaptive review, the supported testing entrypoint, and named Stamp/Image Drop
test-host adoption are published; the subsequent BTW gate and focused migration also passed.

**Milestones:**

- [x] Review accepts an opt-in terminal-adaptive viewport policy while existing fixed numeric sizing
  and RPC pagination remain compatible.
- [x] Adaptive review stays within terminal row budgets at constrained, typical, and large heights,
  including wrapped headers, position indicators, resize, and scroll-offset clamping.
- [x] A separate `@narumitw/pi-tui-kit/testing` entry point drives real TUI components and RPC dialogs
  through focus, text input, key events, rejected retries, pending actions, disposal, and owner abort.
- [x] Stamp and Image Drop representative menu/input tests use the supported test host. Their direct
  ad hoc Kit drivers are gone; repository-level `test/support.ts` remains for explicitly inventoried
  Kit, specialized-component, experimental, and deprecated test owners rather than being deleted
  prematurely.
- [x] The BTW review gate passed against published API 5. Kit choice and adaptive-review flows preserve
  raw identity, initial/restored selection, root Back versus Ctrl+C Close, exact draft content,
  constrained/expanded resize, editor changes observed at completion, and finite host disposal.
  `BtwTextRangeSelector` remains specialized for exact character and line selection.

**Outcome:** Review behavior adapts to its host and consumer packages can verify kit lifecycle
contracts without private component knowledge.

### Phase 4: Qualified Shared Flows and Runtime Locality

**Status:** In progress. The internal interaction driver, read-only browse, and custom-interaction
lifecycle helper are complete; standalone confirmation and deferred multi-select remain independently
gated follow-ups.

**Milestones:**

- [x] A complete seven-screen TUI/RPC behavior matrix admitted the internal semantic interaction
  driver. One coordinator now owns action lookup/invocation, intent mismatch and disabled rejection,
  transitions, composed action signals, stale checks, and error routing while adapters retain TUI
  component and RPC dialog cadence.
- [x] Menu API version 6 admits read-only browse with searchable TUI presentation, deterministic RPC
  list/detail adaptation, textual status, bounds, sanitization, IME focus, and selection restoration;
  extensions retain catalog data, status meaning, freshness, and every domain action.
- [x] `runCustomInteraction()` owns composed cancellation, stale-owner classification, exactly-once
  disposal, and optional pending-work draining around specialized public custom components without
  absorbing their Back/Close values or side effects.
- [x] Pi Starship and Pi Sync completed bounded API-v6 adoption: Modules uses browse, custom Sync UI
  uses the lifecycle helper, and both retain their prior domain, settings, cancellation, and non-TUI
  contracts.
- [ ] Standalone confirmation either proves confirmed, Back, Close, Stale, Unsupported, and Error
  through Image Drop plus a second compatible consumer, or remains deferred with the missing shared
  contract recorded.
- [ ] Deferred or batched multi-select either proves common draft, Save, Discard, rejection, and RPC
  semantics through Pi Sync and Subagents, or remains extension-owned.
- [ ] Immediate-save multi-select behavior remains unchanged for Chrome DevTools, Firecrawl,
  Google GenAI, and Plan mode during any deferred-flow work.

**Outcome:** Repeated lifecycle and read-only disclosure policy moves behind bounded public or
internal seams without absorbing consumer transactions or creating a universal UI framework.

### Phase 5: Evidence-Based Evolution

**Milestones:**

- Remaining direct dialogs are recounted after completed migrations and reclassified by compatible
  lifecycle contract rather than raw call volume.
- Action-bearing or live async catalogs, trees, live previews, reorderable lists, and forms have
  explicit admission or deferral decisions based on compatible workflows.
- Multi-line editor remains deferred until Pi exposes an abort-aware cross-mode editor contract.
- Shipped screens are reviewed against newer public Pi exports and retired when an equivalent stable
  public primitive or composite becomes available.

**Outcome:** The kit continues to grow only where evidence supports durable leverage and removes local
abstractions when Pi provides a better stable owner.

## Technical Health

- Keep TypeScript strict, NodeNext-compatible, and built as published JavaScript plus declarations.
- Keep Pi private `dist/*` imports at zero and package-root consumer imports as the supported boundary.
- Keep the demonstrated runtime/interaction ownership boundary: adapters own presentation cadence
  and the interaction driver owns semantic action coordination. Recombine or split only when a new
  behavior matrix proves better locality and deletes coordination.
- Maintain deterministic model, component, runtime, package-root usage, and README tests for every
  public contract.
- Maintain a TUI/RPC behavior matrix across all declarative screens covering success, rejection, user
  cancellation, component disposal, owner abort, `isCurrent()` failure, action failure, session
  replacement, and shutdown.
- Keep terminal sanitization and cell-aware width checks at the final display boundary while passing
  raw IDs and values separately.
- Revalidate mutable state after every await before publishing UI or in-memory state.
- For each public package change, run the package check, root `npm run check`, deterministic runtime
  smokes, and `just pack-tui-kit`; inspect all exported production and testing entry points.

## Risks and Dependencies

- **Result compatibility:** adding a close reason changes exact result objects even when most callers
  only inspect `kind`. Mitigation: characterize callers, make an explicit API-version decision, and
  provide focused migration evidence.
- **Terminal-height calculation:** wrapped headers and scroll-position lines can make row budgeting
  circular. Mitigation: keep fixed sizing compatible, make adaptive sizing opt-in, and test complete
  rendered-frame height at multiple widths and terminal sizes.
- **Testing API coupling:** a public harness could accidentally expose Pi or component internals.
  Mitigation: expose semantic driving and stable render snapshots through a separate testing entry
  point, not raw private instances.
- **RPC flattening:** Pi dialogs cannot express every TUI distinction or cadence. Mitigation: define
  deterministic RPC outcomes independently and do not claim parity Pi cannot expose.
- **Editor lifecycle:** Pi's RPC editor lacks `AbortSignal` support, and BTW retains a narrow wrapper
  that captures live editor text at standard-menu completion, restores only a current completed flow,
  and avoids writes after host disposal. Exact text selection remains extension-owned.
- **Internal-refactor breadth:** a semantic driver can become a shallow extra layer. Mitigation: require
  a before/after deletion test and keep the refactor independently revertible.
- **API sprawl:** direct-dialog counts can encourage speculative wrappers. Mitigation: retain the
  evidence gate and domain ownership boundary.
- **Consumer capability loss:** a standard flow may erase preview, rollback, selection restoration, or
  three-way cancellation. Mitigation: compare behavioral contracts before migration and preserve
  specialized flows on a no-go result.

## Success Metrics

| Indicator | Baseline | Target | Horizon and source |
| --- | --- | --- | --- |
| Pi private `dist/*` imports in kit source | 0 | Remain 0 | Every phase; boundary check and source search |
| Ordinary `runMenu()` close outcomes visible to callers | Published API 3 collapsed Back and Close | Published API 5 distinguishes root Back and explicit Close | Phase 2 published; runtime TUI/RPC matrix |
| Review TUI viewport policy | Published API 3 was fixed, default 14 rows | Published API 5 provides opt-in adaptive sizing within the live terminal budget | Adaptive milestone published; review component and registry-package smokes |
| Reusable consumer input-host logic | Generic behavior added to repository `test/support.ts` | Supported `/testing` source plus Stamp and Image Drop adoption are complete; retained root owners are inventoried | Phase 3; package and consumer diffs/tests |
| Proof for each new public flow | Two compatible consumers by default; exceptions require recorded evidence | Two completed proof migrations or an explicit no-go/deferral | Every expansion phase; maintained tests and stable PRs |
| Lifecycle verification | Existing deterministic package and consumer coverage | Every admitted contract covers TUI/RPC, cancellation, disposal, owner abort, stale state, and failure | Every phase; package and repository gates |
| Runtime action/lifecycle ownership | TUI and RPC formerly coordinated screen actions in separate branches | One internal driver now owns shared semantic action policy; adapters retain presentation lifecycle | Phase 4 source-complete; maintained all-screen matrix plus source diff |
| Read-only catalog disclosure | Searchable catalogs were specialized | Menu API 6 browse owns bounded cross-mode list/detail presentation without domain actions | Phase 4 published; package matrix and Pi Starship adoption |
| Specialized custom lifecycle | Consumers repeated cancellation, disposal, stale-owner, and draining logic | `runCustomInteraction()` owns the shared lifecycle shell while components and domain results remain local | Phase 4 published; package tests and Pi Sync adoption |
| Regression gate | Repository CI-equivalent gate at each capability change | No regression in the repository CI-equivalent gate | Every phase; `npm run check` |

Delivery dates and capacity targets are unknown; this roadmap intentionally measures verified behavior
and adoption rather than calendar output.

## Non-Goals

- Becoming a general application framework, settings store, transaction coordinator, or domain state
  container.
- Adding arbitrary domain payloads to menu termination results.
- Reproducing Pi's model, session, trust, tree, authentication, provider, or editor domain logic.
- Copying public controls that extensions can import directly or wrapping them without shared policy.
- Exposing Pi TUI component instances through declarative production or testing APIs.
- Adding a general wizard or form merely to reduce Stamp or Image Drop screen definitions; their
  validation and publication semantics differ.
- Adding a multi-line editor while Pi lacks an abort-aware RPC editor contract.
- Building an action-bearing catalog, tree, transcript, live-preview, or reorder framework without
  compatible consumer evidence.
- Reducing direct dialog counts as an end in itself.
- Committing to delivery dates, speculative package versions, or implementation scope without a
  focused approved plan.

## Decisions and Changes

| Date | Decision or change | Rationale and impact |
| --- | --- | --- |
| 2026-07-30 | Store the canonical roadmap under `docs/roadmaps/`. | Roadmaps describe strategic direction; executable feature plans remain under `docs/plans/`. |
| 2026-07-30 | Reuse root-exported Pi composites only when their domain contract fits; use non-exported composites only as interaction references. | Deep implementation paths are not compatibility contracts, while public exports should not be copied. |
| 2026-07-30 | Require two compatible consumers before adding a screen by default. | Prevents one-off hooks and unsupported abstraction growth. |
| 2026-07-30 | Deliver static choice through Statusline information profiles and Worktree selection. | Both need confirmed static selection with raw identity and no cursor-movement side effect. |
| 2026-07-30 | Keep async catalogs, trees, login flows, and live previews deferred. | These patterns require stronger shared evidence or remain domain-specific. |
| 2026-07-30 | Admit optional searchable multi-select through Plan mode and Subagents while keeping API version 2. | Both share stable tool IDs and filtering while retaining different persistence ownership. |
| 2026-07-30 | Defer searchable catalog. | Jupyter remains specialized and no second bounded static catalog workflow was proven. |
| 2026-07-30 | Defer contextual decision. | Image Drop initially had no second compatible consumer, while Starship preview and public confirmations required different contracts. |
| 2026-07-31 | Ship `runTask()`, declarative input, and bounded review in menu API version 3 through PR #478. | Repeated lifecycle and mode-adaptation policy justified public flows; editor remained deferred because Pi lacks abort-aware RPC support. |
| 2026-07-31 | Complete Usage, Stamp, and Image Drop proof migrations through PRs #479, #481, and #482. | The migrations verified reusable lifecycle ownership while leaving domain validation, persistence, and session state with consumers. |
| 2026-07-31 | Record BTW review as no-go. | Root Back and Ctrl+C Close collapse to one result, and fixed review sizing cannot preserve terminal-row behavior. |
| 2026-08-01 | Prioritize menu termination reasons, adaptive review, and a supported consumer test host. | These are the highest-confidence gaps demonstrated by real migrations and unblock stronger composition without adding speculative screen kinds. |
| 2026-08-01 | Move the internal interaction driver, standalone confirmation, and deferred multi-select behind the near-term lifecycle work. | Behavior matrices and explicit terminal outcomes should precede broad runtime refactoring or new public flows. |
| 2026-08-01 | Merge the next-architecture implementation note into this canonical roadmap. | Maintaining one Pi TUI Kit roadmap avoids conflicting priorities while preserving the migration evidence and prior decision history. |
| 2026-08-01 | Implement mandatory `RunMenuResult.closed.reason` and raise repository menu API to version 4. | The navigator already owns root Back versus Close; exposing that reason removes a proven composition blocker while leaving domain completion values local. Publication remains a separate workflow. |
| 2026-08-01 | Implement opt-in adaptive review and raise repository menu API to version 5. | Live public TUI rows now bound complete review frames while fixed/default TUI output and deterministic RPC pages remain unchanged; the testing entry point, BTW gate/migration, and package release remain separate work. |
| 2026-08-01 | Add the supported `@narumitw/pi-tui-kit/testing` subpath without changing production exports or menu API version. | Semantic TUI driving and strict input/select RPC scripts concentrate demonstrated test-host policy without exposing components or absorbing consumer context/domain mocks; adoption and release remain separate. |
| 2026-08-01 | Adopt the supported testing subpath in Stamp and Image Drop before publication. | Two real consumers now prove sequential TUI screens, rejected input, pending drains, strict RPC where supported, loader cancellation, and three-way confirmation; broad root support remains only for its other inventoried owners. |
| 2026-08-01 | Publish menu API 5 and the supported testing subpath. | The pinned-npm provenance workflow and repository gate passed; a clean registry fixture resolved Kit roots, adaptive review, exact close results, and strict NodeNext declarations. |
| 2026-08-01 | Admit BTW's standard choices and preview to Kit after the post-publication gate. | Supported-harness and real-Pi smokes preserve editor text, selected question/scope, Back/Close, raw choice identity, adaptive resize, and exact preview content while `BtwTextRangeSelector` remains local. |
| 2026-08-01 | Admit the internal semantic interaction driver after the Phase 4 deletion gate. | A seven-screen TUI/RPC matrix proves compatible raw payloads, transitions, errors, cancellation, disposal, and stale ownership; one internal owner replaces mode-specific action resolution without changing exports or API version 5. |
| 2026-08-02 | Publish menu API 6 with read-only browse, injected static-list keybindings, and `runCustomInteraction()` through PR #520. | Bounded list/detail disclosure and specialized-component lifecycle policy became reusable while catalog data, domain actions, Back/Close values, and side effects stayed consumer-owned. |
| 2026-08-02 | Adopt API-v6 capabilities in Pi Starship and Pi Sync through PR #522. | Starship Modules now uses browse and Sync custom UI uses the lifecycle helper; both consumers raised only their own compatibility floors and retained domain, settings, cancellation, and non-TUI policy. |
