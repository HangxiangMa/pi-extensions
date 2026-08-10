# 🧰 pi-tool — Tool Browser for Pi

[![npm](https://img.shields.io/npm/v/@narumitw/pi-tool)](https://www.npmjs.com/package/@narumitw/pi-tool) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-tool` adds one read-only `/tool` command for browsing every tool configured in the current Pi session and inspecting the metadata Pi exposes for it.

## ✨ Features

- Lists built-in, SDK-provided, and extension-provided tools in one searchable catalog.
- Shows whether each tool is currently active.
- Shows the tool description, source, scope, origin, path, and optional base directory.
- Shows the complete JSON parameter schema and every prompt guideline exposed by `pi.getAllTools()`.
- Shows the effective prompt snippet exposed for an active tool by `ctx.getSystemPromptOptions()`.
- Reads fresh tool and system-prompt metadata each time the catalog opens.
- Changes no tools, settings, files, or session data.

## 📦 Install

Install persistently from npm:

```bash
pi install npm:@narumitw/pi-tool
```

Try without installing permanently:

```bash
pi -e npm:@narumitw/pi-tool
```

Try this package from a local checkout:

```bash
pi -e ./packages/pi-tool
```

Extensions run with the same permissions as Pi.
Only install packages from sources you trust.

## 🚀 Quick start

Run:

```text
/tool
```

Type to filter the list, move to a tool, and press Enter to open its details.
Escape returns to the list and then closes the catalog.

The command works in TUI and RPC modes.
It rejects arguments and rejects print or JSON modes because Pi does not provide an observable interactive command surface there.

## 💬 Commands

| Command | Description |
| --- | --- |
| `/tool` | Browse configured tools and inspect their exposed metadata. |

`/tool` intentionally accepts no arguments and does not enable, disable, or execute tools.

## ℹ️ Metadata limits

The catalog displays the fields returned by Pi's public `pi.getAllTools()` API: name, description, parameter schema, prompt guidelines, and source metadata.
It combines those fields with the effective snippets returned by `ctx.getSystemPromptOptions()` for the current active tool set.
An inactive tool's configured snippet is not exposed through the Extension API, so “None in the current system prompt” does not mean its full definition has no snippet.
Pi does not expose a tool's implementation, runtime secrets, or label through these Extension APIs.

## 🗂️ Package layout

```text
packages/pi-tool/
├── src/
│   ├── index.ts         # Thin Pi package entrypoint
│   ├── tool.ts          # Command and session lifecycle ownership
│   └── tool-catalog.ts  # Read-only catalog and detail projection
├── test/
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

## 🔎 Keywords

Pi extension, Pi coding agent, tool browser, tool catalog, tool schema, prompt guidelines, TypeScript Pi package.

## 📄 License

MIT.
See [`LICENSE`](./LICENSE).
