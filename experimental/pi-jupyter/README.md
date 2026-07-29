# 📓 pi-jupyter

[![npm](https://img.shields.io/npm/v/@narumitw/pi-jupyter)](https://www.npmjs.com/package/@narumitw/pi-jupyter)
[![Pi Extension](https://img.shields.io/badge/Pi-extension-blue)](https://github.com/earendil-works/pi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> [!WARNING]
> This extension is experimental. Its preview behavior, interaction model, and shortcuts may change between releases.

Preview a Jupyter notebook (`.ipynb`) in a terminal-native panel beside Pi's editor. The panel renders the notebook saved on disk; it does not run a Jupyter kernel or open a browser webview.

## ✨ Features

- Exposes one `/jupyter` current-state menu for choosing, opening, focusing, refreshing, switching, or closing a preview.
- Opens a non-capturing right-side preview while the normal Pi editor remains usable.
- Detects notebooks used by successful Pi file tools and refreshes after matching tool results.
- Watches the selected notebook's parent directory so ordinary and atomic external saves refresh the panel.
- Loads notebook changes atomically and preserves the last valid preview after cancellation, partial saves, or parse failures.
- Renders markdown and code cells, execution counts, bounded text/error output, and inline image output.
- Displays PNG output as truecolor ANSI half-block thumbnails; other image formats use Pi TUI terminal-image support when available.
- Supports keyboard scrolling, focused scrolling, and mouse resizing from the panel's left border.
- Auto-hides the overlay when the terminal is narrower than 90 columns.

## 📦 Install

Install persistently from npm:

```bash
pi install npm:@narumitw/pi-jupyter
```

Try from npm without installing permanently:

```bash
pi -e npm:@narumitw/pi-jupyter
```

Try the local working tree from this repository checkout:

```bash
pi -e ./experimental/pi-jupyter
# or
just try jupyter
```

Avoid loading both a global npm installation and the local workspace at the same time; duplicate instances register the same shortcuts.

## 🚀 Quick start

1. Start Pi in a directory containing a notebook.
2. Run `/jupyter` and choose a notebook. The picker lists top-level `.ipynb` files and also accepts an explicit path.
3. Keep editing normally while the preview follows valid saved changes.
4. Press `Shift+F8` to focus the panel for scrolling, then `Escape` or `F8` to return to the editor.
5. Press `F8` or choose **Close preview** from `/jupyter` when finished.

## 💬 Command

Pi-jupyter registers only `/jupyter`, and it requires Pi's interactive TUI mode. With no arguments
it opens a standard shallow current-state menu. The menu shows the selected filename, open/closed
state, cell count, load time, stale errors, and the fixed 90-column auto-hide threshold.

Primary menu actions depend on the current state:

- **Choose a notebook…** opens a standard dynamic picker for top-level notebooks or an explicit path;
  Escape returns without changing the preview and Ctrl+C closes the flow.
- **Open / Focus preview** performs the most relevant next viewing action.
- **Refresh from disk** keeps the last valid version when a save is incomplete or invalid.
- **Switch notebook…** commits the new path and watcher only after the candidate loads successfully.
- **Close preview** closes the panel and watcher but retains the selection for a later reopen.
- **Controls and shortcuts** opens a standard Back-navigable detail screen.

Loading from the menu is cancellable with Escape. A cancelled or failed load leaves the previous path, content, watcher, scroll position, and panel state unchanged.

### Advanced direct routes

Known actions and nested scroll controls complete after `/jupyter `. Unknown actions, invalid counts, and trailing arguments are rejected.

| Route | Effect |
| --- | --- |
| `/jupyter open [path]` | Open a path, the current selection, or the first discovered top-level notebook. |
| `/jupyter toggle [path]` | Toggle the current preview, or open a supplied path. |
| `/jupyter focus` | Focus the open panel for keyboard scrolling. |
| `/jupyter refresh` | Reload the current selection while preserving the last valid version on failure. |
| `/jupyter close` | Close the panel and watcher. |
| `/jupyter scroll up [lines]` / `down [lines]` | Scroll by a positive line count; defaults to 3. |
| `/jupyter scroll page-up` / `page-down` | Scroll by 12 lines. |
| `/jupyter scroll top` | Return to the first rendered line. |

### Migration from preview commands

The experimental package no longer registers the old slash names. Equivalent routes are:

| Previous command | Replacement |
| --- | --- |
| `/jupyter-preview [path]` | `/jupyter open [path]` |
| `/jupyter-preview-toggle [path]` | `/jupyter toggle [path]` |
| `/jupyter-preview-focus` | `/jupyter focus` |
| `/jupyter-preview-refresh` | `/jupyter refresh` |
| `/jupyter-preview-close` | `/jupyter close` |
| `/jupyter-preview-up [lines]` / `-down [lines]` | `/jupyter scroll up [lines]` / `down [lines]` |
| `/jupyter-preview-page-up` / `-page-down` | `/jupyter scroll page-up` / `page-down` |
| `/jupyter-preview-top` | `/jupyter scroll top` |

## ⌨️ Shortcuts

| Shortcut | Action |
| --- | --- |
| `F8` | Toggle the preview. |
| `Shift+F8` | Focus the preview. |
| `Ctrl+Alt+J` / `Ctrl+Alt+K` | Scroll down/up without focusing. |
| `Ctrl+Alt+D` / `Ctrl+Alt+U` | Page down/up without focusing. |
| Drag the left border | Resize the panel. |

While focused, use `Up`, `Down`, `PgUp`, `PgDn`, `Home`, or `j`, `k`, `u`, `d`, `g`. Use `Escape` or `F8` to release focus.

## 🔒 Security and limits

- Pi extensions run with your full user permissions; install only trusted code.
- An explicitly supplied notebook path may point outside the current project. The extension only reads and watches the selected file; review the path before opening it.
- Notebook previews are limited to regular files no larger than 10 MB.
- Source display is limited to 12 lines per cell and rendered output to 24 lines per code cell.
- PNG decoding accepts non-interlaced 8-bit images and rejects decoded images above 16 million pixels.
- Notebook text, paths, errors, and output are escaped before terminal rendering to prevent embedded terminal controls.
- The extension does not execute notebook code, contact a Jupyter server, or send notebook contents to a separate service.

## 🧪 Experimental limitations

- Preview rendering is intentionally static and does not provide notebook editing or kernel execution.
- Notebook discovery scans only files directly inside Pi's current working directory.
- Rich HTML, JavaScript, widgets, LaTeX, and most MIME-specific output are not rendered.
- Long cells and outputs are summarized rather than interactively expanded.
- An open overlay is hidden below 90 terminal columns and reappears when the terminal is widened; `/jupyter` reports this hidden state.
- Mouse resizing depends on terminal SGR mouse reporting and may require the terminal's selection modifier for text selection.

## 🗂️ Package layout

```text
src/index.ts                Thin Pi entrypoint
src/jupyter-command.ts      Single-command parser, completions, and direct-route dispatch
src/jupyter-menu.ts         Current-state menu, picker, help, and responsive state summaries
src/jupyter-preview.ts      Shortcuts, tool hooks, atomic transitions, watcher, and lifecycle
src/notebook-panel.ts       Overlay component, adaptive hints, scrolling, and mouse resizing
src/notebook.ts             Cancellable loading, validation, and cell/output rendering
src/png-thumbnail.ts        Bounded PNG decoding and ANSI thumbnail rendering

test/jupyter-command.test.ts      Command, completion, menu, navigation, and help behavior
test/jupyter-preview.test.ts      Paths, validation, modes, rendering, hooks, and lifecycle
test/jupyter-transitions.test.ts  Cancellation, failure preservation, races, and reopen behavior
```

## 🔎 Keywords

Pi extension, Jupyter notebook, ipynb preview, terminal UI, notebook side panel.

## 📄 License

[MIT](LICENSE)
