# 🕒 pi-stamp — Message Timestamps for Pi

[![npm](https://img.shields.io/npm/v/@narumitw/pi-stamp)](https://www.npmjs.com/package/@narumitw/pi-stamp) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-stamp` is a passive [Pi coding agent](https://pi.dev) extension that adds a
quiet local timestamp after each user and assistant message in the interactive transcript.

## ✨ Features

- Shows local 24-hour time as `HH:mm:ss` for user and assistant messages.
- Uses each message's own persisted timestamp rather than the extension handler's current time.
- Stores stamps as versioned custom session entries that survive reload and resume.
- Keeps stamp entries outside LLM context, so timestamp text is never sent to the model.
- Uses Pi's current theme and remains width-safe in narrow terminals.
- Performs no network requests and registers no command, tool, setting, status, or background task.

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

Load the extension and use Pi normally. There is no command to run or setting to configure.
Each new user and assistant message receives a separate dim timestamp row:

```text
Your message
14:32:08

Assistant reply
14:32:11
```

The exact foreground color follows the active Pi theme.

## 🕰️ Timestamp semantics

- A **user** stamp is the timestamp recorded when Pi creates the submitted user message.
- An **assistant** stamp is the timestamp recorded when Pi creates the response stream/message. It is
  not the response completion time.
- If an assistant message invokes tools, its stamp appears after the complete tool block. Tool calls
  and results do not receive their own stamps.
- Times use the machine's local time zone, always include seconds, and use a zero-padded 24-hour
  clock.

`pi-stamp` currently runs only in TUI mode. Print, JSON, and RPC sessions do not append stamp entries
or emit extra protocol output.

## 🔒 Context and persistence

Stamps use Pi custom session entries. Pi renders those entries in the interactive transcript but
excludes them from model context. The extension does not modify user or assistant message content.

Once recorded, a stamp survives `/reload` and session resume while the extension remains loaded.
Messages created before `pi-stamp` recorded them are not backfilled because Pi's current public API
cannot insert a new custom entry into an older position in the session tree.

## 🚧 Limitations

- Pi does not currently expose a public decorator for built-in message rows, so timestamps appear as
  separate transcript rows rather than inside the original message bubble.
- Another extension can append transcript entries at the same lifecycle boundary, so strict visual
  adjacency between independently loaded extensions is not guaranteed.
- There are no date, locale, time-zone, relative-time, duration, model, token, cost, or tool-timing
  controls in the initial release.

See the
[pi-stamp roadmap](https://github.com/narumiruna/pi-extensions/blob/main/docs/roadmaps/pi-stamp-roadmap.md)
for possible future metadata stamps.

## 🗂️ Package layout

```text
extensions/pi-stamp/
├── src/
│   ├── index.ts       # Thin Pi package entrypoint
│   └── stamp.ts       # Formatter, renderer, and lifecycle hooks
├── test/
│   └── stamp.test.ts  # Formatting, rendering, ordering, and lifecycle coverage
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
