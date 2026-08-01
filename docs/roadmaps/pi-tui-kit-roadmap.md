# Pi TUI Kit Roadmap

- **Status:** Proposed strategic direction; not an implementation or release commitment
- **Audience:** Pi TUI Kit maintainers and extension authors
- **Planning horizon:** The next capability sequence after `@narumitw/pi-tui-kit@0.41.0`; no
  delivery dates are committed
- **Repository source:** Menu API version 5 with adaptive review, distinct root Back/Close results,
  and a supported `/testing` subpath
- **Latest published package:** `@narumitw/pi-tui-kit@0.41.0`, menu API version 3
- **Migration evidence:** [archived consumer migration plan][consumer-migration-plan]

[consumer-migration-plan]:
  ../plans/archived/2026-07-31_pi-tui-kit-consumer-migrations-plan.md
[choice-plan]: ../plans/archived/2026-07-30_pi-tui-kit-choice-screen-plan.md
[qualification-plan]:
  ../plans/archived/2026-07-30_pi-tui-kit-next-capabilities-qualification-plan.md
[searchable-multi-select-plan]:
  ../plans/archived/2026-07-30_pi-tui-kit-searchable-multi-select-plan.md
[agent-flows-plan]: ../plans/archived/2026-07-31_pi-tui-kit-agent-flows-plan.md
[adaptive-review-plan]:
  ../plans/archived/2026-08-01_pi-tui-kit-adaptive-review-viewport-plan.md
[supported-testing-plan]:
  ../plans/archived/2026-08-01_pi-tui-kit-supported-testing-entrypoint-plan.md

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
- Keep package source imports from Pi private `dist/*` paths at zero through every roadmap phase.

## Current State

The published `0.41.0` package exposes seven declarative screen kinds:

- `actions`;
- `detail`;
- `choice`;
- `settings`;
- `input`;
- `review`; and
- `multiSelect`.

The package also exposes `runTask()` for abort-aware work with a TUI loader and consistent completed,
cancelled, stale, and error outcomes in other modes. Published menu API version 3 identifies runtimes
that can interpret input and review screens. Repository source now uses API version 5 so ordinary
`runMenu()` results distinguish root Back from explicit Close and review screens can opt into a live
terminal-height budget while fixed TUI sizing and deterministic RPC pagination remain compatible.
The same source package also exposes a separate supported `/testing` subpath for semantic TUI driving
and strict RPC scripts without exporting raw components; consumer adoption and package release remain
separate workflows.

Eighteen extension or experimental packages depend on the kit, and 26 TypeScript source files import
its API. Kit-dependent source still contains these literal direct Pi dialog calls:

| Direct interaction | Current calls |
| --- | ---: |
| `ctx.ui.confirm()` | 33 |
| `ctx.ui.select()` | 32 |
| `ctx.ui.input()` | 19 |
| `ctx.ui.editor()` | 7 |

Call counts are inventory, not an admission criterion. A direct dialog justifies kit ownership only
when multiple consumers repeat compatible interaction and lifecycle policy.

The latest proof migrations established the following baseline:

- `pi-usage` replaced local loader orchestration with `runTask()` while preserving query, user
  cancellation, stale-session, and error behavior;
- `pi-stamp` adopted declarative locale and time-zone input while retaining canonical validation,
  settings safety, rejected TUI drafts, RPC behavior, and publication ownership;
- `pi-image-drop` composed declarative input and review into a draft/review/publish flow while keeping
  selected-field state, cross-field validation, exact patches, and post-publication state advancement
  extension-owned; and
- all three migrations passed focused checks, package dry runs, CI, and the 1,914-test repository gate.

The migrations exposed two concrete review gaps: root Back and Ctrl+C Close originally collapsed to
one result, and `ReviewScreen` used fixed rather than terminal-derived viewport sizing. Repository API
versions 4 and 5 now resolve those Kit seams in sequence. The `pi-btw` review migration remains
deferred until the separate supported testability milestone lands and its editor-preservation and
restored-selection contracts pass a fresh gate.

Consumer tests had to extend `test/support.ts` to drive real input focus, rejected retries, Ctrl+C,
disposal, pending action draining, and RPC dialog cadence. Repository source now provides that
reusable lifecycle knowledge through `@narumitw/pi-tui-kit/testing`; Stamp and Image Drop still need
separate migrations before equivalent generic orchestration can leave repository test support.

The main maintainability hotspot is `packages/pi-tui-kit/src/runtime.ts`, currently 767 lines. It owns
both TUI and RPC loops, state loading, action dispatch, navigation, signal composition, stale checks,
and error routing. The concern is not the line count alone: screen action semantics are recognized in
multiple mode-specific branches, so new contracts can require coordinated central edits.

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
consumers. Keep wizards, editors, catalogs, and previews specialized until their lifecycle contracts
actually converge.

### Runtime Locality Without Speculative Layers

Concentrate action and lifecycle policy only when doing so deletes duplicated coordination. Avoid a
pass-through driver that merely renames the same TUI and RPC branches.

## Phases and Milestones

### Phase 1: Proven Declarative Foundation

**Status:** Complete.

**Milestones:**

- [Static choice][choice-plan] and [searchable multi-select][searchable-multi-select-plan] shipped
  through focused proof migrations after the [capability qualification][qualification-plan].
- Input, bounded review, and `runTask()` shipped in menu API version 3 through the
  [agent-flow plan][agent-flows-plan].
- Usage, Stamp, and Image Drop completed behavior-preserving consumer migrations.
- The BTW review gate recorded exact missing seams instead of weakening its specialized behavior.
- Package checks, deterministic TUI/RPC smokes, dry-run packages, and repository gates passed for the
  shipped capabilities and migrations.

**Outcome:** The kit has a verified cross-mode foundation and concrete adoption evidence from which
the next lifecycle contracts can be prioritized.

### Phase 2: Distinct Menu Session Outcomes

**Status:** Complete in repository source; npm release remains separate.

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

**Status:** Adaptive review and the [supported testing entrypoint][supported-testing-plan] are
complete in repository source; Stamp/Image Drop test-host adoption, the BTW gate/migration, and npm
release remain open.

**Milestones:**

- [x] Review accepts an opt-in terminal-adaptive viewport policy while existing fixed numeric sizing
  and RPC pagination remain compatible.
- [x] Adaptive review stays within terminal row budgets at constrained, typical, and large heights,
  including wrapped headers, position indicators, resize, and scroll-offset clamping.
- [x] A separate `@narumitw/pi-tui-kit/testing` entry point drives real TUI components and RPC dialogs
  through focus, text input, key events, rejected retries, pending actions, disposal, and owner abort.
- [ ] Stamp and Image Drop consumer tests use the supported test host, allowing equivalent generic
  input orchestration to leave repository-level `test/support.ts`.
- [ ] The BTW review gate is rerun against close reasons and adaptive viewport; migration proceeds only
  if editor-preservation and restored-selection invariants also remain explicit and testable.

**Outcome:** Review behavior adapts to its host and consumer packages can verify kit lifecycle
contracts without private component knowledge.

### Phase 4: Qualified Shared Flows and Runtime Locality

**Milestones:**

- A decision on the internal semantic interaction driver is grounded in a complete TUI/RPC behavior
  matrix. If admitted, one coordinator owns action invocation, accepted/rejected results,
  transitions, composed signals, stale checks, and error routing while adapters retain presentation
  cadence.
- Standalone confirmation either proves confirmed, Back, Close, Stale, Unsupported, and Error through
  Image Drop plus a second compatible consumer, or remains deferred with the missing shared contract
  recorded.
- Deferred or batched multi-select either proves common draft, Save, Discard, rejection, and RPC
  semantics through Pi Sync and Subagents, or remains extension-owned.
- Immediate-save multi-select behavior remains unchanged for Chrome DevTools, Firecrawl, Google GenAI,
  and Plan mode.

**Outcome:** Repeated lifecycle policy moves behind bounded public or internal seams without absorbing
consumer transactions or creating a universal UI framework.

### Phase 5: Evidence-Based Evolution

**Milestones:**

- Remaining direct dialogs are recounted after completed migrations and reclassified by compatible
  lifecycle contract rather than raw call volume.
- Async catalogs, trees, live previews, reorderable lists, and forms have explicit admission or
  deferral decisions based on at least two compatible workflows.
- Multi-line editor remains deferred until Pi exposes an abort-aware cross-mode editor contract.
- Shipped screens are reviewed against newer public Pi exports and retired when an equivalent stable
  public primitive or composite becomes available.

**Outcome:** The kit continues to grow only where evidence supports durable leverage and removes local
abstractions when Pi provides a better stable owner.

## Technical Health

- Keep TypeScript strict, NodeNext-compatible, and built as published JavaScript plus declarations.
- Keep Pi private `dist/*` imports at zero and package-root consumer imports as the supported boundary.
- Treat the 767-line runtime as a change-locality hotspot; split only when responsibility ownership
  becomes clearer and duplicated coordination is actually deleted.
- Maintain deterministic model, component, runtime, package-root usage, and README tests for every
  public contract.
- Maintain a TUI/RPC behavior matrix covering success, rejection, user cancellation, component
  disposal, owner abort, `isCurrent()` failure, action failure, session replacement, and shutdown.
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
- **Editor lifecycle:** Pi's RPC editor lacks `AbortSignal` support, and BTW owns editor-preservation
  behavior around custom UI. Dependency: no editor screen or BTW migration until those invariants have
  a safe owner.
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
| Ordinary `runMenu()` close outcomes visible to callers | Published API 3 collapses Back and Close | Repository API 4 distinguishes root Back and explicit Close | Phase 2 complete in source; runtime TUI/RPC matrix |
| Review TUI viewport policy | Published API 3 is fixed, default 14 rows | Repository API 5 provides opt-in adaptive sizing within the live terminal budget | Adaptive source milestone complete; review component and built-package smokes |
| Reusable consumer input-host logic | Generic behavior added to repository `test/support.ts` | Supported `/testing` source is complete; Stamp and Image Drop adoption remains | Phase 3; package and consumer diffs/tests |
| Proof for each new public flow | Two compatible consumers by default; exceptions require recorded evidence | Two completed proof migrations or an explicit no-go/deferral | Every expansion phase; archived plans and PRs |
| Lifecycle verification | Existing deterministic package and consumer coverage | Every admitted contract covers TUI/RPC, cancellation, disposal, owner abort, stale state, and failure | Every phase; package and repository gates |
| Runtime action/lifecycle ownership | TUI and RPC loops coordinate screen actions in separate branches | If the driver is admitted, one coordinator owns shared action and lifecycle policy | Phase 4; source diff plus behavior matrix |
| Regression gate | 1,937 tests after the supported testing entrypoint | No regression in the repository CI-equivalent gate | Every phase; `npm run check` |

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
- Building a generic catalog, tree, transcript, pager, live-preview, or reorder framework from one
  specialized consumer.
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
