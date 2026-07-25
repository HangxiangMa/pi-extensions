# 🗂️ pi-file-context

[![npm](https://img.shields.io/npm/v/@narumitw/pi-file-context)](https://www.npmjs.com/package/@narumitw/pi-file-context)
[![Pi Extension](https://img.shields.io/badge/Pi-extension-blue)](https://github.com/earendil-works/pi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> [!WARNING]
> This extension is experimental. Its interaction model and package API may change, and it is excluded from automated repository publishing.

Browse project files inside Pi, preview text, select a line range, and attach the exact snapshot to the next prompt.

## ✨ Features

- Opens the file explorer when `@` is typed at a word boundary in Pi's normal editor.
- Provides `/file-quote` as a discoverable fallback when another extension owns the editor.
- Fuzzy-filters project files, preserves normal whole-file `@path` references, and previews bounded text files with line numbers.
- Selects a contiguous line range without using the system clipboard.
- Accumulates selected ranges in one compact pending-quote widget and injects every snapshot into the next ordinary interactive prompt.
- Skips common dependency, VCS, build, and coverage directories and does not follow symlinks during discovery.

## 📦 Install

The package is currently a local-only experiment. From this repository checkout:

```bash
pi -e ./experimental/pi-file-context
```

For persistent local use, add its absolute directory to the `extensions` array in `~/.pi/agent/settings.json`.

## 🚀 Quick start

1. Type `@` at the start of a word in Pi's editor. If another custom editor is active, run `/file-quote` instead.
2. Type to filter files and use `Up`/`Down` to navigate. Press `Tab` to insert a normal whole-file `@path` reference, or `Enter` to preview a file for quoting.
3. In the preview, move to the first line and press `Space` to anchor the selection.
4. Extend the range with `Up`/`Down`, then press `Enter` to attach it. Without an anchor, `Enter` attaches the cursor line.
5. Repeat from `@` to attach more ranges from the same or different files.
6. Write the question and submit normally. All pending quotes are attached in selection order and then cleared together.

`Escape` returns from a preview to the file list; from the file list it cancels without changing the draft. `Ctrl+C` cancels from either view.

The agent receives an explicit block similar to:

```xml
<user_file_quote path="src/runtime.ts" lines="12-18">
selected content
</user_file_quote>
```

## 💬 Commands

| Command | Mode | Description |
| --- | --- | --- |
| `/file-quote` | TUI only | Open the file explorer. Arguments are rejected. |

RPC receives an observable warning. JSON and print modes do not enter custom UI.

## 🔒 Security and limits

- Extensions run with the user's full permissions; install only trusted code.
- File paths and symlink targets are checked against the real project root before reading.
- Preview files are limited to 1 MB and NUL-containing files are treated as binary.
- Discovery is limited to 5,000 files and skips symlinks.
- Terminal control characters are escaped before file names or file contents are rendered.
- Each quote stores the text visible at selection time. It does not silently reread changed content when the prompt is submitted.
- A quote is limited to 500 lines and 50 KB. At most eight pending quotes and 100 KB of aggregate quote text are accepted.

## 🧪 Experimental limitations

- Keyboard line selection only; mouse drag selection is not implemented.
- Up to eight pending quotes; there is not yet an interactive remove/reorder action.
- Pending quotes do not survive `/reload`, session replacement, or shutdown.
- The `@` trigger is not installed when another extension already owns the custom editor; `/file-quote` remains available.
- File discovery uses a small built-in ignore list rather than `.gitignore` semantics.

## 🗂️ Package layout

```text
src/index.ts                 Thin Pi entrypoint
src/file-quote.ts            Lifecycle, filesystem boundaries, quote injection
src/file-quote-explorer.ts   File list and line-range TUI

test/file-quote.test.ts      Filesystem, prompt, lifecycle, and TUI tests
```

## 🔎 Keywords

Pi extension, file explorer, source quote, line selection, coding agent, terminal UI.

## 📄 License

[MIT](LICENSE)
