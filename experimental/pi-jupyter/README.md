# 📓 pi-jupyter

[![npm](https://img.shields.io/npm/v/@narumitw/pi-jupyter)](https://www.npmjs.com/package/@narumitw/pi-jupyter)
[![Pi Extension](https://img.shields.io/badge/Pi-extension-blue)](https://github.com/earendil-works/pi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> [!WARNING]
> This extension is experimental. Its preview behavior, interaction model, and shortcuts may change between releases.

Preview a Jupyter notebook (`.ipynb`) in a terminal-native panel beside Pi's editor. The panel renders the notebook saved on disk; it does not run a Jupyter kernel or open a browser webview.

## ✨ Features

- Opens a non-capturing right-side preview while the normal Pi editor remains usable.
- Detects notebooks used by Pi file tools and refreshes after matching tool results.
- Watches the selected notebook's parent directory so ordinary and atomic external saves refresh the panel.
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
2. Run `/jupyter-preview` to discover the first top-level `.ipynb`, or `/jupyter-preview path/to/notebook.ipynb` to select one explicitly.
3. Keep editing normally while the preview follows saved changes.
4. Press `Shift+F8` to focus the panel for scrolling, then `Escape` or `F8` to return to the editor.
5. Press `F8` or run `/jupyter-preview-close` to close the panel.

## 💬 Commands

All commands require Pi's interactive TUI mode. Commands documented without arguments reject trailing input.

| Command | Description |
| --- | --- |
| `/jupyter-preview [path]` | Open or refresh the preview; discover a top-level notebook when no path has been selected. |
| `/jupyter-preview-toggle [path]` | Toggle the current preview, or open the supplied notebook. |
| `/jupyter-preview-focus` | Focus the panel for keyboard scrolling. |
| `/jupyter-preview-refresh` | Reload the selected notebook from disk. |
| `/jupyter-preview-close` | Close the panel. |
| `/jupyter-preview-up [lines]` | Scroll up by a positive line count; defaults to 3. |
| `/jupyter-preview-down [lines]` | Scroll down by a positive line count; defaults to 3. |
| `/jupyter-preview-page-up` | Scroll up 12 lines. |
| `/jupyter-preview-page-down` | Scroll down 12 lines. |
| `/jupyter-preview-top` | Return to the first rendered line. |

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
- Mouse resizing depends on terminal SGR mouse reporting and may require the terminal's selection modifier for text selection.

## 🗂️ Package layout

```text
src/index.ts               Thin Pi entrypoint
src/jupyter-preview.ts     Commands, shortcuts, tool hooks, watcher, and lifecycle
src/notebook-panel.ts      Overlay component, scrolling, and mouse resizing
src/notebook.ts            Notebook loading, validation, and cell/output rendering
src/png-thumbnail.ts       Bounded PNG decoding and ANSI thumbnail rendering

test/jupyter-preview.test.ts  Paths, validation, commands, modes, and lifecycle
```

## 🔎 Keywords

Pi extension, Jupyter notebook, ipynb preview, terminal UI, notebook side panel.

## 📄 License

[MIT](LICENSE)
