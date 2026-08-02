# 📈 pi-analytics — Local Analytics for Pi

[![npm](https://img.shields.io/npm/v/@narumitw/pi-analytics)](https://www.npmjs.com/package/@narumitw/pi-analytics) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> [!WARNING]
> This extension is experimental. Its metrics, storage format, and dashboard may change between releases.

`@narumitw/pi-analytics` is a local-first [Pi coding agent](https://pi.dev) extension that counts model calls, skill activations, tool activity, and observed provider errors without storing conversation or tool content.

## ✨ Features

- Starts collecting settled Pi response cycles after installation with no configuration.
- Breaks skill activations down by explicit user invocation, model loading, provider, and model.
- Counts tool calls, failures, average duration, and model attribution.
- Reports logical LLM calls per response with average, median, P95, maximum, and distribution buckets.
- Separates HTTP 429/5xx responses, conservative connection-error categories, recovered errors, and terminal provider failures.
- Offers Today, rolling 7-day, rolling 30-day, and all-time views through one `/analytics` TUI/RPC dashboard.
- Stores only content-free metadata in one private local Turso Database.
- Uses forward-only, checksummed, transactional schema migrations and fails closed on unknown newer schemas.
- Never starts a server, contacts Turso Cloud, or sends analytics anywhere.

## 📦 Install

Install persistently:

```bash
pi install npm:@narumitw/pi-analytics
```

Try the published package without installing:

```bash
pi -e npm:@narumitw/pi-analytics
```

Try a local checkout from the repository root:

```bash
pi -e ./experimental/pi-analytics
```

### Supported platforms

The embedded `@tursodatabase/database` dependency currently publishes native binaries for:

- Linux x64 and arm64 with glibc;
- macOS arm64; and
- Windows x64.

On another platform, Pi still loads the extension and `/analytics` remains available, but collection is disabled and the dashboard explains the supported platform boundary. The database engine is pre-1.0. Analytics are treated as non-critical derived metadata. If the history itself matters, stop every Pi process using the extension and back up both `pi-analytics.db` and `pi-analytics.db-wal`; copying only the main file is not a complete backup.

## 🚀 Quick start

Complete at least one Pi response, then run:

```text
/analytics
```

The default overview covers the last seven rolling days:

```text
Analytics · Last 7 days

Response cycles                    83
LLM calls                         192
Calls per response        2.31 · P95 6
Tool calls                        414
Tool errors                         7
Skill activations                  31
Provider errors                     4
Recovered errors                    3
```

Use the menu to change the time range or browse Skills, Tools, Provider reliability, Response cycles, and Data & privacy. Only fully settled cycles are included; active work is omitted until Pi settles.

## 📐 Metric definitions

### Response cycles and LLM calls

A **response cycle** starts when Pi begins agent work and ends at `agent_settled`. Automatic retries, overflow-compaction recovery, tool follow-ups, and queued continuations before settlement stay in that cycle.

An **LLM call** is one logical provider generation. A provider may make several HTTP attempts inside it, so `429 → 429 → 200` is one LLM call, three observed HTTP responses, two provider errors, and a recovered generation.

### Skills

An activation is **User initiated** when an observed interactive or RPC `/skill:<name>` input is associated with an active or subsequently started response cycle. This includes skill commands queued while Pi is streaming. It is **Model initiated** when the built-in `read` tool successfully loads the exact canonical `SKILL.md` path Pi discovered. A skill is counted at most once per response cycle, and explicit user use takes precedence.

Pi does not expose a first-class skill-invocation event or a post-chain acceptance event for input observers. Non-standard loading such as `bash` plus `cat SKILL.md`, unsuccessful reads, and provider behavior invisible to Pi are not counted; an explicit skill input intercepted later by another extension while a response is active may still be observed.

### Tools

A tool call starts at Pi's `tool_execution_start` event and finishes at `tool_execution_end`. The extension stores the tool name, model attribution, timing, completion state, and final error flag. It cannot reliably distinguish another extension blocking a call from every other tool error, so the MVP reports both as errors rather than claiming a separate blocked count.

### Provider reliability

Pi exposes HTTP responses and final assistant failures, not every provider-SDK transport retry. The dashboard therefore labels these values as **observed provider errors**. It reports:

- HTTP 429 and 5xx counts;
- DNS, timeout, connection-refused, connection-reset, TLS, other-network, and other-provider categories;
- recovered errors; and
- terminal failures.

Error messages are classified in memory and discarded. Raw error text is never stored.

## 💬 Command

```text
/analytics
```

The command accepts no arguments. TUI mode uses the full dashboard; RPC mode adapts the same standard screens to dialogs. Print and JSON modes reject the interactive command observably instead of writing ad hoc protocol output.

The root menu contains seven actions:

```text
Change time range
Skills
Tools
Provider reliability
Response cycles
Data & privacy
Close
```

Skills and Tools are searchable browse views with details and model breakdowns. Escape goes Back from nested screens and closes the root. Ctrl+C closes the menu. Cancelling data deletion has no side effects.

## 🔐 Local data and privacy

The database is stored at:

```text
<pi-agent-directory>/pi-analytics.db
```

On Unix, the extension pre-creates and restricts the database and WAL files to mode `0600`, repairs their permissions after migration, and refuses linked database files.

Stored fields are limited to:

- timestamps and durations;
- provider/model IDs and thinking level;
- tool and skill names;
- user/model skill source;
- counts, outcomes, and completion states;
- HTTP status codes; and
- classified provider-error categories.

The extension does **not** store:

- prompts, responses, or thinking content;
- tool arguments or results;
- raw error messages or HTTP headers;
- cwd, project names, file paths, session names, or Pi session IDs; or
- credentials.

It imports only the local embedded database package. It does not install `@tursodatabase/sync`, request Turso credentials, contact Turso Cloud, or perform any other remote telemetry.

Choose **Data & privacy → Clear analytics data…** to transactionally remove all currently committed response, model, skill, tool, and reliability observations. Migration history remains so the valid schema can continue to be used. Another running Pi process may commit a newly settled response after the clear operation.

## 🧱 Database migrations and recovery

Schema migrations are numbered, immutable, contiguous, and checksummed. Pending migrations recheck and apply inside an exclusive transaction with bounded conflict retry, so two Pi processes cannot publish half of a migration. Runtime schema changes follow additive-first compatibility: add nullable columns or tables before considering any later contraction.

The extension never downgrades, repairs, deletes, or recreates a database automatically. If a migration fails, an applied checksum differs, or the database was created by a newer extension version, collection fails closed and existing bytes remain in place. Update the extension or restore a user-managed backup before retrying.

Settled response publication is one atomic transaction. A failed write leaves prior data valid and is retained for bounded retry while that Pi session remains open. Graceful shutdown drains pending writes and closes the session-owned connection.

## 🚧 MVP limitations

- There are no retention settings; records remain until explicitly cleared.
- Prometheus, JSON/CSV export, Turso Cloud sync, browser dashboards, token/cost reporting, and project attribution are not included.
- Statistics cover only events visible through Pi's public extension API.
- Clearing rows is logical deletion, not a secure-erasure guarantee for underlying storage media.

## 🗂️ Package layout

```text
experimental/pi-analytics/
├── src/
│   ├── index.ts              # Thin Pi entrypoint
│   ├── analytics.ts          # Pi lifecycle, command, and session ownership
│   ├── collector.ts          # Content-free response-cycle state machine
│   ├── errors.ts             # Conservative error classification
│   ├── skills.ts             # Explicit and model skill detection
│   ├── menu.ts               # TUI/RPC analytics dashboard
│   ├── types.ts              # Observation records
│   └── storage/
│       ├── database.ts       # Dynamic driver startup and private file lifecycle
│       ├── migrations.ts     # Transactional checksummed schema history
│       ├── queries.ts        # Indexed aggregate projections
│       └── store.ts          # Atomic writes, retries, queries, and clear
├── test/
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

## 🔎 Keywords

Pi extension, Pi coding agent, local analytics, agent skills, tool usage, model calls, provider reliability, Turso Database, SQLite-compatible metrics.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
