# Pi Codex Compact stable promotion plan

## Goal

Promote `@narumitw/pi-codex-compact` from experimental to stable without changing its compaction protocol or safety fallbacks.

## Plan

- [x] Update package and root lifecycle metadata so direct Git installation loads `pi-codex-compact`; `npm run check:boundaries` passed with 25 active extensions and 5 experimental extensions.
- [x] Remove package-level experimental warnings from runtime text and add a regression proving ordinary startup is quiet; all 4 focused lifecycle tests passed, and the RPC smoke emitted no startup notification.
- [x] Move the package into the stable root catalog and revise package and implementation documentation while retaining concrete wire-contract, backup, and replay limitations; the remaining package references to “experimental” describe upstream Codex settings or a different strategy.
- [x] Add a minor Changeset for the published stable promotion; `npm run changeset:status` reports `@narumitw/pi-codex-compact` 0.50.0.
- [x] Run verification: the package check, boundary check, 2,987-test full suite with one worker, 10-file dry-run pack inspection, and local RPC Pi load smoke passed. Two default-concurrency `npm run check` attempts completed Biome, boundaries, and all workspace typechecks but exposed unrelated load-sensitive `pi-subagents` and `pi-sync` test flakes; every failed file passed alone, and the complete one-worker suite passed 301/301 files.
- [x] Audit the final diff against `docs/extension-conventions.md` and Pi's extension, package, and RPC documentation; settings conventions are not applicable because settings behavior and schema do not change.

## Completion Checklist

- [x] `piExtension.lifecycle` is `stable`, and the root Pi manifest includes the extension.
- [x] No experimental startup warning remains, while real compatibility limitations remain documented.
- [x] Focused tests, boundary validation, package check, full serialized test suite, pack inspection, and load smoke pass; the default-concurrency gate deviation is recorded above.
- [x] The completed plan is archived under `docs/plans/archived/`.
