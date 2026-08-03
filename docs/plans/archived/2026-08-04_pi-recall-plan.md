# Experimental Pi Recall implementation plan

## Goal

Add `experimental/pi-recall` (`@narumitw/pi-recall`, `/recall`) so users can save a text user or assistant message from the active session branch, then preview, quote, or delete it across sessions through All, Current cwd, and Current session scopes.

## Architecture

- Store versioned `recall_message` records in `getAgentDir()/pi-recall.jsonl`.
- Keep only raw text plus bounded source metadata; never inject saved content into model context automatically.
- Serialize cross-process read-modify-write operations with `proper-lockfile`, cancellable extension-owned retry, private temporary files, and atomic replacement.
- Use Pi TUI Kit standard screens for the manager, save choice, selected actions, reviews, status, and help. Use `runCustomInteraction()` only for the TUI scoped picker; RPC receives explicit scope and message dialogs.
- Own every interaction with a per-session generation and `AbortController`; abort and drain on reload, replacement, fork, and shutdown.

## Non-goals

No tags, text search, editing, import/export, automatic expiry, automatic context injection, cross-session transcript reading, settings, tools, or publication.

## Plan

- [x] Add failing focused tests for text extraction, source identity, scope filtering, previews, and XML-safe quote formatting; red: `tsc -p tsconfig.test.json` could not resolve `src/messages.js`; green: focused Node test passed 5/5.
- [x] Add failing focused tests for JSONL validation, limits, private regular-file checks, abort-aware cross-process locking, atomic save/delete, unknown-field preservation, malformed/newer/symlink/interrupted-write protection, and concurrent store instances; red: `tsc -p tsconfig.test.json` could not resolve `src/store.js`, and the later generated-ID collision test failed before its guard; green: focused store suite passed 8/8.
- [x] Add failing TUI/RPC tests for `/recall`, standard menu flows, save, preview, quote, confirmed delete, cancellation, empty/error states, argument rejection, and unsupported modes; red: `src/menu.js` was absent; green: menu suite passed 7/7.
- [x] Add failing scoped-picker tests for Current cwd default, Tab/Shift+Tab scope cycling, counts, stable selection, Back/Close, narrow widths, terminal-control sanitization, disposal, and owner replacement; red: `src/picker.js` was absent; green: picker suite passed 5/5, with owner cancellation also covered by the menu/lifecycle suites.
- [x] Add failing lifecycle tests for startup warning, replacement while a menu or lock wait is active, shutdown, post-publication staleness, and no stale UI/context access; red: `createRecallExtension` did not exist; green: lifecycle suite passed 5/5 and the store lock-abort test passed.
- [x] Add the thin entrypoint, package manifest, TypeScript config, MIT license, and English README with experimental warning, standard badges/headings, exact behavior, privacy, limits, deletion semantics, and package layout; package check and boundary validator passed.
- [x] With Node 22.22.2 and npm 12.0.2, add Pi TUI Kit/proper-lockfile dependencies, update the workspace lockfile, and add root `pack:recall`, `pack-recall`, and `try-recall` helpers; npm version was verified through the pinned `npm@12.0.2` invocation and `just --list` exposes both aliases.
- [x] Run focused tests, package typecheck, `npm run check:boundaries`, `npm run check`, `just pack recall`, inspect packed files, and run a non-interactive RPC load smoke that observes the warning and `/recall` command; evidence: 30/30 focused tests, all workspace typechecks, Biome over 711 files, 25-extension boundary pass, and 2,339/2,339 root tests passed in an isolated normal clone (avoiding linked-worktree Git injection and real user settings). Dry-run tarball contained only 9 allowed files. RPC `get_commands` observed the experimental warning and registered `recall`.
- [x] Audit the final diff against `docs/extension-conventions.md` for experimental package, entrypoint, command modes, custom TUI lifecycle, file mutation, documentation, tests, pack, and runtime loading. All applicable MUST rules are covered; `docs/extension-settings.md` is not applicable because Pi Recall has no settings. No accepted product deviation remains.

## Completion Checklist

- [x] A non-latest text user/assistant message on the active branch can be saved; abandoned branches and unsupported/empty/oversized content are excluded without mutation.
- [x] Saved messages survive sessions and filter correctly by normalized cwd or exact session ID; TUI scope switching preserves a still-visible saved ID.
- [x] Preview is exact, quote only edits the draft and excludes local identifiers, and confirmed deletion removes the canonical record while cancellation is byte-for-byte inert.
- [x] Concurrent processes do not lose updates or leave locks; invalid, newer, oversized, symlinked, or interrupted storage remains protected.
- [x] TUI/RPC, narrow/untrusted content, disposal, replacement, shutdown, print/JSON rejection, and experimental warning behavior are covered.
- [x] Root checks, package dry run, and non-interactive Pi load smoke pass.
- [x] Plan evidence is complete and this file is archived under `docs/plans/archived/`.
