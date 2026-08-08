# Pi File Context content search plan

## Goal

Add an approved content-search mode to `pi-file-context`: `Ctrl+F` switches from the existing file-name picker to cwd file contents, literal case-insensitive search is the default, `Alt+C` and `Alt+F` toggle case-sensitive and fuzzy matching, result cards highlight matches, and `Enter` opens the existing line-range preview at the matched line.

## Architecture

- Keep filesystem discovery and safe bounded reads owned by `file-context.ts`.
- Add a focused content-search module that scans discovered files with cancellation, bounded results, match ranges, and skipped-file reporting.
- Keep navigation and rendering in `FileQuoteExplorer`, preserving file-name search, whole-file references, Git detail flows, pending quotes, and non-TUI behavior.
- Treat content searching, file opening, cancellation, component disposal, session replacement, and shutdown as separate lifecycle paths.

## Non-Goals

- Character-range attachment, persistent search settings, mouse selection, external search-process dependencies, or changing the established `@` trigger.

## Plan

- [x] Added focused literal, case-sensitive, fuzzy, bounded, and cancellation tests in `packages/pi-file-context/test/content-search.test.ts` plus abort-aware read coverage; initial `npm test` failed because `content-search.js` and `LoadOptions.signal` were absent.
- [x] Implemented `packages/pi-file-context/src/content-search.ts` and abort-aware safe reads; focused matcher, Unicode-range, and filesystem tests pass.
- [x] Added focused explorer tests for `Ctrl+F`, result cards/highlighting, `Alt+C`, `Alt+F`, matched-line preview entry, preserved search state on `Escape`, width safety, cancellation, disposal, and stale opens; initial `npm test` failed because `FileQuoteExplorer.dispose()` was absent.
- [x] Implemented the approved screen through `content-search-session.ts`, `content-search-ui.ts`, and `file-context-explorer.ts`; the explorer remains below 1,000 lines and all focused package tests pass.
- [x] Updated `packages/pi-file-context/README.md` and added `.changeset/calm-books-search.md` with a minor release; documentation matches the tested keyboard, lifecycle, and limit behavior.
- [x] Ran the 42 focused `pi-file-context` tests and package check, then `npm run check`; the final CI-equivalent gate passed all 2,562 tests.
- [x] Ran `just pack file-context` and inspected all 11 expected published files; a non-interactive offline Pi load smoke exited successfully. The live custom-TUI path was not opened because repository execution policy forbids interactive TUI commands; deterministic component tests exercise that path.

## Completion Checklist

- [x] `content-search.test.ts` proves default `this is` matches both example files case-insensitively while `thisis` has no literal result.
- [x] Matcher and explorer tests prove fuzzy `thisis` matching plus visible `Alt+C` case and `Alt+F` fuzzy states.
- [x] Explorer tests prove selected path/line cards, distant-match context, terminal sanitization, IME focus forwarding, navigation, and width bounds.
- [x] Explorer tests prove matched-line preview entry and restoration of the content query, result selection, and scroll position on `Escape`.
- [x] Abort-aware discovery/read/Git paths plus cancellation, disposal, stale-open, session-owner, and shutdown guards prevent stale publication and release owned work.
- [x] The final 2,562-test repository gate covers existing file search, `Tab` references, Git views, quote injection, and non-TUI rejection; focused tests also cover content-result `Tab`.
- [x] Audited `docs/extension-conventions.md` custom-TUI and lifecycle MUST rules: TUI guards remain, lines are bounded, theme/input invalidation and IME focus are forwarded, every owned async path is abortable and stale-guarded, and deterministic tests cover cancellation/disposal. No settings guide applies because no setting is persisted.
- [x] `.changeset/calm-books-search.md` reports a minor bump to 0.50.0; `npm run check`, `just pack file-context`, `npm run changeset:status`, non-interactive Pi load smoke, and `git diff --check` pass.
