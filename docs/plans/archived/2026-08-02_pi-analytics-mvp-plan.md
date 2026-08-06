# Pi Analytics MVP Plan

> Follow-up: the completed package was moved to `packages/pi-analytics` and now shows the
> repository-required experimental warning in both its README and Pi UI.

## Goal

Add a publishable `@narumitw/pi-analytics` extension that collects content-free Pi response, model,
skill, tool, and provider-reliability metadata into a local Turso Database and exposes useful
Today/7-day/30-day/all-time summaries through a lifecycle-safe `/analytics` TUI/RPC dashboard.

## Context

- The extension is local-first and zero-configuration. It must not contact Turso Cloud or any other
  remote analytics service.
- Storage uses `@tursodatabase/database` directly, without Prisma. The driver is a pre-1.0,
  SQLite-compatible Turso engine with native packages for Linux glibc x64/arm64, macOS arm64, and
  Windows x64; unsupported platforms must fail observably without preventing Pi from loading the
  extension.
- Pi exposes exact lifecycle events for response settlement, logical model generations, HTTP
  responses, and tool execution. It does not expose a first-class skill-invocation or connection-error
  event, so the MVP uses documented, conservative detection rules rather than claiming perfect
  attribution.
- The approved UI presents Overview, Skills, Tools, Provider reliability, Response cycles, and Data &
  privacy. It includes only settled response cycles and defaults to the last seven days.
- This plan touches new-package metadata, extension lifecycle/events, local persistence and
  migrations, an asynchronous command/menu, privacy-sensitive classification, tests, documentation,
  and package/runtime verification. Applicable MUST rules come from `docs/extension-conventions.md`:
  canonical entrypoint/package boundaries, factory/session resource ownership, TUI/mode safety,
  command argument behavior, lifecycle cancellation/disposal, deterministic tests, root checks, pack
  inspection, and Pi loading smoke. The MVP adds no extension-owned settings, so
  `docs/extension-settings.md` is not in scope.

## Architecture

- `packages/pi-analytics/src/index.ts` remains a thin default-export forwarder to the extension
  factory in `analytics.ts`.
- `analytics.ts` owns Pi event registration, per-session generations, database startup/shutdown,
  ordered persistence, and command registration; it starts no resource during factory evaluation.
- `collector.ts` is a Pi-independent state machine for one response cycle. It correlates attempts,
  generations, ordered provider responses, parallel tools, skill activations, conservative error
  categories, retries, outcomes, and settlement without retaining event content.
- `skills.ts` maps Pi-provided skill provenance to explicit `/skill:<name>` input and successful
  built-in `read` results. One skill is counted once per response cycle, with explicit user use taking
  precedence over model loading.
- `storage/database.ts` dynamically imports the Turso native driver during `session_start`, opens
  `<agent-dir>/pi-analytics.db`, bounds connection/query waits, and closes only after its write queue
  drains.
- `storage/migrations.ts` owns immutable, contiguous, checksummed forward migrations recorded in
  `schema_migrations`. Every pending migration rechecks and applies inside an exclusive transaction;
  checksum mismatch, a newer unknown schema, or migration failure leaves existing data intact and
  disables collection for that extension instance.
- `storage/store.ts` publishes a settled run and all child observations atomically. It also owns
  indexed aggregate queries and transactional data clearing; callers do not issue SQL.
- `menu.ts` projects typed query results into `@narumitw/pi-tui-kit` action, choice, browse, and detail
  screens. The menu owns no database connection and revalidates session/menu identity after every
  await.
- The database stores timestamps, model/provider IDs, thinking level, tool and skill names, durations,
  counters, HTTP statuses, and classified errors. It never stores prompts, model/thinking output,
  tool arguments/results, raw errors, headers, cwd/project/file paths, session names/IDs, or
  credentials.
- One database file is shared by Pi processes. Each process serializes its own mutations; Turso
  transactions arbitrate cross-process writes. Schema evolution is additive-first so an already
  running older Pi process is not broken by a newly started process.

Expected package layout:

```text
packages/pi-analytics/
├── src/
│   ├── index.ts
│   ├── analytics.ts
│   ├── collector.ts
│   ├── errors.ts
│   ├── menu.ts
│   ├── skills.ts
│   ├── types.ts
│   └── storage/
│       ├── database.ts
│       ├── migrations.ts
│       ├── queries.ts
│       └── store.ts
├── test/
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

## Tech Stack

- Pi extension APIs from `@earendil-works/pi-coding-agent` as peer/runtime-provided surfaces.
- `@tursodatabase/database` as the direct embedded database dependency; no Prisma, ORM, sync client,
  or cloud credentials.
- `@narumitw/pi-tui-kit` for standard cross-mode screens and lifecycle adaptation; select a published
  compatibility floor only after verifying the exact API used exists at that floor.
- Node built-ins for paths, cryptographic migration checksums, file permissions, clocks, and IDs.
- TypeScript strict NodeNext sources, Biome, the repository test compiler/Node test runner, boundary
  validator, package dry run, and non-interactive Pi smokes.

## Non-Goals

- Prometheus, JSON/CSV export, a browser dashboard, Turso Cloud sync, Prisma, or another ORM.
- Prompt/response capture, token/cost reporting, project attribution, raw error diagnostics, or
  general-purpose tracing that overlaps `pi-langfuse`.
- Configurable retention, settings files, statusline/widgets, background HTTP servers, or persistent
  UI outside `/analytics`.
- Exact detection of skills loaded through shell commands or provider-internal retries/errors that Pi
  does not expose.
- Automatic downgrade, destructive schema contraction, secure erase, database repair, or automatic
  replacement of a malformed/newer database.
- Publishing to npm as part of MVP implementation.

## Assumptions

- The package starts at the repository's current shared workspace version and follows existing active
  extension metadata/README conventions.
- Analytics data is non-critical derived metadata. Transaction rollback and fail-closed startup are
  sufficient recovery for the MVP; no automatic backup is required.
- Today uses local calendar boundaries; 7-day and 30-day ranges are rolling windows; All time has no
  lower bound.
- A response cycle begins with the first accepted `before_agent_start` in an idle collector and ends
  at `agent_settled`; queued automatic retries/compaction recovery/continuations remain in that cycle.
- An active, unsettled cycle is excluded from dashboard results and is persisted as `interrupted` only
  during graceful session shutdown/replacement.
- Clearing data removes currently committed observation rows in one transaction but preserves
  migration history; another running Pi process may publish a later settled run after the clear.

## Unknowns

- Confirm in an early spike that the selected Turso release loads through Pi's normal npm runtime and
  the supported local environment, and that an unsupported/missing native binding can be caught by a
  delayed dynamic import.
- Confirm with two independent connections that `transactionAsync(...).exclusive(...)` serializes
  concurrent DDL migration attempts and that normal concurrent run transactions do not corrupt or
  partially publish data.
- Confirm the driver's file creation/permission behavior and close semantics before finalizing the
  `0600` enforcement and shutdown adapter.
- Confirm the smallest published `pi-tui-kit` caret-minor floor containing the browse/detail APIs used
  by the dashboard before recording the dependency range.

## Risks

- **Native driver reduces portability:** gate startup through dynamic import, document the exact native
  support matrix, inject the storage dependency in deterministic tests, and add a real supported-host
  load smoke.
- **Concurrent migrations or writers could race:** perform version checks inside exclusive migration
  transactions, keep writes short and atomic, use bounded busy/query timeouts, and test two live
  connections against one temporary database.
- **A newer process could break an older running process:** prefer nullable columns/new tables and
  dual-read/dual-write transitions; do not rename/drop existing schema in the MVP migration policy.
- **Attribution could overstate precision:** label connection results as observed provider errors,
  discard raw errors after conservative classification, count only successful exact skill-file reads,
  and document non-standard/invisible paths.
- **Lifecycle replacement could write stale state or use a closed database:** generation-guard all
  async continuations, serialize writes before prerequisite awaits, abort menus on replacement, and
  drain the owner queue before close.
- **Queries could block cancellation:** keep every query indexed and timeout-bounded, let the menu
  lifecycle drain in-flight work before disposal, and never publish a result after its owner signal or
  session generation becomes stale.
- **Analytics metadata can still reveal local tool/skill/model names:** use private file permissions,
  no remote transport, a visible privacy inventory, display sanitization, and a transactional clear
  action.
- **Pre-1.0 database changes can break compatibility:** use a bounded dependency range and lockfile,
  isolate all driver calls behind `storage/database.ts`, and verify the package/runtime smoke before
  upgrades.

## Rollback / Recovery

- Before release, remove the new workspace and its focused root aliases, then restore the lockfile;
  no existing package behavior or data is changed.
- After users have data, never roll back the schema automatically. An older extension encountering a
  newer migration version must open no writer and report that the extension needs updating.
- A failed migration rolls back its transaction and leaves the last successfully recorded version;
  collection and ordinary queries remain disabled until a compatible extension starts successfully.
- A failed settled-run write leaves the prior database valid, remains in a bounded process-local retry
  queue, and produces at most one actionable notification per failure episode; shutdown drains the
  queue before giving up observably.
- A malformed or unsupported database is never deleted or recreated automatically. The UI reports its
  path and safe recovery guidance; the user-owned clear action operates only after a valid database is
  open.

## Plan

- [x] Run a Turso integration spike in temporary test fixtures that dynamically imports
  `@tursodatabase/database`, opens/closes a file database, enforces or repairs `0600` on Unix, executes
  an async transaction, catches a simulated missing native binding, and exercises two connections
  contending on one exclusive DDL migration; accept with focused Node tests plus a non-interactive Pi
  load on the supported development host, and resolve every Turso unknown above before production
  storage code depends on it.
- [x] Scaffold `packages/pi-analytics/` with the thin `src/index.ts`, package metadata, strict
  `tsconfig.json`, MIT `LICENSE`, at least one loader test, and the canonical
  `pi.extensions: ["./src/index.ts"]`; add only the verified Turso and Pi TUI Kit runtime dependencies,
  Pi peer dependencies, lockfile changes, root `pack:analytics`, and `just` pack/try/install/publish
  aliases, accepting with package typecheck, `npm run check:boundaries`, and manifest review showing no
  extension-to-extension dependency.
- [x] Define content-free domain types and a reducer in `src/types.ts`, `src/collector.ts`, and
  `src/errors.ts` for response cycles, attempts, logical generations, ordered HTTP responses, parallel
  tools, outcomes, durations, retries, and conservative error categories; drive implementation with
  tests for success, tool loops, parallel completion order, 429/5xx recovery, terminal errors,
  abort/length/interruption, duplicate events, and absent active runs, accepting when no reducer state
  can retain prompt, output, arguments, results, raw errors, headers, cwd, or session identity.
- [x] Implement `src/skills.ts` and collector integration for pending interactive/RPC
  `/skill:<name>` inputs, Pi-provided skill provenance, canonical successful built-in `read` matches,
  per-cycle deduplication, and user precedence over model detection; accept with tests for command
  arguments, extension input exclusion, handled/no-agent input discard, failed reads, repeated reads,
  same-name path collisions, terminal-control names, and non-standard bash reads remaining uncounted.
- [x] Implement `src/storage/migrations.ts` with an immutable contiguous migration registry,
  SHA-256 checksums, the initial tables/indexes, exclusive in-transaction rechecks, and fail-closed
  handling for checksum mismatch, gaps, migration failure, and databases newer than the extension;
  accept with fresh/latest/idempotent/every-prior-version fixtures, forced rollback, modified-history,
  newer-schema, and concurrent two-connection migration tests.
- [x] Implement `src/storage/database.ts` and `src/storage/store.ts` with delayed driver loading,
  agent-directory path resolution, bounded connection/query waits, private permissions, one
  process-local mutation queue, atomic settled-run publication, bounded failed-write retention,
  transactional clear, and idempotent close; accept with temporary-database tests for reopen,
  concurrent writers, partial-write rollback, queue order, transient/permanent failures, shutdown
  drain, repeated close, and no access to the developer's real Pi agent directory.
- [x] Implement indexed aggregate queries in `src/storage/queries.ts` for overview totals,
  per-response generation distributions (average, median, nearest-rank P95, maximum, and
  1/2–3/4–6/7+ buckets), skill source/model breakdowns, tool success/error/duration/model breakdowns,
  and observed provider reliability across Today/7-day/30-day/all-time ranges; accept with fixed-clock
  database fixtures covering exact boundaries, empty ranges, long names, mixed models, retries,
  interrupted runs, and cross-query count reconciliation.
- [x] Integrate the collector and store in `src/analytics.ts` through `input`,
  `before_agent_start`, `agent_start`, `turn_start`, `before_provider_request`,
  `after_provider_response`, assistant message/error, tool lifecycle, `agent_end`, `agent_settled`, and
  session lifecycle events; accept with an extension harness proving event ordering, active-run
  ownership, queued continuation/retry behavior, parallel tools, one atomic settlement, replacement,
  reload, fork/new/resume/quit shutdown, stale-continuation rejection after every await, and graceful
  operation when storage never initializes.
- [x] Build `src/menu.ts` with `pi-tui-kit` standard screens for the seven-row root dashboard,
  transient time-range choice, searchable Skills and Tools browse/detail views, Provider reliability,
  Response cycles, Data & privacy, and exact transactional clear confirmation; accept with TUI/RPC
  harness tests for loading, empty, success, partial, unsupported-platform, migration/query/write
  error, clear-cancel/confirm/racing-writer, Back/Escape/Ctrl+C, owner disposal, query timeout, stale
  results, selection restoration, and widths of 40/80/120 columns without overflow or terminal escape
  injection.
- [x] Register `/analytics` as a no-argument manager command in `src/analytics.ts`, rejecting all
  arguments and trailing input, running only standard TUI/RPC flows, and throwing an observable
  unsupported-mode error in print/JSON without ad hoc protocol output; accept with exact command-mode
  tests and a non-interactive `pi -p -e ./packages/pi-analytics "/analytics"` load/rejection smoke
  that does not invoke a model.
- [x] Write `packages/pi-analytics/README.md` with the approved emoji/badges and standard sections,
  installation/local-try commands, metric definitions, dashboard flow, local database path,
  supported native platforms, no-cloud guarantee, privacy inventory, skill/error detection limits,
  migration/upgrade/newer-schema behavior, data clearing semantics, pre-1.0 database caveat, package
  layout, keywords, and license; accept by cross-checking every public claim against source/tests and
  retaining `🗂️ Package layout`, `🔎 Keywords`, and `📄 License`.
- [x] Audit the complete extension against `docs/extension-conventions.md`: package/entrypoint and
  dependency boundaries; factory/session resource ownership; cancellation, disposal, replacement, and
  shutdown after every await; command/mode behavior; output/privacy bounds; stable UI ownership; and
  focused deterministic coverage. Resolve every same-class failure across the whole new package and
  record any accepted deviation next to its owner before running final gates.
- [x] Run `npm run check`, `just pack analytics`, inspect the dry-run tarball for only declared source,
  README, license, and metadata, run the supported-host Turso file/concurrency smoke, and run the
  non-interactive local Pi entrypoint/command smoke; accept only when all pass, no external network or
  real agent data is touched, and every skipped platform/runtime path is documented in the handoff.

## Execution Evidence

- Turso spike and permanent tests proved supported-host native loading, private database and WAL files,
  linked-file rejection, idempotent close, bounded cross-connection migration/write retries, atomic
  rollback, and two live writers. The spike also established that default file databases require
  immediate/exclusive retry rather than `BEGIN CONCURRENT`.
- `packages/pi-analytics/test/` contains 48 deterministic tests covering collection, retries,
  automatic continuation, streaming and model skill attribution, migrations, permissions,
  concurrency, aggregation boundaries, loading/cancellation, TUI/RPC rendering, clear commit
  semantics, unsupported storage, replacement, shutdown, and command modes.
- `npm run check` passed the final tree: Biome checked 665 files, boundaries accepted 23 active
  extensions, every workspace typechecked, and all 2,174 repository tests passed.
- `just pack analytics` produced a 14-file dry run containing only `src/`, `README.md`, `LICENSE`, and
  `package.json`; no tests, generated output, or undeclared files were included.
- A non-interactive Pi smoke with an isolated `PI_CODING_AGENT_DIR` loaded the extension, rejected
  `/analytics` observably in print mode without invoking a model, and created only private `0600`
  analytics database/WAL files plus Pi's private auth file.
- `npm audit --omit=dev` reported zero vulnerabilities. The supported-host native runtime was verified
  on Linux x64 glibc; other declared native platforms remain unexecuted locally and are documented as
  the upstream package's support matrix rather than claimed smoke coverage.
- Final semantic review used `docs/extension-conventions.md` and the official Pi extension, skill,
  session-format, and TUI documentation. Extension-owned settings are absent, so
  `docs/extension-settings.md` remained out of scope. No convention deviation was accepted.

## Completion Checklist

- [x] `@narumitw/pi-analytics` is an independently installable experimental extension with a thin canonical
  entrypoint, bounded runtime dependencies, root workflow aliases, tests, practical English README,
  and inspected package contents.
- [x] The extension records only the approved content-free fields, never contacts a remote service,
  and exposes transparent skill/error attribution limits and local clearing behavior.
- [x] Response, generation, HTTP retry, tool, skill, outcome, and reliability semantics match the
  approved definitions under success, retry, parallelism, cancellation, replacement, and shutdown.
- [x] Turso startup, permissions, migrations, concurrent connections, atomic writes, query bounds,
  failed-write recovery, newer/malformed database handling, and idempotent closure are verified on a
  supported native host.
- [x] `/analytics` provides the approved Today/7-day/30-day/all-time TUI/RPC flows with tested loading,
  empty, success, error, partial, unsupported, cancellation, disposal, accessibility, and destructive
  confirmation states; print/JSON and arguments reject observably.
- [x] The final semantic audit names `docs/extension-conventions.md` as read, confirms settings are not
  touched, and records checks/smokes plus any accepted deviation or unverified native platform.
- [x] `npm run check`, `just pack analytics`, the Turso runtime/concurrency smoke, and the
  non-interactive Pi load/command smoke pass against the final diff.
- [x] After all items above have evidence, archive this plan as
  `docs/plans/archived/2026-08-02_pi-analytics-mvp-plan.md` and report the archived path.
