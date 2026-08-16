# 🧭 Pi TUI Kit Showcase

[![private](https://img.shields.io/badge/npm-private-lightgrey)](./package.json) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> [!WARNING]
> Pi TUI Kit Showcase is experimental and private.
> It is a local maintainer demo, not a published extension.

`@narumitw/pi-tui-kit-showcase` opens an interactive local demo of public `@narumitw/pi-tui-kit` screens and standalone interactions.

It stores no persistent settings.

It uses only in-memory state for the current demo session.

## ✨ Features

- Shows `actions`, `detail`, `browse`, `choice`, `settings`, `input`, `review`, and `multiSelect` menu screens.
- Shows standalone `runTask()`, `runConfirmation()`, and `runLiveChoice()` interactions from the same entry menu.
- Demonstrates disabled rows, busy labels, searchable choices, exact browse documents, adaptive review, bulk multi-select actions, and selected-row descriptions.
- Keeps all side effects inside the demo process.
- Lazy-loads the Kit runtime only after the command runs.

## 📦 Install

This package is private and is not meant for npm publication.

Load it from a local checkout:

```bash
pi --no-extensions --no-skills --no-session -e ./packages/pi-tui-kit-showcase
```

The repository shortcut builds Kit first and then loads only this showcase extension:

```bash
just showcase-tui-kit
```

## 🚀 Quick start

Run this command in Pi TUI mode:

```text
/tui-kit-showcase
```

Choose any row to inspect a presentation pattern.

The standalone task, confirmation, and live-choice rows close the menu, show the standalone interaction, then reopen the menu when the interaction finishes.

RPC mode reports that the showcase requires TUI mode.

Print and JSON modes reject the command without writing ad hoc output.

## ⚙️ Settings

The showcase has no extension-owned settings file.

The **Settings screen** row edits in-memory demo values only.

Those values reset when the command starts again or the session owner is replaced.

## 💬 Commands

### `/tui-kit-showcase`

Opens the showcase menu in TUI mode.

The command accepts no arguments.

Unknown arguments are rejected with usage text.

## 🗂️ Package layout

- `src/index.ts` — thin Pi extension entrypoint forwarder.
- `src/showcase.ts` — command registration, lazy runtime loading, mode handling, and session owner cancellation.
- `src/runtime.ts` — menu loop plus standalone Kit interactions.
- `src/menu.ts` — declarative showcase screens and in-memory demo state.
- `test/` — focused package behavior tests.

## 🔎 Keywords

pi, pi-extension, tui, showcase, demo

## 📄 License

MIT © narumiruna
