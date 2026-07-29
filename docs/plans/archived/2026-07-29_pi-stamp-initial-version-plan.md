# pi-stamp Initial Version Plan

## Goal

Add a production `@narumitw/pi-stamp` package that passively renders one dim local `HH:mm:ss`
stamp after every newly observed user and assistant message in Pi's TUI. Stamps must use the
message's own timestamp, survive session reloads, remain outside LLM context, and require no command,
settings, network access, or background work.

## Context

- Pi messages already carry a Unix-millisecond `timestamp`.
- Pi's public renderer hooks apply only to extension-owned custom messages and custom entries; they
  cannot decorate built-in user or assistant components directly.
- `message_end` extension handlers run before AgentSession persists that message. Appending the stamp
  from the same handler would place it before the message in session history.
- Pi persists a user message before the next `message_start`, and persists an assistant message plus
  its tool results before `turn_end`. Those later boundaries can append stamps in stable session
  order without timers.
- `message.timestamp` means message creation time. For an assistant response it is approximately the
  request/stream creation time, not completion time; response duration is roadmap work.
- The durable product direction lives in
  [`docs/roadmaps/pi-stamp-roadmap.md`](../roadmaps/pi-stamp-roadmap.md).

## Architecture

### Package layout

```text
extensions/pi-stamp/
├── src/
│   ├── index.ts       # Thin default-export forwarding entrypoint
│   └── stamp.ts       # Data validation, formatting, renderer, and lifecycle hooks
├── test/
│   └── stamp.test.ts
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

The package uses only Pi's coding-agent and TUI peer dependencies. It owns no runtime dependency,
command, tool, setting, status, widget, process, watcher, timer, or network client.

### Persisted entry

Use one stable custom entry type, `pi-stamp`, with a small versioned payload:

```ts
interface MessageStampData {
  version: 1;
  role: "user" | "assistant";
  timestamp: number;
}
```

The renderer validates persisted data before constructing a component. Valid entries render local
24-hour `HH:mm:ss` text with the callback-provided theme's `dim` color and no internal padding, so
host-owned spacing remains width-safe even in a one-column render. Invalid, unsupported, or
non-finite data returns no component instead of throwing.

### Lifecycle and ordering

1. `session_start` resets pending in-memory state and enables capture only when `ctx.mode === "tui"`.
2. A user `message_end` stores only plain stamp data in a small pending FIFO; it does not append yet
   because the user message has not been persisted.
3. The next `message_start` flushes prior pending user stamps before the new message is rendered or
   persisted. This also preserves ordering if Pi emits more than one user message before an assistant
   response.
4. `turn_end` appends exactly one assistant stamp from `event.message.timestamp`. At that point the
   assistant message and any tool-result messages have been persisted, so a tool-using assistant
   stamp appears after the complete tool block.
5. `agent_end` flushes pending user stamps if no later message boundary arrived.
6. `session_shutdown` performs the same idempotent fallback flush, clears pending state, and disables
   the old session instance before replacement or reload.
7. Non-TUI modes append nothing. Existing persisted `pi-stamp` entries still render when their
   session is later opened with the extension in TUI mode.

No continuation crosses an `await`, no timer needs disposal, and no stale `ExtensionContext` is
retained.

## Tech Stack

- TypeScript with the repository's NodeNext/ES2022 strict configuration.
- `@earendil-works/pi-coding-agent` for extension events and custom entries.
- `@earendil-works/pi-tui` `Text` for width-safe transcript rendering.
- Node's built-in test runner through the repository's root `npm test` harness.
- Biome and TypeScript through the package and root checks.

## Non-Goals

- Tool call/result, custom-message, bash, compaction, or branch-summary stamps.
- Date, locale, time-zone, relative-time, duration, model, token, cache, cost, or diagnostic display.
- Commands, settings, toggles, statusline integration, or non-TUI output.
- Modifying message content or sending timestamp text to the model.
- Monkey-patching Pi components to place time inside the original message row.
- Backfilling messages that predate the extension's persisted custom entries.
- Publishing the package; implementation ends at release-ready verification and pack inspection.

## Assumptions

- The accepted package and directory names are `@narumitw/pi-stamp` and `extensions/pi-stamp`.
- The initial display is local, zero-padded, 24-hour `HH:mm:ss` with seconds always visible.
- Pi's host-owned custom-entry spacing and a separate dim row are acceptable for the initial UI.
- Assistant stamps intentionally appear after the whole tool block when the assistant message invokes
  tools, even though tool rows themselves are not stamped.
- Package metadata uses the repository's shared version and current pinned development dependency
  versions at implementation time rather than hard-coded roadmap versions.

## Risks

- A future Pi event-ordering change could move stamps ahead of their messages. Lifecycle tests and a
  real runtime smoke must verify ordering against the targeted Pi release.
- Custom entries are excluded from LLM context but still become session-tree nodes. Branch, reload,
  and compaction behavior must be checked for duplication or misplaced stamps.
- Another extension can append an entry at the same lifecycle boundary, so strict visual adjacency
  across independently loaded extensions is not guaranteed.
- Very narrow terminals could wrap even a short stamp. Renderer tests must prove every emitted line
  respects the supplied width.
- Sessions opened without `pi-stamp` cannot display their stamps, and old unstamped messages cannot
  be backfilled in place with the current API.

## Plan

- [x] Scaffold `extensions/pi-stamp/` with the thin `src/index.ts` forwarder, current shared package
  version, canonical `pi.extensions`, Pi/TUI peer and pinned development dependencies, `LICENSE`,
  `tsconfig.json`, and package scripts; `npm run check:boundaries` passed with `pi-stamp` among 22
  active extensions.
- [x] Extend `test/support.ts` with a minimal `registerEntryRenderer` mock registry and add red-first
  `extensions/pi-stamp/test/stamp.test.ts` specifications for formatting, payload validation,
  rendering width/theme use, event ordering, TUI-only behavior, fallback flushing, reload/reset, and
  duplicate prevention; root `npm test` reached the intended TS2307 red state because `stamp.ts` did
  not yet exist.
- [x] Implement the versioned stamp formatter and `pi-stamp` entry renderer in
  `extensions/pi-stamp/src/stamp.ts`; root `npm test` passed formatter, malformed-entry,
  callback-theme, and 1/4/8/10-column width checks after the red test exposed and removed unsafe
  internal padding.
- [x] Implement the timer-free user FIFO and assistant `turn_end` lifecycle, including `agent_end` and
  `session_shutdown` fallback cleanup plus non-TUI no-op behavior; root `npm test` passed all 1,770
  tests, including normal, successive-user, tool-use, error, fallback, reload, shutdown, and
  print/JSON/RPC stamp cases.
- [x] Write `extensions/pi-stamp/README.md` in repository style with features, install/try commands,
  timestamp semantics, TUI-only and no-LLM-context behavior, separate-row/API limitation, historical
  limitation, package layout, keywords, and license; package checks, lifecycle tests, a Pi 0.82.1
  print-mode load, and a real Pi TUI-component render/restore smoke cover the documented paths.
- [x] Integrate `pi-stamp` into the root package catalog, `pack:stamp` script, lockfile, and named
  `just` pack/try/install/publish aliases while relying on existing workspace and publishing globs;
  `just --list` exposes all four aliases, the boundary check discovers 22 active extensions, and
  `bump-shared-version.mjs --list-packages` includes `extensions/pi-stamp/package.json`.
- [x] Format only the new/touched paths, then run `npm run check`, inspect
  `just pack stamp` for only `src`, `README.md`, and `LICENSE`, and run a non-interactive Pi load smoke
  plus a TUI transcript smoke covering one user reply, one assistant reply, `/reload`, and a resumed
  session; final `npm run check` passed all 1,771 tests, the five-file pack contains only manifest,
  license, README, and two source files, Pi 0.82.1 loaded in print mode and returned `OK`, and the
  real Pi TUI components rendered user → stamp → assistant plus a restored stamp in order.
- [x] Audit the final diff against `docs/extension-conventions.md` and Pi's extension/package/TUI
  documentation for package boundaries, passive command surface, TUI mode guards, session
  replacement, shutdown, persisted-data validation, width, theme invalidation, and verification;
  the preflight found no merge-blocking finding or convention deviation, and all applicable review,
  test, validator, pack, and runtime evidence is recorded above.

## Completion Checklist

- [x] `@narumitw/pi-stamp` is an independently installable production extension with the canonical
  thin entrypoint, manifest, files list, peer dependencies, license, README, root integrations, and
  lockfile evidence.
- [x] Every newly observed TUI user and assistant message receives exactly one dim local `HH:mm:ss`
  stamp sourced from its own `message.timestamp`, including tool-using and error turns.
- [x] Stamps persist as validated custom entries, survive reload/resume, do not enter LLM context,
  and do not get duplicated by fallback lifecycle events.
- [x] Print, JSON, and RPC modes append no stamp entries and emit no ad hoc protocol output.
- [x] User cancellation/abort, agent end, session replacement, reload, and shutdown leave no pending
  work or stale-session continuation.
- [x] Renderer output is theme-aware, safely ignores malformed persisted data, and never exceeds the
  supplied terminal width.
- [x] Focused tests, full `npm run check`, package dry run, Pi load smoke, and the TUI ordering/reload
  smoke pass with no unavailable path left open.
