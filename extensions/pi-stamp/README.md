# 🕒 pi-stamp — Message Timestamps for Pi

[![npm](https://img.shields.io/npm/v/@narumitw/pi-stamp)](https://www.npmjs.com/package/@narumitw/pi-stamp) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-stamp` is a quiet [Pi coding agent](https://pi.dev) extension that adds a
right-aligned timestamp after each user and assistant message in the interactive transcript.

## ✨ Features

- Shows each message's recorded creation time on a dim, right-aligned transcript row.
- Supports 12/24-hour clocks, optional seconds, automatic date context, locales, and time zones.
- Stores versioned custom session entries that survive reload and resume.
- Keeps stamp entries outside LLM context, so timestamp text is never sent to the model.
- Uses Pi's current theme and remains width-safe in narrow terminals.
- Performs no network requests and registers no tool, status item, timer, or background task.

## 📦 Install

Install from npm:

```bash
pi install npm:@narumitw/pi-stamp
```

Try without installing permanently:

```bash
pi -e npm:@narumitw/pi-stamp
```

Try this package from a local checkout:

```bash
pi -e ./extensions/pi-stamp
```

## 🚀 Quick start

Load the extension and use Pi normally. Each new user and assistant message receives a separate dim
stamp aligned to the terminal's right edge:

```text
Your message
                                 14:32:08

Assistant reply
                                 14:32:11
```

Run `/stamp` to open the presentation menu:

```text
Stamp
24-hour · seconds · Day changes · Invariant · Local

Settings
Status
Help
Close
```

Settings save immediately. Mounted stamps reformat on the next render, and future stamps use the
same effective values.

## ⚙️ Settings

The `/stamp` Settings screen provides these controls:

| Field | Accepted values | Default | Behavior |
| --- | --- | --- | --- |
| `hourCycle` | `"24h"`, `"12h"` | `"24h"` | Selects the clock style. |
| `showSeconds` | boolean | `true` | Shows or hides seconds. |
| `dateContext` | `"day-change"`, `"always"`, `"never"` | `"day-change"` | Adds a date at recorded day boundaries, every time, or never. |
| `locale` | `"invariant"`, `"system"`, or one BCP 47 tag | `"invariant"` | Controls localized date/time presentation. |
| `timeZone` | `"local"` or one supported IANA zone | `"local"` | Controls time and day-boundary interpretation; `UTC` is accepted. |

The compatibility defaults produce local `HH:mm:ss` for ordinary same-day messages. `invariant`
uses Gregorian ISO dates, Latin digits, and English `AM`/`PM`. `system` uses the operating system
locale; examples of explicit locales are `en-US`, `fr-FR`, and `zh-TW`.

The canonical user file is:

```text
~/.pi/agent/pi-stamp.json
```

Pi's configured agent directory replaces `~/.pi/agent` when applicable. The file is a partial JSON
object, so this is enough to show 12-hour Taipei time without seconds:

```json
{
  "hourCycle": "12h",
  "showSeconds": false,
  "timeZone": "Asia/Taipei"
}
```

Settings precedence is intentionally:

```text
built-in defaults -> user pi-stamp.json
```

Presentation is a personal preference, so `pi-stamp` does not read project settings or
extension-specific environment variables. Missing settings do not create a file or directory.
Updates preserve unknown fields and publish through a private temporary file plus atomic rename.
Malformed or invalid files become read-only and are never overwritten; fix the reported file and run
`/reload`. A fresh process uses defaults while the file is invalid, and a running process retains its
last valid settings.

Reads and writes are serialized within one Pi process. Separate Pi processes do not share a lock, so
concurrent saves are last-writer-wins even though each process rereads immediately before its atomic
publication.

`/stamp` supports TUI and RPC dialog modes. Print and JSON command invocations reject without writing
ad hoc protocol output. Transcript stamps themselves are appended only in TUI mode.

## 🕰️ Timestamp semantics

- A **user** stamp is the timestamp recorded when Pi creates the submitted user message.
- An **assistant** stamp is the timestamp recorded when Pi creates the response stream/message. It is
  not the response completion time.
- If an assistant message invokes tools, its stamp appears after the complete tool block. Tool calls
  and results do not receive their own stamps.
- `dateContext: "day-change"` compares each newly recorded stamp with its persisted predecessor in
  the currently selected time zone. The first known stamp stays time-only.
- Changing locale or time zone re-renders recorded version-2 stamps without rewriting session files.

Relative labels such as `3m ago` are intentionally unavailable because they would require periodic
background refresh and lifecycle cleanup.

## 🔒 Context and persistence

Stamps use Pi custom session entries. Pi renders those entries in the interactive transcript but
excludes them from model context. The extension does not modify user or assistant message content.

Version-2 entries retain the previous recorded stamp timestamp so day changes can be recomputed for
the active presentation settings. Existing version-1 entries remain readable. They can show their
own date with `dateContext: "always"`, but `day-change` cannot infer a missing predecessor.

Once recorded, a stamp survives `/reload` and session resume while the extension remains loaded.
Messages created before `pi-stamp` recorded them are not backfilled because Pi's current public API
cannot insert a new custom entry into an older position in the session tree.

## 🚧 Limitations

- Pi does not currently expose a public decorator for built-in message rows, so timestamps appear as
  separate transcript rows rather than inside the original message bubble.
- Another extension can append transcript entries at the same lifecycle boundary, so strict visual
  adjacency between independently loaded extensions is not guaranteed.
- There are no arbitrary format strings, relative labels, duration, model, token, cost, or
  tool-timing controls.

See the
[pi-stamp roadmap](https://github.com/narumiruna/pi-extensions/blob/main/docs/roadmaps/pi-stamp-roadmap.md)
for possible future metadata stamps.

## 🗂️ Package layout

```text
extensions/pi-stamp/
├── src/
│   ├── index.ts       # Thin Pi package entrypoint
│   ├── format.ts      # Locale, time-zone, date, and clock formatting
│   ├── menu.ts        # /stamp presentation menu
│   ├── settings.ts    # Validation and atomic user settings
│   └── stamp.ts       # Renderer, payload compatibility, and lifecycle hooks
├── test/
│   ├── format.test.ts
│   ├── menu.test.ts
│   ├── settings.test.ts
│   └── stamp.test.ts
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

## 🔎 Keywords

Pi extension, Pi coding agent, message timestamps, transcript time, TUI metadata, TypeScript Pi
package.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
