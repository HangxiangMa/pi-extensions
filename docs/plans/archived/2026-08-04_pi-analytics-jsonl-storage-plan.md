# Pi Analytics JSONL Storage Plan

## Goal

Replace shared SQLite/Turso storage with private, versioned, append-only JSONL files so analytics never performs database work during Pi startup or shutdown and concurrent Pi processes do not share routine writer locks.

## Context

- The approved storage root is `<agent-dir>/pi-analytics/`, with an atomic `current` generation marker and per-runtime writer files under `generations/<generation>/`.
- Existing `pi-analytics.db` and `pi-analytics.db-wal` are legacy user-owned files. The extension must not open, migrate, import, delete, or rewrite them.
- Analytics are best-effort derived metadata. Already published frames remain durable, but failed, oversized, timed-out, or shutdown-interrupted observations may be dropped.
- `/analytics` remains argument-free and TUI/RPC-only. No setting, version bump, publication, visibility change, tag, or release dispatch is in scope.
- Applicable guidance: `docs/extension-conventions.md` lifecycle, command, TUI/RPC, local-data, package-boundary, documentation, and verification rules. `docs/extension-settings.md` is not applicable because no extension-owned settings change.

## Architecture

- `src/analytics.ts` owns Pi lifecycle and creates an in-memory store facade without startup I/O. Shutdown invalidates the facade without persisting an active interrupted cycle.
- `src/storage/format.ts` owns the v1 JSONL envelope, known-field validation, and the 1 MiB frame boundary.
- `src/storage/files.ts` owns private lazy generation initialization, atomic marker publication, per-runtime append files, cancellable scanning, generation-race retries, logical Clear, and best-effort obsolete-generation deletion.
- `src/storage/queries.ts` incrementally aggregates validated `SettledRun` values without SQL while preserving existing metric definitions and ordering.
- `src/storage/store.ts` is the small lifecycle facade consumed by the extension and menu.
- `src/storage/database.ts` and `src/storage/migrations.ts` are removed with their obsolete tests and Turso dependency.

## Plan

- [x] Add red-first storage tests for lazy construction, initialization races, isolated concurrent writers, frame validation/bounds, partial tails, cancellation/deadlines, generation races, Clear races, permissions, and symlink rejection. Evidence: initial focused runs failed in the unimplemented `format.ts` and `files.ts` paths; final focused analytics suite passes 53 tests.
- [x] Implement the JSONL format, file protocol, store facade, and incremental aggregation. Evidence: focused storage/format/files/query tests pass, including six independent OS processes publishing 60 unique runs into one root.
- [x] Add red-first lifecycle tests for no startup I/O, bounded settled writes, stale-continuation guards, shutdown invalidation, and omission of active interrupted runs; update `analytics.ts`. Evidence: lifecycle tests cover repeated start, delayed write shutdown, delayed skill reads, and stale-session guards.
- [x] Update menu Clear semantics and tests for all-history confirmation, generic success, post-commit cancellation, incomplete-cleanup warnings, and terminal-control-safe display.
- [x] Remove SQLite production/migration code and tests; remove `@tursodatabase/database` and regenerate only intended lockfile changes with npm 12.0.2 on Node 22.22.2. Evidence: lock diff removes only the Turso workspace dependency and its transitive packages.
- [x] Rewrite the package README for JSONL storage, platform support, privacy, Clear, legacy recovery, limitations, and package layout.
- [x] Audit the final diff against `docs/extension-conventions.md`. Touched areas: factory/session lifecycle, async menu cancellation, command compatibility, private local storage, package dependencies, README, tests, package/runtime verification. No settings guide applies. Node filesystem cancellation remains best-effort and is documented; Windows-specific cleanup races are covered structurally but were not runtime-smoked on Windows.

## Completion Checklist

- [x] Startup and shutdown contain no SQLite/native-driver path; startup creates only a lazy in-memory facade, while shutdown aborts and drains owned filesystem work.
- [x] Concurrent writers, cancellation, Clear races, corruption boundaries, lifecycle replacement, display privacy, and data privacy invariants have deterministic passing tests.
- [x] `/analytics` retains its established TUI/RPC interface and metric definitions.
- [x] Legacy DB/WAL remain untouched and are documented as manual cleanup only after all old Pi processes stop.
- [x] Verification passed: focused analytics suite (53 tests), `npm test`, `npm run check` (2,343 tests plus Biome/boundaries/typechecks), 14-entry package dry run, six-process Pi startup/exit smoke, and six-process/60-run JSONL publication smoke.
- [x] Conventions audit records the guide, touched areas, checks/smokes, accepted best-effort filesystem cancellation, and unverified Windows runtime path.
