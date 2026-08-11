# Pi Firecrawl Lazy Tools Plan

## Goal

Keep one lightweight `firecrawl_load` tool active and defer the five Firecrawl capability definitions until the model requests an allowed scraping, crawling, crawl-status, URL-discovery, or web-search capability.

## Context

Pi 0.84 supports dynamic tool loading when a loader makes a purely additive `setActiveTools()` call during execution.

`@narumitw/pi-firecrawl` currently registers and eagerly activates five independently configurable tools.

Its saved `tools` array currently means “activate these tools” and will instead become the allowed lazy-load catalog.

The package has immediate-save tool selection, serialized and atomic settings writes, session-owned oversized-response artifacts, and compatibility handling for `pi-firecrawl-settings.json` that must remain intact.

## Architecture

- Add package-owned `tool-names.ts` and `lazy-tools.ts` modules so names, catalog policy, query matching, and loader behavior do not create tool-definition or settings cycles.
- Register `firecrawl_scrape`, `firecrawl_crawl`, `firecrawl_crawl_status`, `firecrawl_map`, `firecrawl_search`, and `firecrawl_load` at extension load.
- Keep `firecrawl_load` active across the session and remove all five capability definitions from the initial active set after settings load.
- Store the allowed catalog per `ExtensionAPI` in a package-owned shared weak registry so reloads and fresh module instances do not leak policy across runtimes.
- Match a bounded task query by exact normalized terms after filtering to the allowed catalog, retain the highest-scoring capability set, then add up to the requested limit without removing any active tool.
- Treat crawl status as a companion to a best-matching crawl-creation capability so a general crawl workflow loads both, while a status-specific query loads only `firecrawl_crawl_status`; exact terms avoid accidental substring matches such as `web` matching `website`.
- Move persistent guidance to `firecrawl_load`, including the missing-API-key no-retry rule, and remove `promptSnippet` and `promptGuidelines` from deferred capability tools so lazy activation does not rebuild the system-prompt prefix.
- Keep API calls, response truncation, private artifact storage, and session shutdown cleanup in their existing owners.
- Keep the selector’s immediate-save interaction model, but relabel selection as available/unavailable policy rather than eager enable/disable state.

## Convention Map

- Tool registration and execution MUST keep factory evaluation free of action-method reads, keep failures observable, honor cancellation, and bound output; verify with factory/loader tests, capability tests, and review of additive `setActiveTools()` calls.
- Session lifecycle MUST reject stale continuations and release response artifacts and status UI; verify generation/replacement tests, shutdown tests, and lifecycle review.
- Command routes MUST retain aliases, completions, exact parsing, and observable behavior in every claimed mode; verify TUI, RPC, print, and JSON tests.
- TUI custom flows MUST remain TUI-only, width-safe, cancellable, and disposal-safe; verify selector and narrow-width tests plus review of the existing Kit flow.
- Settings MUST remain side-effect free on read, ordered, atomic, invalid-file protecting, unknown-field preserving, legacy-compatible, and rollback-safe; verify existing and expanded settings/concurrency tests.
- Published behavior MUST have deterministic tests, a Changeset, package-aligned files, a pack dry run, a declared-entrypoint smoke, and the repository check gate.

## Non-Goals

- Do not lazy-load the extension module, Firecrawl client, or response-artifact subsystem.
- Do not change Firecrawl request payloads, endpoints, API-key sources, truncation limits, or temporary-file security.
- Do not introduce provider-specific deferred-loading payloads; Pi owns native references and fallback behavior.
- Do not redesign the immediate-save selector into a staged review workflow.
- Do not share code with another extension package or depend on the Chrome DevTools extension.

## Risks

- Generic queries can select the wrong capability unless matching is deterministic, catalog-filtered before limiting, and covered by representative tests.
- Removing capability prompt metadata can lose the missing-key recovery rule unless the loader owns equivalent always-active guidance.
- Settings rollback can restore the catalog but lose the previously loaded subset unless both availability and active capability state are captured and restored.
- A session replacement during settings or artifact work can publish stale state unless existing generation checks and shutdown durability boundaries remain authoritative.
- Command labels can imply eager activation unless README, status, menus, aliases, and notifications consistently distinguish “available” from “loaded.”

## Risk Disposition

- Deterministic exact-term ranking, catalog-first filtering, morphology cases, and crawl-companion tests cover query selection; substring matching was rejected after a regression exposed `web` matching `website`.
- The loader owns the missing-key guidance, and every deferred capability has no active-only prompt metadata.
- Transaction snapshots and regression tests restore both availability and loaded capabilities after failure.
- Generation checks now guard session start, command continuations, selector work, and status reads after every relevant await; shutdown still waits for settings durability and artifact cleanup.
- User-facing terminology consistently distinguishes available catalog entries from loaded capabilities, and terminal controls are stripped from settings, status, configuration, unknown-command, and failure display paths.

## Plan

- [x] Add focused failing tests under `packages/pi-firecrawl/test/` for six-tool registration, absent capability prompt metadata, loader-only session initialization, bounded query/limit validation, catalog-first matching, additive activation, repeated loads, crawl/crawl-status matching, and rejection of unavailable capabilities. Evidence: the focused pre-implementation run executed 37 tests and the five new lazy-loading behavior groups failed for the intended missing-loader/eager-active reasons; loader cases now live in `lazy-tools.test.ts` so no test source exceeds 1,000 lines.
- [x] Add `packages/pi-firecrawl/src/tool-names.ts` and update settings, selectors, tests, and tool definitions to consume the neutral five-name tuple without changing accepted names or ordering. Evidence: normalization, duplicate ordering, canonical/legacy settings, and compatibility tests pass.
- [x] Add `packages/pi-firecrawl/src/lazy-tools.ts` with `firecrawl_load`, deterministic search metadata, a per-API allowed catalog, bounded constant-size results, cancellation checks, loader-only initialization, additive activation, and helpers for availability changes. Evidence: factory action-method safety, registration, schema, cancellation, no-network, repeat-load, missing-settings replacement, catalog-first limit, morphology, task distinction, crawl companion, and status-only tests pass.
- [x] Update `packages/pi-firecrawl/src/firecrawl.ts` to register the loader, initialize the unsaved catalog from Pi’s current policy, apply valid saved settings as availability, keep invalid or missing settings side-effect free, and defer all five capabilities after each current `session_start`. Evidence: missing, valid, invalid, canonical/legacy precedence, replacement-generation, and shutdown suites pass.
- [x] Refactor `packages/pi-firecrawl/src/tool-selector.ts` so immediate-save toggles mutate availability, remove newly unavailable loaded tools, leave newly available tools deferred, preserve other active tools, reject queued selector publication after availability changes, and restore both prior availability and prior loaded capabilities after save failure. Evidence: immediate-save cursor, deferred enable, unload, queued stale selection, ordered saves, invalid-file rollback, failed publication, unknown-field, and shutdown-invalidated save tests pass.
- [x] Update Firecrawl menu, selector, completions, notifications, command guide, and status output to show available count, loaded count, loader state, persisted lazy catalog, API-key presence, and non-Firecrawl active-tool count; retain `tools`/`toggle`, `enable`/`on`, and `disable`/`off` routes with availability semantics. Evidence: command, menu, status, alias, narrow-width, and cursor tests pass.
- [x] Make menu, `tools`, `help`, `config`, `quickstart`, `status`, and unknown-command behavior explicitly observable or rejecting in TUI, RPC, print, and JSON modes, while preserving deterministic non-interactive `enable` and `disable`. Evidence: exact JSON/print rejection coverage plus TUI menu/selector and RPC status/selector tests pass.
- [x] Adapt existing Firecrawl execution tests to select only the five capability tools when iterating network behavior, ensuring `firecrawl_load` never performs network I/O or creates response artifacts. Evidence: all five oversized-success paths, bounded errors, private artifact permissions, unique paths, per-session ownership, in-flight cleanup, and shutdown rejection tests pass.
- [x] Update `packages/pi-firecrawl/README.md` with the six-tool model, two-stage loading flow, native deferred/fallback behavior, catalog settings semantics, API-key failure behavior, command modes, immediate-save behavior, and package layout.
- [x] Add a minor Changeset for `@narumitw/pi-firecrawl` and verify `npm run changeset:status` reports the intended release. Evidence: `.changeset/lazy-firecrawl-tools.md` resolves the package to the next minor version.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`, covering additive loader execution, bounded output, cancellation, session replacement, artifact cleanup, settings concurrency, rollback, invalid-file safety, legacy precedence, prompt metadata, terminal-safe display, and extension independence. Evidence: loader execution is purely additive and constant-bounded; capability execution and artifact ownership are unchanged; generation checks guard post-await state; settings tests cover ordering, atomic failure, stale selection, invalid files, unknown fields, and legacy precedence; no extension dependency or untrusted terminal display path was added.
- [x] Run package format, typecheck, all Firecrawl tests, `npm run check` with an isolated temporary `PI_CODING_AGENT_DIR`, `just pack firecrawl`, and an offline declared-entrypoint Pi smoke. Evidence: package format/typecheck and 46 Firecrawl tests pass; the repository gate passes 302 test files and 3,006 tests; the dry-run tarball contains 12 expected files including both new source modules; the offline entrypoint resolves successfully. No live Firecrawl request was run because request behavior is unchanged and deterministic network fixtures cover it; Windows and macOS rendering were not exercised.

## Completion Checklist

- [x] Only `firecrawl_load` is active for this extension immediately after current session initialization.
- [x] Loader execution adds matching allowed capabilities without removing any active tool or performing network I/O.
- [x] Generic crawl workflows can discover both crawl creation and crawl-status capabilities, and catalog filtering occurs before result limiting.
- [x] Missing `FIRECRAWL_API_KEY` guidance remains active without eagerly loading a capability definition.
- [x] Saved `tools` values control availability, loaded subsets remain session-local, and disabling availability unloads affected capabilities.
- [x] Settings saves remain ordered, atomic, unknown-field preserving, legacy-compatible, and rollback-safe for both availability and loaded state.
- [x] Existing Firecrawl request, truncation, artifact-permission, ownership, cancellation, and shutdown behavior remains unchanged.
- [x] README, command surfaces, status output, tests, minor Changeset, package dry run, runtime smoke, semantic audits, and repository checks are complete.
- [x] The completed plan is moved to `docs/plans/archived/` only after every item has evidence.
