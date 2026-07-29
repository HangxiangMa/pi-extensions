# pi-stamp Presentation Controls Plan

## Goal

Implement Phase 2 of the
[`pi-stamp` roadmap](../../roadmaps/pi-stamp-roadmap.md) by adding user-controlled absolute timestamp
formatting and automatic date context while preserving the current dim, right-aligned, TUI-only
transcript presentation.

The public settings surface will be a partial JSON object at `<getAgentDir()>/pi-stamp.json`; omitted
fields inherit these compatibility defaults:

```json
{
  "hourCycle": "24h",
  "showSeconds": true,
  "dateContext": "day-change",
  "locale": "invariant",
  "timeZone": "local"
}
```

Default same-day stamps remain `HH:mm:ss`. A newly recorded stamp that follows a stamp on another
calendar day adds date context on the same row, for example `2026-07-30 · 00:01:02`.

## Context

- Phase 1 persists version-1 `pi-stamp` custom entries containing `role` and the owning message's
  `timestamp`; Pi excludes those entries from LLM context.
- The current renderer formats local `HH:mm:ss` once when Pi constructs the custom-entry component.
  Settings must instead be read by mounted components during render so a successful menu change can
  update existing visible stamps on the next TUI render.
- A renderer receives one custom entry and cannot inspect adjacent transcript rows. Day-change
  detection therefore needs enough relationship data in each newly persisted entry rather than
  hidden renderer-global ordering.
- This phase touches extension-owned settings, a command/menu, custom TUI rendering, session
  lifecycle, persisted payload compatibility, package dependencies, and documentation. The
  applicable MUST rules are the settings path and validation protocol, unknown-field preservation,
  atomic publication, ordered reads/writes, TUI mode guards, menu cancellation/disposal, stale
  session protection, width bounds, theme invalidation, canonical package boundaries, tests, pack
  inspection, and a Pi runtime smoke.

## Architecture

### Formatting contract

Add `extensions/pi-stamp/src/format.ts` to own presentation validation and pure formatting:

- `hourCycle` accepts only `24h` or `12h`.
- `showSeconds` controls whether seconds are present.
- `dateContext` accepts `day-change`, `always`, or `never`.
- `locale` accepts `invariant`, `system`, or one canonicalizable BCP 47 locale tag.
- `timeZone` accepts `local` or an `Intl.DateTimeFormat`-supported IANA time-zone identifier,
  including `UTC`.
- `invariant` uses Gregorian dates, Latin digits, ISO `YYYY-MM-DD`, zero-padded 24-hour time, and
  English `AM`/`PM` for 12-hour time. This keeps the Phase 1 default byte-for-byte compatible.
- `system` and explicit locales use `Intl.DateTimeFormat` with an explicit Gregorian calendar,
  selected hour cycle, seconds policy, and effective time zone. Date and time are formatted
  separately and joined with ` · ` so locale punctuation cannot obscure their roles.
- Day equality is computed from Gregorian year/month/day parts in the effective time zone, including
  DST and date-line transitions; it is never inferred by dividing Unix milliseconds into 24-hour
  periods.

Keep absolute time as the only Phase 2 display mode. Relative labels are deferred because they age
without new transcript events and would require an owned refresh timer plus disposal semantics for a
cosmetic option.

### Persisted stamp compatibility

Continue rendering existing version-1 payloads and persist new entries as version 2:

```ts
interface MessageStampDataV2 {
  version: 2;
  role: "user" | "assistant";
  timestamp: number;
  previousTimestamp?: number;
}
```

`previousTimestamp` is the previously appended valid `pi-stamp` timestamp on the active session
branch. The lifecycle layer, not the renderer, assigns it in append order and updates the last-stamp
cursor only after appending. On `session_start`, rebuild that cursor from valid version-1 and
version-2 stamp entries in `ctx.sessionManager.getBranch()`.

The renderer computes day changes from `previousTimestamp` using the current effective time-zone
setting. This lets locale and time-zone changes reformat recorded version-2 stamps without rewriting
session files. Version-1 entries remain time-format compatible; `dateContext: "always"` can show
their own date, while `day-change` cannot infer a missing predecessor and therefore keeps them
minimal. Do not migrate, backfill, or mutate existing session entries.

### Settings ownership and persistence

Add `extensions/pi-stamp/src/settings.ts` with one user-scoped protocol:

```text
built-in defaults -> <getAgentDir()>/pi-stamp.json
```

Project settings and extension-specific environment variables are intentionally unsupported: these
controls are personal transcript preferences rather than repository policy. The loader and writer
will:

- treat a missing file as defaults without creating the agent directory, file, lock, or temporary;
- require a JSON object, validate every recognized present field, canonicalize locale/time-zone
  values for the effective runtime, and retain a structured invalid/unreadable issue;
- preserve unknown top-level fields and omitted recognized fields on each field-level update;
- reject every save while the latest file is malformed or invalid, leaving its exact bytes intact;
- serialize reads and writes in one in-process queue, reread the latest valid document before each
  mutation, and keep the queue usable after failure;
- publish a complete temporary file in the destination directory with `0600` POSIX permissions,
  rename it atomically without hard links, and remove abandoned temporaries;
- keep the previous effective settings when publication fails, expose an explicit `flush()` boundary,
  and make reload wait for earlier writes.

The concurrency guarantee is deliberately in-process. Separate Pi processes may race and the last
atomic writer can win; each process still rereads immediately before publication, but this phase does
not add a cross-process lock for low-risk presentation preferences.

### Runtime and menu

Keep `src/stamp.ts` responsible for payload validation, entry rendering, and message ordering. Add a
small session runtime that owns effective settings, the last-stamp cursor, one generation counter,
and one `AbortController` for menu/session work.

Register one argument-free `/stamp` command and implement its standard screens in
`extensions/pi-stamp/src/menu.ts` with `@narumitw/pi-tui-kit`:

- **Main:** Settings, Status, Help, and Close.
- **Settings:** immediate rows for hour cycle, seconds, and date context; Locale and Time zone rows
  open shallow choice screens with `ctx.ui.input()` only for custom BCP 47/IANA values.
- **Status:** effective values, source (`Built-in` or `User`), canonical settings path, and any
  read-only load issue. This is a menu detail, not a persistent statusline item.
- **Help:** concise semantics for message creation time, date boundaries, persistence, and the lack of
  relative-time refresh.

Use `pi-tui-kit` serialization and rollback for displayed rows, while the extension-owned settings
runtime remains authoritative for validation, persistence, and unknown-field preservation. Save
before publishing a new effective runtime value; on failure, retain the prior formatter settings,
let the kit restore the row, and report the sanitized error through `ctx.ui.notify()`.

The custom stamp component reads current settings on every `render(width)`, formats the entry then,
and right-aligns every wrapped line using ANSI-aware width. Pi rebuilds the renderer on theme
invalidation; the component stores no themed render cache. A successful settings action requests a
normal TUI render through the kit, so mounted stamps and new stamps use the same effective settings.

`/stamp` supports TUI and the kit's RPC dialog adaptation. Print and JSON invocations reject through
Pi's command error path before opening UI; unknown or trailing arguments are rejected in every mode.
No command route writes ad hoc stdout. On session replacement/reload/shutdown, abort the old menu,
drain any publication already past its cancellation boundary, guard every post-`await`
continuation by generation, flush pending stamp entries, then clear session state.

## Non-Goals

- Relative labels, refresh timers, countdowns, or background work.
- Response completion time, duration, first-token timing, model/provider data, usage, cost, or tool
  stamps; those remain later roadmap phases.
- Editing or monkey-patching Pi's built-in message rows.
- Project settings, environment-variable overrides, cross-process locking, or a generic `/settings`
  command.
- Rewriting version-1 custom entries, backfilling unstamped history, or changing stamp data sent to
  model context (there is none).
- Arbitrary custom date/time patterns; Phase 2 exposes bounded semantic choices instead of a format
  string language.

## Assumptions

- `dateContext: "day-change"` shows a date only when a version-2 stamp has a predecessor whose
  Gregorian date differs in the effective time zone; the first known stamp stays time-only.
- `dateContext: "always"` shows a date for both payload versions, while `never` always shows only
  time.
- Custom locale and time-zone inputs are canonicalized for display/runtime use but saves preserve
  unrelated JSON and do not rewrite a valid file merely to normalize existing spelling.
- Settings changes apply immediately to newly rendered and mounted stamp components after a
  successful save; persisted session payloads remain presentation-neutral.
- No settings-file migration exists because Phase 1 created no settings file.

## Risks

- A day can change at different instants after a time-zone change. Persisting the predecessor
  timestamp rather than a precomputed boolean keeps the displayed boundary consistent with the
  current setting.
- `Intl` output varies by locale and ICU data. Exact snapshot assertions should cover only invariant
  output; locale tests should assert canonical parts and representative supported locales without
  coupling to incidental punctuation.
- Longer localized date/time labels can wrap in narrow terminals. The right-alignment component must
  preserve content and keep every rendered line within the supplied width.
- A save may complete after its menu is cancelled. The operation must remain drainable and durable,
  while generation checks prevent the stale continuation from mutating or notifying a replacement
  session.
- Supporting version 1 and version 2 can accidentally weaken validation. Keep separate exact guards
  and test malformed optional predecessor values rather than coercing data.
- Adding `/stamp` changes the Phase 1 no-command surface. Keep it menu-only, argument-free, and scoped
  to presentation controls so the passive transcript behavior still requires no user action.

## Plan

- [x] Add red-first formatter specifications in `extensions/pi-stamp/test/format.test.ts` for the
  compatibility `HH:mm:ss` default, 12/24-hour modes, seconds visibility, invariant/system/custom
  locale handling, local/UTC/IANA zones, Gregorian day keys across DST/date-line boundaries,
  `always`/`day-change`/`never` date context, invalid timestamps, and exact width-safe labels; root
  `npm test` reached the intended TS2307 failure because `src/format.ts` did not exist.
- [x] Implement `extensions/pi-stamp/src/format.ts` with exact setting-value validators, canonical
  locale/time-zone resolution, invariant formatting, `Intl` formatting, and day-change comparison;
  all six focused compiled formatter tests pass without reading files, current wall-clock time, or
  global mutable locale/time-zone state.
- [x] Add red-first settings specifications in `extensions/pi-stamp/test/settings.test.ts` for
  side-effect-free missing loads, partial valid documents, every invalid recognized field,
  malformed/unreadable/oversized/non-regular files, canonical path resolution, unknown-field
  preservation, first save, `0600` temporary publication plus rename, failure rollback/cleanup,
  ordered concurrent updates, reload-after-save, queue recovery, and explicit flush behavior; the
  compiled test reached the intended TS2307 failure before `src/settings.ts` existed.
- [x] Implement `extensions/pi-stamp/src/settings.ts` as the single queued read/update protocol;
  all seven focused settings tests pass, including byte-identical invalid-file protection, failed
  publication rollback, queue recovery, and user-only precedence.
- [x] Extend `extensions/pi-stamp/test/stamp.test.ts` red-first for exact version-1/version-2 guards,
  predecessor assignment in append order, active-branch cursor reconstruction on startup,
  day-boundary rendering after reload/resume, dynamic re-render after a settings change, v1 fallback,
  theme invalidation, ANSI-aware right alignment at narrow widths, lifecycle fallback deduplication,
  and continued exclusion from `buildSessionContext()`; the focused suite first failed on the missing
  renderer export and version-1 payloads.
- [x] Refactor `extensions/pi-stamp/src/stamp.ts` to persist version-2 entries, rebuild and clear the
  branch cursor at session boundaries, and render through a live settings getter while preserving
  the existing timer-free user FIFO, assistant `turn_end`, non-TUI no-op behavior, and version-1
  compatibility; all 14 focused renderer, persistence, ordering, replacement, shutdown, command,
  and mode tests pass.
- [x] Add `@narumitw/pi-tui-kit` `<1` to `extensions/pi-stamp/package.json` and the minimal workspace
  lockfile edge, then add red-first command/menu tests covering the argument-free `/stamp` surface,
  Main/Settings/Status/Help screens, all bounded choices, custom input validation/cancellation,
  immediate application, serialized save rollback, invalid-file read-only behavior, RPC adaptation,
  print/JSON rejection, unknown arguments, menu cancellation, session replacement, and shutdown
  draining; compilation reached the intended missing-`menu.ts` failure and the extension boundary
  check accepts the library dependency.
- [x] Implement `extensions/pi-stamp/src/menu.ts` and session-owned settings/menu orchestration in
  `src/stamp.ts` using `defineMenu()`/`runMenu()`, generation plus abort guards, sanitized
  notifications, and a durability boundary; all five focused menu tests and the command/replacement/
  shutdown lifecycle cases pass without stale-context notification or undrained publication.
- [x] Update `extensions/pi-stamp/README.md` with `/stamp`, the settings table and examples, canonical
  user path, defaults and precedence, locale/time-zone/date semantics, immediate application,
  invalid-file recovery, in-process ordering and cross-process last-writer scope, RPC versus
  print/JSON behavior, version-1 limitations, and the explicit relative-time deferral; the package
  README, root catalog, and Phase 2 roadmap status now match the tested surface.
- [x] Format touched package paths, run focused tests followed by `npm test` and `npm run check`, run
  `just pack stamp` and inspect the dependency metadata plus every intended published source/document
  file, then run a Pi 0.82.1 load smoke and TUI/RPC smokes covering settings save/rollback,
  existing-stamp re-render, day-change display, `/reload`, resume, cancellation, and non-TUI protocol
  safety; final `npm run check` passed all 1,793 tests, the eight-file pack is exact, Pi returned `OK`,
  real TUI components passed day-change/live-reformat/invalidation width checks, RPC saved a setting,
  publication rollback passed, and print/JSON rejection preserved their output contracts.
- [x] Audit the final diff against `docs/extension-conventions.md`,
  `docs/extension-settings.md`, Pi's extension/package/TUI documentation, and the roadmap boundary;
  package boundaries, user-only precedence, in-process last-writer scope, invalid-file protection,
  atomic publication, menu cancellation/disposal, stale-session guards, shutdown draining, v1/v2
  compatibility, width/theme behavior, non-TUI output, pack contents, and verification all pass with
  no unrecorded deviation.

## Completion Checklist

- [x] The compatibility default remains dim, right-aligned local `HH:mm:ss` for ordinary same-day
  user and assistant stamps.
- [x] `hourCycle`, `showSeconds`, `dateContext`, `locale`, and `timeZone` are validated, documented,
  persisted atomically, and applied through the exact documented precedence.
- [x] New version-2 entries provide truthful date-boundary context in the selected time zone, while
  existing version-1 entries remain readable and no session history is rewritten.
- [x] `/stamp` exposes Settings, Status, and Help through `pi-tui-kit`; save failures roll back,
  invalid files are read-only, custom-input cancellation is mutation-free, and unsupported modes are
  observable without protocol corruption.
- [x] Missing-file reads are side-effect free; unknown fields survive; malformed/invalid files are
  never overwritten; ordered reads/writes, reload, replacement, and shutdown use one drainable
  concurrency protocol.
- [x] User cancellation, component disposal, session replacement, reload, and shutdown abort or drain
  every owned operation and leave no stale-context continuation or background task.
- [x] Renderer output remains callback-theme-aware, ANSI-width-safe, and outside LLM context at every
  supported format and terminal width.
- [x] Focused tests, root `npm test`, full `npm run check`, package dry run, Pi load smoke, and
  representative TUI/RPC lifecycle smokes pass with no unrecorded deviation.
