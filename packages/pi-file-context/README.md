# 🗂️ pi-file-context

[![npm](https://img.shields.io/npm/v/@narumitw/pi-file-context)](https://www.npmjs.com/package/@narumitw/pi-file-context)
[![Pi Extension](https://img.shields.io/badge/Pi-extension-blue)](https://github.com/earendil-works/pi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> [!WARNING]
> This extension is experimental. Its interaction model and package API may change between releases.

Browse project files inside Pi, preview text, select a line range, and attach the exact snapshot to the next prompt.

## ✨ Features

- Opens the file explorer with a configurable shortcut that defaults to `F8`.
- Provides `/file-context` as a discoverable fallback without replacing Pi's normal editor.
- Fuzzy-searches project file names with typo tolerance and relevance ranking, preserves normal whole-file `@path` references, and previews bounded text files with line numbers.
- Switches with `Ctrl+F` to cancellable cwd content search with highlighted result cards, literal case-insensitive matching by default, and visible case-sensitive and fuzzy toggles.
- Shows textual staged, unstaged, untracked, ignored, and conflict status plus branch, HEAD, and dirty state when Git is available.
- Selects a contiguous line range or changed hunk without using the system clipboard and shows a deterministic token estimate before attachment.
- Discloses current-line blame and bounded file history, opens a validated commit/branch/tag version, and attaches explicit Git diff hunks.
- Accumulates selected ranges in one compact pending-quote widget, lets you remove one with `/file-context remove`, and injects the remaining snapshots into the next ordinary interactive prompt.
- Skips common dependency, VCS, build, and coverage directories and does not follow symlinks during discovery.

## 📦 Install

Install persistently from npm:

```bash
pi install npm:@narumitw/pi-file-context
```

Try from npm without installing permanently:

```bash
pi -e npm:@narumitw/pi-file-context
```

Try the local working tree from this repository checkout:

```bash
pi -e ./packages/pi-file-context
```

## 🚀 Quick start

1. Press `F8` or run `/file-context`.
2. Type to fuzzy-search file names in relevance order and use `Up`/`Down` to navigate. Press `Tab` to insert a normal whole-file `@path` reference, or `Enter` to preview a file for quoting.
3. Press `Ctrl+F` to switch between file-name and content search. Content search is literal and case-insensitive by default; `Alt+C` toggles case sensitivity and `Alt+F` toggles ordered fuzzy matching. The current states remain visible above the results.
4. In content results, use `Up`/`Down` to choose a highlighted path-and-line card. Press `Tab` for a whole-file reference or `Enter` to preview the file at that line. `Escape` from the preview restores the query, result selection, and scroll position.
5. In the preview, press `Space` to anchor the selection. Extend the range with `Up`/`Down`, then press `Enter` to attach it. Without an anchor, `Enter` attaches the cursor line.
6. In a Git worktree, use `[`/`]` to select changed hunks, `b` for current-line blame, `h` for file history, `r` to open a commit/branch/tag, or `d` to inspect and attach explicit diff context.
7. Repeat from the shortcut to attach more ranges from the same or different files. Run `/file-context remove` to choose and remove one pending quote, or press `Escape`/`Ctrl+C` in that selector to keep every quote. Then write the question and submit normally. All remaining quotes are attached in selection order and cleared together.

`Escape` returns from a preview to its originating file-name or content results; from either search screen it cancels without changing the draft. `Ctrl+C` cancels from every view.

The agent receives an explicit block similar to:

```xml
<user_file_quote path="src/runtime.ts" lines="12-18" git_head="a1b2c3d4..." git_branch="main" git_status="modified (unstaged)" git_blob="e5f6..." content_sha256="9abc..." source="worktree" git_base="HEAD">
selected content
</user_file_quote>
```

Non-Git quotes retain the original `path` and `lines` attributes exactly. Git-backed quotes add ordered optional provenance: the repository HEAD at selection time, branch, file status, selected revision or baseline, tracked blob when available, source kind (`worktree`, `revision`, or `git_diff`), and SHA-256 of the exact attached text. HEAD alone does not identify uncommitted content; `content_sha256` identifies the actual snapshot.

Token counts are deterministic byte-based estimates (`ceil(UTF-8 bytes / 4)`), not provider billing guarantees. Diff context is never attached automatically.

## ⚙️ Settings

File Context reads optional user settings from `~/.pi/agent/pi-file-context.json`, or the equivalent file under Pi's configured agent directory.

The file is not created when defaults are used.

```json
{
  "openShortcut": "f8"
}
```

Set `openShortcut` to any valid Pi key identifier, or set it to `null` to disable the shortcut and use `/file-context` only.

Run `/reload` after editing the file because Pi registers extension shortcuts during extension loading.

Invalid JSON or values leave the source file unchanged, use the default shortcut, and produce a warning.

Choose a shortcut that does not conflict with Pi or another extension; `Ctrl+F` is already Pi's cursor-right binding and File Context's internal search-mode toggle.

The previous `Ctrl+Alt+F` default depended on terminal modifier support and may not reach Pi. An explicit `"openShortcut": "ctrl+alt+f"` value remains supported but is not migrated automatically; replace it with `"f8"` and run `/reload` to adopt the reliable default.

## 💬 Commands

| Command | Mode | Description |
| --- | --- | --- |
| `/file-context` | TUI only | Open the file explorer. |
| `/file-context remove` | TUI only | Choose and remove one pending quote. |

Unknown and trailing arguments are rejected. RPC receives an observable warning. JSON and print modes do not enter interactive UI.

## 🔒 Security and limits

- Extensions run with the user's full permissions; install only trusted code.
- File paths and symlink targets are checked against the real project root before reading.
- Preview files are limited to 1 MB and NUL-containing files are treated as binary.
- Discovery is limited to 5,000 files and skips symlinks.
- File-name and content-search queries are limited to 256 characters. Content search returns at most 100 cards and reports truncation and unreadable, oversized, or binary files as skipped.
- Content search uses the same 5,000-file, 1 MB-per-file, real-project-path, and no-symlink boundaries as preview loading. Superseded searches and file opens are cancelled.
- Terminal control characters are escaped before file names, Git refs, authors, summaries, search context, or file contents are rendered.
- Git is invoked read-only without a shell, pager, external diff, or text conversion; commands time out after 5 seconds and output is bounded to 1.1 MB.
- Revision names are resolved to a commit before file loading. Historical files remain subject to the 1 MB and binary guards.
- Blame shows the author name but not author email. Commit summaries and diffs can still contain sensitive project text; inspect selections before attachment.
- Each quote stores the text visible at selection time. It does not silently reread changed content when the prompt is submitted.
- A quote is limited to 500 lines and 50 KB. At most eight pending quotes and 100 KB of aggregate quote text are accepted.

## 🧪 Experimental limitations

- Keyboard line selection only; mouse drag selection is not implemented.
- Up to eight pending quotes; removal is supported, but there is not yet a reorder action.
- Pending quotes do not survive `/reload`, session replacement, or shutdown.
- The configurable shortcut is registered without replacing another extension's custom editor; `/file-context` remains available if the shortcut is disabled or conflicts.
- File discovery uses a small built-in ignore list rather than `.gitignore` semantics.
- Content search scans discovered files natively and sequentially; large projects or queries with no matches may take longer than indexed or external search tools.
- Fuzzy content search matches query characters in order on one line; it is not semantic search and does not cross line boundaries.
- Git integration degrades to the original filesystem-only workflow outside a repository or when Git metadata cannot be read.
- File history is limited to the 20 most recent commits. Untracked files have status and provenance but no HEAD diff hunk until Git tracks them.

## 🗂️ Package layout

```text
src/index.ts                   Thin Pi entrypoint
src/file-context.ts            Lifecycle, shortcut registration, filesystem boundaries, quote injection
src/file-context-settings.ts   User shortcut loading and validation
src/file-context-explorer.ts   File list, Git detail views, and line-range TUI
src/content-search.ts          Bounded literal and fuzzy content matching
src/content-search-session.ts  Search input, toggles, navigation, and cancellation
src/content-search-ui.ts       Width-safe result cards and highlighted context
src/file-search.ts             Bounded native fuzzy file-name ranking
src/git-context.ts             Bounded read-only Git status, diff, blame, history, revisions

test/content-search.test.ts     Content matcher behavior and limits
test/content-search-ui.test.ts  Content interaction, rendering, and lifecycle tests
test/file-context.test.ts       Filesystem, prompt, lifecycle, shortcut, and explorer tests
test/pending-quotes.test.ts     Pending quote removal, cancellation, and stale-flow tests
test/file-context-settings.test.ts  Shortcut settings defaults and validation tests
test/git-context.test.ts        Git repository behavior and parser tests
```

## 🔎 Keywords

Pi extension, file explorer, source quote, line selection, coding agent, terminal UI.

## 📄 License

[MIT](LICENSE)
