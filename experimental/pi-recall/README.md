# 🧠 Pi Recall — Saved Messages for Pi

[![npm](https://img.shields.io/npm/v/@narumitw/pi-recall)](https://www.npmjs.com/package/@narumitw/pi-recall) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> [!WARNING]
> Pi Recall is experimental. Its storage format and interaction flow may change between releases.

`@narumitw/pi-recall` saves selected text messages from the active Pi session branch and lets you preview or quote them in another session. Saved content remains local until you explicitly insert a quote into a draft and submit it.

## ✨ Features

- Saves any eligible user or assistant text message from the current active session branch—not only the latest message.
- Recalls saved messages across sessions using **Current cwd**, **All**, or **Current session** scope.
- Cycles TUI scope with `Tab` and `Shift+Tab`, with the active scope and result count always visible.
- Previews the complete saved text before use.
- Inserts an XML-marked quote at the TUI editor cursor without submitting it automatically.
- Stores versioned JSONL locally with cross-process locking, private permissions, and atomic replacement.
- Fails closed when storage is malformed, unsupported, oversized, symlinked, or not a regular file.

## 📦 Install

Install persistently from npm:

```bash
pi install npm:@narumitw/pi-recall
```

Try from npm without installing permanently:

```bash
pi -e npm:@narumitw/pi-recall
```

Try this package from a local checkout:

```bash
pi -e ./experimental/pi-recall
```

## 🚀 Quick start

1. Run `/recall`.
2. Choose **Save a message** and select a text user or assistant message from the active branch.
3. In any later session, run `/recall` and choose **Recall a saved message**.
4. In TUI mode, press `Tab` or `Shift+Tab` to change scope. RPC mode asks for scope explicitly.
5. Preview the message or choose **Quote into draft**.
6. Add your question or instruction, then submit the draft normally.

A quoted draft uses this form:

```xml
<recalled_message role="assistant" message_timestamp="2026-08-04T12:34:56.000Z">
Original message text
</recalled_message>

The user intentionally recalled and quoted the saved message above.
```

The quote sent to the editor omits cwd, session IDs, entry IDs, session files, and other local paths.

## 💬 Commands

| Command | Modes | Description |
| --- | --- | --- |
| `/recall` | TUI, RPC | Open the Pi Recall manager. Arguments are rejected. |

Print and JSON modes reject `/recall` before opening an interactive flow. TUI and RPC expose the same save, preview, quote, delete, status, and help capabilities; RPC uses explicit dialogs instead of terminal shortcuts. In RPC, quoting emits Pi's `set_editor_text` extension UI request.

## 🧭 Recall scopes

- **Current cwd** — saved messages whose normalized absolute source cwd matches the current cwd. This is the default each time the picker opens.
- **All** — every valid record in the current Pi agent directory.
- **Current session** — records whose source session ID exactly matches the current session.

Scope applies only when recalling already saved messages. The save picker intentionally reads only `ctx.sessionManager.getBranch()` from the current session and never scans other session files. TUI scope switching keeps the selected saved record when it remains visible in the new scope; otherwise it selects the newest visible record.

## 🔒 Storage, privacy, and recovery

The canonical user file is:

```text
~/.pi/agent/pi-recall.jsonl
```

Pi's configured agent directory replaces `~/.pi/agent` when applicable. Each line is one active versioned `recall_message` record. Records contain the text, role, saved time, original message time, source cwd, source session ID, source entry ID, and optional session name. This provenance is shown locally but is excluded from generated quote payloads except for role and original message time.

Pi Recall does not create settings, session custom entries, tools, background processes, watchers, or automatic model context. It reads storage only when `/recall` needs it.

Save and delete operations acquire one cross-process lock, reread canonical storage under that lock, and publish a complete JSONL replacement through a unique same-directory `0600` temporary file. Lock waiting is abort-aware. The canonical file is required to be a regular non-symlink file and is kept at `0600`.

Malformed JSON, duplicate IDs, unknown record types or versions, invalid records, symlinks, and limit violations make storage read-only. Fix or move the reported file, then reopen `/recall`; Pi Recall never overwrites invalid storage. Unknown fields on otherwise valid version-1 records survive later rewrites.

Deleting a message removes it from canonical `pi-recall.jsonl`. It is not secure erasure of filesystem blocks, backups, snapshots, temporary copies left by an operating-system failure, or content already quoted into a session.

## 📝 Message semantics and limits

- Eligible sources are `message` entries with role `user` or `assistant` on the active branch.
- User strings and text blocks are kept; multiple text blocks are joined in source order with newlines.
- Thinking, tool calls, tool results, images/base64, custom messages, image-only messages, empty text, and abandoned branches are not saved.
- Markdown, indentation, Unicode, and original line breaks are preserved. Oversized messages are excluded rather than truncated.
- A source message can be saved only once for the same source session ID and entry ID.
- At most 200 messages may be saved.
- One message text may contain at most 50,000 UTF-8 bytes.
- Canonical JSONL may contain at most 12 MiB.
- Records are never evicted automatically.

Terminal controls are removed from labels, previews, metadata, and errors before display. Full review content is passed through Pi TUI Kit's sanitized review renderer. The raw stored text is not modified merely for display.

## 🚧 Experimental limitations

- No tags, text search, editing, reordering, import/export, automatic expiry, or automatic context injection.
- No cross-session transcript browser: only previously saved records can be recalled across sessions.
- Text only; images and tool payloads are deliberately omitted.
- The custom TUI picker is keyboard-operated. RPC uses sequential dialogs.
- Scope preference is not persisted; every new picker starts at **Current cwd**.

## 🗂️ Package layout

```text
experimental/pi-recall/
├── src/
│   ├── index.ts       # Thin Pi package entrypoint
│   ├── menu.ts        # Standard manager screens and TUI/RPC flow
│   ├── messages.ts    # Text extraction, scope filtering, previews, and quote format
│   ├── picker.ts      # Scoped TUI saved-message picker
│   ├── recall.ts      # Command registration and session lifecycle ownership
│   └── store.ts       # Locked, validated, atomic JSONL storage
├── test/
│   ├── menu.test.ts
│   ├── messages.test.ts
│   ├── picker.test.ts
│   ├── recall.test.ts
│   └── store.test.ts
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

## 🔎 Keywords

Pi extension, saved messages, message recall, cross-session context, quote manager, JSONL, terminal UI.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
