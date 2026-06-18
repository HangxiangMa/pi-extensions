## Goal

Add opt-in Pi conversation/session syncing to `@narumitw/pi-sync` for issue #99. Success means users can sync Pi JSONL sessions under `~/.pi/agent/sessions/` through the existing R2/S3 snapshot flow, with privacy warnings, backups, conflict protection, tests, and docs.

## Context

Issue #99 asks for `pi-sync` to support synced sessions/conversations. Current docs explicitly said pi-sync did not sync Pi sessions. Pi stores sessions as JSONL under `~/.pi/agent/sessions/--<cwd>--/<timestamp>_<uuid>.jsonl`; session files are user data and may include prompts, tool output, paths, screenshots, or secrets.

## Architecture

Keep the existing S3/R2 snapshot model and local lock. Add a `syncSessions` config flag, defaulting to `false`, that extends the collected file set with session JSONL files only. Do not add real-time collaborative editing; this remains file snapshot sync.

## Non-Goals

- Do not sync `auth.json`, OAuth state, npm caches, `.pisync`, `.env*`, or arbitrary files under `~/.pi/agent`.
- Do not support concurrent live editing of the same session file from multiple machines.
- Do not add a new storage backend or database.

## Assumptions

- “Synchronous conversations” in issue #99 means Pi session/conversation files, not live multi-user chat.
- Opt-in is required because sessions are more sensitive than settings.

## Plan

- [x] Confirm the exact Pi session file shape and resume behavior against local Pi docs and one sample file; verified by `docs/sessions.md`, `docs/session-format.md`, `find ~/.pi/agent/sessions -name '*.jsonl' | head -5`, and a sample JSONL header showing `type: "session", version: 3`.
- [x] Add `syncSessions?: boolean | string` config parsing to `extensions/pi-sync/src/sync.ts`, default `false`, with env override `PI_SYNC_SESSIONS`; verified by `syncSessions config defaults off and supports file plus env overrides` in `npm test`.
- [x] Extend snapshot collection so `sessions/**/*.jsonl` is included only when `syncSessions` is enabled, while denying non-JSONL files, symlink escapes, `.pisync`, `.env*`, token/secret paths, and `node_modules`; verified by `snapshot collection includes session jsonl files only when enabled` and `snapshot preflight validates checksums, duplicate session paths, and deletes stale files` in `npm test`.
- [x] Keep pull/rollback safety for sessions by reusing the current backup and preflight apply path, and add regression coverage for duplicate session paths, checksum mismatch, and local backup creation before applying a session snapshot; verified by `snapshot preflight validates checksums, duplicate session paths, and deletes stale files` and `session backups include session jsonl files when enabled` in `npm test`.
- [x] Update `/pisync config`, `/pisync doctor`, `/pisync status`, and `/pisync diff` output to show whether sessions are included and to warn that session contents may contain sensitive data; verified by `pisync config output reports session sync and privacy warning` in `npm test` and source review of `status`, `diff`, and `doctor` output.
- [x] Decide whether auto-sync should push on `session_shutdown` when `autoSync` and `syncSessions` are enabled; implemented a quiet shutdown push guarded by `autoSync`, `syncSessions`, local-change detection, and the existing lock, with async shutdown support grounded in Pi extension docs and the `auto-commit-on-exit.ts` example.
- [x] Update `extensions/pi-sync/README.md` to document `syncSessions`, `PI_SYNC_SESSIONS`, privacy risks, non-real-time behavior, conflict expectations, and the recovery path from `~/.pi/agent/.pisync/backups/`; verified by README review and `rg -n "syncSessions|PI_SYNC_SESSIONS|sessions" extensions/pi-sync/README.md`.
- [x] Run package checks for the smallest affected surface; verified by `npm --workspace @narumitw/pi-sync run typecheck`, `npm --workspace @narumitw/pi-sync run check`, `npm test`, and `npm run pack:sync`.

## Risks

- [x] Session files can contain secrets; mitigated with default-off config, secret scanning, command warnings, and README privacy docs.
- [x] Same session edited on two machines can still conflict; mitigated by existing remote-change checks and README snapshot/conflict docs.
- [x] Session trees can be large; mitigated by including only `.jsonl` and relying on gzip snapshots.

## Rollback / Recovery

- Disable with `syncSessions: false` or `PI_SYNC_SESSIONS=false`.
- Recover overwritten local session files from `~/.pi/agent/.pisync/backups/<snapshot>.json.gz` or by pulling an older remote snapshot with `/pisync rollback <snapshot-id>`.
- If the feature regresses, revert the `syncSessions` collection/config changes; existing settings-only sync continues to read old snapshots because they omit session files.

## Completion Checklist

- [x] Session sync is opt-in and default-off, verified by config unit tests and `/pisync config` output test.
- [x] Only `sessions/**/*.jsonl` is synced when enabled, verified by collection/filter tests and preflight rejection of non-JSONL session paths.
- [x] Pull and rollback protect local session data with backups and preflight validation, verified by backup and preflight tests.
- [x] User-facing docs explain privacy, non-real-time behavior, conflicts, env/config settings, and recovery, verified in `extensions/pi-sync/README.md`.
- [x] The implementation passes the affected package checks and package dry run, verified by `npm --workspace @narumitw/pi-sync run typecheck`, `npm --workspace @narumitw/pi-sync run check`, `npm test`, and `npm run pack:sync`.
