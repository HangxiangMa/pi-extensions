# pi-stamp Response Timing Plan

## Goal

Implement Phase 3 of the
[`pi-stamp` roadmap](../roadmaps/pi-stamp-roadmap.md) by recording extension-observed assistant
completion and first-content times, deriving truthful per-response elapsed labels, and keeping the
existing timestamp-only transcript as the compatibility default.

Add one opt-in setting:

```json
{
  "responseTiming": "off"
}
```

Accepted values are `"off"`, `"duration"`, and `"detailed"`. Assistant stamps render as follows
when timing data is available:

```text
Off:       14:32:08
Duration:  14:32:08 · 3.2s
Detailed:  14:32:08 · first 0.8s · total 3.2s
```

User stamps never show response timing. `detailed` renders `first n/a` when Pi finalized a newly
recorded assistant response without emitting a meaningful streaming update; it does not substitute
message start, response headers, or completion time for first content.

## Context

- Assistant `message.timestamp` is created by Pi's provider stream near request/message creation; it
  is not completion time. This phase defines total response elapsed as the extension-observed
  `message_end` time minus that persisted timestamp.
- Pi emits assistant `message_end` before persisting the message. The extension must capture timing
  there but continue appending the stamp at `turn_end`, after the assistant and any tool results are
  persisted.
- `message_update` exposes text, thinking, and tool-call stream events. Provider granularity varies,
  so the UI must call the optional metric **first content**, not first token or network latency.
- Phase 2 already owns a queued, atomic user-settings protocol and a live renderer settings getter.
  Adding a recognized field must preserve its malformed-file protection, unknown-field retention,
  ordered publication, rollback, and reload/shutdown durability behavior.
- This phase touches persisted custom-entry compatibility, message/turn lifecycle, settings,
  standard menu screens, custom transcript rendering, and documentation. Applicable MUST rules are
  exact runtime validation, TUI-only entry creation, width/theme-safe rendering, no stale session
  state, settings ordering and atomic publication, menu cancellation/disposal, deterministic tests,
  the root CI-equivalent check, pack inspection, and a Pi runtime smoke.

## Architecture

### Measurement contract

Use an injectable wall-clock function, defaulting to `Date.now`, only at Pi event boundaries:

- **Response start:** the finalized assistant message's existing `timestamp`.
- **First content:** the first extension-observed assistant `message_update` that carries a non-empty
  text/thinking/tool-call delta, a non-empty completed text/thinking block when no delta was observed,
  or a completed tool call. Empty deltas and block-start events do not count.
- **Completion:** the extension-observed wall-clock time in assistant `message_end`.
- **Total elapsed:** `completedAt - message.timestamp`.
- **First-content elapsed:** `firstContentAt - message.timestamp`.

These are local Pi observations, not provider-server timestamps. A tool-using response completes at
assistant `message_end`; tool execution time is deliberately excluded even though the assistant stamp
continues to appear after the complete tool block. Error and aborted assistant messages use the same
finalization boundary.

Retain only the first qualifying update. Require finite, valid Unix-millisecond values and ordered
boundaries. If completion precedes message creation because the wall clock moved backwards or a
provider supplied an inconsistent timestamp, persist the assistant stamp without timing. If only the
first-content boundary is inconsistent, retain valid completion timing and omit first content.

Format elapsed values as locale-independent ASCII seconds rounded to one decimal. Render `0.0s` for
an exact zero and `<0.1s` for a positive elapsed value below one tenth of a second. Reject negative or
non-finite durations instead of clamping or estimating them. Existing ANSI-aware wrapping and
right-alignment remain responsible for narrow widths.

### Persisted compatibility

Continue reading exact version-1 and version-2 payloads. Keep new user stamps at version 2 and add an
exact assistant-only version 3 payload:

```ts
interface AssistantMessageStampDataV3 {
  version: 3;
  role: "assistant";
  timestamp: number;
  previousTimestamp?: number;
  completedAt: number;
  firstContentAt?: number;
}
```

Persist absolute observed boundaries, not preformatted labels or redundant durations. The renderer
recomputes elapsed labels and date/time presentation from the payload and current settings. Version 3
validation accepts no unknown keys, enforces `timestamp <= completedAt`, and, when present, enforces
`timestamp <= firstContentAt <= completedAt`.

Version-1/version-2 assistant entries remain timestamp-only in every timing mode because they do not
contain the required observations. Do not backfill, migrate, or rewrite session history. Include
version 3 in predecessor-cursor reconstruction so date context remains continuous across mixed
payload versions.

### Lifecycle and state

Keep timing state bounded to the one sequential assistant stream owned by the active Pi turn:

1. `session_start` clears timing state, advances existing session ownership, reloads settings, and
   rebuilds only the persisted predecessor cursor.
2. Assistant `message_start` initializes one in-memory observation from the message timestamp; it
   does not append an entry.
3. Assistant `message_update` records the first qualifying content boundary once.
4. Assistant `message_end` captures completion and finalizes a pending timing observation without
   appending before Pi persistence.
5. `turn_end` consumes only the finalized observation for that assistant message and appends a
   version-3 stamp; if no valid observation matches, it appends the existing version-2 fallback.
6. A new turn, agent end, session replacement, reload, and shutdown clear unmatched timing state so
   it cannot leak into another response. Existing pending-user FIFO and settings flush behavior stay
   unchanged.

No timer, refresh loop, process, watcher, network request, or captured `ExtensionContext` is added.
Every timing event handler remains synchronous; session cancellation and disposal still apply to the
existing menu/settings flow only.

### Settings and presentation

Extend `StampSettings` with:

```ts
responseTiming: "off" | "duration" | "detailed";
```

`off` is the built-in default so ordinary same-day output remains byte-for-byte compatible. The
existing user-only precedence remains:

```text
built-in defaults -> <getAgentDir()>/pi-stamp.json
```

Add one **Response timing** row to `/stamp` Settings and include its effective value/source in Main
and Status. The row cycles through Off, Duration, and Detailed using the existing `pi-tui-kit`
settings action and queued persistence path. No command route, project setting, environment variable,
or new file is introduced.

The renderer adds timing only for valid version-3 assistant entries:

- `duration`: append the unlabeled compact total, matching `14:32:08 · 3.2s`.
- `detailed`: append `first <elapsed> · total <elapsed>`; use `first n/a` only for a version-3 entry
  whose first-content observation is absent.
- Legacy assistant entries and every user entry: retain their existing timestamp/date label.

Mounted version-3 stamps respond to successful setting changes through the existing live settings
getter without rewriting persisted data.

## Non-Goals

- Provider-server latency, HTTP-response timing, token-level timestamps, or a claim that first content
  is time-to-first-token.
- Including tool execution, retries outside the individual assistant message, queued follow-ups, or
  full agent settlement in response elapsed time.
- Absolute completion-clock display, relative labels, periodic refresh, thresholds, color coding, or
  timing aggregates.
- Phase 4 provider/model/usage/cost fields or Phase 5 tool stamps.
- Editing built-in message rows, altering message content, adding model context, or backfilling old
  sessions.
- New commands, project settings, environment variables, dependencies, package metadata, or network
  access.

## Assumptions

- Phase 3 timing is opt-in because the roadmap's minimal-default principle says the default
  transcript shows only a dim timestamp.
- `responseTiming: "duration"` is the compact mode shown in the roadmap; `"detailed"` is the explicit
  diagnostic mode needed to label first-content and total measurements without ambiguity.
- Pi processes one assistant stream at a time within a model turn. Tool results may occur between its
  `message_end` and `turn_end`, but another assistant stream does not start before that turn ends.
- A completed tool call is meaningful assistant content, while a block-start event with no payload is
  not.
- Version-3 entries with no first-content field distinguish a measured non-streaming/no-update
  response from legacy entries that contain no timing observations at all.

## Risks

- Provider adapters may emit streaming updates at different granularities. Define and test the exact
  qualifying event set, label it first content, and expose `n/a` rather than substituting another
  lifecycle boundary.
- Wall-clock adjustment or malformed provider timestamps can make elapsed values negative. Validate
  ordering before persistence and fall back to timestamp-only data rather than clamping.
- Assistant completion occurs before tools, while the stamp renders after tools. Documentation and a
  tool-use test must prove that the displayed total excludes tool runtime.
- A stale finalized observation could be attached to a later turn after malformed or interrupted
  event ordering. Match the pending observation to the assistant timestamp, consume it once, and
  clear it at every turn/session terminal boundary.
- Adding a recognized setting can make a previously ignored unknown `responseTiming` value invalid.
  Preserve the exact invalid file and previous effective runtime settings under the existing
  settings protocol.
- Longer detailed labels can wrap in narrow terminals. Keep timing formatting independent from ANSI
  alignment and rerun width checks at one-column and representative narrow widths.

## Plan

- [x] Add red-first pure formatting specifications in
  `extensions/pi-stamp/test/format.test.ts` for Off/Duration/Detailed assistant labels, exact-zero,
  positive sub-tenth, one-decimal rounding, missing first content, legacy/no-timing omission,
  negative/non-finite rejection, and date-context composition; root `npm test` reached the intended
  TS2724/TS2305 failures for the absent timing-format exports before implementation.
- [x] Extend `extensions/pi-stamp/src/format.ts` with the response-timing enum/type, compatibility
  default, elapsed validation/formatting, and stamp-suffix composition while preserving existing
  locale/time-zone behavior; root `npm test` passed all 1,796 tests, including deterministic timing
  composition and elapsed-boundary cases with no clock or mutable global dependency.
- [x] Add red-first settings specifications in `extensions/pi-stamp/test/settings.test.ts` for the
  missing-file default, every accepted `responseTiming` value, invalid type/value protection,
  unknown-field preservation, source reporting, ordered updates, save rollback, reload, and flush;
  root `npm test` reached two intended failures: the field remained built-in instead of `detailed`,
  and updates rejected it as unknown.
- [x] Extend `extensions/pi-stamp/src/settings.ts` so `responseTiming` participates in exact
  normalization, patch validation, sources, queued reread/update, atomic publication, and frozen
  runtime state; root `npm test` passed all 1,796 tests, including accepted values, invalid fields,
  source reporting, unknown-field retention, atomic publication, rollback, queue, reload, and flush.
- [x] Add red-first lifecycle and persistence specifications in
  `extensions/pi-stamp/test/stamp.test.ts` for exact version-3 validation, persisted reload/context
  exclusion, text/thinking/tool-call first content, ignored starts/empty updates, no-update `n/a`,
  completion capture at `message_end`, append ordering at `turn_end`, tool-runtime exclusion,
  stop/error/abort responses, one-shot consumption, timestamp mismatch, clock reversal, mixed-version
  predecessor recovery, replacement/reload/shutdown clearing, default rendering compatibility,
  duration/detailed width safety, and injected-clock determinism; root `npm test` reached the intended
  TS2353 failures because the timing clock/lifecycle option did not exist.
- [x] Refactor `extensions/pi-stamp/src/stamp.ts` to own one generation-bounded assistant observation,
  persist validated version-3 assistant data, retain version-2 user/fallback entries, and render live
  timing settings while preserving the existing pending-user FIFO and TUI-only behavior; root
  `npm test` passed all 1,801 tests, including first-content variants, no-update/tool/error/abort,
  mismatch, clock reversal, replacement, persistence/context exclusion, and width-safe rendering.
- [x] Add red-first menu specifications in `extensions/pi-stamp/test/menu.test.ts` for the Response
  timing row, all three cycles, Main/Status source labels, immediate application, invalid-file
  read-only behavior, save rollback, cancellation, and RPC adaptation; root `npm test` reached the
  intended TS7053 failures because `set-response-timing` was absent from the menu contract.
- [x] Update `extensions/pi-stamp/src/menu.ts` to expose and persist Response timing through the
  existing `pi-tui-kit` flow and revise Help with creation/completion, first-content, tool-exclusion,
  legacy, and `n/a` semantics; root `npm test` passed all 1,801 tests, including all timing cycles,
  Main/Status labels, rollback, cancellation/disposal, RPC adaptation, and shutdown draining.
- [x] Update `extensions/pi-stamp/README.md` and the Phase 3 status in
  `docs/roadmaps/pi-stamp-roadmap.md` with the opt-in setting, exact compact/detailed examples,
  observer-clock semantics, provider dependence, tool-runtime exclusion, old-entry behavior,
  privacy/no-context guarantee, and limitations; a 10-claim documentation assertion audit passed,
  and the roadmap points to this plan's final archived path.
- [x] Format only the touched `pi-stamp` paths, run focused tests followed by root `npm test` and
  `npm run check`, run `just pack stamp` and inspect the intended source/docs, then run a
  non-interactive Pi load and programmatic TUI lifecycle/render smoke covering default, duration,
  detailed/no-update, tool-use, reload, and resume; final tests/check passed all 1,802 tests, the
  eight-file pack is exact, offline Pi package loading returned OK, and the programmatic smoke passed.
- [x] Audit the final diff against `docs/extension-conventions.md`,
  `docs/extension-settings.md`, Pi's extension/session-format/TUI/package documentation, and the
  roadmap boundary; settings concurrency, malformed-file protection, custom-entry validation,
  message/turn ordering, cancellation, component disposal, replacement/shutdown, width/theme,
  non-TUI safety, resource/network absence, package contents, and every touched-area MUST passed with
  no finding or deviation.

## Completion Checklist

- [x] The built-in default and legacy entries remain dim, right-aligned timestamp-only rows with
  unchanged date, locale, time-zone, width, and theme behavior.
- [x] New assistant stamps persist exact completion observations and optional first-content
  observations as validated version-3 custom entries outside LLM context; user stamps remain version
  2 and all older payloads remain readable.
- [x] `duration` shows creation-to-`message_end` elapsed time, while `detailed` labels first content
  and total distinctly and uses `first n/a` without substituting another measurement.
- [x] Tool execution time, full-agent retries/settlement, provider-server clocks, and legacy history
  are never presented as response timing.
- [x] Invalid or out-of-order observations degrade to timestamp-only data without negative, clamped,
  fabricated, duplicate, or cross-turn values.
- [x] `responseTiming` is validated, documented, source-labeled, persisted atomically, applied live,
  and protected by the existing ordered settings/menu lifecycle in TUI and RPC modes.
- [x] User cancellation, component disposal, agent end, turn replacement, session replacement,
  reload, and shutdown clear or drain every owned state/operation with no stale continuation or
  background task.
- [x] Focused tests, root `npm test`, full `npm run check`, package dry run, Pi load smoke, and
  representative programmatic TUI lifecycle/render smokes pass with no unrecorded deviation.
