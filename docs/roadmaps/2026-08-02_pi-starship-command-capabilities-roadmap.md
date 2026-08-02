# pi-starship Command Capabilities Roadmap

## Vision

Make `/starship` a trustworthy Pi-native surface for understanding, inspecting, and safely changing
the footer. Follow the useful intent of upstream Starship commands—especially `explain`, `module`,
`print-config`, `toggle`, and `bug-report`—without cloning shell-only commands or weakening Pi's
render, lifecycle, privacy, and settings boundaries.

## Objectives

- **Explain the current footer** — Success after Phase 2: every non-empty module in the rendered
  footer is represented exactly once with a catalog-owned name and description, using the same
  immutable snapshot and no new render-time I/O.
- **Make all supported modules discoverable** — Success after Phase 3: every catalog module appears
  once with a non-color state, current preview when available, and an accurate reason when it is not
  showing.
- **Make configuration state transparent** — Success after Phase 4: users can distinguish overview,
  raw document, and computed public configuration; every read-only path creates zero files, and a
  failed reload preserves the last valid effective footer.
- **Keep mutations truthful and recoverable** — Success after Phase 5: no action conflates module
  `disabled` state with root-format reachability, and every approved mutation retains preview,
  confirmation, atomic publication, rollback, and unknown-field protection.
- **Improve support without collecting telemetry** — Success after Phase 6: users can review a
  bounded, sanitized diagnostic report locally; performance data appears only if collector timing
  can be measured and labelled accurately. Adoption targets remain TBD because the repository has no
  telemetry or grounded usage baseline.

## Current State

- `@narumitw/pi-starship` renders Starship-style TOML natively and does not invoke the Starship binary
  or load `~/.config/starship.toml`.
- The built-in footer uses an explicit nine-module root. Module reachability controls whether cached
  filesystem, Git, command, timer, or network work starts; footer rendering itself is pure.
- PR #516, PR #517, and PR #518 are merged on `main`. Together they provide palette-free
  Starship-compatible built-in style semantics plus a shallow six-action `/starship` menu, accurate
  built-in/fallback states, adaptive transactional preview, strict direct routes, and
  lifecycle/settings regression coverage. Their required CI and CodeQL checks passed.
- The renderer's grouped output feeds a catalog that owns module names, descriptions, variables,
  defaults, options, and ordering. One pure inspection model combines those entries with effective
  config, root reachability, and the current immutable runtime snapshot for Explain and Modules.
- Configuration loading retains both a normalized effective config and the original document. No
  public computed-config projection currently excludes parser ASTs and private runtime metadata.
- `/starship settings`, `/starship status`, and `/starship help` are the only direct routes. Print and
  JSON modes intentionally emit no ad hoc command output; RPC uses notifications rather than custom
  terminal UI.
- There is no structured module mutation UI, diagnostic-report exporter, Pi-native preset catalog,
  or collector duration instrumentation.
- Checked-in upstream Starship at the repository-pinned revision defines `explain` as a breakdown of
  currently visible modules, `module` as one-module rendering/listing, `print-config` as defaults
  merged into computed config, `toggle` as a config mutation, and `timings` as module execution cost.
  Only the user goals—not shell-specific implementation details—transfer to Pi.

## Guiding Principles

- **Adapt, do not imitate:** preserve upstream command intent only when it maps to a real Pi footer
  goal.
- **Explain before mutating:** establish read-only output, module state, and configuration semantics
  before adding structured settings actions.
- **One source of truth:** derive descriptions and state from the module catalog, effective config,
  rendered result, and immutable runtime snapshot rather than duplicating module logic in commands.
- **Truthful states:** distinguish Showing, Empty, Disabled, Not in format, and—only when collector
  evidence exists—Unavailable in text; never describe `disabled = false` alone as visible or enabled
  in the footer.
- **Pure presentation:** explanation, previews, and TUI rendering perform no filesystem, subprocess,
  environment, timer, or network work.
- **Safe settings:** missing-file reads stay side-effect free; invalid documents remain protected;
  writes remain explicit, serialized, atomic, rollback-capable, and unknown-field aware.
- **Shallow navigation:** keep no more than seven top-level goals and add depth only for coherent
  Configuration or Help & support capabilities; do not restore an undifferentiated Advanced menu.
- **Private support:** reports use an allowlist, remain local until explicit user action, and never
  include credentials, message content, complete paths, remote URLs, or raw configuration by default.

## Roadmap

### Phase 1: Land the trustworthy management baseline

- [x] The state-aware, four-action `/starship` workflow is merged on `main` with its adaptive preview,
  strict routing, destructive-restore disclosure, side-effect-free missing-file behavior, and
  deterministic lifecycle/settings checks intact. Evidence: PR #517 merged as `6a39955`; CI and
  CodeQL completed successfully.

**Outcome:** The source baseline on `main` makes customization and recovery dependable enough to host
additional read-only capabilities without reopening foundational menu, preview, or persistence
problems. npm publication is intentionally deferred and is not part of this phase.

### Phase 2: Explain what is showing

- [x] Every registered module exposes a concise catalog-owned description suitable for command UI and
  documentation without changing its render behavior. Evidence: PR #518 merged as `a1834b9`; catalog
  type coverage and focused duplicate/non-empty description tests pass for all registered modules.
- [x] **Explain footer** presents each currently rendered non-empty module exactly once with rendered
  value, module name, description, and available snapshot state; it has explicit empty/unavailable
  states and starts no collection work. Evidence: PR #518's responsive TUI, runtime collector-spy,
  lifecycle, CI, and CodeQL checks passed.

**Outcome:** Users can answer “what is this footer showing, and why?” from the same data that produced
the footer. This establishes the shared explanation model needed by module browsing and support.

### Phase 3: Make module state discoverable

- [x] **Modules** provides a bounded searchable list in which every catalog module has one textual
  state: Showing, Empty, Disabled, Not in format, or Unavailable only when the current footer cannot
  provide an inspection snapshot. Evidence: PR #518's catalog/state/search/resize/keybinding tests
  passed.
- [x] Module detail exposes its current preview when available, format variables, relevant style and
  display fields, root reference and reachability, and every reason the runtime can determine for
  absent output without writing settings. Evidence: PR #518's detail, no-write, disposal,
  replacement, shutdown, CI, and CodeQL checks passed.

**Outcome:** Users can inspect supported and hidden capabilities without reading source or assuming
that absence means disabled. The state model provides the prerequisite for honest module actions.

### Phase 4: Make configuration transparent

- [ ] **Configuration** becomes one coherent section containing Overview, Computed configuration,
  Settings document, and Reload from disk while the top-level menu remains at six or fewer goals.
- [ ] Computed configuration deterministically projects only public TOML fields from normalized
  effective state and clearly excludes comments and unknown fields; Settings document presents the
  byte-preserving raw source through a terminal-safe read-only view and explains a healthy
  missing-file state.
- [ ] Reload from disk validates and previews external changes, applies only a valid current
  generation, creates no file, and preserves the prior effective footer on absence, invalid input,
  cancellation, replacement, shutdown, or apply failure.

**Outcome:** Users can distinguish what they wrote from what pi-starship is using and can safely apply
external edits without reloading the whole Pi session.

### Phase 5: Make module changes unambiguous

- [ ] A documented module-action contract decides separately how `disabled` and root-format
  reachability change, including what happens to `$all`, duplicate references, comments, custom root
  expressions, and modules whose collectors have lifecycle cost.
- [ ] Only actions approved by that contract are exposed from module detail, with accurate resulting
  state, adaptive preview, explicit confirmation, atomic publication, runtime apply, rollback,
  cancellation, and stale-session protection.

**Outcome:** Structured module actions can be trusted to produce the visible result they promise
rather than copying upstream `toggle` into a different format/reachability model.

### Phase 6: Make support evidence safe and actionable

- [ ] **Help & support** can produce a local preview of a bounded diagnostic report containing only
  allowlisted version, configuration-state, sanitized diagnostic, module-state, and collector-health
  fields; sharing or opening an issue always requires a separate explicit user action.
- [ ] A performance view is either delivered from bounded collector duration/age/failure
  instrumentation or explicitly rejected after measurement proves it non-actionable; it is never
  labelled as upstream-style module timings when it measures asynchronous Pi collectors.

**Outcome:** Users can diagnose and report problems with useful local evidence without hidden
telemetry, accidental disclosure, or misleading timing semantics.

## Proposed Information Architecture

```text
/starship
├─ Customize footer
├─ Explain footer
├─ Modules
├─ Configuration
│  ├─ Overview
│  ├─ Computed configuration
│  ├─ Settings document
│  └─ Reload from disk
├─ Help & support
│  ├─ Quick help
│  ├─ Diagnostic report
│  └─ Documentation
└─ Restore built-in…
```

`Explain footer` owns the current full preview and visible-module breakdown. A separate top-level
Prompt preview is not planned because Pi already displays the footer continuously.

## Upstream Command Adaptation

| Upstream Starship command | pi-starship direction | Roadmap position |
| --- | --- | --- |
| `config` | Keep transactional Customize; add safe external reload | Existing / Phase 4 |
| `explain` | Explain currently rendered Pi modules | Phase 2 |
| `module` | Search, inspect, and preview one Pi module | Phase 3 |
| `print-config` | Show a read-only public computed-config projection | Phase 4 |
| `toggle` | Separate disabled state from root-format reachability | Phase 5 |
| `bug-report` | Preview a sanitized local support report | Phase 6 |
| `timings` | Measure Pi collectors only if instrumentation is actionable | Phase 6 gate |
| `prompt` | Integrate current preview into Explain footer | Phase 2 |
| `preset` | Defer pending a separate Pi-native preset decision | Deferred |
| `completions`, `init`, `session`, `statusline` | Exclude shell/provider lifecycle commands | Non-goal |

## Success Metrics

| Indicator | Baseline | Target / invariant | Measurement source |
| --- | --- | --- | --- |
| Visible modules represented by Explain | No Explain surface | Every non-empty rendered module exactly once | Render/explain parity tests |
| Catalog modules represented in Modules | No module browser | Every registered module exactly once with a textual state | Catalog-driven UI tests |
| I/O started by footer/explanation rendering | 0 | 0 | Source audit and collector-spy tests |
| Files created by read-only command paths | 0 | 0 | Missing-directory/filesystem tests |
| Public computed-config fields | No projection | Public TOML fields only; no AST/private runtime data | Serialization contract tests |
| Invalid/cancelled reload changes | Not available | 0 file bytes and 0 effective-state changes | Settings/lifecycle tests |
| Sensitive or raw content in diagnostic report | No report | 0 excluded fields; 0 automatic network requests | Allowlist/redaction tests |
| Adoption and task-completion rate | Unknown; no telemetry | TBD only if privacy-compatible evidence exists | No current measurement source |

## Risks and Dependencies

| Risk or dependency | Impact | Mitigation / decision |
| --- | --- | --- |
| Catalog descriptions or state semantics drift from rendering | Explain and Modules could become inconsistent with the footer | Keep metadata catalog-owned and retain render/inspection parity plus exhaustive catalog tests. |
| Per-module chunks do not alone explain root reachability or empty values | A browser could mislabel modules | Keep the shared inspection model derived from effective config, root variables, and the same rendered result. |
| Computed config contains ASTs or private selectors internally | Output could expose invalid/non-public schema | Serialize through an explicit public projection; keep raw document as a separate byte-preserving view. |
| `disabled` and explicit root format are independent | A copied `toggle` action could promise visibility without producing it | Gate Phase 5 on a documented two-axis action contract and preview the resulting footer. |
| Collectors have asynchronous cost while rendering is pure | Upstream `timings` semantics would be misleading | Instrument collector age/duration separately or reject the feature. |
| Diagnostic context can contain paths, remotes, config, or terminal controls | Support output could leak data or inject terminal content | Use bounded allowlisted fields, sanitize at the display boundary, and preview before sharing. |
| `main` is ahead of npm `0.44.0` while release is deferred | Users installing from npm do not yet receive the merged baseline or later roadmap capabilities | Distinguish merged source status from published availability and require separate release authorization. |
| Zero-major pi-tui-kit ranges intentionally do not follow workspace minors | Consumers can miss newer shared lifecycle and keybinding behavior | Raise each consumer's compatibility floor only through a manually reviewed dependency change and verify its resolved package. |
| No usage telemetry or validated preset demand | Prioritization and preset value are uncertain | Keep targets explicit unknowns and presets outside this roadmap until evidence supports a separate decision. |

## Decisions and Changes

- **2026-08-02 — Defer release:** Phase 1 now completes when the verified command baseline is merged
  on `main`. No version bump, npm publication, tag, or GitHub release is implied; published
  availability remains a separately authorized decision.
- **2026-08-02 — Keep inspector compatibility local:** pi-starship initially retained its declared
  pi-tui-kit compatibility floor, so Explain and Modules shipped through one extension-owned
  adaptive inspector rather than relying on newer monorepo-only APIs.
- **2026-08-02 — Raise the helper floor explicitly:** after Phase 2–3 merged, a separate manually
  reviewed change raises pi-starship's pi-tui-kit floor to the shared API-v5 release. The inspector
  remains extension-owned because the kit still has no searchable read-only browse/detail screen;
  consumer ranges must not be synchronized automatically.

## Non-Goals

- Trigger a package version bump, npm publication, Git tag, or GitHub release while publication is
  deferred.
- Clone the complete Starship CLI or promise full Starship module/config compatibility.
- Add shell completions, shell initialization, random session keys, provider statusline generation, or
  ad hoc print/JSON output.
- Invoke the Starship executable, read `~/.config/starship.toml`, run arbitrary custom commands, or
  expose unrestricted environment variables.
- Import upstream Starship presets directly or add a preset selector before a separately approved
  Pi-native preset catalog and replacement contract exist.
- Add module timing labels without collector instrumentation, or add telemetry to establish adoption.
- Change formatter/style semantics, the built-in nine-module root, module defaults, palette behavior,
  settings location, or backup/migration policy as part of these command capabilities.
- Automatically create a GitHub issue or transmit diagnostics without a separate informed action.

## Assumptions and Unknowns

- This roadmap is for maintainers and contributors; no delivery dates, owners, capacity commitments,
  or release horizon were supplied.
- Milestone completion currently tracks verified capabilities merged on `main`, not npm availability;
  the roadmap must state that distinction while release remains deferred.
- Explainability and discovery are assumed to be more valuable and lower risk than immediate module
  mutation because they build on existing renderer/catalog data and do not write settings.
- Demand for structured toggles, collector performance diagnostics, issue creation, and Pi-native
  presets is unknown. Their scope must remain gated rather than inferred from upstream Starship's CLI.
- New direct routes such as `/starship explain` or `/starship module` are not assumed. Menu-first TUI
  delivery should precede any RPC/non-TUI protocol decision with a concrete automation use case.
