# pi-stamp Roadmap

## Vision

`@narumitw/pi-stamp` adds quiet, trustworthy metadata stamps to Pi's transcript. A stamp answers a
small question—when was this sent, how long did it take, which model produced it, what usage was
reported, or how long did a tool run—without changing message content, sending stamp data to the
model, or turning the transcript into an analytics dashboard.

**Current roadmap status:** Phases 1–5 are implemented. Phase 6 is an explicit upstream platform
dependency: the current installed Pi API exposes no public decorator for built-in user, assistant,
or tool rows, so no further extension implementation is actionable without violating the public-API
boundary.

## Objectives

1. Preserve one dim local timestamp as the compatibility default for every newly observed user and
   assistant message in TUI mode.
2. Offer opt-in date/time controls, response timing, assistant provenance/usage, and tool timing with
   labels that distinguish local observation boundaries from provider-reported values.
3. Keep all stamp entries outside LLM context, perform zero provider/telemetry requests, and exclude
   credentials, opaque signatures, message/tool content, and raw diagnostics.
4. Maintain exact versioned persistence so malformed or unknown entries fail closed and all older
   supported entries continue rendering without migration or history rewrites.
5. Move stamps into owning transcript rows only after Pi publishes a stable decoration API and a
   bounded deduplication/migration design is verified.

## Current State

- `extensions/pi-stamp/src/stamp.ts` observes message and tool lifecycle events only in TUI sessions,
  appends `pi-stamp` custom entries, and registers one callback-theme-aware, width-safe renderer.
- Message entry versions 1–4 preserve timestamps, date context, response timing, and opt-in sanitized
  assistant metadata. A disjoint version-1 tool schema stores only bounded ID association, local
  timing, and outcome.
- `/stamp` exposes Settings, Status, and Help through `@narumitw/pi-tui-kit`. The user-only
  `pi-stamp.json` protocol validates exact values, preserves unknown fields, blocks malformed-file
  replacement, serializes in-process reads/writes, and publishes by private temporary file plus
  atomic rename.
- The default remains timestamp-only. Assistant metadata and tool stamps are not captured unless
  their settings are enabled. Response IDs and bounded diagnostic type/name/code summaries require
  both metadata opt-in and Pi's explicit transcript-expansion state.
- Tool observations are paired by `toolCallId`, appended in tool-result source order, capped at 256
  per turn, and cleared independently on turn replacement, cancellation/agent end, session
  replacement/reload, and shutdown.
- Pi custom entries are excluded from `buildSessionContext()`. Pi's current extension API can render
  separate custom rows but cannot decorate built-in transcript rows or insert entries retroactively.

## Guiding Principles

- **Minimal by default:** show only a dim timestamp unless the user explicitly enables more.
- **Truthful labels:** distinguish message creation, first-content, completion, elapsed tool time,
  requested model, provider-reported response model, and reported estimated cost.
- **TUI-only presentation:** persist stamps as custom session entries that never participate in LLM
  context; append no transcript stamps in print, JSON, or RPC sessions.
- **Provider-neutral behavior:** show optional metadata only when the finalized assistant message
  carries an individually valid value; never infer missing totals, models, costs, or diagnostics.
- **Private by design:** perform no network requests and never copy content, arguments/results,
  credentials, opaque signatures, diagnostic messages/stacks/details, or raw payloads into stamps.
- **Public Pi APIs only:** do not replace or monkey-patch built-in message/tool components.
- **Compatible persistence:** use exact versioned schemas, retain older readers, and ignore unknown or
  malformed entries safely.
- **Bounded lifecycle ownership:** cap mutable state and clear every owned observation on cancellation,
  turn/session replacement, reload, and shutdown.

## Roadmap Themes

### Quiet context

Keep the default transcript visually small while allowing date, timing, provenance, usage, and tool
context to be enabled independently through one settings surface.

### Truthful local and provider boundaries

Persist absolute observations and sanitized reported values, then derive labels at render time. Never
present one lifecycle boundary or inferred aggregate as another.

### Private, compatible session data

Use custom entries outside model context, exact validation, bounded summaries, no telemetry, and
cumulative payload versions rather than rewriting conversation history.

### Platform-native integration

Stay within Pi's public renderer/lifecycle contracts now; adopt in-row decoration only when upstream
provides an explicit stable seam.

## Phases and Milestones

### Phase 1: Establish message timestamps

**Status:** Implemented; see the archived
[initial-version plan](../plans/archived/2026-07-29_pi-stamp-initial-version-plan.md).

**Milestones:**

- Every newly observed TUI user and assistant message receives one dim, right-aligned local
  `HH:mm:ss` stamp derived from its persisted message `timestamp`.
- Version-1 `pi-stamp` custom entries survive reload/resume and remain excluded from model context.
- Tool results, custom/bash messages, compaction summaries, branch summaries, non-TUI modes, and old
  unstamped history remain untouched.

**Outcome:** A passive timestamp-only extension establishes the persistence and rendering boundary
without commands, settings, network access, or background work.

### Phase 2: Add presentation controls

**Status:** Implemented; see the archived
[presentation-controls plan](../plans/archived/2026-07-29_pi-stamp-presentation-controls-plan.md).

**Milestones:**

- Local day changes can add date context, while 12/24-hour display, seconds, locale, and explicit
  time-zone controls retain the original minimal compatibility default.
- Version-2 message entries persist predecessor timestamps so mounted stamps can recompute day
  boundaries under current settings without rewriting history.
- `/stamp` and the extension-owned user settings file satisfy precedence, validation,
  malformed-file recovery, unknown-field preservation, ordering, rollback, and atomic-publication
  requirements.

**Outcome:** Users can tailor absolute date/time presentation while persistence and default output
remain compatible.

### Phase 3: Measure response timing

**Status:** Implemented; see the archived
[response-timing plan](../plans/archived/2026-07-29_pi-stamp-response-timing-plan.md).

**Milestones:**

- Version-3 assistant entries record extension-observed completion separately from message creation
  and optionally the first meaningful text/thinking/tool-call stream update.
- Compact duration and detailed first-content/total labels remain opt-in, degrade on invalid clocks,
  and never substitute a different boundary for missing first content.
- Tool runtime, provider-server latency, full-agent settlement, retries outside the assistant
  message, and legacy entries are excluded from response timing.

**Outcome:** Assistant stamps can show truthful local response timing without changing the default or
claiming provider telemetry.

### Phase 4: Expose assistant provenance and usage

**Status:** Implemented; see the archived
[roadmap-completion plan](../plans/archived/2026-07-30_pi-stamp-roadmap-completion-plan.md).

**Milestones:**

- `assistantMetadata` offers `off`, `compact`, and `expanded`; `off` remains the default and captures
  no new metadata snapshot.
- Version-4 assistant entries persist sanitized API, provider, requested model, optional
  provider-reported response model, stop reason, and individually valid input/output/reasoning/
  cache-read/cache-write/total token and estimated-cost values.
- Compact output shows model, response-model differences, reported total tokens, and estimated cost;
  expanded output labels every available field rather than filling gaps.
- Response IDs and at most five diagnostic type/error-name/error-code summaries appear only when
  metadata is enabled and Pi transcript details are explicitly expanded. Content, tool data,
  signatures, diagnostic messages/stacks/details, and raw payloads are never copied into stamp data.

**Outcome:** Users can inspect per-response provenance and reported usage with bounded privacy and
truthfulness guarantees while timestamp-only sessions remain unchanged.

### Phase 5: Measure tool timing

**Status:** Implemented; see the archived
[roadmap-completion plan](../plans/archived/2026-07-30_pi-stamp-roadmap-completion-plan.md).

**Milestones:**

- `toolStamps: true` captures extension-observed start/completion and Pi's success/error outcome;
  disabled tools are not backfilled.
- Parallel executions pair strictly by exact `toolCallId`, ignore duplicate/unmatched/malformed or
  backwards events, and append one tool stamp per finalized result in source order after the tool
  block.
- Mutable observations are capped at 256 per turn and cleared on new turns, cancellation/agent end,
  session replacement, reload, and shutdown.
- Tool stamp UI contains only sanitized tool name, elapsed duration, and outcome; IDs, arguments,
  outputs, and details remain hidden.

**Outcome:** Opt-in tool stamps provide bounded, parallel-safe local duration and outcome without
altering built-in tool blocks or leaking their data.

### Phase 6: Integrate with owning transcript rows

**Status:** Blocked on an upstream Pi transcript-decoration API; no current extension implementation
is planned.

**Milestones:**

- Pi publishes and documents a stable public decorator for built-in user, assistant, and tool rows.
- A compatibility design proves that existing `pi-stamp` custom entries still render and that any
  in-row format transition cannot duplicate stamps in old or mixed-version sessions.
- Only after those prerequisites pass does `pi-stamp` move presentation into owning rows without
  changing persisted message/tool content.

**Outcome:** If the dependency becomes available, stamps can gain native in-row placement while
preserving old sessions. Until then, separate custom rows are the complete supported public-API
implementation.

## Technical Health

- Keep exact runtime guards for every persisted version and reject unknown keys rather than coercing
  session data.
- Keep terminal-facing metadata control-free and bounded before persistence; diagnostics remain
  structural summaries, not text payloads.
- Keep renderer output callback-theme-aware and within every supplied width, including one-column
  terminals and multi-line expanded metadata.
- Keep settings reads and writes in one recoverable queue with a shutdown durability boundary and
  byte-identical invalid-file protection.
- Keep assistant state limited to one stream and tool state limited to 256 observations in one turn;
  no cosmetic feature may introduce an unowned timer, watcher, process, or network request.
- Re-run deterministic package tests, the repository CI-equivalent gate, pack inspection, and a Pi
  load/runtime smoke for every lifecycle, payload, settings, or renderer change.

## Risks and Dependencies

| Risk or dependency | Impact | Mitigation / decision |
| --- | --- | --- |
| Provider adapters omit or vary metadata | Labels could imply unsupported precision | Validate each field independently and leave missing values absent. |
| Local wall clock moves backwards | Durations could become negative or fabricated | Reject unordered observations and fall back to older timestamp-only/message behavior or no tool stamp. |
| Parallel tools complete out of order | Stamps could attach to the wrong tool | Pair only by exact ID, consume once, and append by `turn_end.toolResults` source order. |
| Metadata contains terminal controls or sensitive diagnostic text | Transcript injection or disclosure | Sanitize/cap identifiers; retain only diagnostic type/name/code; exclude content, messages, stacks, details, and signatures. |
| Settings writes overlap reload/shutdown | Stale or lost effective state | Serialize in process, reread before mutation, publish atomically, roll back on failure, and await `flush()`. |
| Pi has no transcript decoration API | In-row placement cannot be implemented safely | Keep separate rows and Phase 6 blocked; monitor upstream public documentation rather than monkey-patching. |
| Another extension appends at the same boundary | Strict visual adjacency is not guaranteed | Document the limitation; do not claim cross-extension ordering ownership. |

## Success Metrics

| Indicator | Baseline | Target / invariant | Measurement source |
| --- | --- | --- | --- |
| Default same-day fields per message stamp | One timestamp | One timestamp; no timing/metadata/tool row unless enabled | Deterministic renderer and settings tests |
| Stamp messages added to LLM context | 0 | 0 | `SessionManager.buildSessionContext()` persistence test |
| Stamp network/provider requests | 0 | 0 | Source review and Pi runtime smoke |
| Non-TUI transcript entries appended | 0 | 0 | Print/JSON/RPC lifecycle tests |
| Supported legacy message versions | Versions 1–3 before Phase 4 | Versions 1–4 readable with no rewrite | Exact payload and reopen tests |
| Maximum live tool observations | No tool tracker before Phase 5 | At most 256 per turn | Boundary lifecycle test |
| Parallel tool association | Not available before Phase 5 | One source-ordered stamp per exact finalized ID | Interleaved/duplicate/unmatched tests |
| Package/repository verification | Passing before this phase | Focused tests, root tests/check, pack inspection, and Pi smoke all pass | Local commands and PR CI |

No adoption or performance target is claimed because the repository has no telemetry or grounded user
baseline, and adding telemetry would violate the product boundary.

## Non-Goals

- Editing message text to append metadata or otherwise changing LLM context.
- Replacing or monkey-patching Pi's built-in transcript components.
- Sending telemetry, querying providers, or independently estimating absent model/usage/cost values.
- Exposing credentials, message/tool content, opaque signatures, full diagnostics, raw payloads, or
  raw tool details.
- Building a full session analytics dashboard, aggregates, thresholds, or relative-time refresh.
- Retroactively stamping messages or tools created before the extension recorded them.
- Implementing in-row placement before a stable public Pi decoration API and migration strategy
  exist.

## Decisions and Changes

- **2026-07-29 — Initial boundary:** Adopt separate TUI-only custom entries because Pi exposes no
  built-in row decorator; preserve message content and context isolation.
- **2026-07-29 — Presentation settings:** Add user-only semantic controls and version-2 predecessor
  timestamps; defer relative labels because they require refresh lifecycle ownership.
- **2026-07-29 — Response timing:** Define first content and completion as local Pi observations,
  persist version 3, and exclude tool runtime from assistant duration.
- **2026-07-30 — Metadata privacy:** Make assistant metadata capture opt-in, persist exact sanitized
  version-4 snapshots, and use Pi's explicit transcript expansion as the only response-ID/diagnostic
  debug view.
- **2026-07-30 — Tool ownership:** Make tool stamps opt-in, pair by ID, append in source order, and cap
  each turn at 256 observations with independent cleanup at every terminal boundary.
- **2026-07-30 — Roadmap resolution:** Mark Phases 1–5 implemented and Phase 6 blocked on a verified
  upstream dependency. Separate custom rows are the complete current implementation; the roadmap
  does not authorize a private-API workaround.
